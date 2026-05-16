# Tesseract Midnight — Path A Implementation Design

**Date:** 2026-05-16  
**Status:** Ready for Implementation — post-verification update applied  
**Validation:** 3 swarm agents CONDITIONAL_GO + adversarial verification pass complete  
**Blocker fixed:** CoinMapKey compound key (batchId + leaf) prevents cross-batch collision

---

## 1. Architecture Overview

**Core model:** Pre-Split UTXO (ADR-001)  
Each recipient gets an independent UTXO pre-created by the payer before `submitBatchRoot`. Claims are fully concurrent — no shared mutable state during claim phase. Eliminates Error 186 race condition by construction.

**Three product features:**
- **Batch Pay** — payer sends to N recipients in one batch, each gets own UTXO
- **Payment Link** — bearer link; anyone with `claimSecret` can claim to any wallet
- **Payment Request** — requester posts on-chain obligation; payer fulfills off-chain then marks paid

**Tech stack:** Midnight devnet, Compact language (pragma >= 0.19), midnight-js SDK, React/TS frontend.

---

## 2. Smart Contract — `TesseractCore.compact`

### 2.0 Helper: CoinMapKey (REQUIRED — prevents cross-batch collision)

Leaf hash alone (`persistentHash(recipientKey, amount)`) is NOT unique across batches.
Same recipient + same amount in two different batches produces identical leaf hashes → map key collision → second deposit overwrites first coin.

Fix: compound map key = `persistentHash<CoinMapKey>({ batchId, leaf })`.

```compact
struct CoinMapKey { batchId: Bytes<32>; leaf: Bytes<32>; }

pure circuit computeCoinKey(batchId: Bytes<32>, leaf: Bytes<32>): Bytes<32> {
  return persistentHash<CoinMapKey>(CoinMapKey { batchId: batchId, leaf: leaf });
}
```

Applied in depositRecipientCoin, claimPayment, reclaimRecipientCoin. Does NOT change the Merkle tree leaf format — only the map storage key.

### 2.1 Ledger Maps (9 flat maps)

```compact
// Per-recipient coin storage — key is computeCoinKey(batchId, leaf) — NOT raw leaf
export ledger recipientCoins: Map<Bytes<32>, QualifiedShieldedCoinInfo>;

// Batch metadata
export ledger batchMerkleRoots:  Map<Bytes<32>, Field>;
export ledger batchDeadlines:    Map<Bytes<32>, Uint<64>>;
export ledger payerCommitments:  Map<Bytes<32>, Bytes<32>>;

// Claim double-spend
export ledger claimNullifiers:   Map<Bytes<32>, Boolean>;

// Payment Request
export ledger requestExists:     Map<Bytes<32>, Boolean>;
export ledger requestStatus:     Map<Bytes<32>, Uint<64>>;    // 0=open 1=paid 2=expired
export ledger requestDeadlines:  Map<Bytes<32>, Uint<64>>;
export ledger requestPayeeHash:  Map<Bytes<32>, Bytes<32>>;
```

**Removed:** `batchCoins`, `batchClaimedAmounts`, `batchReclaimed` (no shared pool, no cumulative tracking needed)

### 2.2 Structs

```compact
struct PayerCommitInput     { payerKey: ZswapCoinPublicKey; batchNonce: Bytes<32>; }
struct ClaimNullifierInput  { claimSecret: Bytes<32>; leaf: Bytes<32>; batchId: Bytes<32>; }
struct RequesterCommitInput { requesterKey: ZswapCoinPublicKey; requestNonce: Bytes<32>; }
```

### 2.3 Circuits (6 total)

#### Circuit 1: `submitBatchRoot(batchId, deadline)`
- No coin parameter — metadata only
- Witnesses: `getMerkleRoot(): Field`, `getPayerKey()`, `getBatchNonce()`
- Stores: root, deadline, payerCommitment
- Does NOT call `receiveShielded` — coin acceptance moved to `depositRecipientCoin`

