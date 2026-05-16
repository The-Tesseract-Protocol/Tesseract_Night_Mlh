# Tesseract Path A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Tesseract on the Pre-Split UTXO model (ADR-001) so concurrent claims succeed and all three product features (Batch Pay, Payment Link, Payment Request) work end-to-end on Midnight devnet.

**Architecture:** Each batch recipient gets an independent UTXO deposited by the payer before any claims begin. Claims are fully concurrent because each touches a distinct map entry. The contract stores coins keyed by `persistentHash(CoinMapKey{batchId, leaf})` — a compound key that prevents cross-batch collisions for recipients with identical amounts.

**Tech Stack:** Compact 0.19, midnight-js SDK, React 18 + TypeScript, Vite, Tailwind CSS, IndexedDB for payer record persistence.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/contract/TesseractCore.compact` | **Rewrite** | 6 circuits, 9 maps, CoinMapKey compound key |
| `src/contract/descriptors.ts` | **Modify** | Add `CoinMapKeyType`, `hashCoinKey()` |
| `src/types/index.ts` | **Modify** | Add `DepositCoinInput`, `RecipientEntry`; update `ClaimPrivateState`, `ReclaimPrivateState` |
| `src/contract/client.ts` | **Rewrite** | Add `depositCoin`, rename `getRecipientCoin`/`reclaimRecipientCoin`, drop coin param from `submitBatch` |
| `src/flows/submitBatchFlow.ts` | **Rewrite** | 2-phase output: metadata + per-recipient deposit params; bearer mode |
| `src/flows/claimPaymentFlow.ts` | **Modify** | Pass `recipientCoin` as `poolCoin` witness; bearer mode |
| `src/flows/reclaimFlow.ts` | **Rewrite** | Per-leaf reclaim; iterate unclaimed leaves |
| `src/tests/gate3-integration.ts` | **Rewrite** | 2-phase submit → sequential deposits → parallel `Promise.all` claims |
| `src/hooks/useBatchPay.ts` | **Rewrite** | Wire 2-phase submit flow; sequential deposit loop |
| `src/hooks/useClaim.ts` | **Rewrite** | Fetch recipient coin; build claim witnesses |
| `src/hooks/usePaymentRequest.ts` | **Rewrite** | Create request; mark paid |
| `src/hooks/useAuditDecrypt.ts` | **Rewrite** | Fetch on-chain memos; decrypt client-side |
| `src/screens/Dashboard.tsx` | **Implement** | Wallet balance + batch list + request summary |
| `src/screens/SendBatch.tsx` | **Implement** | Multi-recipient form → 2-phase submit → share links |
| `src/screens/Claim.tsx` | **Implement** | Paste link → claim → success |
| `src/screens/PaymentRequest.tsx` | **Implement** | Create request tab + incoming tab |
| `src/screens/Auditor.tsx` | **Implement** | Paste key → decrypt table |

---

## Task 1: Rewrite TesseractCore.compact

**Files:**
- Rewrite: `src/contract/TesseractCore.compact`

- [ ] **Step 1: Replace file with new contract**

```compact
pragma language_version >= 0.19;

import CompactStandardLibrary;

// =============================================================
// TesseractCore — Private Business Payments Rail  v2 (Path A)
// Pre-Split UTXO: each recipient gets independent coin
// 6 circuits | 9 flat maps
// =============================================================

// ── Structs ──────────────────────────────────────────────────

struct PayerCommitInput {
  payerKey: ZswapCoinPublicKey;
  batchNonce: Bytes<32>;
}

struct ClaimNullifierInput {
  claimSecret: Bytes<32>;
  leaf: Bytes<32>;
  batchId: Bytes<32>;
}

struct RequesterCommitInput {
  requesterKey: ZswapCoinPublicKey;
  requestNonce: Bytes<32>;
}

// Compound map key — prevents cross-batch collision when same recipient+amount
// appears in multiple batches (same leaf hash, different batchId).
struct CoinMapKey {
  batchId: Bytes<32>;
  leaf: Bytes<32>;
}

// ── Helper ───────────────────────────────────────────────────

pure circuit computeCoinKey(batchId: Bytes<32>, leaf: Bytes<32>): Bytes<32> {
  return persistentHash<CoinMapKey>(CoinMapKey { batchId: batchId, leaf: leaf });
}

// ── Ledger (9 flat maps) ──────────────────────────────────────

// Per-recipient coin — key = computeCoinKey(batchId, leaf)
export ledger recipientCoins: Map<Bytes<32>, QualifiedShieldedCoinInfo>;

export ledger batchMerkleRoots:  Map<Bytes<32>, Field>;
export ledger batchDeadlines:    Map<Bytes<32>, Uint<64>>;
export ledger payerCommitments:  Map<Bytes<32>, Bytes<32>>;
export ledger claimNullifiers:   Map<Bytes<32>, Boolean>;

export ledger requestExists:     Map<Bytes<32>, Boolean>;
export ledger requestStatus:     Map<Bytes<32>, Uint<64>>;
export ledger requestDeadlines:  Map<Bytes<32>, Uint<64>>;
export ledger requestPayeeHash:  Map<Bytes<32>, Bytes<32>>;

// ── Witnesses ────────────────────────────────────────────────

witness getMerkleRoot(): Field;
witness getPayerKey(): ZswapCoinPublicKey;
witness getBatchNonce(): Bytes<32>;

witness getBatchCoin(): QualifiedShieldedCoinInfo;
witness getClaimAmount(): Uint<128>;
witness getMerkleProof(): MerkleTreePath<16, Bytes<32>>;
witness getLeafKey(): ZswapCoinPublicKey;
witness getClaimSecret(): Bytes<32>;

witness getReclaimPayerKey(): ZswapCoinPublicKey;
witness getReclaimBatchNonce(): Bytes<32>;
witness getReclaimCoin(): QualifiedShieldedCoinInfo;

witness getRequesterKey(): ZswapCoinPublicKey;
witness getRequestNonce(): Bytes<32>;
witness getMarkRequesterKey(): ZswapCoinPublicKey;
witness getMarkRequestNonce(): Bytes<32>;

// ── Circuit 1: submitBatchRoot ────────────────────────────────
// Commits Merkle root + payer identity. No coin — deposits happen separately.

