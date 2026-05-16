# Tesseract — Midnight Devnet: Detailed Ask for AI

> This document is a complete technical briefing for an AI assistant to help resolve a persistent
> circuit-call failure in a Midnight Network smart contract. It covers what we've built, what's
> working, the exact error, and every fix already attempted.

---

## 1. What We Are Building

**Tesseract** is a private business payments rail on Midnight Network. Three features:

1. **Batch Pay** — payer sends shielded NIGHT to N recipients with ZK Merkle proof per claim
2. **Payment Link / Bearer token** — shareable link lets any holder claim
3. **Payment Request** — on-chain request ID, requester marks paid

Tech stack: Compact 0.19 (Midnight DSL), midnight-js SDK 4.x, ledger-v8 8.0.3, TypeScript/React.

---

## 2. Architecture: Path A — Pre-Split UTXO

### Why Path A

The prior design (Path B) used a single shared coin for the whole batch. Concurrent claims hit
`Error 186` (two proofs referencing same coin mt_index). Path A eliminates this: every recipient
gets an **independent UTXO** deposited by the payer before any claims begin.

### 2-phase submit

- **Phase 1** — `submitBatchRoot(batchId, deadline)`: stores Merkle root + payer commitment.
  **No coin. Zero shielded operations.**
- **Phase 2** — `depositRecipientCoin(batchId, leafHash, coin)` × N: payer deposits one
  shielded coin per recipient. Has `receiveShielded`.

### Claim

`claimPayment(batchId, encryptedAuditMemo)` — recipient proves Merkle inclusion, gets their
independent UTXO via `sendShielded`. No race condition because each claim touches a distinct map
entry keyed by `persistentHash(CoinMapKey{batchId, leaf})`.

---

## 3. Contract Source: TesseractCore.compact

