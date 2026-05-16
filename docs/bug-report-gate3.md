# Gate-3 Integration Test — Complete Bug Report

**Date**: 2026-05-17  
**Test file**: `src/tests/gate3-integration.ts`  
**Run environment**: Midnight devnet (Docker), local Node 22.15.0  
**Test command**: `npx tsx src/tests/gate3-integration.ts`  
**Status at report time**: FAILING — crashes at step 2 (secondary `pollForTx` after `submitBatchRoot`)

---

## Summary

| ID | Severity | Category | Component | Status |
|----|----------|----------|-----------|--------|
| BUG-001 | CRITICAL | Runtime crash | test file | Confirmed by live run |
| BUG-002 | CRITICAL | Runtime wrong behavior | test file + SDK | Confirmed by SDK source |
| BUG-003 | HIGH | Runtime Error 186 | test file | Confirmed by docs |
| BUG-004 | MEDIUM | TypeScript build | test file | Confirmed by `tsc` |
| BUG-005 | MEDIUM | TypeScript build | test file | Confirmed by `tsc` |
| BUG-006 | MEDIUM | TypeScript build | test file | Confirmed by `tsc` |
| BUG-007 | MEDIUM | TypeScript build | types file | Confirmed by `tsc` |
| BUG-008 | LOW | TypeScript build | stale test | Confirmed by `tsc` |

---

## BUG-001 — `pollForTx` uses wrong identifier type [CRITICAL / BLOCKER]

**Location**: `gate3-integration.ts` lines 405, 422, 503, 510, 537, 541

**What `pollForTx` does**:
```typescript
async function pollForTx(identifier: string): Promise<IndexerTx> {
  // polls this query every 3s, 200 times:
  gqlFetch(`{ transactions(offset: { identifier: "${identifier}" }) { ... } }`)
}
```

**What the test passes to it**:
- Line 405: `pollForTx(submitTxHash)` — `submitTxHash` comes from `_hash(callTx.submitBatchRoot(...))`
- Line 422: `pollForTx(depTxHash)` — same, from `_hash(callTx.depositRecipientCoin(...))`
- Lines 503, 510: `pollForTx(bobTxHash)`, `pollForTx(carolTxHash)` — same pattern
- Lines 537, 541: `pollForTx(reqTxHash)`, `pollForTx(markTxHash)` — same pattern

**`_hash()` extraction in client.ts line 161**:
```typescript
const h = result?.public?.txHash ?? result?.txHash ?? result?.txId ?? result?.public?.txId;
```
This returns the **transaction hash** (32 bytes = 64 hex chars), e.g. `2ffb112d...` (64 chars).

**What the indexer actually accepts**:

The `TransactionOffset` GQL input type (confirmed via schema introspection) has TWO fields:
```graphql
input TransactionOffset {
  hash: HexEncoded        # tx hash (32 bytes)
  identifier: HexEncoded  # submission identifier (33 bytes)
}
```

The `identifier` field requires the **submission identifier** — the value returned by
`facade.submitTransaction(tx)` (33 bytes = 66 hex chars), e.g. `00f3a79c...` (66 chars).

**Live proof** (queries run against devnet):
```
# 64-char tx hash via identifier= → returns []
curl -d '{"query":"{ transactions(offset: { identifier: \"2ffb112d...\" }) { id } }"}' → {"data":{"transactions":[]}}

# 66-char submission ID via identifier= → returns result
curl -d '{"query":"{ transactions(offset: { identifier: \"00f3a79c...\" }) { id } }"}' → {"data":{"transactions":[{"id":81,"hash":"2ffb112d..."}]}}
```

**Impact**: All 6 `pollForTx` calls in the test fail. The test spins for 10 minutes (200 × 3s) then crashes:
```
Error: TX 2ffb112dc38f53b356eb9a424defd58aa58af0f7d2a96a7ff3b9d6dc2851f2d0 never confirmed
    at pollForTx (gate3-integration.ts:196:9)
    at async <anonymous> (gate3-integration.ts:405:1)
```

**Test never reaches step 3 (deposits), 5 (claims), or 7 (payment requests).**

**Root cause**: The test uses `txHash` (from `_hash()` result) where the query needs `identifier` (submission ID). The correct fix is one of:
- Change query to use `{ hash: X }` instead of `{ identifier: X }` when passing tx hash
- Store and pass the submission ID (returned by `facade.submitTransaction`) separately

---

## BUG-002 — `waitForSyncedState()` resolves immediately if already synced [CRITICAL]

**Location**: `gate3-integration.ts` lines 401, 423, 428–432, 504