#### Circuit 2 (NEW): `depositRecipientCoin(batchId, recipientLeafHash, coin)`
- Called once per recipient by payer
- `coin: ShieldedCoinInfo` is a public parameter; zero witnesses
- Guards: batch exists, batch not expired (`blockTimeLt(batchDeadlines.lookup(d_batchId))`), coinKey not already used
- `coinKey = computeCoinKey(d_batchId, d_recipientLeafHash)`
- Calls `receiveShielded(disclose(coin))`
- Calls `recipientCoins.insertCoin(coinKey, disclose(coin), right<...>(kernel.self()))`

#### Circuit 3: `claimPayment(batchId, encryptedAuditMemo)`
- Witnesses: `getBatchCoin(): QualifiedShieldedCoinInfo`, `getClaimAmount()`, `getMerkleProof()`, `getLeafKey(): ZswapCoinPublicKey`, `getClaimSecret()`
- Steps:
  1. `batchDeadlines.lookup(batchId)` → deadline check with `blockTimeLt`
  2. Build nullifier, `claimNullifiers.member()` guard, insert nullifier
  3. `merkleTreePathRootNoLeafHash<16>(merkleProof)` vs `batchMerkleRoots.lookup(batchId)`
  4. `d_leaf = disclose(merkleProof.leaf)`; `coinKey = computeCoinKey(disclose(batchId), d_leaf)`
  5. `recipientCoins.lookup(coinKey)` → verify coin matches witness
  6. `sendShielded(coin, left(leafKey), coin.value)` — full value, no change coin
  7. `recipientCoins.remove(coinKey)`
  7. `disclose(encryptedAuditMemo)`
- **Bearer mode:** `leafKey` witness is caller's own `coinPublicKey` (from URL bearer flow, set client-side)

#### Circuit 4: `reclaimRecipientCoin(batchId, recipientLeafHash)`
- Per-recipient reclaim after deadline
- Witnesses: `getReclaimPayerKey()`, `getReclaimBatchNonce()`, `getReclaimCoin(): QualifiedShieldedCoinInfo`
- Guards: deadline passed (`blockTimeGt`), payer identity via payerCommitment, coin exists
- Sends full coin value back to payer
- Removes from `recipientCoins`

#### Circuit 5: `createPaymentRequest(requestId, deadline)`
- Unchanged from current contract

#### Circuit 6: `markRequestPaid(requestId)`
- Unchanged from current contract

### 2.4 Witness Declarations

```compact
// submitBatchRoot
witness getMerkleRoot(): Field;
witness getPayerKey(): ZswapCoinPublicKey;
witness getBatchNonce(): Bytes<32>;

// claimPayment
witness getBatchCoin(): QualifiedShieldedCoinInfo;
witness getClaimAmount(): Uint<128>;
witness getMerkleProof(): MerkleTreePath<16, Bytes<32>>;
witness getLeafKey(): ZswapCoinPublicKey;
witness getClaimSecret(): Bytes<32>;

// reclaimRecipientCoin
witness getReclaimPayerKey(): ZswapCoinPublicKey;
witness getReclaimBatchNonce(): Bytes<32>;
witness getReclaimCoin(): QualifiedShieldedCoinInfo;

// createPaymentRequest / markRequestPaid — unchanged
witness getRequesterKey(): ZswapCoinPublicKey;
witness getRequestNonce(): Bytes<32>;
witness getMarkRequesterKey(): ZswapCoinPublicKey;
witness getMarkRequestNonce(): Bytes<32>;
```

---

## 3. Leaf Hash Model

All leaves use `persistentHash<T>` over a struct. Two modes:

```
Addressed mode: leaf = persistentHash(LeafInput { recipientKey: ZswapCoinPublicKey, amount: Uint<128> })
Bearer mode:    leaf = persistentHash(LeafInput { recipientKey: Bytes<32> as claimSecret, amount: Uint<128> })
```

Same `hashPaymentLeaf(key, amount)` function in `src/contract/descriptors.ts` handles both — bearer passes `claimSecret` bytes where `recipientKey` bytes would go.

**Security model (bearer):** Possession of `claimSecret` = authorization to claim. Front-running risk accepted for hackathon; mitigated by private mempool (Midnight ZK). Documented in README.

---