```compact
pragma language_version >= 0.19;
import CompactStandardLibrary;

struct PayerCommitInput  { payerKey: ZswapCoinPublicKey; batchNonce: Bytes<32>; }
struct ClaimNullifierInput { claimSecret: Bytes<32>; leaf: Bytes<32>; batchId: Bytes<32>; }
struct RequesterCommitInput { requesterKey: ZswapCoinPublicKey; requestNonce: Bytes<32>; }
struct CoinMapKey { batchId: Bytes<32>; leaf: Bytes<32>; }

pure circuit computeCoinKey(batchId: Bytes<32>, leaf: Bytes<32>): Bytes<32> {
  return persistentHash<CoinMapKey>(CoinMapKey { batchId: batchId, leaf: leaf });
}

export ledger recipientCoins:   Map<Bytes<32>, QualifiedShieldedCoinInfo>;
export ledger batchMerkleRoots: Map<Bytes<32>, Field>;
export ledger batchDeadlines:   Map<Bytes<32>, Uint<64>>;
export ledger payerCommitments: Map<Bytes<32>, Bytes<32>>;
export ledger claimNullifiers:  Map<Bytes<32>, Boolean>;
export ledger requestExists:    Map<Bytes<32>, Boolean>;
export ledger requestStatus:    Map<Bytes<32>, Uint<64>>;
export ledger requestDeadlines: Map<Bytes<32>, Uint<64>>;
export ledger requestPayeeHash: Map<Bytes<32>, Bytes<32>>;

witness getMerkleRoot():   Field;
witness getPayerKey():     ZswapCoinPublicKey;
witness getBatchNonce():   Bytes<32>;
witness getBatchCoin():    QualifiedShieldedCoinInfo;
witness getClaimAmount():  Uint<128>;
witness getMerkleProof():  MerkleTreePath<16, Bytes<32>>;
witness getLeafKey():      ZswapCoinPublicKey;
witness getClaimSecret():  Bytes<32>;
witness getReclaimPayerKey():   ZswapCoinPublicKey;
witness getReclaimBatchNonce(): Bytes<32>;
witness getReclaimCoin():       QualifiedShieldedCoinInfo;
witness getRequesterKey():      ZswapCoinPublicKey;
witness getRequestNonce():      Bytes<32>;
witness getMarkRequesterKey():  ZswapCoinPublicKey;
witness getMarkRequestNonce():  Bytes<32>;

// Circuit 1 — NO shielded operations
export circuit submitBatchRoot(batchId: Bytes<32>, deadline: Uint<64>): [] {
  const merkleRoot = getMerkleRoot();
  const payerKey   = getPayerKey();
  const batchNonce = getBatchNonce();
  const d_batchId  = disclose(batchId);
  const d_deadline = disclose(deadline);
  assert(blockTimeLt(d_deadline), "deadline must be in future");
  assert(!batchDeadlines.member(d_batchId), "batchId already exists");
  batchMerkleRoots.insert(d_batchId, disclose(merkleRoot));
  batchDeadlines.insert(d_batchId, d_deadline);
  const payerInput = PayerCommitInput { payerKey: payerKey, batchNonce: batchNonce };
  payerCommitments.insert(
    d_batchId,
    persistentHash<PayerCommitInput>(disclose(payerInput))
  );
}

// Circuit 2 — HAS receiveShielded
export circuit depositRecipientCoin(
  batchId: Bytes<32>, recipientLeafHash: Bytes<32>, coin: ShieldedCoinInfo
): [] {
  const d_batchId = disclose(batchId);
  const d_leaf    = disclose(recipientLeafHash);
  assert(batchDeadlines.member(d_batchId), "batch not found");
  assert(blockTimeLt(batchDeadlines.lookup(d_batchId)), "batch expired");
  const coinKey = computeCoinKey(d_batchId, d_leaf);
  assert(!recipientCoins.member(coinKey), "coin already deposited for this leaf");
  receiveShielded(disclose(coin));
  recipientCoins.insertCoin(coinKey, disclose(coin),
    right<ZswapCoinPublicKey, ContractAddress>(kernel.self())
  );
}

// Circuit 3 — HAS sendShielded
export circuit claimPayment(batchId: Bytes<32>, encryptedAuditMemo: Bytes<128>): [] {
  const amount      = getClaimAmount();
  const merkleProof = getMerkleProof();
  const leafKey     = getLeafKey();
  const claimSecret = getClaimSecret();
  const coin        = getBatchCoin();
  const d_batchId   = disclose(batchId);
  const deadline    = batchDeadlines.lookup(d_batchId);
  assert(blockTimeLt(disclose(deadline)), "batch deadline passed");
  const nullInput = ClaimNullifierInput {
    claimSecret: claimSecret, leaf: merkleProof.leaf, batchId: batchId
  };
  const nullifier = persistentHash<ClaimNullifierInput>(disclose(nullInput));
  assert(!claimNullifiers.member(nullifier), "already claimed");
  const computedRoot = merkleTreePathRootNoLeafHash<16>(merkleProof);
  const storedRoot   = batchMerkleRoots.lookup(d_batchId);
  assert(computedRoot.field == storedRoot, "invalid merkle proof");
  claimNullifiers.insert(nullifier, true);
  const d_leaf     = disclose(merkleProof.leaf);
  const coinKey    = computeCoinKey(d_batchId, d_leaf);
  const storedCoin = recipientCoins.lookup(coinKey);
  assert(coin.nonce == storedCoin.nonce, "coin nonce mismatch");
  assert(coin.color == storedCoin.color, "coin color mismatch");
  assert(coin.value == storedCoin.value, "coin value mismatch");
  const result = sendShielded(disclose(coin),
    left<ZswapCoinPublicKey, ContractAddress>(disclose(leafKey)),
    disclose(storedCoin.value)
  );
  if(result.change.is_some) {
    recipientCoins.insertCoin(coinKey, result.change.value,
      right<ZswapCoinPublicKey, ContractAddress>(kernel.self())
    );
  } else {
    recipientCoins.remove(coinKey);
  }
  disclose(encryptedAuditMemo);
}

// Circuit 4 — HAS sendShielded
export circuit reclaimRecipientCoin(batchId: Bytes<32>, recipientLeafHash: Bytes<32>): [] {
  ... (sends coin back to payer)
}

// Circuit 5 — NO shielded operations
export circuit createPaymentRequest(requestId: Bytes<32>, deadline: Uint<64>): [] { ... }

// Circuit 6 — NO shielded operations
export circuit markRequestPaid(requestId: Bytes<32>): [] { ... }
```

**Compiled artifacts info** (from `src/contract/compiled/compiler/contract-info.json`):
- compiler-version: **0.31.0**
- language-version: **0.23.0**
- runtime-version: **0.16.0**

**Package versions** (from `package.json`):
- `@midnight-ntwrk/compact-runtime`: `^0.16.0`
- `@midnight-ntwrk/ledger-v8`: `^8.0.3`
- `@midnight-ntwrk/midnight-js-contracts`: `^4.0.4`
- `@midnight-ntwrk/wallet-sdk-facade`: `^3.0.0`
- `@midnight-ntwrk/wallet-sdk-prover-client`: `^1.2.1`