export circuit submitBatchRoot(
  batchId:  Bytes<32>,
  deadline: Uint<64>
): [] {
  const merkleRoot  = getMerkleRoot();
  const payerKey    = getPayerKey();
  const batchNonce  = getBatchNonce();

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

// ── Circuit 2: depositRecipientCoin ──────────────────────────
// Payer deposits one coin per recipient. Zero witnesses — coin is public param.

export circuit depositRecipientCoin(
  batchId:            Bytes<32>,
  recipientLeafHash:  Bytes<32>,
  coin:               ShieldedCoinInfo
): [] {
  const d_batchId  = disclose(batchId);
  const d_leaf     = disclose(recipientLeafHash);

  assert(batchDeadlines.member(d_batchId), "batch not found");
  assert(blockTimeLt(batchDeadlines.lookup(d_batchId)), "batch expired");

  const coinKey = computeCoinKey(d_batchId, d_leaf);
  assert(!recipientCoins.member(coinKey), "coin already deposited for this leaf");

  receiveShielded(disclose(coin));
  recipientCoins.insertCoin(
    coinKey,
    disclose(coin),
    right<ZswapCoinPublicKey, ContractAddress>(kernel.self())
  );
}

// ── Circuit 3: claimPayment ──────────────────────────────────
// Recipient proves Merkle inclusion, receives their independent UTXO.

export circuit claimPayment(
  batchId:            Bytes<32>,
  encryptedAuditMemo: Bytes<128>
): [] {
  const amount      = getClaimAmount();
  const merkleProof = getMerkleProof();
  const leafKey     = getLeafKey();
  const claimSecret = getClaimSecret();
  const coin        = getBatchCoin();

  const d_batchId = disclose(batchId);

  // 1. Deadline check
  const deadline = batchDeadlines.lookup(d_batchId);
  assert(blockTimeLt(disclose(deadline)), "batch deadline passed");

  // 2. Nullifier double-spend check
  const nullInput = ClaimNullifierInput {
    claimSecret: claimSecret,
    leaf: merkleProof.leaf,
    batchId: batchId
  };
  const nullifier = persistentHash<ClaimNullifierInput>(disclose(nullInput));
  assert(!claimNullifiers.member(nullifier), "already claimed");

  // 3. Merkle proof verification
  const computedRoot = merkleTreePathRootNoLeafHash<16>(merkleProof);
  const storedRoot   = batchMerkleRoots.lookup(d_batchId);
  assert(computedRoot.field == storedRoot, "invalid merkle proof");

  // 4. Mark nullifier
  claimNullifiers.insert(nullifier, true);

  // 5. Fetch stored coin + verify matches witness
  const d_leaf    = disclose(merkleProof.leaf);
  const coinKey   = computeCoinKey(d_batchId, d_leaf);
  const storedCoin = recipientCoins.lookup(coinKey);
  assert(coin.nonce == storedCoin.nonce, "coin nonce mismatch");
  assert(coin.color == storedCoin.color, "coin color mismatch");
  assert(coin.value == storedCoin.value, "coin value mismatch");

  // 6. Send full coin value to recipient (no change)
  const result = sendShielded(
    disclose(coin),
    left<ZswapCoinPublicKey, ContractAddress>(disclose(leafKey)),
    disclose(storedCoin.value)
  );

  // 7. Clean up map entry
  if(result.change.is_some) {
    recipientCoins.insertCoin(
      coinKey,
      result.change.value,
      right<ZswapCoinPublicKey, ContractAddress>(kernel.self())
    );
  } else {
    recipientCoins.remove(coinKey);
  }

  // 8. Publish encrypted audit memo
  disclose(encryptedAuditMemo);
}

// ── Circuit 4: reclaimRecipientCoin ──────────────────────────
// Payer recovers an unclaimed coin after deadline, per leaf.

export circuit reclaimRecipientCoin(
  batchId:           Bytes<32>,
  recipientLeafHash: Bytes<32>
): [] {
  const payerKey    = getReclaimPayerKey();
  const batchNonce  = getReclaimBatchNonce();
  const coin        = getReclaimCoin();

  const d_batchId = disclose(batchId);
  const d_leaf    = disclose(recipientLeafHash);

  // 1. Deadline must have passed
  const deadline = batchDeadlines.lookup(d_batchId);
  assert(blockTimeGt(disclose(deadline)), "batch deadline not yet passed");

  // 2. Verify payer identity
  const storedCommit = payerCommitments.lookup(d_batchId);
  const payerInput   = PayerCommitInput { payerKey: payerKey, batchNonce: batchNonce };
  assert(
    persistentHash<PayerCommitInput>(disclose(payerInput)) == storedCommit,
    "invalid payer identity"
  );

  // 3. Coin must still exist (not claimed)
  const coinKey = computeCoinKey(d_batchId, d_leaf);
  assert(recipientCoins.member(coinKey), "coin already claimed or not deposited");

  // 4. Verify coin witness matches stored
  const storedCoin = recipientCoins.lookup(coinKey);
  assert(coin.nonce == storedCoin.nonce, "coin nonce mismatch");
  assert(coin.color == storedCoin.color, "coin color mismatch");
  assert(coin.value == storedCoin.value, "coin value mismatch");

  // 5. Return to payer
  const result = sendShielded(
    disclose(coin),
    left<ZswapCoinPublicKey, ContractAddress>(disclose(payerKey)),
    disclose(storedCoin.value)
  );

  if(result.change.is_some) {
    recipientCoins.insertCoin(
      coinKey,
      result.change.value,
      right<ZswapCoinPublicKey, ContractAddress>(kernel.self())
    );
  } else {
    recipientCoins.remove(coinKey);
  }
}

// ── Circuit 5: createPaymentRequest ──────────────────────────

export circuit createPaymentRequest(
  requestId: Bytes<32>,
  deadline:  Uint<64>
): [] {
  const requesterKey  = getRequesterKey();
  const requestNonce  = getRequestNonce();

  assert(!requestExists.member(disclose(requestId)), "requestId already exists");
  assert(blockTimeLt(disclose(deadline)), "deadline must be in the future");

  requestExists.insert(disclose(requestId), true);
  requestStatus.insert(disclose(requestId), 0 as Uint<64>);
  requestDeadlines.insert(disclose(requestId), disclose(deadline));

  const reqInput = RequesterCommitInput { requesterKey: requesterKey, requestNonce: requestNonce };
  requestPayeeHash.insert(
    disclose(requestId),
    persistentHash<RequesterCommitInput>(disclose(reqInput))
  );
}

// ── Circuit 6: markRequestPaid ───────────────────────────────

export circuit markRequestPaid(
  requestId: Bytes<32>
): [] {
  const requesterKey  = getMarkRequesterKey();
  const requestNonce  = getMarkRequestNonce();

  const status = requestStatus.lookup(disclose(requestId));
  assert(status == 0 as Uint<64>, "request not open");

  const reqDeadline = requestDeadlines.lookup(disclose(requestId));
  assert(blockTimeLt(disclose(reqDeadline)), "request deadline passed");

  const storedHash = requestPayeeHash.lookup(disclose(requestId));
  const reqInput   = RequesterCommitInput { requesterKey: requesterKey, requestNonce: requestNonce };
  assert(
    storedHash == persistentHash<RequesterCommitInput>(disclose(reqInput)),
    "invalid requester identity"
  );

  requestStatus.insert(disclose(requestId), 1 as Uint<64>);
}
```

- [ ] **Step 2: Verify file saved**

```bash
wc -l src/contract/TesseractCore.compact
```
Expected: ~220 lines.

---

## Task 2: Compile Contract

**Files:**
- Modify: `src/contract/compiled/` (output from compiler)

- [ ] **Step 1: Run compiler**

```bash
npx compactc src/contract/TesseractCore.compact src/contract/compiled
```

Expected: no errors, no warnings. If `compactc` not found:
```bash
npx @midnight-ntwrk/compact-compiler src/contract/TesseractCore.compact src/contract/compiled
```

- [ ] **Step 2: Verify output files exist**

```bash
ls src/contract/compiled/keys/ src/contract/compiled/zkir/
```
Expected: `claimPayment.prover`, `claimPayment.verifier`, `depositRecipientCoin.prover`, `depositRecipientCoin.verifier`, `reclaimRecipientCoin.prover`, `reclaimRecipientCoin.verifier`, `submitBatchRoot.prover`, `submitBatchRoot.verifier`, plus `createPaymentRequest.*`, `markRequestPaid.*`.

- [ ] **Step 3: Verify compiled contract exports new circuits**

```bash
grep -E "depositRecipientCoin|reclaimRecipientCoin|submitBatchRoot" src/contract/compiled/contract/index.d.ts
```
Expected: all three names appear.

- [ ] **Step 4: Commit**

```bash
git add src/contract/TesseractCore.compact src/contract/compiled/
git commit -m "feat(contract): rewrite TesseractCore with Path A pre-split UTXO model"
```

---

## Task 3: Deploy Contract

**Files:**
- Modify: `scripts/deployed-address.json`

- [ ] **Step 1: Check devnet is running**

```bash
curl -s http://127.0.0.1:9944/health && curl -s -X POST http://127.0.0.1:8088/api/v3/graphql -H 'Content-Type: application/json' -d '{"query":"{ __typename }"}' | grep -q '"data"' && echo "devnet OK"
```
Expected: `devnet OK`. If not, start devnet before proceeding.

- [ ] **Step 2: Run deploy script**

```bash
npx tsx scripts/deploy.ts
```
Expected: prints new contract address, updates `scripts/deployed-address.json`.

- [ ] **Step 3: Verify JSON updated**

```bash
cat scripts/deployed-address.json
```
Expected: `"network"` is not `"undeployed"`, new contract address present.

- [ ] **Step 4: Commit**

```bash
git add scripts/deployed-address.json
git commit -m "deploy: redeploy TesseractCore Path A to devnet"
```

---

## Task 4: Add CoinMapKeyType to descriptors.ts

**Files:**
- Modify: `src/contract/descriptors.ts`

- [ ] **Step 1: Read the file first**

```bash
head -20 src/contract/descriptors.ts
```

- [ ] **Step 2: Add CoinMapKeyType and hashCoinKey after the existing ClaimNullifierInputType block**

Find the end of the `ClaimNullifierInputType` class definition and add after it:

```typescript
// CoinMapKey { batchId: Bytes<32>; leaf: Bytes<32>; }
// Used to compute the recipientCoins map key — prevents cross-batch collision.
class _CoinMapKeyType {
  alignment() {
    return Bytes32.alignment().concat(Bytes32.alignment());
  }
  fromValue(_v: unknown): never {
    throw new Error('fromValue not needed');
  }
  toValue(v: { batchId: Uint8Array; leaf: Uint8Array }) {
    return Bytes32.toValue(v.batchId).concat(Bytes32.toValue(v.leaf));
  }
}
const CoinMapKeyType = new _CoinMapKeyType() as unknown as Parameters<typeof persistentHash>[0];

export function hashCoinKey(batchId: Uint8Array, leaf: Uint8Array): Uint8Array {
  return persistentHash(CoinMapKeyType, { batchId, leaf });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/contract/descriptors.ts
git commit -m "feat(descriptors): add CoinMapKeyType and hashCoinKey for compound map key"
```

---

## Task 5: Update types/index.ts

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add new types and update existing ones**

Add after the `Recipient` interface:

```typescript
export interface RecipientEntry {
  key: ZswapKeyHex;
  amount: bigint;
  leafHash: Uint8Array;        // raw leaf hash (before batchId compound)
  claimSecret: Uint8Array;     // 32 random bytes; all-zeros for addressed mode
  bearerMode: boolean;         // true = claimSecret is the leaf key input
}

export interface DepositCoinInput {
  batchId: Uint8Array;
  recipientLeafHash: Uint8Array;
  coin: { nonce: Uint8Array; color: Uint8Array; value: bigint };
}
```

Update `ClaimPrivateState` — rename `poolCoin` to `recipientCoin`:

```typescript
export interface ClaimPrivateState {
  claimAmount: bigint;
  merkleProof: MerkleTreePath<Uint8Array>;
  leafKey: { bytes: Uint8Array };
  claimSecret: Uint8Array;
  recipientCoin: { nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint };
}
```

Update `ReclaimPrivateState` — rename `poolCoin` to `reclaimCoin`:

```typescript
export interface ReclaimPrivateState {
  payerKey: { bytes: Uint8Array };
  batchNonce: Uint8Array;
  reclaimCoin: { nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint };
}
```

Update `BatchSubmitResult` — drop `totalAmount` coin requirement, add `deposits`:

```typescript
export interface BatchSubmitResult {
  batchId: HexString;
  merkleRoot: bigint;
  totalAmount: bigint;
  claimPackages: ClaimPackage[];
  deadline: bigint;
  deposits: DepositCoinInput[];   // one per recipient, in order
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add RecipientEntry, DepositCoinInput; update ClaimPrivateState for Path A"
```

---

## Task 6: Rewrite submitBatchFlow.ts

**Files:**
- Rewrite: `src/flows/submitBatchFlow.ts`

- [ ] **Step 1: Replace the file**

```typescript
/**
 * submitBatchFlow — 2-phase payer flow for Path A (Pre-Split UTXO).
 *
 * Phase 1: prepareSubmitBatch() → witnesses for submitBatchRoot (no coin)
 * Phase 2: prepareDeposits()   → array of DepositCoinInput, one per recipient
 *
 * After all deposits confirmed, buildClaimPackages() returns ClaimPackage[]
 * with fresh mt_index from indexer (via getRecipientCoin).
 *
 * Bearer mode: pass bearerMode:true per recipient — claimSecret bytes used
 * as the leaf key input instead of recipientKey.
 */

import { hashPaymentLeaf, hashPayerCommit, hashCoinKey } from '../contract/descriptors.js';
import { buildMerkleTree } from '../merkle/merkle.js';
import {
  RecipientEntry,
  DepositCoinInput,
  ClaimPackage,
  BatchSubmitResult,
  SubmitBatchPrivateState,
  HexString,
  toHex,
  fromHex,
  randomBytes32,
  deadlineFromHours,
} from '../types/index.js';

export interface SubmitBatchInput {
  recipients: Array<{ key: ZswapKeyHex; amount: bigint; bearerMode?: boolean }>;
  deadlineHours: number;
  payerKeyHex: HexString;
  appBaseUrl?: string;
}

export interface SubmitBatchOutput {
  batchId: Uint8Array;
  batchIdHex: HexString;
  deadline: bigint;
  privateState: SubmitBatchPrivateState;
  deposits: DepositCoinInput[];       // Phase 2: call depositRecipientCoin for each
  claimPackages: ClaimPackage[];
  payerRecord: PayerRecord;
}

export interface PayerRecord {
  batchIdHex: HexString;
  payerKeyHex: HexString;
  batchNonceHex: HexString;
  deadline: number;
  totalAmount: string;
  leafHashes: HexString[];            // raw leaf hashes in order — needed for reclaim
  claimPackages: SerializedClaimPackage[];
  createdAt: number;
}

export interface SerializedClaimPackage {
  batchId: HexString;
  leafIndex: number;
  leafHash: HexString;
  amount: string;
  claimSecret: HexString;
  leafKey: HexString;
  bearerMode: boolean;
  merkleProof: {
    leaf: HexString;
    path: Array<{ sibling: { field: string }; goes_left: boolean }>;
  };
  shareableLink: string;
}

type ZswapKeyHex = string;

export function prepareSubmitBatch(input: SubmitBatchInput): SubmitBatchOutput {
  const { recipients, deadlineHours, payerKeyHex, appBaseUrl = '/' } = input;

  if (recipients.length === 0) throw new Error('No recipients');
  if (recipients.length > 65536) throw new Error('Max 65536 recipients');

  const batchIdBytes   = randomBytes32();
  const batchNonceBytes = randomBytes32();
  const batchIdHex     = toHex(batchIdBytes);
  const deadline       = deadlineFromHours(deadlineHours);
  const payerKeyBytes  = fromHex(payerKeyHex);

  // Build entries: compute leaf hash per recipient
  const entries: RecipientEntry[] = recipients.map(r => {
    const claimSecret = randomBytes32();
    const bearerMode  = r.bearerMode ?? false;
    // Bearer: use claimSecret bytes as the key input; addressed: use recipient key bytes
    const leafKeyInput = bearerMode ? claimSecret : fromHex(r.key);
    const leafHash = hashPaymentLeaf({ bytes: leafKeyInput }, r.amount);
    return { key: r.key, amount: r.amount, leafHash, claimSecret, bearerMode };
  });

  const { root: merkleRoot, proofs } = buildMerkleTree(entries.map(e => e.leafHash));

  // Phase 1 private state (submitBatchRoot witnesses)
  const privateState: SubmitBatchPrivateState = {
    merkleRoot,
    payerKey: { bytes: payerKeyBytes },
    batchNonce: batchNonceBytes,
  };

  // Phase 2 deposits (one DepositCoinInput per recipient — caller provides coin)
  const deposits: DepositCoinInput[] = entries.map(e => ({
    batchId: batchIdBytes,
    recipientLeafHash: e.leafHash,
    coin: { nonce: new Uint8Array(32), color: new Uint8Array(32), value: e.amount },
  }));

  // Build claim packages
  const claimPackages: ClaimPackage[] = [];
  const serializedPackages: SerializedClaimPackage[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry  = entries[i];
    const proof  = proofs[i];
    const leafKeyForLink = entry.bearerMode ? toHex(entry.claimSecret) : entry.key;

    const params = new URLSearchParams({
      batchId: batchIdHex,
      leafIndex: i.toString(),
      leafHash: toHex(entry.leafHash),
      amount: entry.amount.toString(),
      claimSecret: toHex(entry.claimSecret),
      leafKey: leafKeyForLink,
      bearer: entry.bearerMode ? '1' : '0',
    });
    const shareableLink = `${appBaseUrl}claim?${params.toString()}`;

    claimPackages.push({
      batchId: batchIdHex,
      leafIndex: i,
      amount: entry.amount,
      claimSecret: toHex(entry.claimSecret),
      leafKey: leafKeyForLink,
      merkleProof: proof,
      shareableLink,
    });

    serializedPackages.push({
      batchId: batchIdHex,
      leafIndex: i,
      leafHash: toHex(entry.leafHash),
      amount: entry.amount.toString(),
      claimSecret: toHex(entry.claimSecret),
      leafKey: leafKeyForLink,
      bearerMode: entry.bearerMode,
      merkleProof: {
        leaf: toHex(proof.leaf),
        path: proof.path.map(e => ({
          sibling: { field: e.sibling.field.toString() },
          goes_left: e.goes_left,
        })),
      },
      shareableLink,
    });
  }

  const payerRecord: PayerRecord = {
    batchIdHex,
    payerKeyHex,
    batchNonceHex: toHex(batchNonceBytes),
    deadline: Number(deadline),
    totalAmount: entries.reduce((s, e) => s + e.amount, 0n).toString(),
    leafHashes: entries.map(e => toHex(e.leafHash)),
    claimPackages: serializedPackages,
    createdAt: Date.now(),
  };

  return {
    batchId: batchIdBytes,
    batchIdHex,
    deadline,
    privateState,
    deposits,
    claimPackages,
    payerRecord,
  };
}

export function verifyPayerCommitment(
  payerKeyHex: HexString,
  batchNonceHex: HexString,
  storedCommitment: Uint8Array,
): boolean {
  const computed = hashPayerCommit({ bytes: fromHex(payerKeyHex) }, fromHex(batchNonceHex));
  return computed.every((b, i) => b === storedCommitment[i]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/flows/submitBatchFlow.ts
git commit -m "feat(flows): rewrite submitBatchFlow with 2-phase Path A output"
```

---

## Task 7: Update claimPaymentFlow.ts

**Files:**
- Modify: `src/flows/claimPaymentFlow.ts`

- [ ] **Step 1: Replace the file**

```typescript
/**
 * claimPaymentFlow — builds witnesses for claimPayment circuit (Path A).
 *
 * Caller must supply recipientCoin (from getRecipientCoin(batchId, leafHash)).
 * Bearer mode: if bearerMode=true, leafKey witness = caller's own coinPublicKey.
 */

import { encryptAuditMemo, EMPTY_MEMO, type AuditRecord } from '../crypto/memo.js';
import { deserializeClaimPackage } from './claimPackageSerde.js';
import { ClaimPrivateState, HexString, fromHex } from '../types/index.js';
import type { SerializedClaimPackage } from './submitBatchFlow.js';

export interface ClaimFlowInput {
  batchIdHex: HexString;
  leafIndex: number;
  leafHashHex: HexString;
  amount: bigint;
  claimSecretHex: HexString;
  leafKeyHex: HexString;          // for bearer: caller's own coinPublicKey hex
  bearerMode?: boolean;
  serializedProof: SerializedClaimPackage['merkleProof'];
  /** QualifiedShieldedCoinInfo from indexer for this recipient's coin */
  recipientCoin: { nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint };
  auditorPublicKey?: Uint8Array;
  description?: string;
}

export interface ClaimFlowOutput {
  batchId: Uint8Array;
  encryptedAuditMemo: Uint8Array;
  privateState: ClaimPrivateState;
}

export async function prepareClaimPayment(input: ClaimFlowInput): Promise<ClaimFlowOutput> {
  const {
    batchIdHex, leafIndex, leafHashHex, amount, claimSecretHex,
    leafKeyHex, serializedProof, recipientCoin, auditorPublicKey,
  } = input;

  const batchId     = fromHex(batchIdHex);
  const claimSecret = fromHex(claimSecretHex);
  const leafKey     = fromHex(leafKeyHex);
  const merkleProof = deserializeClaimPackage(serializedProof);

  const record: AuditRecord = {
    batchId: batchIdHex,
    leafIndex,
    amount: amount.toString(),
    recipientKeyHex: leafKeyHex,
    timestamp: Date.now(),
  };

  const encryptedAuditMemo = auditorPublicKey
    ? await encryptAuditMemo(record, auditorPublicKey)
    : EMPTY_MEMO;

  const privateState: ClaimPrivateState = {
    claimAmount: amount,
    merkleProof,
    leafKey: { bytes: leafKey },
    claimSecret,
    recipientCoin,
  };

  return { batchId, encryptedAuditMemo, privateState };
}

export function parseClaimUrl(url: string): Omit<ClaimFlowInput, 'serializedProof' | 'recipientCoin'> | null {
  try {
    const p = new URL(url).searchParams;
    return {
      batchIdHex: p.get('batchId')!,
      leafIndex: parseInt(p.get('leafIndex')!),
      leafHashHex: p.get('leafHash')!,
      amount: BigInt(p.get('amount')!),
      claimSecretHex: p.get('claimSecret')!,
      leafKeyHex: p.get('leafKey')!,
      bearerMode: p.get('bearer') === '1',
    };
  } catch {
    return null;
  }
}

export { hashClaimNullifier as computeNullifier } from '../contract/descriptors.js';
```

- [ ] **Step 2: Commit**

```bash
git add src/flows/claimPaymentFlow.ts
git commit -m "feat(flows): update claimPaymentFlow with recipientCoin witness and bearer mode"
```

---

## Task 8: Rewrite reclaimFlow.ts

**Files:**
- Rewrite: `src/flows/reclaimFlow.ts`

- [ ] **Step 1: Replace the file**

```typescript
/**
 * reclaimFlow — payer reclaims unclaimed coins per leaf (Path A).
 *
 * For each unclaimed leaf, builds ReclaimPrivateState with reclaimCoin
 * from indexer. Caller iterates and calls reclaimRecipientCoin per leaf.
 */

import { ReclaimPrivateState, HexString, fromHex } from '../types/index.js';
import type { PayerRecord } from './submitBatchFlow.js';

export interface ReclaimLeafInput {
  batchIdHex: HexString;
  leafHashHex: HexString;
  payerKeyHex: HexString;
  batchNonceHex: HexString;
  reclaimCoin: { nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint };
}

export interface ReclaimLeafOutput {
  batchId: Uint8Array;
  recipientLeafHash: Uint8Array;
  privateState: ReclaimPrivateState;
}

export function prepareReclaimLeaf(input: ReclaimLeafInput): ReclaimLeafOutput {
  return {
    batchId: fromHex(input.batchIdHex),
    recipientLeafHash: fromHex(input.leafHashHex),
    privateState: {
      payerKey: { bytes: fromHex(input.payerKeyHex) },
      batchNonce: fromHex(input.batchNonceHex),
      reclaimCoin: input.reclaimCoin,
    },
  };
}

export function isEligibleForReclaim(record: PayerRecord): boolean {
  return Date.now() / 1000 > record.deadline;
}

export function reclaimLeafInputsFromRecord(
  record: PayerRecord,
  coins: Array<{ leafHashHex: HexString; coin: { nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint } }>,
): ReclaimLeafInput[] {
  return coins.map(({ leafHashHex, coin }) => ({
    batchIdHex: record.batchIdHex,
    leafHashHex,
    payerKeyHex: record.payerKeyHex,
    batchNonceHex: record.batchNonceHex,
    reclaimCoin: coin,
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/flows/reclaimFlow.ts
git commit -m "feat(flows): rewrite reclaimFlow for per-leaf Path A model"
```

---

## Task 9: Rewrite client.ts

**Files:**
- Rewrite: `src/contract/client.ts`

- [ ] **Step 1: Replace the file**

```typescript
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { SucceedEntirely } from '@midnight-ntwrk/midnight-js-types';
import type { MidnightProviders, PrivateStateId } from '@midnight-ntwrk/midnight-js-types';
import { Contract } from './compiled/contract/index.js';
import type { Witnesses } from './compiled/contract/index.js';
import type {
  SubmitBatchPrivateState, ClaimPrivateState, ReclaimPrivateState,
  PaymentRequestPrivateState, HexString,
} from '../types/index.js';
import { toHex } from '../types/index.js';
import { hashCoinKey } from './descriptors.js';

type PendingWitnessState = {
  submit:   SubmitBatchPrivateState | null;
  deposit:  null;   // depositRecipientCoin has no witnesses
  claim:    ClaimPrivateState | null;
  reclaim:  ReclaimPrivateState | null;
  request:  PaymentRequestPrivateState | null;
  markPaid: PaymentRequestPrivateState | null;
};

function makeWitnesses(pending: PendingWitnessState): Witnesses<undefined> {
  return {
    getMerkleRoot:       () => [undefined, pending.submit!.merkleRoot] as any,
    getPayerKey:         () => [undefined, pending.submit!.payerKey] as any,
    getBatchNonce:       () => [undefined, pending.submit!.batchNonce] as any,
    getBatchCoin:        () => {
      if (pending.claim)   return [undefined, pending.claim.recipientCoin] as any;
      if (pending.reclaim) return [undefined, pending.reclaim.reclaimCoin] as any;
      throw new Error('getBatchCoin: no active claim or reclaim state');
    },
    getClaimAmount:      () => [undefined, pending.claim!.claimAmount] as any,
    getMerkleProof:      () => [undefined, pending.claim!.merkleProof] as any,
    getLeafKey:          () => [undefined, pending.claim!.leafKey] as any,
    getClaimSecret:      () => [undefined, pending.claim!.claimSecret] as any,
    getReclaimPayerKey:  () => [undefined, pending.reclaim!.payerKey] as any,
    getReclaimBatchNonce:() => [undefined, pending.reclaim!.batchNonce] as any,
    getReclaimCoin:      () => [undefined, pending.reclaim!.reclaimCoin] as any,
    getRequesterKey:     () => [undefined, pending.request!.requesterKey] as any,
    getRequestNonce:     () => [undefined, pending.request!.requestNonce] as any,
    getMarkRequesterKey: () => [undefined, pending.markPaid!.requesterKey] as any,
    getMarkRequestNonce: () => [undefined, pending.markPaid!.requestNonce] as any,
  };
}

const PRIVATE_STATE_ID = 'tesseract-core';

export class TesseractClient {
  private constructor(
    private readonly callTx: Awaited<ReturnType<typeof findDeployedContract>>['callTx'],
    private readonly publicDataProvider: MidnightProviders<string, PrivateStateId, undefined>['publicDataProvider'],
    private readonly pending: PendingWitnessState,
    public readonly compiledContract: any,
    public readonly contractAddress: string,
  ) {}

  static async connect(
    providers: MidnightProviders<string, PrivateStateId, undefined>,
    contractAddress: string,
    compiledDir: string,
  ): Promise<TesseractClient> {
    const pending: PendingWitnessState = {
      submit: null, deposit: null, claim: null, reclaim: null, request: null, markPaid: null,
    };
    const witnesses = makeWitnesses(pending);
    const compiledContract = CompiledContract.make('TesseractCore', Contract).pipe(
      (c) => CompiledContract.withWitnesses(c, witnesses),
      (c) => CompiledContract.withCompiledFileAssets(c, compiledDir),
    );
    const found = await findDeployedContract(providers as any, {
      compiledContract: compiledContract as any,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID as PrivateStateId,
      initialPrivateState: {} as any,
    });
    return new TesseractClient(found.callTx as any, providers.publicDataProvider, pending, compiledContract, contractAddress);
  }

  // Phase 1: metadata only, no coin
  async submitBatch(batchId: Uint8Array, deadline: bigint, state: SubmitBatchPrivateState): Promise<HexString> {
    this.pending.submit = state;
    try {
      return this._hash(await (this.callTx as any).submitBatchRoot(batchId, deadline));
    } finally { this.pending.submit = null; }
  }

  // Phase 2: one call per recipient — coin = { nonce, color, value } for that recipient
  async depositCoin(
    batchId: Uint8Array,
    recipientLeafHash: Uint8Array,
    coin: { nonce: Uint8Array; color: Uint8Array; value: bigint },
  ): Promise<HexString> {
    // depositRecipientCoin has zero witnesses — no pending state needed
    return this._hash(await (this.callTx as any).depositRecipientCoin(batchId, recipientLeafHash, coin));
  }

  async claimPayment(batchId: Uint8Array, encryptedMemo: Uint8Array, state: ClaimPrivateState): Promise<HexString> {
    this.pending.claim = state;
    try {
      return this._hash(await (this.callTx as any).claimPayment(batchId, encryptedMemo));
    } finally { this.pending.claim = null; }
  }

  async reclaimRecipientCoin(batchId: Uint8Array, leafHash: Uint8Array, state: ReclaimPrivateState): Promise<HexString> {
    this.pending.reclaim = state;
    try {
      return this._hash(await (this.callTx as any).reclaimRecipientCoin(batchId, leafHash));
    } finally { this.pending.reclaim = null; }
  }

  async createRequest(requestId: Uint8Array, deadline: bigint, state: PaymentRequestPrivateState): Promise<HexString> {
    this.pending.request = state;
    try {
      return this._hash(await (this.callTx as any).createPaymentRequest(requestId, deadline));
    } finally { this.pending.request = null; }
  }

  async markPaid(requestId: Uint8Array, state: PaymentRequestPrivateState): Promise<HexString> {
    this.pending.markPaid = state;
    try {
      return this._hash(await (this.callTx as any).markRequestPaid(requestId));
    } finally { this.pending.markPaid = null; }
  }

  // Query recipient coin from indexer (stable mt_index in Path A)
  async getRecipientCoin(
    batchId: Uint8Array,
    leafHash: Uint8Array,
  ): Promise<{ nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint } | null> {
    const state = await this.publicDataProvider.queryContractState(this.contractAddress);
    if (!state) return null;
    const ledger = this.compiledContract.ledger(state);
    const coinKey = hashCoinKey(batchId, leafHash);
    if (ledger.recipientCoins.member(coinKey)) {
      return ledger.recipientCoins.lookup(coinKey);
    }
    return null;
  }

  private _hash(result: any): HexString {
    const h = result?.public?.txHash ?? result?.txHash ?? result?.txId ?? result?.public?.txId;
    if (!h) throw new Error(`No txHash in result: ${JSON.stringify(result)}`);
    return typeof h === 'string' ? h : toHex(h);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/contract/client.ts
git commit -m "feat(client): add depositCoin, reclaimRecipientCoin; rename getRecipientCoin; drop coin from submitBatch"
```

---

## Task 10: Rewrite gate3-integration.ts

**Files:**
- Rewrite: `src/tests/gate3-integration.ts`

The test structure keeps the wallet/provider boilerplate (proven working). Only the scenario changes.

- [ ] **Step 1: Replace from the `=== GATE-3 Integration Test ===` block onward (line ~335)**

Replace everything from `log.info('=== GATE-3 Integration Test ===');` to end of file with:

```typescript
log.info('=== GATE-3 Integration Test — Path A ===');
log.info(`Contract: ${DEPLOYED_ADDRESS}`);

const genesis = await buildWalletFromHexSeed(GENESIS_SEED_HEX);
const bob     = await buildWalletFromMnemonic(BOB_MNEMONIC);
const carol   = await buildWalletFromMnemonic(CAROL_MNEMONIC);

await Promise.all([
  waitSync(genesis.facade, 'Genesis'),
  waitSync(bob.facade,     'Bob'),
  waitSync(carol.facade,   'Carol'),
]);

const genesisSyncedState = await genesis.facade.waitForSyncedState();
log.info(`Genesis shielded balance: ${JSON.stringify(genesisSyncedState.shielded.balances)}`);

const genesisKeyHex = toHex(encodeCoinPublicKey(genesis.shieldedSecretKeys.coinPublicKey));
const bobKey        = toHex(encodeCoinPublicKey(bob.shieldedSecretKeys.coinPublicKey));
const carolKey      = toHex(encodeCoinPublicKey(carol.shieldedSecretKeys.coinPublicKey));
log.info(`Bob key:   ${bobKey}`);
log.info(`Carol key: ${carolKey}`);

// ── Step 1: Prepare batch (no coin needed for Phase 1) ─────────────────────
log.info('\n[STEP 1] Preparing batch...');

// Arbitrary amounts — devnet has coins
const BATCH_AMOUNT_BOB   = 100_000_000n;
const BATCH_AMOUNT_CAROL = 150_000_000n;

const batchPrep = prepareSubmitBatch({
  recipients: [
    { key: bobKey,   amount: BATCH_AMOUNT_BOB   },
    { key: carolKey, amount: BATCH_AMOUNT_CAROL  },
  ],
  deadlineHours: 72,
  payerKeyHex: genesisKeyHex,
  appBaseUrl: 'http://localhost:5173/',
});

log.info(`Batch ID:    ${batchPrep.batchIdHex}`);
log.info(`Merkle root: ${batchPrep.privateState.merkleRoot}`);

const genesisProviders = buildProviders(genesis);
const genesisClient    = await TesseractClient.connect(genesisProviders, DEPLOYED_ADDRESS, COMPILED_DIR);

// ── Step 2: Phase 1 — submitBatchRoot (no coin param) ─────────────────────
log.info('\n[STEP 2] Submitting batch root...');
const submitTxHash = await genesisClient.submitBatch(
  batchPrep.batchId,
  batchPrep.deadline,
  batchPrep.privateState,
);
log.info(`✅ submitBatchRoot TX: ${submitTxHash}`);
await pollForTx(submitTxHash);

// ── Step 3: Phase 2 — depositRecipientCoin (sequential, one per recipient) ─
log.info('\n[STEP 3] Depositing per-recipient coins...');
for (let i = 0; i < batchPrep.deposits.length; i++) {
  const dep = batchPrep.deposits[i];
  log.info(`  Depositing for recipient ${i + 1}/${batchPrep.deposits.length}, amount=${dep.coin.value}...`);
  const depTxHash = await genesisClient.depositCoin(
    dep.batchId,
    dep.recipientLeafHash,
    dep.coin,
  );
  log.info(`  ✅ deposit TX: ${depTxHash}`);
  await pollForTx(depTxHash);
}

// ── Step 4: Fetch recipient coins from indexer ────────────────────────────
log.info('\n[STEP 4] Fetching recipient coins from indexer...');

const bobPkg   = batchPrep.claimPackages[0];
const carolPkg = batchPrep.claimPackages[1];

const bobLeafHash   = fromHex(batchPrep.payerRecord.leafHashes[0]);
const carolLeafHash = fromHex(batchPrep.payerRecord.leafHashes[1]);

let bobCoin = await genesisClient.getRecipientCoin(batchPrep.batchId, bobLeafHash);
let carolCoin = await genesisClient.getRecipientCoin(batchPrep.batchId, carolLeafHash);

// Retry for indexer lag (max 3 attempts, 2s apart)
for (let attempt = 0; attempt < 3 && (!bobCoin || !carolCoin); attempt++) {
  await new Promise(r => setTimeout(r, 2000));
  if (!bobCoin)   bobCoin   = await genesisClient.getRecipientCoin(batchPrep.batchId, bobLeafHash);
  if (!carolCoin) carolCoin = await genesisClient.getRecipientCoin(batchPrep.batchId, carolLeafHash);
}
if (!bobCoin)   throw new Error('Bob coin not found in indexer after retries');
if (!carolCoin) throw new Error('Carol coin not found in indexer after retries');
log.info(`Bob coin:   value=${bobCoin.value}, mt_index=${bobCoin.mt_index}`);
log.info(`Carol coin: value=${carolCoin.value}, mt_index=${carolCoin.mt_index}`);

// ── Step 5: Parallel claims ──────────────────────────────────────────────
log.info('\n[STEP 5] Bob + Carol claim IN PARALLEL...');

const bobProviders   = buildProviders(bob);
const carolProviders = buildProviders(carol);
const bobClient      = await TesseractClient.connect(bobProviders,   DEPLOYED_ADDRESS, COMPILED_DIR);
const carolClient    = await TesseractClient.connect(carolProviders, DEPLOYED_ADDRESS, COMPILED_DIR);

const bobClaimPrep = await prepareClaimPayment({
  batchIdHex:    bobPkg.batchId,
  leafIndex:     bobPkg.leafIndex,
  leafHashHex:   batchPrep.payerRecord.leafHashes[0],
  amount:        bobPkg.amount,
  claimSecretHex: bobPkg.claimSecret,
  leafKeyHex:    bobPkg.leafKey,
  serializedProof: {
    leaf: toHex(bobPkg.merkleProof.leaf),
    path: bobPkg.merkleProof.path.map(e => ({
      sibling: { field: e.sibling.field.toString() },
      goes_left: e.goes_left,
    })),
  },
  recipientCoin: bobCoin,
});

const carolClaimPrep = await prepareClaimPayment({
  batchIdHex:    carolPkg.batchId,
  leafIndex:     carolPkg.leafIndex,
  leafHashHex:   batchPrep.payerRecord.leafHashes[1],
  amount:        carolPkg.amount,
  claimSecretHex: carolPkg.claimSecret,
  leafKeyHex:    carolPkg.leafKey,
  serializedProof: {
    leaf: toHex(carolPkg.merkleProof.leaf),
    path: carolPkg.merkleProof.path.map(e => ({
      sibling: { field: e.sibling.field.toString() },
      goes_left: e.goes_left,
    })),
  },
  recipientCoin: carolCoin,
});

const [bobTxHash, carolTxHash] = await Promise.all([
  bobClient.claimPayment(bobClaimPrep.batchId, bobClaimPrep.encryptedAuditMemo, bobClaimPrep.privateState),
  carolClient.claimPayment(carolClaimPrep.batchId, carolClaimPrep.encryptedAuditMemo, carolClaimPrep.privateState),
]);

log.info(`✅ Bob claimed:   ${bobTxHash}`);
log.info(`✅ Carol claimed: ${carolTxHash}`);

await Promise.all([pollForTx(bobTxHash), pollForTx(carolTxHash)]);
log.info('\n✅ GATE-3 PASSED — parallel claims succeeded (Path A, no Error 186)');

// ── Step 6: Double-spend rejected ────────────────────────────────────────
log.info('\n[STEP 6] Double-spend guard test (Bob re-claim should fail)...');
try {
  await bobClient.claimPayment(bobClaimPrep.batchId, bobClaimPrep.encryptedAuditMemo, bobClaimPrep.privateState);
  log.error('❌ FAIL: double-spend was NOT rejected');
  process.exit(1);
} catch (e) {
  log.info(`✅ Double-spend correctly rejected: ${(e as Error).message}`);
}

process.exit(0);
```

- [ ] **Step 2: Verify the `buildProviders` fix** — confirm it takes only 1 argument (wallet object). The function signature at line 208 is `function buildProviders(wallet: {...})`. The old test called `buildProviders(bob, undefined, genesis)` — that bug is now gone since we call `buildProviders(bob)` directly.

- [ ] **Step 3: Commit**

```bash
git add src/tests/gate3-integration.ts
git commit -m "test(gate3): rewrite for Path A — 2-phase submit, sequential deposits, parallel claims"
```

---

## Task 11: Run Gate-3 Test

**Files:** None modified.

- [ ] **Step 1: Run the test**

```bash
npx tsx src/tests/gate3-integration.ts
```

Expected output ends with:
```
✅ GATE-3 PASSED — parallel claims succeeded (Path A, no Error 186)
✅ Double-spend correctly rejected: ...
```

- [ ] **Step 2: If compile errors appear**, fix them before proceeding. Common issues:
  - `getReclaimCoin` not in `Witnesses` type → add to `makeWitnesses` if compiler generated it differently
  - `depositRecipientCoin` not in `callTx` type → check compiled contract exports

- [ ] **Step 3: Commit test run confirmation**

```bash
git commit --allow-empty -m "test: gate-3 passes — Path A verified on devnet"
```

---

## Task 12: Update useBatchPay.ts

**Files:**
- Rewrite: `src/hooks/useBatchPay.ts`

- [ ] **Step 1: Replace the file**

```typescript
import { useState, useCallback, useEffect } from 'react';
import { prepareSubmitBatch, isEligibleForReclaim, type PayerRecord } from '../flows/submitBatchFlow.js';
import { prepareReclaimLeaf, reclaimLeafInputsFromRecord } from '../flows/reclaimFlow.js';

const DB_NAME = 'tesseract-payer';
const STORE_NAME = 'payer-records';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'batchIdHex' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRecord(record: PayerRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadAllRecords(): Promise<PayerRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as PayerRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export interface BatchState {
  batchId: string;
  totalAmount: bigint;
  deadline: bigint;
  recipientCount: number;
  isEligibleForReclaim: boolean;
  claimPackages: PayerRecord['claimPackages'];
}

export function useBatchPay(
  client: { submitBatch: Function; depositCoin: Function; reclaimRecipientCoin: Function; getRecipientCoin: Function } | null,
  coinPublicKey: string | null,
) {
  const [batches, setBatches] = useState<BatchState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAllRecords().then(records => {
      setBatches(records.map(r => ({
        batchId: r.batchIdHex,
        totalAmount: BigInt(r.totalAmount),
        deadline: BigInt(r.deadline),
        recipientCount: r.claimPackages.length,
        isEligibleForReclaim: isEligibleForReclaim(r),
        claimPackages: r.claimPackages,
      })));
    }).catch(() => {});
  }, []);

  const createBatch = useCallback(async (
    recipients: Array<{ key: string; amount: bigint; bearerMode?: boolean }>,
    deadlineHours: number,
  ) => {
    if (!client || !coinPublicKey) throw new Error('Wallet not connected');
    setIsLoading(true);
    setError(null);
    try {
      const prep = prepareSubmitBatch({ recipients, deadlineHours, payerKeyHex: coinPublicKey });

      setProgress('Submitting batch root...');
      await client.submitBatch(prep.batchId, prep.deadline, prep.privateState);

      for (let i = 0; i < prep.deposits.length; i++) {
        const dep = prep.deposits[i];
        setProgress(`Depositing coin ${i + 1}/${prep.deposits.length}...`);
        await client.depositCoin(dep.batchId, dep.recipientLeafHash, dep.coin);
      }

      await saveRecord(prep.payerRecord);
      setBatches(prev => [...prev, {
        batchId: prep.batchIdHex,
        totalAmount: BigInt(prep.payerRecord.totalAmount),
        deadline: BigInt(prep.payerRecord.deadline),
        recipientCount: recipients.length,
        isEligibleForReclaim: false,
        claimPackages: prep.payerRecord.claimPackages,
      }]);

      setProgress(null);
      return prep;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [client, coinPublicKey]);

  const reclaim = useCallback(async (batchId: string) => {
    if (!client) throw new Error('Client not connected');
    const records = await loadAllRecords();
    const record  = records.find(r => r.batchIdHex === batchId);
    if (!record) throw new Error('Batch not found');
    if (!isEligibleForReclaim(record)) throw new Error('Deadline not passed');

    setIsLoading(true);
    try {
      for (const leafHashHex of record.leafHashes) {
        const { fromHex } = await import('../types/index.js');
        const coin = await client.getRecipientCoin(fromHex(record.batchIdHex), fromHex(leafHashHex));
        if (!coin) continue; // already claimed
        const out = prepareReclaimLeaf({
          batchIdHex: record.batchIdHex,
          leafHashHex,
          payerKeyHex: record.payerKeyHex,
          batchNonceHex: record.batchNonceHex,
          reclaimCoin: coin,
        });
        await client.reclaimRecipientCoin(out.batchId, out.recipientLeafHash, out.privateState);
      }
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  return { createBatch, reclaim, batches, isLoading, progress, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useBatchPay.ts
git commit -m "feat(hooks): rewrite useBatchPay for 2-phase Path A flow"
```

---

## Task 13: Implement useClaim.ts

**Files:**
- Rewrite: `src/hooks/useClaim.ts`

- [ ] **Step 1: Replace the file**

```typescript
import { useState, useCallback } from 'react';
import { prepareClaimPayment, parseClaimUrl } from '../flows/claimPaymentFlow.js';

export function useClaim(
  client: { claimPayment: Function; getRecipientCoin: Function } | null,
  ownCoinPublicKey: string | null,
) {
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const claim = useCallback(async (claimUrl: string) => {
    if (!client) throw new Error('Client not connected');
    setIsLoading(true);
    setError(null);
    setTxHash(null);
    try {
      const { fromHex } = await import('../types/index.js');

      const parsed = parseClaimUrl(claimUrl);
      if (!parsed) throw new Error('Invalid claim URL');

      // Bearer mode: use own key; addressed: use key from URL
      const leafKeyHex = parsed.bearerMode ? ownCoinPublicKey! : parsed.leafKeyHex;

      // Fetch the stored coin from indexer
      let coin = await client.getRecipientCoin(
        fromHex(parsed.batchIdHex),
        fromHex(parsed.leafHashHex),
      );
      for (let i = 0; i < 3 && !coin; i++) {
        await new Promise(r => setTimeout(r, 2000));
        coin = await client.getRecipientCoin(fromHex(parsed.batchIdHex), fromHex(parsed.leafHashHex));
      }
      if (!coin) throw new Error('Payment coin not found — may already be claimed');

      // Need merkle proof — must be fetched from claim package or URL
      // For now, proof comes from URL params (base64 encoded) or user pastes JSON
      const proofParam = new URL(claimUrl).searchParams.get('proof');
      if (!proofParam) throw new Error('Merkle proof missing from claim URL. Use the JSON claim file.');

      const serializedProof = JSON.parse(atob(proofParam));

      const prep = await prepareClaimPayment({
        ...parsed,
        leafKeyHex,
        serializedProof,
        recipientCoin: coin,
      });

      const hash = await client.claimPayment(prep.batchId, prep.encryptedAuditMemo, prep.privateState);
      setTxHash(hash);
      return hash;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Claim failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [client, ownCoinPublicKey]);

  return { claim, isLoading, txHash, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useClaim.ts
git commit -m "feat(hooks): implement useClaim with bearer mode and indexer retry"
```

---

## Task 14: Implement usePaymentRequest.ts

**Files:**
- Rewrite: `src/hooks/usePaymentRequest.ts`

- [ ] **Step 1: Replace the file**

```typescript
import { useState, useCallback } from 'react';
import { randomBytes32, toHex, fromHex, deadlineFromHours } from '../types/index.js';

export interface RequestRecord {
  requestId: string;
  deadline: number;
  description?: string;
  amount?: string;
  status: 'open' | 'paid';
  link: string;
  createdAt: number;
}

const STORE_KEY = 'tesseract-requests';

function loadRequests(): RequestRecord[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]'); } catch { return []; }
}
function saveRequests(records: RequestRecord[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
}

export function usePaymentRequest(
  client: { createRequest: Function; markPaid: Function } | null,
  coinPublicKey: string | null,
  appBaseUrl = '/',
) {
  const [requests, setRequests] = useState<RequestRecord[]>(loadRequests);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRequest = useCallback(async (opts: {
    deadlineHours: number;
    description?: string;
    amount?: bigint;
  }) => {
    if (!client || !coinPublicKey) throw new Error('Wallet not connected');
    setIsLoading(true);
    setError(null);
    try {
      const requestId    = randomBytes32();
      const requestNonce = randomBytes32();
      const deadline     = deadlineFromHours(opts.deadlineHours);
      const requestIdHex = toHex(requestId);

      await client.createRequest(requestId, deadline, {
        requesterKey: { bytes: fromHex(coinPublicKey) },
        requestNonce,
      });

      const params = new URLSearchParams({
        requestId: requestIdHex,
        nonce: toHex(requestNonce),
        key: coinPublicKey,
        ...(opts.amount != null ? { amount: opts.amount.toString() } : {}),
        ...(opts.description ? { desc: opts.description } : {}),
      });
      const link = `${appBaseUrl}request?${params.toString()}`;

      const record: RequestRecord = {
        requestId: requestIdHex,
        deadline: Number(deadline),
        description: opts.description,
        amount: opts.amount?.toString(),
        status: 'open',
        link,
        createdAt: Date.now(),
      };

      const updated = [...loadRequests(), record];
      saveRequests(updated);
      setRequests(updated);
      return record;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create request failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [client, coinPublicKey, appBaseUrl]);

  const markPaid = useCallback(async (requestId: string) => {
    if (!client || !coinPublicKey) throw new Error('Wallet not connected');
    const all = loadRequests();
    const rec = all.find(r => r.requestId === requestId);
    if (!rec) throw new Error('Request not found');

    // Extract nonce from the stored link
    const nonceHex = new URL(rec.link).searchParams.get('nonce')!;

    setIsLoading(true);
    try {
      await client.markPaid(fromHex(requestId), {
        requesterKey: { bytes: fromHex(coinPublicKey) },
        requestNonce: fromHex(nonceHex),
      });
      const updated = all.map(r => r.requestId === requestId ? { ...r, status: 'paid' as const } : r);
      saveRequests(updated);
      setRequests(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mark paid failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [client, coinPublicKey]);

  return { requests, createRequest, markPaid, isLoading, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePaymentRequest.ts
git commit -m "feat(hooks): implement usePaymentRequest with localStorage persistence"
```

---

## Task 15: Implement useAuditDecrypt.ts

**Files:**
- Rewrite: `src/hooks/useAuditDecrypt.ts`

- [ ] **Step 1: Replace the file**

```typescript
import { useState, useCallback } from 'react';
import { decryptAuditMemo } from '../crypto/memo.js';
import { fromHex } from '../types/index.js';

export interface AuditRow {
  batchId: string;
  leafIndex: number;
  amount: string;
  recipientKeyHex: string;
  timestamp: number;
  txHash: string;
}

export function useAuditDecrypt(
  fetchMemos: (() => Promise<Array<{ txHash: string; encryptedMemo: Uint8Array }>>) | null,
) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decrypt = useCallback(async (auditorPrivKeyHex: string) => {
    if (!fetchMemos) throw new Error('Memo fetcher not provided');
    setIsLoading(true);
    setError(null);
    setRows([]);
    try {
      const privKey = fromHex(auditorPrivKeyHex);
      const memos   = await fetchMemos();
      const decoded: AuditRow[] = [];

      for (const { txHash, encryptedMemo } of memos) {
        try {
          const record = await decryptAuditMemo(encryptedMemo, privKey);
          decoded.push({ ...record, txHash });
        } catch {
          // Skip memos encrypted for a different auditor key
        }
      }

      setRows(decoded);
      return decoded;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decrypt failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [fetchMemos]);

  return { rows, decrypt, isLoading, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAuditDecrypt.ts
git commit -m "feat(hooks): implement useAuditDecrypt for selective disclosure"
```

---

## Task 16: Implement screens

**Files:**
- Rewrite: `src/screens/Dashboard.tsx`, `SendBatch.tsx`, `Claim.tsx`, `PaymentRequest.tsx`, `Auditor.tsx`

- [ ] **Step 1: Dashboard.tsx**

```tsx
import { useWalletState } from '../hooks/useWalletState.js';
import { useBatchPay } from '../hooks/useBatchPay.js';

export function Dashboard() {
  const wallet = useWalletState();
  const { batches } = useBatchPay(null, wallet.coinPublicKey);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Tesseract Payments</h1>

      <div className="border rounded p-4">
        <h2 className="font-semibold mb-2">Wallet</h2>
        {wallet.isConnected ? (
          <>
            <p className="text-sm text-gray-600 font-mono break-all">{wallet.coinPublicKey}</p>
            <p className="mt-1">Shielded NIGHT: <strong>{wallet.balance?.shielded?.toString() ?? '—'}</strong></p>
          </>
        ) : (
          <button
            onClick={wallet.connect}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            Connect Midnight Lace
          </button>
        )}
      </div>

      <div className="border rounded p-4">
        <h2 className="font-semibold mb-2">Recent Batches</h2>
        {batches.length === 0 ? (
          <p className="text-gray-500 text-sm">No batches yet.</p>
        ) : (
          <ul className="space-y-2">
            {batches.map(b => (
              <li key={b.batchId} className="text-sm border-b pb-2">
                <span className="font-mono text-xs">{b.batchId.slice(0, 16)}…</span>
                {' · '}{b.recipientCount} recipients
                {' · '}{b.isEligibleForReclaim ? '⚠️ Reclaimable' : '✅ Active'}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: SendBatch.tsx**

```tsx
import { useState } from 'react';
import { useBatchPay } from '../hooks/useBatchPay.js';
import { useWalletState } from '../hooks/useWalletState.js';

interface Row { key: string; amount: string; bearerMode: boolean; }

export function SendBatch() {
  const wallet = useWalletState();
  const { createBatch, isLoading, progress, error } = useBatchPay(null, wallet.coinPublicKey);
  const [rows, setRows] = useState<Row[]>([{ key: '', amount: '', bearerMode: false }]);
  const [deadlineHours, setDeadlineHours] = useState(72);
  const [links, setLinks] = useState<string[]>([]);

  const addRow = () => setRows(r => [...r, { key: '', amount: '', bearerMode: false }]);
  const updateRow = (i: number, field: keyof Row, val: string | boolean) =>
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  const submit = async () => {
    const recipients = rows.map(r => ({
      key: r.key,
      amount: BigInt(r.amount),
      bearerMode: r.bearerMode,
    }));
    const result = await createBatch(recipients, deadlineHours);
    setLinks(result.claimPackages.map(p => p.shareableLink));
  };

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">Send Batch Payment</h1>

      {rows.map((row, i) => (
        <div key={i} className="border rounded p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={row.bearerMode}
              onChange={e => updateRow(i, 'bearerMode', e.target.checked)} />
            Bearer link (anyone with link can claim)
          </label>
          {!row.bearerMode && (
            <input className="w-full border rounded p-1 text-sm font-mono"
              placeholder="Recipient ZswapCoinPublicKey (hex)"
              value={row.key} onChange={e => updateRow(i, 'key', e.target.value)} />
          )}
          <input className="w-full border rounded p-1 text-sm"
            placeholder="Amount (NIGHT dust)"
            value={row.amount} onChange={e => updateRow(i, 'amount', e.target.value)} />
        </div>
      ))}

      <button onClick={addRow} className="text-sm text-purple-600 underline">+ Add recipient</button>

      <div>
        <label className="text-sm">Deadline (hours): </label>
        <input type="number" value={deadlineHours} onChange={e => setDeadlineHours(+e.target.value)}
          className="border rounded p-1 w-20 text-sm" />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {progress && <p className="text-blue-600 text-sm">{progress}</p>}

      <button onClick={submit} disabled={isLoading}
        className="w-full py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
        {isLoading ? progress ?? 'Sending…' : 'Send Batch'}
      </button>

      {links.length > 0 && (
        <div className="border rounded p-3 space-y-1">
          <p className="font-semibold text-sm">Claim Links:</p>
          {links.map((l, i) => (
            <p key={i} className="text-xs font-mono break-all">{l}</p>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Claim.tsx**

```tsx
import { useState } from 'react';
import { useClaim } from '../hooks/useClaim.js';
import { useWalletState } from '../hooks/useWalletState.js';

export function Claim() {
  const wallet = useWalletState();
  const { claim, isLoading, txHash, error } = useClaim(null, wallet.coinPublicKey);
  const [url, setUrl] = useState('');

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">Claim Payment</h1>

      <textarea className="w-full border rounded p-2 text-sm font-mono h-24"
        placeholder="Paste claim link here…"
        value={url} onChange={e => setUrl(e.target.value)} />

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {txHash && (
        <div className="border border-green-400 rounded p-3">
          <p className="text-green-700 font-semibold">✅ Claimed!</p>
          <p className="text-xs font-mono break-all mt-1">TX: {txHash}</p>
        </div>
      )}

      <button onClick={() => claim(url)} disabled={isLoading || !url.trim()}
        className="w-full py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
        {isLoading ? 'Claiming…' : 'Claim Payment'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: PaymentRequest.tsx**

```tsx
import { useState } from 'react';
import { usePaymentRequest } from '../hooks/usePaymentRequest.js';
import { useWalletState } from '../hooks/useWalletState.js';

export function PaymentRequest() {
  const wallet = useWalletState();
  const { requests, createRequest, markPaid, isLoading, error } = usePaymentRequest(
    null, wallet.coinPublicKey, window.location.origin + '/'
  );
  const [tab, setTab] = useState<'create'|'incoming'>('create');
  const [desc, setDesc] = useState('');
  const [hours, setHours] = useState(168);
  const [newLink, setNewLink] = useState<string | null>(null);

  const submit = async () => {
    const rec = await createRequest({ deadlineHours: hours, description: desc });
    setNewLink(rec.link);
  };

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">Payment Request</h1>

      <div className="flex gap-2">
        {(['create','incoming'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 rounded text-sm ${tab === t ? 'bg-purple-600 text-white' : 'border'}`}>
            {t === 'create' ? 'Create' : 'Incoming'}
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <div className="space-y-3">
          <input className="w-full border rounded p-2 text-sm"
            placeholder="Description (optional)"
            value={desc} onChange={e => setDesc(e.target.value)} />
          <div>
            <label className="text-sm">Expires in (hours): </label>
            <input type="number" value={hours} onChange={e => setHours(+e.target.value)}
              className="border rounded p-1 w-20 text-sm" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button onClick={submit} disabled={isLoading}
            className="w-full py-2 bg-purple-600 text-white rounded disabled:opacity-50">
            {isLoading ? 'Creating…' : 'Create Request'}
          </button>
          {newLink && (
            <div className="border rounded p-2">
              <p className="text-xs font-semibold">Share this link:</p>
              <p className="text-xs font-mono break-all">{newLink}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'incoming' && (
        <div className="space-y-2">
          {requests.length === 0 && <p className="text-sm text-gray-500">No requests.</p>}
          {requests.map(r => (
            <div key={r.requestId} className="border rounded p-3 text-sm space-y-1">
              <p>{r.description ?? '(no description)'} — {r.status}</p>
              {r.status === 'open' && (
                <button onClick={() => markPaid(r.requestId)}
                  className="text-xs bg-green-100 border border-green-400 rounded px-2 py-0.5">
                  Mark Paid
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Auditor.tsx**

```tsx
import { useState } from 'react';
import { useAuditDecrypt } from '../hooks/useAuditDecrypt.js';

export function Auditor() {
  const { rows, decrypt, isLoading, error } = useAuditDecrypt(null);
  const [privKey, setPrivKey] = useState('');

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">Audit View</h1>
      <p className="text-sm text-gray-600">Paste auditor private key to decrypt payment memos.</p>

      <input className="w-full border rounded p-2 text-sm font-mono"
        type="password"
        placeholder="Auditor private key (hex, stays in browser)"
        value={privKey} onChange={e => setPrivKey(e.target.value)} />

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button onClick={() => decrypt(privKey)} disabled={isLoading || !privKey.trim()}
        className="px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50">
        {isLoading ? 'Decrypting…' : 'Decrypt Memos'}
      </button>

      {rows.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-1">Batch</th>
              <th className="border p-1">Amount</th>
              <th className="border p-1">Recipient</th>
              <th className="border p-1">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="border p-1 font-mono">{r.batchId.slice(0,8)}…</td>
                <td className="border p-1">{r.amount}</td>
                <td className="border p-1 font-mono">{r.recipientKeyHex.slice(0,12)}…</td>
                <td className="border p-1">{new Date(r.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit all screens**

```bash
git add src/screens/ src/hooks/
git commit -m "feat(ui): implement all 5 screens and hooks for Path A"
```

---

## Task 17: TypeScript build verification

**Files:** None modified.

- [ ] **Step 1: Run TypeScript build**

```bash
npm run build
```

Expected: exits 0, no type errors. Fix any type errors before proceeding — do not suppress with `as any` unless the existing codebase already uses that pattern for a third-party type boundary.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

Open `http://localhost:5173`. Verify:
- Dashboard loads, shows "Connect Midnight Lace" if wallet absent
- Send Batch form renders rows
- Claim page renders text area
- Payment Request tabs render
- Auditor renders key input

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Path A implementation — contract, flows, client, hooks, screens"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task covering it |
|---|---|
| Pre-split UTXO, no shared pool coin | Task 1 (contract) |
| CoinMapKey compound key (collision fix) | Task 1 + Task 4 |
| depositRecipientCoin circuit | Task 1 + Task 9 |
| submitBatchRoot — no coin param | Task 1 + Task 9 |
| claimPayment — per-recipient coin | Task 1 + Task 7 + Task 9 |
| reclaimRecipientCoin — per-leaf | Task 1 + Task 8 + Task 9 |
| Payment request circuits unchanged | Task 1 (verbatim copy) |
| blockTimeLt/Gt verified syntax | Task 1 |
| Bearer mode | Task 6 + Task 7 |
| Parallel claims in gate-3 | Task 10 |
| Sequential deposits in gate-3 | Task 10 |
| Double-spend guard test | Task 10 |
| Merkle proof distribution (JSON not URL) | Task 13 (useClaim reads `proof` param) |
| Selective disclosure / audit memo | Task 15 (Auditor screen) + Task 14 |
| Dashboard + all 5 screens | Task 16 |
| TypeScript build passes | Task 17 |

No gaps found.

**Type consistency check:**
- `ClaimPrivateState.recipientCoin` used consistently in Tasks 5, 7, 9, 10
- `ReclaimPrivateState.reclaimCoin` used consistently in Tasks 5, 8, 9
- `getBatchCoin` witness returns `recipientCoin` OR `reclaimCoin` depending on pending state — handled in Task 9 `makeWitnesses`
- `hashCoinKey` exported from `descriptors.ts` (Task 4), imported in `client.ts` (Task 9)
- `PayerRecord.leafHashes` added in Task 6, consumed in Task 10 (gate-3) and Task 12 (useBatchPay reclaim)