## 4. Merkle Tree

- Depth D=16, max 65,536 recipients
- `merkleTreePathRootNoLeafHash<16>` — assumes leaf is pre-hashed in `MerkleTreePath.leaf`
- Merkle proof distribution: separate JSON file downloaded at claim time (NOT in URL — ~800B proof too large)
- Proof package format: `{ batchId, merkleRoot, recipientLeafHash, merkleProof, amount, claimSecret? }`

---

## 5. TypeScript Layer

### 5.1 `src/types/index.ts` — New/Changed Types

```typescript
export interface DepositCoinInput {
  batchId: Uint8Array;        // 32 bytes
  recipientLeafHash: Uint8Array; // 32 bytes
  coin: ShieldedCoinInfo;
}

export interface ClaimPackage {
  batchId: Uint8Array;
  amount: bigint;
  merkleProof: MerkleTreePath;
  leafHash: Uint8Array;
  claimSecret: Uint8Array;   // all-zeros for addressed mode
  leafKey?: ZswapCoinPublicKey; // undefined = bearer (use own key)
}

export interface RecipientEntry {
  leafHash: Uint8Array;
  amount: bigint;
  coin: ShieldedCoinInfo;    // populated after wallet split
}
```

### 5.2 `src/contract/client.ts` — Methods

```typescript
// New
depositCoin(batchId, recipientLeafHash, coin, witnesses, state): Promise<TxHash>

// Renamed
getRecipientCoin(leafHash, state): QualifiedShieldedCoinInfo   // was getPoolCoin(batchId)
reclaimRecipientCoin(batchId, leafHash, witnesses, state): Promise<TxHash>  // was reclaimBatch

// Updated
submitBatchRoot(batchId, deadline, witnesses, state): Promise<TxHash>  // NO coin param
claimPayment(batchId, encryptedMemo, witnesses, state): Promise<TxHash>  // same sig, updated witnesses
```

### 5.3 `src/flows/submitBatchFlow.ts` — 2-Phase Output

**Phase 1 — Metadata** (call `submitBatchRoot`):
```typescript
interface BatchMetadata {
  batchId: Uint8Array;
  merkleRoot: Field;
  deadline: bigint;
  recipients: RecipientEntry[];   // leafHash + amount for each
}
```

**Phase 2 — Deposits** (N sequential `depositRecipientCoin` calls):
- Wallet auto-splits coin pool into N UTXOs via normal transfer before each deposit
- Each deposit: `balanceUnboundTransaction(depositCoin(...))` → `finalizeRecipe` → `submitTransaction`
- Wait for each deposit to confirm before next (sequential, not parallel — wallet UTXO state)
- Return: array of `ClaimPackage` (populated with mt_index from indexer after all deposits confirm)

**Partial deposit failure:** abort entire batch, document "use new batchId" for retry. Acceptable for hackathon.

### 5.4 `src/flows/claimPaymentFlow.ts`

- Fetch claim package (JSON file or URL params)
- Build witnesses: `getBatchCoin` = `getRecipientCoin(leafHash)` from indexer
- Bearer mode: if no `leafKey` in package → use `wallet.coinPublicKey` as `getLeafKey()` witness
- No retry logic needed (independent UTXOs, no 186 risk)
- Retry ONLY for indexer lag (404 on `getRecipientCoin`) — max 3 attempts, 2s backoff

### 5.5 `src/flows/reclaimFlow.ts`

- Iterate `recipientLeafHashes[]` (stored with batch metadata)
- Sequential `reclaimRecipientCoin` per leaf
- Skip leaves where `recipientCoins.member(leafHash)` = false (already claimed)

---

## 6. Selective Disclosure / Audit Memo

**Format:** 128 bytes in `encryptedAuditMemo` calldata  
- `[0:32]`  — ephemeral X25519 pubkey (P-256 stand-in for hackathon)  
- `[32:56]` — 24-byte AES-GCM nonce  
- `[56:128]` — 72 bytes ciphertext+tag (encrypts: `{ batchId, amount, timestamp, payerNote }`)

