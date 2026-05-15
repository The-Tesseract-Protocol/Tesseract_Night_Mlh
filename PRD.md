---
title: "PRD — Tesseract: Private Business Payments Rail"
type: build
status: active
confidence: high
last_updated: 2026-05-15
ecosystem: [midnight]
product: [tesseract-payments]
active_build: [active/midnight-mlh-2026-05]
related:
  - active/midnight-mlh-2026-05/CONTEXT.md
  - active/midnight-mlh-2026-05/handoff.md
  - raw/unsorted/tesseract-pay-archive/settlement-engine-spec.md
  - raw/unsorted/tesseract-pay-archive/architecture-decisions.md
  - active/midnight-mlh-2026-05/research/midnight-validation-round1.md
  - active/midnight-mlh-2026-05/research/compact-stdlib-shielded-ops.md
  - active/midnight-mlh-2026-05/research/midnight-live-contract-patterns.md
tags: [prd, hackathon, midnight, build, payments]
---

# PRD — Tesseract: Private Business Payments Rail
## MLH × Midnight Hackathon — May 15–17 2026

**Status:** LOCKED FOR BUILD. Claude Code reads this file first, then the referenced vault files.

**Decision record:** Product pivot confirmed by Abhinav 2026-05-15. Tessera DEX abandoned. Private payments rail is the hackathon product.

---

## 1. What We Are Building

**Tesseract** is a private business payments rail on Midnight Network.

Three connected flows over one shared primitive: private obligation + private settlement + optional selective disclosure.

> "We're not building an invoice tool. We're building the private payments rail underneath payroll, vendor payouts, payment requests, and institutional settlement on Midnight."

**One-sentence judge pitch:**
> "Tesseract is the first private payments primitive for businesses on Midnight — send batch payouts, accept payment requests, and share claimable payment links, with every amount hidden by ZK proof and every audit disclosure controlled by cryptographic key."

---

## 2. The Three Flows

### Flow 1 — Batch Pay

A business enters N recipients with amounts. One transaction locks the total in TesseractCore. Each recipient independently claims their private payout with a Merkle inclusion proof. Public chain sees: batch ID, Merkle root, cumulative claimed amount. Nothing else.

**Why it matters:** Covers payroll, contractor payouts, grants, rebates, DAO treasury disbursements.

### Flow 2 — Payment Link

A payer generates a static claim package for one recipient (single-leaf batch). The package is shared as a URL or via any channel. The recipient opens the link, imports the package, and claims their private payment. No pre-registration. No counterparty visibility on-chain.

**Why it matters:** Solves the onboarding problem. Recipient doesn't need to be pre-whitelisted. Works for any crypto-native recipient with a Midnight wallet.

**Architecture note:** Payment Link is NOT a separate circuit. It is UX-only — a Batch Pay with N=1 whose claim package is distributed as a shareable link. Same `submitBatchRoot` + `claimPayment` circuits. Zero additional contract work.

### Flow 3 — Payment Request

A contractor/vendor creates a private payment request on-chain — a cryptographic commitment to the amount and their identity, with a deadline. The payer sees it in their dashboard, pays it via Batch Pay targeting the requester as recipient. After receiving their claim, the requester marks the request as fulfilled.

**Why it matters:** B2B payables, contractor invoicing, OTC settlement, any scenario where the recipient initiates the payment obligation.

**Architecture note:** Requires 2 new circuits (`createPaymentRequest` + `markRequestPaid`) and 4 new flat maps. Scope is ~80 lines of Compact total.

---

## 3. Architecture Overview

### 3.1 What Is Reused vs New

| Component | Source | Status |
|---|---|---|
| `submitBatchRoot` circuit | Archive (updated) | Reuse + fix `insertCoin` for OQ-16 |
| `claimPayment` circuit | Archive (updated) | Reuse + remove `contractCoin` witness (OQ-16 resolved) |
| `reclaimExpiredBatch` circuit | Archive (updated) | Reuse + same OQ-16 fix |
| Merkle tree spec (D=16) | Archive AD-28 | Reuse exactly |
| Encrypted memo pattern | Archive AD-20, AD-26 | Reuse (app-side only — Compact `encrypt()` confirmed dead) |
| `persistentHash` usage | Archive + validation | Reuse exactly |
| `createPaymentRequest` circuit | NEW | Build from scratch |
| `markRequestPaid` circuit | NEW | Build from scratch |
| Payment request ledger maps (×4) | NEW | Build from scratch |

### 3.2 Key Corrections vs Archive

The archive settlement-engine-spec.md is 97% accurate but has 4 confirmed corrections from validation-round1.md:

1. **`encrypt()` does not exist in Compact** — all encrypted memos are app-side X25519+ChaCha20 ciphertexts passed as public circuit parameters and `disclose()`d on-chain. AD-26 fallback is now the ONLY path.