**Deployed contract address**: `fd235aed0be90e04fa0a75ae5570184344edbcfd98918bafff178581389a0ebf`
**Network ID**: `undeployed` (Midnight local devnet always uses this ID)

---

## 4. TypeScript Client (`src/contract/client.ts`)

The client uses `findDeployedContract` from `@midnight-ntwrk/midnight-js-contracts`.

```typescript
// Witness implementations — note [undefined, value] tuple format
function makeWitnesses(pending: PendingWitnessState): Witnesses<undefined> {
  return {
    getMerkleRoot:  () => [undefined, pending.submit!.merkleRoot] as any,
    getPayerKey:    () => [undefined, pending.submit!.payerKey] as any,
    getBatchNonce:  () => [undefined, pending.submit!.batchNonce] as any,
    getBatchCoin: () => {
      if (pending.claim)   return [undefined, pending.claim.recipientCoin] as any;
      if (pending.reclaim) return [undefined, pending.reclaim.reclaimCoin] as any;
      throw new Error('getBatchCoin: no active state');
    },
    // ... all other witnesses throw "wrong circuit" errors
  };
}

// submitBatch call — NO coin argument
async submitBatch(batchId: Uint8Array, deadline: bigint, state: SubmitBatchPrivateState): Promise<HexString> {
  this.pending.submit = state;
  try {
    return this._hash(await (this.callTx as any).submitBatchRoot(batchId, deadline));
  } finally { this.pending.submit = null; }
}
```

**Compiled witness signatures** (from `index.d.ts`):
```typescript
getMerkleRoot(context: WitnessContext<Ledger, PS>): [PS, bigint];
getPayerKey(context: WitnessContext<Ledger, PS>): [PS, { bytes: Uint8Array }];
getBatchNonce(context: WitnessContext<Ledger, PS>): [PS, Uint8Array];
```

---

## 5. Provider Setup (Integration Test)

```typescript
// queryZSwapAndContractState — FIXED to use type fragments
async queryZSwapAndContractState(contractAddress: string) {
  const data = await gqlFetch(`{
    contractAction(address: "${contractAddress}") {
      ... on ContractDeploy { state zswapState }
      ... on ContractCall  { state zswapState }
    }
  }`);
  const action = data.contractAction;
  if (!action?.state || !action?.zswapState) return null;
  return [
    ledger.ZswapChainState.deserialize(fromHex(action.zswapState)),
    ContractState.deserialize(fromHex(action.state)),
    ledger.LedgerParameters.initialParameters(),
  ];
},

// balanceTx — wallet pays fees using shielded NIGHT
async balanceTx(tx: UnboundTransaction) {
  const ttl = new Date(Date.now() + 3_600_000);
  const recipe = await facade.balanceUnboundTransaction(tx, { shieldedSecretKeys, dustSecretKey }, { ttl });
  return facade.finalizeRecipe(recipe);
},
```

---

## 6. What Is Fully Implemented and Committed

| Task | Status | Commit |
|------|--------|--------|
| TesseractCore.compact rewrite (Path A) | ✅ Done | `ff12813` |
| Contract compiled (compiler 0.31.0) | ✅ Done | artifacts in `src/contract/compiled/` |
| Contract deployed to devnet | ✅ Done | `4a6b1c2` — address `fd235aed...` |
| `descriptors.ts` — CoinMapKeyType, hashCoinKey | ✅ Done | `8270600` |
| `types/index.ts` — RecipientEntry, DepositCoinInput | ✅ Done | `f8d5652` |
| `submitBatchFlow.ts` — 2-phase output | ✅ Done | `aa69bfc` |
| `claimPaymentFlow.ts` — recipientCoin witness | ✅ Done | `dd044a7` |
| `reclaimFlow.ts` — per-leaf reclaim | ✅ Done | `6a5314a` |
| `client.ts` — depositCoin, new witness routing | ✅ Done | `8d80cac` |
| `gate3-integration.ts` — 2-phase test | ✅ Done | `fb66fb3` |
| `types/index.ts` — deadlineFromHours → ms | ✅ Done | `7b0e624` |

**Tasks NOT yet done** (blocked by the error below):
- Tasks 12–17: hooks, screens, build verification — paused until the circuit call works

---

## 7. THE BLOCKER: Exact Error

**Circuit**: `submitBatchRoot(batchId: Bytes<32>, deadline: Uint<64>)`  
**Stage at which it fails**: HTTP proof server `/check` endpoint (BEFORE proof generation)  
**Error message** (exact):