**SDK implementation** (`wallet-sdk-shielded/dist/ShieldedWallet.js:121`):
```javascript
waitForSyncedState(allowedGap = 0n) {
    return rx.firstValueFrom(
        this.state.pipe(rx.filter((state) => state.state.progress.isCompleteWithin(allowedGap)))
    );
}
```

`firstValueFrom` returns the **first emission that passes the filter** — including the CURRENT state if it already passes. If the wallet was synced before the latest block arrived, this resolves immediately with stale state.

**Timeline from test run #4 (previous session)**:
```
23:31:52 — submitBatchRoot TX confirmed (block 6500), fee note A spent
23:32:02 — waitForSyncedState() returns + 10s sleep finishes (wallet never processed block 6500)
23:32:02 — depositCoin builds TX using fee note A again
23:32:08 — Error 186 EffectsCheckFailure (fee note A already spent)
```

**Root cause per Midnight docs**: Before building each TX, the wallet's local ZSwap state must have processed all on-chain updates via `apply_collapsed_update`. Without this:
- Fee note spent in TX-A creates change note B on-chain
- Wallet hasn't applied the block update yet
- TX-B is built spending note A again (stale UTXO set)
- Node rejects: declared nullifiers don't match reality → Error 186

**The `waitSync` helper has the same bug** (line 337-343):
```typescript
async function waitSync(facade: WalletFacade, name: string) {
  await Rx.firstValueFrom(
    facade.state().pipe(Rx.filter((s) => s.isSynced)),  // returns immediately if already synced
  );
}
```

**Impact**: Even with 10s+ sleeps, Error 186 on first deposit because sleep doesn't guarantee block processing.

---

## BUG-003 — Carol's claim proof built against pre-Bob-claim state [HIGH]

**Location**: `gate3-integration.ts` lines 482–497 vs. line 499

**Code order**:
```typescript
// Lines 482-497: BOTH claim preps built at the same ledger state
const bobClaimPrep   = await prepareClaimPayment({ ... recipientCoin: bobCoin });
const carolClaimPrep = await prepareClaimPayment({ ... recipientCoin: carolCoin });

// Line 499: Bob's claim TX submitted
const bobTxHash = await bobClient.claimPayment(bobClaimPrep.batchId, ...);

// Lines 503-505: Wait for Bob's TX + resync
await pollForTx(bobTxHash);  // also broken by BUG-001
await carol.facade.waitForSyncedState();  // also broken by BUG-002
await new Promise(r => setTimeout(r, 60000));

// Line 508: Carol submits using STALE proof
const carolTxHash = await carolClient.claimPayment(carolClaimPrep.batchId, ...);
```

**What happens when Bob's claim confirms**:
1. Bob's coin is spent (commitment removed or nullified in ZSwap)
2. Change note (if any) is added to ZSwap tree
3. ZSwap Merkle tree root changes → new root recorded in `past_roots` via `post_block_update`
4. Carol's proof was built against the OLD root (before Bob's TX)
5. Carol submits — her declared effects reference the old root which may no longer be in `past_roots` window, or her proof simply doesn't match current tree state → Error 186

**Per Midnight docs**: "Each claim transaction must be built against the current confirmed ledger state." Carol's claim must be built AFTER Bob's TX confirms and Carol's wallet has processed the resulting block.

---

## BUG-004 — `UnboundTransaction` does not exist in ledger-v8 [MEDIUM]

**Location**: `gate3-integration.ts` line 70

**Code**:
```typescript
import type { UnboundTransaction } from '@midnight-ntwrk/ledger-v8';
```

**Build error**:
```
src/tests/gate3-integration.ts(70,15): error TS2724: '"@midnight-ntwrk/ledger-v8"' has no exported
member named 'UnboundTransaction'. Did you mean 'UnprovenTransaction'?
```

**Usage**: Used in `balanceTx(tx: UnboundTransaction)` on line 312. The correct type is `UnprovenTransaction`.

---

## BUG-005 — Stale/unused imports in gate3-integration.ts [MEDIUM]

**Location**: `gate3-integration.ts` lines 47, 59, 75

```typescript
// Line 47 — all unused
import { encodeShieldedCoinInfo, encodeCoinPublicKey } from '@midnight-ntwrk/ledger-v8';
// Build error: "All imports in import declaration are unused."

// Line 59 — unused after switching to httpClientProofProvider
import { HttpProverClient } from '@midnight-ntwrk/wallet-sdk-prover-client';
// Build error: "'HttpProverClient' is declared but its value is never read."

// Line 75 — prepareMarkRequestPaid unused
import { prepareCreatePaymentRequest, prepareMarkRequestPaid } from '../flows/paymentRequestFlow.js';
// Build error: "'prepareMarkRequestPaid' is declared but its value is never read."
```