2. **`claimNullifiers` key is `Bytes<32>` not `Bytes<64>`** — `persistentHash` always returns `Bytes<32>`. Fixed in this PRD.

3. **OQ-16 RESOLVED** — `Map.insertCoin` exists for `Map<K, QualifiedShieldedCoinInfo>` (confirmed). `contractCoin` witness input removed from `claimPayment` and `reclaimExpiredBatch`. Contract uses `batchCoins.insertCoin(batchId, coin)` after `receiveShielded`, then `batchCoins.lookup(batchId)` inside `claimPayment` and `reclaimExpiredBatch`.

4. **DApp Connector v4 breaking changes** — `enable()` removed, use `connect(networkId)` directly. `getShieldedAddresses()` (plural). Web app only, no circuit impact.

### 3.3 Complete TesseractCore Ledger State

All flat maps. No struct maps. `BlockLimitExceeded` confirmed if struct maps used.

```compact
ledger {
  // ====== BATCH PAY + PAYMENT LINK (5 batch maps + 1 coin map + 1 nullifier map) ======

  // Batch coin custody — OQ-16 resolved: insertCoin stores QualifiedShieldedCoinInfo
  batchCoins:           Map<Bytes<32>, QualifiedShieldedCoinInfo>  // batchId → pool coin

  // Batch registry (5 flat maps — batchTotalAmounts omitted for payer privacy, Invariant 14)
  batchMerkleRoots:     Map<Bytes<32>, Bytes<32>>     // batchId → merkleRoot (SHA-256 Bytes<32>)
  batchDeadlines:       Map<Bytes<32>, Uint<64>>       // batchId → Unix timestamp deadline
  batchClaimedAmounts:  Map<Bytes<32>, Uint<128>>      // batchId → cumulative claimed so far
  payerCommitments:     Map<Bytes<32>, Bytes<32>>      // batchId → persistentHash(payerKey, batchNonce)
  batchReclaimed:       Map<Bytes<32>, Boolean>        // batchId → double-reclaim guard

  // Claim double-spend prevention
  claimNullifiers:      Map<Bytes<32>, Boolean>        // persistentHash(claimSecret, leafIndex, batchId) → used

  // ====== PAYMENT REQUEST (4 flat maps) ======

  requestExists:        Map<Bytes<32>, Boolean>        // requestId → exists guard
  requestStatus:        Map<Bytes<32>, Uint<64>>       // requestId → 0=open 1=paid 2=expired
  requestDeadlines:     Map<Bytes<32>, Uint<64>>       // requestId → deadline timestamp
  requestPayeeHash:     Map<Bytes<32>, Bytes<32>>      // requestId → persistentHash(requesterKey, requestNonce)
}
```

**Total: 11 flat maps.** All conform to the Aliit-confirmed flat-map-only invariant.

---

## 4. Circuit Specifications

### 4.1 `submitBatchRoot` — Lock Batch Value + Commit Merkle Root

**Purpose:** Payer locks total payment value in TesseractCore and commits the Merkle root of (recipientKey, amount) pairs. No recipient data on-chain.

**Public parameters:** `batchId`, `deadline`

**Witness inputs:** `coin`, `merkleRoot`, `totalAmount`, `payerKey`, `batchNonce`

```compact
export circuit submitBatchRoot(
  batchId:   Bytes<32>,                       // unique ID: persistentHash(merkleRoot, payerKey, batchNonce) — off-chain
  deadline:  Uint<64>                         // public: batch claim deadline (Unix seconds)
  // WITNESS — never on-chain
  witness coin:         ShieldedCoinInfo,     // total payout value
  witness merkleRoot:   Bytes<32>,            // Merkle root of (leafKey, amount) pairs
  witness totalAmount:  Uint<128>,            // sum of all payments (verified against coin.value)
  witness payerKey:     ZswapCoinPublicKey,   // payer identity (stored as hash — never plaintext)
  witness batchNonce:   Bytes<32>             // HMAC-SHA256(rootSeed, "tesseract_batch_nonce_" || batchIndex)
): [] {
  assert coin.value == totalAmount;

  receiveShielded(disclose(coin));

  // OQ-16 resolved: store coin reference for claims
  ledger.batchCoins.insertCoin(disclose(batchId), coin);

  ledger.batchMerkleRoots.insert(disclose(batchId), merkleRoot);
  ledger.batchDeadlines.insert(disclose(batchId), disclose(deadline));
  ledger.batchClaimedAmounts.insert(disclose(batchId), 0);
  ledger.payerCommitments.insert(disclose(batchId), persistentHash(payerKey, batchNonce));
  ledger.batchReclaimed.insert(disclose(batchId), false);

  disclose(batchId);
}
```

**Chain records:** `batchId` (opaque hash), batch deadline, Merkle root (opaque), zero claimed amount, payer hash (opaque).

**What's NOT on-chain:** Total amount, payer identity, any recipient data.

---

### 4.2 `claimPayment` — Recipient Claims Private Payout