```
ClientError: Failed to check: bad input
  at WASM ledger-v8, wasm-function[15690]
  (FiberFailure) ClientError: Failed to check: bad input
```

The error is thrown when `callTx.submitBatchRoot(batchId, deadline)` is called. It happens inside
`HttpProverClient.proveTransaction` → proof server `/check` → WASM module `ledger-v8` →
`wasm-function[15690]`.

**JS simulation passes cleanly.** The circuit logic runs without error in the local JS simulator
(the `Contract` class executes all assertions correctly). The failure is only at the WASM ZK prover
check step.

---

## 8. Key Characteristic of the Failing Circuit

`submitBatchRoot` has **ZERO shielded coin operations**. No `receiveShielded`, no `sendShielded`.
It only:
1. Calls 3 witnesses: `getMerkleRoot() → Field`, `getPayerKey() → ZswapCoinPublicKey`, `getBatchNonce() → Bytes<32>`
2. Reads/writes 3 ledger maps: `batchMerkleRoots`, `batchDeadlines`, `payerCommitments`
3. No coin inputs or outputs

The other circuits that DO have shielded ops (`depositRecipientCoin`, `claimPayment`,
`reclaimRecipientCoin`) have NOT been tested yet — we can't reach them because `submitBatchRoot`
is Phase 1 and must succeed first.

The two other circuits also without shielded ops are `createPaymentRequest` and `markRequestPaid`
— these haven't been tested either.

---

## 9. All Fix Attempts (All Failed)

### Attempt 1 — BigInt serialization fix
**What we thought**: `JSON.stringify(BigInt)` was crashing before the circuit call.  
**Fix**: Used string interpolation instead for logging.  
**Result**: Crash gone, but `/check` "bad input" still thrown.

### Attempt 2 — Deadline milliseconds fix
**What we thought**: `deadlineFromHours` returned seconds (`Date.now()/1000 + hours*3600`).
Devnet block timestamps are milliseconds (confirmed: `1778944938006`). So `blockTimeLt(deadline)`
was comparing ms block time against a tiny seconds-based deadline → assertion failed inside WASM.  
**Fix**: Changed to `BigInt(Date.now() + hours * 3600 * 1000)`.  
**Result**: Deadline now in ms (correct range), error persists.

### Attempt 3 — queryZSwapAndContractState type fragments
**What we thought**: `contractAction(address: ...)` query without type fragments returns no
`zswapState` field → `null` ZSwap state → prover gets bad state input.  
**Fix**: Added `... on ContractDeploy { state zswapState } ... on ContractCall { state zswapState }`.  
**Result**: `zswapState` now non-null and deserializes cleanly. Error persists.

### Attempt 4 — Verified compiled circuit matches source
**What we checked**: `contract-info.json` confirms `submitBatchRoot` takes exactly `(batchId: Bytes<32>, deadline: Uint<64>)`, matching the TypeScript call `callTx.submitBatchRoot(batchId, deadline)`.  
**Result**: Types are correct. Error persists.

---

## 10. What We Strongly Suspect But Cannot Confirm

### Hypothesis A: ZSwap operation required per transaction
Midnight's ZSwap protocol may require at least one coin operation per provable circuit transaction.
Circuits without `receiveShielded`/`sendShielded` may not produce a valid ZSwap state transition,
causing the WASM prover to reject the check with "bad input".

**Evidence for**: `submitBatchRoot` has no shielded ops. Error is at WASM ZSwap check level.  
**Evidence against**: The Midnight counter example contract (`increment()`) has no shielded ops
and supposedly works. `createPaymentRequest` (Tesseract) also has no shielded ops.  
**Status**: Unconfirmed. We cannot test `createPaymentRequest` independently because we never
get past `submitBatchRoot`.

### Hypothesis B: `balanceTx` produces invalid ZSwap state for no-coin circuits
`balanceUnboundTransaction` adds fee payment. For circuits with no coin outputs, the ZSwap note
tree update from fee spending might be structured incorrectly, producing a state snapshot the
prover rejects.

**Evidence for**: Fee payment requires spending a shielded coin (from genesis wallet) →
`sendShielded` for fee. If `balanceTx` can't construct valid ZSwap state for a circuit that
itself has no coin ops, the state passed to `/check` would be invalid.  
**Status**: Unconfirmed. We cannot inspect the serialized payload to `/check`.