---

## BUG-006 — Unused destructured variables in `buildProviders` [MEDIUM]

**Location**: `gate3-integration.ts` line 229

```typescript
const { facade, shieldedSecretKeys, dustSecretKey } = wallet;
//      ^^^^^^                       ^^^^^^^^^^^^^  — never used in function body
```

Build errors:
```
(229,11): error TS6133: 'facade' is declared but its value is never read.
(229,39): error TS6133: 'dustSecretKey' is declared but its value is never read.
```

---

## BUG-007 — `MerkleTreePath` needs type-only import [MEDIUM]

**Location**: `src/types/index.ts` line 6

```typescript
import { MerkleTreePath } from '@midnight-ntwrk/compact-runtime';
// Error: 'MerkleTreePath' is a type and must be imported using a type-only import
// when 'verbatimModuleSyntax' is enabled.
```

Fix: `import type { MerkleTreePath } from ...`

---

## BUG-008 — `intercept-check.ts` uses deleted SubmitBatchInput API [LOW]

**Location**: `src/tests/intercept-check.ts` lines 111, 160, 162

`SubmitBatchInput` was rewritten to remove `coin` and the private state no longer has `totalAmount`.

Build errors:
```
(111,3): error TS2353: Object literal may only specify known properties, and 'coin' does not
  exist in type 'SubmitBatchInput'.
(160,51): error TS2339: Property 'coin' does not exist on type 'SubmitBatchPrivateState'.
(161,53): error TS2339: Property 'totalAmount' does not exist on type 'SubmitBatchPrivateState'.
```

---

## What DID Work

| Feature | Status | Evidence |
|---------|--------|----------|
| Wallet init (all 3 wallets) | ✅ Working | Lines 3–17 in test output |
| Initial wallet sync | ✅ Working | All 3 synced in <2s |
| Genesis balance query | ✅ Working | Balance ~150k NIGHT shown |
| Merkle tree construction | ✅ Working | Merkle root computed |
| `submitBatchRoot` TX | ✅ Working | TX confirmed at block 6947 |
| `httpClientProofProvider` | ✅ Fixed | No "bad input" errors |
| Witness format `(ctx) => [ctx.privateState, val]` | ✅ Fixed | No witness errors |
| Coin nonce randomization | ✅ Fixed | No zero-nonce errors |

---

## What Failed

| Feature | Error | Bug ID |
|---------|-------|--------|
| Secondary `pollForTx(txHash)` | "TX never confirmed" after 10min | BUG-001 |
| Wallet sync before deposits | Returns immediately, stale UTXO | BUG-002 |
| Carol claim proof | Would be stale vs post-Bob state | BUG-003 |
| TypeScript build | 10+ errors in test + types files | BUG-004–008 |

---

## Open Questions After This Hunt

1. **Does `WalletFacade.waitForSyncedState(allowedGap)` with a non-zero gap help?** The `allowedGap` param in the SDK is `0n` by default — unclear if setting it > 0 forces a re-wait.

2. **Is there an RxJS-based "wait for NEXT sync" pattern?** Need `skip(1).filter(isSynced)` or similar to force waiting for the NEXT emission, not the current one.

3. **Does Carol's wallet independently manage its own ZSwap state?** If so, Carol's proof is built using Carol's local ZSwap tree (not genesis's), and Carol's tree may actually be up-to-date. Need to verify what `prepareClaimPayment` uses for proof generation vs. what the genesis wallet uses.

4. **Does the claim circuit build the ZK proof at `prepareClaimPayment` time or at `callTx` time?** If the ZK proof is built lazily at `callTx.claimPayment()` time (not at `prepareClaimPayment` time), then Carol's claim proof might use the CURRENT tree state (post-Bob), not the pre-Bob state. This would mean BUG-003 might not apply.

---

## Fix Priority Order

1. **Fix BUG-001 first** — test can't proceed at all without this. Change `pollForTx` to use `{ hash: X }` query field when passed a 32-byte tx hash.
2. **Fix BUG-002** — use `skip(1).filter(isSynced)` pattern to force waiting for next wallet state after a TX confirms.
3. **Fix BUG-003** — move `carolClaimPrep` construction to after Bob's claim confirms and Carol's wallet resyncs.
4. **Fix BUG-004–007** — TypeScript cleanup (quick, mechanical fixes).