**Purpose:** Recipient proves Merkle inclusion and receives their shielded UTXO from TesseractCore pool.

**Public parameters:** `batchId`, `encryptedAuditMemo`

**Witness inputs:** `amount`, `merkleProof`, `leafIndex`, `leafKey`, `claimSecret`

> Note: `contractCoin` witness removed — OQ-16 resolved via `batchCoins.lookup`.

```compact
export circuit claimPayment(
  batchId:             Bytes<32>,
  encryptedAuditMemo:  Bytes<128>               // app-side X25519+ChaCha20, auditor-key-encrypted
  // WITNESS
  witness amount:       Uint<128>,
  witness merkleProof:  Vector<16, Bytes<32>>,  // D=16, bottom-to-top
  witness leafIndex:    Uint<64>,
  witness leafKey:      ZswapCoinPublicKey,
  witness claimSecret:  Field
): [] {
  // 1. Verify deadline not passed
  const deadlineEntry = ledger.batchDeadlines.lookup(disclose(batchId));
  assert(deadlineEntry.is_some, "Batch not found");
  assert(kernel.blockTimeLessThan(deadlineEntry.value), "Batch expired");

  // 2. Compute nullifier (Bytes<32> — persistentHash always returns Bytes<32>)
  const claimNullifier = persistentHash(claimSecret, leafIndex, batchId);
  const alreadyClaimed = ledger.claimNullifiers.lookup(claimNullifier);
  assert(!alreadyClaimed.is_some || !alreadyClaimed.value, "Already claimed");

  // 3. Build leaf
  const leaf = persistentHash(leafKey, amount);

  // 4. Merkle path verification (D=16 iterations — compile-time constant)
  // fold over Vector<16> checking left/right direction from leafIndex bit decomposition
  // full implementation: see Merkle spec Section 5.6 in settlement-engine-spec.md

  // 5. Assert computed root == stored root
  const rootEntry = ledger.batchMerkleRoots.lookup(disclose(batchId));
  assert(rootEntry.is_some && computedRoot == rootEntry.value, "Invalid proof");

  // 6. Mark claimed
  ledger.claimNullifiers.insert(claimNullifier, true);

  // 7. Update cumulative claimed
  const prev = ledger.batchClaimedAmounts.lookup(disclose(batchId));
  ledger.batchClaimedAmounts.insert(disclose(batchId),
    if prev.is_some { prev.value + amount } else { amount });

  // 8. Fetch pool coin (OQ-16 resolved) and send
  const coinEntry = ledger.batchCoins.lookup(disclose(batchId));
  assert(coinEntry.is_some, "No pool coin");
  const sendResult = sendShielded(
    coinEntry.value,
    left<ZswapCoinPublicKey, ContractAddress>(leafKey),
    amount
  );

  // 9. Store change coin back (UTXO chain model — AD-21)
  // sendResult.change is the change coin (verify exact field name at compile)
  ledger.batchCoins.insertCoin(disclose(batchId), sendResult.change);

  // 10. Disclose encrypted audit memo (auditor decrypts with their key)
  disclose(encryptedAuditMemo);
}
```

**Chain records:** Nullifier (opaque), cumulative claimed total (aggregate, not per-claim), encrypted audit memo blob (auditor-only decryptable).

**What recipient sees:** Incoming shielded UTXO in their Midnight Lace wallet via Indexer ViewingKey session.

**Compile-time discovery:** Exact field name for `sendResult.change` — verify at first compile. See Section 8 (Risk Register).

---

### 4.3 `reclaimExpiredBatch` — Payer Recovers Unclaimed Funds

**Purpose:** After deadline, payer recovers remaining pool funds. Mandatory — without this, partially-claimed batches permanently lock funds.

```compact
export circuit reclaimExpiredBatch(
  batchId: Bytes<32>
  // WITNESS
  witness payerKey:   ZswapCoinPublicKey,
  witness batchNonce: Bytes<32>
): [] {
  // 1. Deadline must have passed
  const deadlineEntry = ledger.batchDeadlines.lookup(disclose(batchId));
  assert(deadlineEntry.is_some, "Batch not found");
  assert(kernel.blockTimeGreaterThan(deadlineEntry.value), "Batch still active");

  // 2. Not already reclaimed
  const reclaimedEntry = ledger.batchReclaimed.lookup(disclose(batchId));
  assert(!reclaimedEntry.is_some || !reclaimedEntry.value, "Already reclaimed");

  // 3. Verify caller is payer
  assert(persistentHash(payerKey, batchNonce) ==
    ledger.payerCommitments.lookup(disclose(batchId)).value, "Not payer");

  // 4. Mark reclaimed
  ledger.batchReclaimed.insert(disclose(batchId), true);

  // 5. Return remaining pool coin to payer
  const coinEntry = ledger.batchCoins.lookup(disclose(batchId));
  assert(coinEntry.is_some, "No pool coin");
  sendShielded(
    coinEntry.value,
    left<ZswapCoinPublicKey, ContractAddress>(payerKey),
    coinEntry.value.value     // send entire remaining balance
  );
}
```