**Encrypt:** `src/crypto/memo.ts` `encryptAuditMemo(auditorPubKey, payload)`  
**Decrypt:** auditor page calls `decryptAuditMemo(auditorPrivKey, encryptedMemo)`  

Auditor public key is a well-known address per deployment (set in `.env`). Privacy: only auditor can read memo; chain sees only 128 opaque bytes.

---

## 7. Frontend

### 7.1 Routes
```
/          → Dashboard   (wallet balance, recent batches, requests summary)
/send      → SendBatch   (add recipients, amounts, submit)
/claim     → Claim       (paste/scan link, claim payment)
/request   → Request     (create payment request, view incoming)
/audit     → Auditor     (paste privkey, decrypt memos, table view)
```

### 7.2 Screen Specs

**Dashboard:** Wallet NIGHT balance (shielded), list of sent batches (status: active/expired/reclaimed), list of pending payment requests.

**SendBatch:**
1. Add recipients row by row (address or "bearer link" mode per recipient)
2. Set deadline (default: 7 days)
3. "Send" → progress stepper: `submitBatchRoot` → N deposits → generate claim packages → share links/JSON

**Claim:**
- Paste claim link or upload JSON proof file
- Shows: amount, batch expiry, "Claim Now" button
- On success: confetti + tx hash

**PaymentRequest:**
- Create tab: amount (display only, off-chain), note, deadline → generates requestId link
- Incoming tab: list open requests with "Mark Paid" action (for requester)

**Auditor:**
- Paste auditor private key (never leaves browser)
- Auto-fetches on-chain `encryptedAuditMemo` from calldata
- Decrypts and shows table: batchId | amount | timestamp | payerNote

### 7.3 Hooks

```
useWalletState()    → { balance, coinPublicKey, isReady }
useBatchPay()       → { submit(recipients, deadline), progress, claimPackages }
useClaim()          → { claim(package), status, txHash }
usePaymentRequest() → { create(amount, note, deadline), markPaid(requestId), requests[] }
useAuditDecrypt()   → { decrypt(privKey, memos[]), auditRows[] }
```

---

## 8. Deployment Sequence

1. `npx compact compile src/contract/TesseractCore.compact` → clean compile, no warnings
2. `npx ts-node scripts/deploy.ts` → new contract address → update `scripts/deployed-address.json`
3. `npx ts-node src/tests/gate3-integration.ts` → Gate-3 passes (parallel Bob+Carol claims succeed)
4. `npm run dev` → UI works end-to-end on devnet
5. Record demo video

---

## 9. Implementation Order

| # | File | Time est. |
|---|------|-----------|
| 1 | `TesseractCore.compact` rewrite | 45 min |
| 2 | Deploy + update address | 10 min |
| 3 | `src/types/index.ts` | 10 min |
| 4 | `src/contract/client.ts` | 30 min |
| 5 | `src/flows/submitBatchFlow.ts` | 45 min |
| 6 | `src/flows/claimPaymentFlow.ts` | 20 min |
| 7 | `src/flows/reclaimFlow.ts` | 15 min |
| 8 | `src/tests/gate3-integration.ts` | 30 min |
| 9 | `src/hooks/` (5 hooks) | 45 min |
| 10 | `src/screens/` (5 screens) | 60 min |

Total: ~5.5 hours

---

## 10. Resolved Design Decisions

| Decision | Resolution |
|---|---|
| Partial deposit failure | Abandon batch, use new batchId — document in README |
| Merkle proof distribution | Separate JSON file download, not in URL |
| Bearer front-running | Accepted security model, private mempool mitigates |
| Payment request amount | Off-chain trust, on-chain only has requestId + deadline |
| Concurrent deposit ordering | Sequential (wallet state), parallel claims only |
| Reclaim: per-recipient or batch | Per-recipient (simpler, no shared state) |

---

## 11. Known Constraints / Non-Goals (Hackathon)

- No partial deposit retry — full batch restart on failure
- Auditor key stored in browser memory only — no KMS
- P-256 stand-in for X25519 in memo encryption — acceptable for demo
- No amount privacy in Payment Request — just requestId + deadline on-chain
- No multi-sig payer — single wallet per batch