### Hypothesis C: compiler/prover version incompatibility
Compiled with `compiler-version: 0.31.0`, `language-version: 0.23.0`. Proof server runs
`ledger-v8: 8.0.3`. ZKIR format from compiler 0.31.0 may not be compatible with the WASM
prover in `ledger-v8 8.0.3`.

**Evidence for**: The debug comment in `debug-submit.ts` specifically calls this out:
"does the proof server version (8.0.3) match the compiler version (0.31.0)?"  
**Evidence against**: Deploy succeeded (but deploy doesn't require ZK proofs, only circuit
calls do). Prover keys were generated alongside the ZKIR at compile time.  
**Status**: Most likely hypothesis if the devnet proof server version doesn't match.

### Hypothesis D: `contractAction(address)` returns DEPLOY state, not LATEST state
The GraphQL `contractAction(address: "...")` query might return the initial deploy action's
state, not the most recent state. After a re-deploy, the contract address changes, so for a
freshly deployed contract this should be the same state. But if the indexer has stale data or
the query semantics are wrong, the ZSwap chain state provided to the prover could be wrong.

**Evidence for**: `check-zswap-state.ts` was written specifically to test this. It uses an older
contract address (`a54d...`) vs the deployed address (`fd23...`).  
**Status**: Partially mitigated by the type-fragment fix (attempt 3), but still possible the
state is deploy-time not current.

---

## 11. Questions for Midnight Experts / Documentation

1. **Can a Compact circuit with zero `receiveShielded`/`sendShielded` ops be called via `callTx`
   on the devnet?** The Midnight example `counter.increment()` has no coin ops — does it work
   via `callTx` today on devnet?

2. **What does "bad input" from `wasm-function[15690]` in `ledger-v8` mean specifically?**
   Is there a list of what constitutes "bad input" for the `/check` endpoint? Is it:
   - Missing ZSwap coin operations?
   - ZSwap state mismatch (stale/wrong state provided)?
   - Circuit input type mismatch?
   - Prover key / ZKIR version mismatch?

3. **Is there a minimum ZSwap operation requirement per circuit call?** Does every call via
   `callTx` need at least one `receiveShielded` or `sendShielded` in the circuit?

4. **How should `queryZSwapAndContractState` work?** The `contractAction(address: ...)` GraphQL
   query — does it return the LATEST state after all transactions, or the deploy-time state?
   What is the correct query to get the current ZSwap chain state for a contract?

5. **Are `compiler-version 0.31.0` ZKIR files compatible with `ledger-v8 8.0.3`?** What's
   the version compatibility matrix between the Compact compiler and the ledger-v8 proof server?

6. **Is `pragma language_version >= 0.19` valid without an upper bound?** The compiler accepted
   it and produced `language-version: 0.23.0`. Does the proof server have any version checks?

7. **For circuits with no coin ops, how does `balanceUnboundTransaction` pay the fee?** Does it
   add a shielded coin spend for fee, and if so, does that ZSwap state transition work correctly
   when the circuit itself has no coin ops?

---

## 12. What We Need

**One of the following**:

A. **Confirmation that pure state-update circuits (no shielded ops) work on devnet** + what
   the correct way to call them is.

B. **The correct way to make the `/check` pass** — is there something we're missing in how
   we call `callTx` for a no-coin circuit?

C. **Confirmation that we need to add a dummy coin op** to `submitBatchRoot` (e.g., a
   `receiveShielded` of a zero-value coin) to satisfy the ZSwap protocol requirement, and what
   the correct pattern for that is.

D. **The correct compiler version to use** with `ledger-v8 8.0.3` / devnet proof server, if
   our compiler version is causing a format mismatch.

---

## 13. Repro Steps

```bash
# Clone project, install deps
cd Tesseract_Midnight
npm install

# Start devnet (Docker)
# Requires: midnight-node, indexer-client, proof-server on ports 9944, 8088, 6300

# Run integration test
npx tsx src/tests/gate3-integration.ts
```

Error occurs at Step 2 (`submitBatchRoot`). Steps 1 (batch prep, wallet sync) succeed.

The interceptor test can be run to see the raw `/check` payload:
```bash
npx tsx src/tests/intercept-check.ts
```

---

## 14. Repository Context

- **GitHub**: Private MLH hackathon repo
- **Timeline**: MLH × Midnight Hackathon, deadline May 17, 2026
- **All 17 implementation tasks** are complete except running the test (Task 11) and
  implementing hooks/screens (Tasks 12–17), which are blocked on this error.