---

### 4.4 `createPaymentRequest` — NEW Circuit

**Purpose:** Requester (contractor/vendor) posts a private payment request on-chain. Amount stays private (off-chain). Only a commitment and deadline appear on-chain.

```compact
export circuit createPaymentRequest(
  requestId: Bytes<32>,          // public: persistentHash(requesterKey, requestNonce, deadline) — computed off-chain
  deadline:  Uint<64>            // public: request expiry
  // WITNESS
  witness requesterKey:  ZswapCoinPublicKey,
  witness requestNonce:  Field
): [] {
  // Guard: requestId must be unused
  const exists = ledger.requestExists.lookup(disclose(requestId));
  assert(!exists.is_some || !exists.value, "Request ID already used");

  // Deadline must be in future
  assert(kernel.blockTimeLessThan(disclose(deadline)), "Deadline not in future");

  // Store request
  ledger.requestExists.insert(disclose(requestId), true);
  ledger.requestStatus.insert(disclose(requestId), 0);         // 0 = open
  ledger.requestDeadlines.insert(disclose(requestId), disclose(deadline));
  ledger.requestPayeeHash.insert(
    disclose(requestId),
    persistentHash(requesterKey, requestNonce)                  // identity commitment, never plaintext
  );

  disclose(requestId);
}
```

**Chain records:** `requestId` (opaque hash), deadline timestamp, status=0, payee hash (opaque). Amount: NOT on-chain.

**Off-chain:** Requester distributes `requestId` + amount + their wallet address to payer out-of-band (email/app). Payer uses this to create a Batch Pay targeting requester.

---

### 4.5 `markRequestPaid` — NEW Circuit

**Purpose:** After receiving their `claimPayment` payout, requester marks the request as fulfilled on-chain.

```compact
export circuit markRequestPaid(
  requestId: Bytes<32>
  // WITNESS
  witness requesterKey:  ZswapCoinPublicKey,
  witness requestNonce:  Field
): [] {
  // Must be open
  const statusEntry = ledger.requestStatus.lookup(disclose(requestId));
  assert(statusEntry.is_some && statusEntry.value == 0, "Request not open");

  // Deadline not yet passed (can only mark paid while still within window)
  const deadlineEntry = ledger.requestDeadlines.lookup(disclose(requestId));
  assert(deadlineEntry.is_some, "Request not found");
  assert(kernel.blockTimeLessThan(deadlineEntry.value), "Request expired");

  // Verify caller is requester
  const payeeHashEntry = ledger.requestPayeeHash.lookup(disclose(requestId));
  assert(payeeHashEntry.is_some &&
    payeeHashEntry.value == persistentHash(requesterKey, requestNonce),
    "Not requester");

  // Mark paid
  ledger.requestStatus.insert(disclose(requestId), 1);          // 1 = paid
}
```

**Chain records:** `requestStatus[requestId]` updated to 1. Nothing else.

---

## 5. Merkle Tree Specification

> **Full shared spec in:** `raw/unsorted/tesseract-pay-archive/settlement-engine-spec.md` Section 5.
> This is a binding contract between circuit and web app. Deviate from neither.

**Key parameters:**
- Depth D = 16 (compile-time constant, supports up to 65,536 recipients per batch)
- Hash function: `persistentHash` in circuit (SHA-256 based, confirmed stable). Web app: `@midnight-ntwrk/compact-runtime` `persistentHash` JS export (same underlying function).
- Leaf: `persistentHash(recipientKey_bytes32, amount_bytes128)` — 32+16 byte input
- NULL_LEAF: `persistentHash(0x00*32, 0x00*16)` — hardcoded constant, identical in circuit + web app
- Node: `persistentHash(leftChild, rightChild)`
- Proof: `Vector<16, Bytes<32>>` ordered bottom-to-top
- Nullifier: `persistentHash(claimSecret, leafIndex, batchId)`

**First integration test (mandatory before any real tx):** Build same tree in web app and circuit stub. Assert roots match. Any divergence silently breaks all proofs.

---

## 6. Disclosure Model

### What the chain shows publicly

| Data | Visible? | Notes |
|---|---|---|
| Batch submitted | ✅ Yes | `batchId` opaque hash only |
| Batch deadline | ✅ Yes | Plain timestamp — OK for UX |
| Merkle root | ✅ Yes | Opaque hash |
| Individual amounts | ❌ No | Witness-only |
| Recipient identities | ❌ No | Never on-chain |
| Payer identity | ❌ No | Hash commitment only |
| Cumulative claimed | ✅ Yes | Aggregate total, not per-claim |
| Claim happened | ✅ Yes | Nullifier (opaque) |
| Payment request exists | ✅ Yes | `requestId` opaque hash |
| Payment request amount | ❌ No | Off-chain only |
| Request status (open/paid) | ✅ Yes | 0 or 1 |

### Auditor view (selective disclosure)

The auditor holds a key pair. For each `claimPayment` transaction, the payer's app encrypts `(batchId, amount, timestamp, recipient_hint)` with the auditor's X25519 public key and passes the ciphertext as `encryptedAuditMemo` (public circuit parameter). The circuit calls `disclose(encryptedAuditMemo)` — the blob is on-chain. Auditor scans all TesseractCore transactions and attempts to decrypt. Successfully decrypted memos are their audit trail.

**Auditor sees per claim:** batch ID, amount, timestamp. NOT recipient public identity.

---

## 7. TypeScript Off-Chain Layer

### 7.1 Stack

```
@midnight-ntwrk/compact-runtime    — contract deployment + calls
@midnight-ntwrk/midnight-js-wallet — WalletBuilder.build() headless wallet
@midnight-ntwrk/midnight-js-network-id — NetworkId.TestNet
libsodium-wrappers                 — X25519+ChaCha20 (audit memo + payment link encryption)
@midnight-ntwrk/compact-runtime    — persistentHash JS export (Merkle tree + nullifiers)
merkletreejs + SHA-256             — off-chain Merkle tree construction (use same hash as circuit)
TypeScript / Node.js               — coordinator + backend
Vite + React + Tailwind            — frontend
```

### 7.2 Wallet Setup

```typescript
import { WalletBuilder, NetworkId } from '@midnight-ntwrk/midnight-js-wallet';

const wallet = await WalletBuilder.build(
  process.env.INDEXER_URL!,
  process.env.INDEXER_WS_URL!,
  process.env.PROOF_SERVER_URL!,  // http://localhost:6300
  process.env.NODE_URL!,
  process.env.WALLET_SEED!,
  NetworkId.TestNet
);
```

**Proof server:**
```bash
docker run -p 6300:6300 midnightnetwork/proof-server:6.1.0-alpha.6
```

**DApp Connector (frontend wallets):**
```typescript
// v4 breaking change: enable() removed
const api = await window.midnight.mnLace.connect(networkId);  // NOT enable() + connect()
const addresses = await api.getShieldedAddresses();           // PLURAL — not getShieldedAddress()
```

### 7.3 Batch Pay Flow

```typescript
async function createBatch(recipients: {key: ZswapPubkey, amount: bigint}[]) {
  // 1. Build Merkle tree (web app, SHA-256 via persistentHash JS)
  const { root, tree } = buildMerkleTree(recipients, D=16);

  // 2. Compute batch identifiers
  const batchNonce = hmacSHA256(rootSeed, `tesseract_batch_nonce_${batchIndex}`);
  const batchId = persistentHash(root, payerKey, batchNonce);

  // 3. Generate static claim packages for each recipient
  const claimPackages = recipients.map((r, i) => ({
    batchId,
    merkleProof: getMerkleProof(tree, i, 16),
    amount: r.amount,
    claimSecret: randomField(),
    leafKey: r.key,
    leafIndex: i
  }));

  // 4. Submit batch (payer sends shielded coin to TesseractCore + circuit call)
  await contract.submitBatchRoot(batchId, deadline, {
    coin: payerShieldedCoin,
    merkleRoot: root,
    totalAmount: recipients.reduce((a, r) => a + r.amount, 0n),
    payerKey: payerKey,
    batchNonce: batchNonce
  });

  // 5. Persist claim packages (IndexedDB + encrypted export before submitBatchRoot confirm)
  await saveBatchData(batchId, claimPackages, tree);

  return { batchId, claimPackages };
}
```

### 7.4 Claim Flow (Batch Pay + Payment Link)

```typescript
async function claimPayment(claimPackage: ClaimPackage, auditorPubKey: Uint8Array) {
  const { batchId, merkleProof, amount, claimSecret, leafKey, leafIndex } = claimPackage;

  // Encrypt audit memo (app-side — Compact has no encrypt())
  const memoPlaintext = encode(batchId, amount, Date.now());
  const encryptedAuditMemo = encryptX25519ChaCha20(memoPlaintext, auditorPubKey); // 128 bytes

  await contract.claimPayment(batchId, encryptedAuditMemo, {
    amount,
    merkleProof,
    leafIndex,
    leafKey,
    claimSecret
  });
}
```

### 7.5 Payment Link

```typescript
// Payment Link = single-recipient batch (N=1) with claim package as URL
async function createPaymentLink(recipient: {key: ZswapPubkey, amount: bigint}) {
  const { batchId, claimPackages } = await createBatch([recipient]);
  const link = `https://tesseract.app/claim?pkg=${btoa(JSON.stringify(claimPackages[0]))}`;
  return link;
}
```

### 7.6 Payment Request Flow

```typescript
// Requester side
async function createPaymentRequest(amount: bigint, deadline: number) {
  const requestNonce = randomField();
  const requestId = persistentHash(requesterKey, requestNonce, BigInt(deadline));

  await contract.createPaymentRequest(requestId, BigInt(deadline), {
    requesterKey,
    requestNonce
  });

  // Share requestId + amount with payer out-of-band
  return { requestId, amount, deadline };
}

// Requester confirms receipt (after claimPayment succeeds)
async function confirmRequestPaid(requestId: Bytes32) {
  await contract.markRequestPaid(requestId, {
    requesterKey,
    requestNonce  // stored locally when request was created
  });
}

// Payer pays a request — just create a batch with requester as single recipient
async function payRequest(request: {requestId: Bytes32, requesterKey: ZswapPubkey, amount: bigint}) {
  return createBatch([{ key: request.requesterKey, amount: request.amount }]);
}
```

---

## 8. UI Specification

### Screen 1 — Dashboard (`/`)

- Header: "Tesseract — Private Business Payments"
- **Outbox panel:** Active batches — Batch# | Recipients | Status | Deadline countdown | "Manage"
- **Inbox panel:** Incoming payment requests — Request# | Status | "Pay Now"
- **Claims panel:** Unclaimed fills — Batch# | "Claim"
- **Quick actions:** "Send Batch" | "Create Payment Link" | "Request Payment"

### Screen 2 — Send Batch (`/send`)

- Step 1: Add recipients (paste addresses + amounts, or CSV upload)
- Step 2: Set deadline (slider: 24h / 48h / 7d)
- Step 3: Review + fund (wallet prompts for shielded payment)
- Step 4: Success — "Batch submitted. Claim packages ready to distribute."
- Claim package export: download JSON / copy per-recipient links

### Screen 3 — Claim (`/claim?pkg=...`)

- Accepts claim package URL parameter (Payment Link flow) OR local import
- Shows: amount (private — only visible to claimant), batch deadline, claim button
- Post-claim: "Claimed. Nullifier: `0xabc...`. Payment in your Midnight wallet."
- Midnight explorer link showing nullifier (amount not visible on explorer)

### Screen 4 — Payment Request (`/request`)

- Create request: enter amount, deadline, optional memo
- Generates: shareable request link
- Status tracking: open / paid / expired

### Screen 5 — Auditor View (`/audit`)

- Auditor key input
- On valid key: decrypted claim table — Batch# | Amount | Timestamp
- Toggle "Public view" (chain data) vs "Auditor view" (decrypted)
- Export CSV
- Banner: "This view requires the auditor key. Without it, data is cryptographically inaccessible."

---

## 9. Demo Script (3 minutes for judges)

**Setup:** 2 contractors, 1 vendor, 1 business, 1 auditor. Testnet-02 wallets.

1. **[00:00–01:00] Batch Pay** — Business opens dashboard. Creates a batch for 2 contractors ($500, $300). Submits. Chain shows: batch ID + opaque Merkle root. No amounts. UI shows "Batch sealed."

2. **[01:00–01:30] Payment Link** — Business copies claim link for Contractor A. Contractor A opens link in fresh browser. Claims $500. Chain shows: nullifier only. Amount never appears.

3. **[01:30–02:00] Payment Request** — Vendor creates request for $200. Business sees it on dashboard. Pays it (single-recipient batch). Vendor claims. Vendor calls `markRequestPaid`. Request status flips to "paid."

4. **[02:00–02:30] Auditor View** — Auditor enters key. Full decrypted table appears: all 3 payments with amounts and timestamps. Judge switches to "Public view" — chain shows nothing but hashes.

5. **[02:30–03:00] Judge question** — "Is this really private?" Answer: "Every amount is a ZK circuit witness. Midnight's `disclose()` enforces disclosure at protocol level — no application code can override it. Without the auditor key, even Midnight validators see only commitments. This is structural privacy, not application-layer."

---

## 10. Build Order (47h Remaining)

### Hour 0–3: Environment + Skeleton

```
- Clone/init repo
- Docker: docker run -p 6300:6300 midnightnetwork/proof-server:6.1.0-alpha.6
- Confirm testnet-02 endpoints (Discord fallback: local devnet)
- Write TesseractCore.compact: all 11 ledger maps + all 5 circuit stubs
- Compile stub — confirm no syntax errors, no type errors
- Deploy empty contract to testnet — get txHash
```

### Hour 3–10: Core Circuits (Archive Port + OQ-16 Fix)

```
- submitBatchRoot: port from archive, replace witness coin storage with batchCoins.insertCoin
- claimPayment: port from archive, remove contractCoin witness, add batchCoins.lookup + insertCoin(change)
  ⚠️ Compile-time discovery: confirm sendShielded return type + .change field name
- reclaimExpiredBatch: port from archive, same batchCoins.lookup pattern
- Compile all 3 — fix any type errors
- Benchmark: claimPayment with D=16 Merkle fold → record k + rows. Must be < 14,000 rows.
```

### Hour 10–14: New Circuits (Payment Request)

```
- createPaymentRequest: write from Section 4.4 spec
- markRequestPaid: write from Section 4.5 spec
- Compile both — confirm Uint<64> status enum, persistentHash inputs compile clean
- Deploy full 5-circuit contract to testnet
```

### Hour 14–22: TypeScript Layer

```
- submitBatchFlow(): coin selection → Merkle tree build → circuit call → claim package persist
- claimPaymentFlow(): load package → fetch live coin reference → build audit memo → circuit call
- reclaimFlow(): deadline check → circuit call
- createPaymentRequestFlow(): generate requestId → circuit call → return shareable link
- payRequestFlow(): wrap as single-recipient batch
- markRequestPaidFlow(): circuit call
- Integration test: 2 recipients, 1 batch, 1 settlement, 2 claims — all succeed on testnet
  ⚠️ Merkle root parity test (circuit vs web app) MUST pass before proceeding
```

### Hour 22–34: UI

```
- Screen 1: Dashboard (wire to contract state polling)
- Screen 2: Send Batch (form + Merkle build + submitBatchFlow)
- Screen 3: Claim (URL param import + claimPaymentFlow)
- Screen 4: Payment Request (createPaymentRequestFlow + markRequestPaidFlow)
- Screen 5: Auditor view (decrypt loop over chain data)
```

### Hour 34–42: Demo Rehearsal + Hardening

```
- Full end-to-end: 3 flows as per demo script
- Run 3 times. Time each step.
- Fix error states, loading states, timeout handling
- Seed demo wallets with testnet NIGHT
- Adjust batch deadlines for demo speed (30-minute window)
```

### Hour 42–47: Submission

```
- README.md (Devpost requires: what it does, how we built it, challenges, tech stack)
- Record 3-minute demo video (backup if live demo fails)
- Devpost submission before deadline
- Final Midnight explorer screenshots for README
```

---

## 11. Risk Register

| Risk | Probability | Mitigation |
|---|---|---|
| `sendShielded` return type: `.change` field unknown | High | Confirm at Hour 3 compile. Check `compact-stdlib-shielded-ops.md` first. |
| testnet-02 endpoints not yet posted | High | Use local Midnight devnet: `docker run midnightnetwork/devnet` |
| `kernel.blockTimeLessThan` / `blockTimeGreaterThan` exact signature | Medium | Verify from `midnight-live-contract-patterns.md` at first compile |
| `fold` / `Vector<16>` Merkle loop — Compact syntax for bit decomposition | Medium | Reference `compact-stdlib-shielded-ops.md`. Fallback: manual if/else 16-step unrolled |
| `persistentHash` JS parity with circuit hash | Medium | **Priority test at Hour 14.** Build same 2-leaf tree in both. Roots must match. |
| Proof time for `claimPayment` D=16 | Low-Medium | Benchmark at Hour 3. Drop to D=8 if > 60s. Supports 256 recipients — sufficient for demo. |
| `encryptedAuditMemo: Bytes<128>` circuit param size limit | Low | Test at compile. Reduce to Bytes<64> if needed. Memo content can be compressed. |
| Payment request circuits: `Uint<64>` status enum validity | Low | Test compile Hour 10. Fallback: use `Boolean` pair (isPaid, isExpired). |
| Testnet down during submission | Low | Demo video backup is mandatory deliverable. |

---

## 12. Vault File Index for Claude Code

Read these files in this order before writing any code:

| Priority | File | What to get from it |
|---|---|---|
| 1 | `active/midnight-mlh-2026-05/build/PRD.md` | **This file** — full spec |
| 2 | `raw/unsorted/tesseract-pay-archive/settlement-engine-spec.md` | Full circuit bodies, Merkle spec Section 5, disclosure model, constraint budget |
| 3 | `active/midnight-mlh-2026-05/research/midnight-validation-round1.md` | Confirmed API corrections: `encrypt()` dead, `Map.insertCoin` confirmed, `Bytes<32>` nullifier key, DApp Connector v4 fixes |
| 4 | `active/midnight-mlh-2026-05/research/compact-stdlib-shielded-ops.md` | Compact stdlib API reference: `receiveShielded`, `sendShielded`, `persistentHash`, etc. |
| 5 | `active/midnight-mlh-2026-05/research/midnight-live-contract-patterns.md` | Real contract patterns: `insertCoin`, `Map.lookup`, `fold`, `Vector` usage |
| 6 | `raw/unsorted/tesseract-pay-archive/architecture-decisions.md` | All 25 ADs — understand WHY decisions were made before changing anything |
| 7 | `active/midnight-mlh-2026-05/CONTEXT.md` | Confirmed primitives list — what's been verified as working |

**Do NOT read** `active/midnight-mlh-2026-05/hackathon-spec.md` — that is the abandoned Tessera DEX spec. Irrelevant.

---

## 13. Self-Review — Buildability Verification

All claims verified against vault evidence before writing this PRD.

### Confirmed Midnight Primitives (all required by this build)

| Primitive | Used in | Source |
|---|---|---|
| `receiveShielded(disclose(coin))` | `submitBatchRoot` | validation-round1.md ✅ |
| `sendShielded(coin, recipient, amount)` | `claimPayment`, `reclaimExpiredBatch` | settlement-engine-spec.md CONFIRMED ✅ |
| `Map.insertCoin(key, coin)` | `submitBatchRoot`, `claimPayment` | validation-round1.md ✅ |
| `Map.lookup(key)` | all circuits | validation-round1.md ✅ |
| `persistentHash(...)` → `Bytes<32>` | nullifiers, commitments, Merkle | validation-round1.md ✅ |
| `disclose(value)` | all circuits | CONTEXT.md, arch-decisions ✅ |
| `kernel.blockTimeLessThan(ts)` | `claimPayment`, `createPaymentRequest` | CONTEXT.md ✅ |
| `kernel.blockTimeGreaterThan(ts)` | `reclaimExpiredBatch` | CONTEXT.md ✅ |
| `WalletBuilder.build(...)` | TypeScript layer | CONTEXT.md ✅ |
| Flat maps only (no struct maps) | all ledger state | Aliit production confirmation ✅ |
| `Vector<N, T>` + `fold` | Merkle proof D=16 | CONTEXT.md ✅ |
| `QualifiedShieldedCoinInfo` as map value | `batchCoins` map | validation-round1.md ✅ |

### Confirmed Eliminated

| Item | Status | Correction |
|---|---|---|
| `encrypt()` in Compact | ❌ Does not exist | All memos: app-side X25519+ChaCha20 |
| `claimNullifiers: Map<Bytes<64>, _>` | ❌ Wrong type | Fixed: `Map<Bytes<32>, Boolean>` |
| `contractCoin` witness in claimPayment | ❌ Not needed | Fixed: `batchCoins.lookup` via `insertCoin` |
| `WalletBuilder.buildFromSeed()` | ❌ Deprecated v4.0.0 | Fixed: `WalletBuilder.build()` |
| `wallet.enable()` then `connect()` | ❌ Removed v4.0.0 | Fixed: `connect(networkId)` only |

### Remaining Compile-Time Discoveries (not blockers)

| Question | Risk | How to resolve |
|---|---|---|
| `sendShielded` return type structure (`.change` field name) | Medium | Check at first compile of `claimPayment`. Consult `compact-stdlib-shielded-ops.md`. |
| `persistentHash` JS export exact function signature | Low | Test Merkle root parity at Hour 14 integration. |
| `fold` syntax for bit decomposition in Merkle proof | Low | Reference `midnight-live-contract-patterns.md`. |
| Payment request `Uint<64>` enum (0/1/2) — valid Compact type? | Low | Test compile Hour 10. Fallback: two Boolean maps. |

### Scope Assessment

| Flow | New circuits | Reuse | Estimated hours |
|---|---|---|---|
| Batch Pay | 0 new | `submitBatchRoot` + `claimPayment` + `reclaimExpiredBatch` (port) | 7h circuits + 4h TS |
| Payment Link | 0 new | UX only — N=1 batch + claim package URL | 2h UI |
| Payment Request | 2 new (~80 lines) | `persistentHash` pattern, flat maps | 4h circuits + 2h TS |
| UI | — | — | 12h |
| Demo + hardening | — | — | 8h |
| README + submit | — | — | 5h |
| **Total** | | | **44h** ← within 47h window |

**Verdict: BUILDABLE. No hard blockers. All compile-time discoveries have designed fallbacks. 47h is sufficient for MVP demo submission.**

---

## 14. Post-Hackathon Alignment

**Midnight product (this build):** ZK-native privacy rail. Shielded UTXOs, Compact circuits, structural privacy.

**Circle/Arc product (`active/tesseract-arc-circle-grant/`):** EVM treasury application. USDC-native, agent-driven, Circle Developer-Controlled Wallets. Privacy planned via Arc Privacy Module (not live).

**Long-term:** Same brand (Tesseract), same thesis (private by default, auditable on demand), two execution environments. The Circle product's "Shield" milestone = Midnight is that capability working today. The grant narrative: we build privacy-first payments infrastructure across both ZK-native and EVM-native ecosystems. Midnight hackathon → Build Club → Midnight Accelerator. Circle grant → Arc mainnet. Unified product vision converges when Arc Privacy Module ships or cross-chain settlement is viable.

---

*PRD version 1.0 — 2026-05-15. Owner: Claude Chat. Claude Code reads this file + referenced vault files. Replaces hackathon-spec.md (Tessera DEX — abandoned). Product: Tesseract private payments rail.*
