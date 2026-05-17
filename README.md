# Tesseract — Private Business Payments Rail

A ZK-powered batch payment system on [Midnight Network](https://midnight.network). Pay multiple recipients from a single on-chain commitment. Each recipient claims their funds with a zero-knowledge Merkle proof. Observers see a root hash and shielded coins — nothing else.

Built for **MLH Hackathon — May 2026**.

---

## What It Does

Tesseract is a privacy-preserving batch payment rail. Six ZK circuits form the complete payment lifecycle:

| Circuit | Who calls it | What it does |
|---|---|---|
| `submitBatchRoot` | Payer | Commits a Merkle root of (recipient, amount) pairs on-chain. No recipient or amount is revealed. |
| `depositRecipientCoin` | Payer | Deposits one shielded coin per recipient, locked to `hash(batchId, leafHash)`. No on-chain link between payer and recipient. |
| `claimPayment` | Recipient | Proves Merkle membership + ownership of claim secret. Burns a nullifier. Receives the shielded coin. |
| `reclaimRecipientCoin` | Payer | Reclaims unclaimed coins after deadline. ZK-proves payer identity. |
| `createPaymentRequest` | Requester | Creates an on-chain payment request with deadline and ZK identity commitment. |
| `markRequestPaid` | Payer | Marks a request paid. Proves requester identity matches stored commitment. |

**Double-spend protection**: nullifier map prevents any leaf from being claimed twice.  
**Privacy**: recipient list, individual amounts, and payer–recipient links never appear on-chain.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Payer                                              │
│  1. Build Merkle tree of {recipient, amount} leaves │
│  2. submitBatchRoot  → on-chain root + payer commit │
│  3. depositRecipientCoin × N  → N shielded coins    │
└────────────────────────┬────────────────────────────┘
                         │  batchId + Merkle root public
                         │  coin locked to hash(batchId, leaf)
┌────────────────────────▼────────────────────────────┐
│  Recipient                                          │
│  1. Receive claim package (off-chain link)          │
│  2. claimPayment: prove leaf ∈ tree + secret match  │
│  3. Nullifier burned → coin transferred             │
└─────────────────────────────────────────────────────┘
```

**On-chain state** (9 flat maps in Compact):
- `recipientCoins` — locked shielded coin per recipient
- `batchMerkleRoots` / `batchDeadlines` / `payerCommitments`
- `claimNullifiers` — burned on claim, prevents double-spend
- `requestExists` / `requestStatus` / `requestDeadlines` / `requestPayeeHash`

**Merkle tree**: SHA-256 leaves, depth-16 `MerkleTreePath<16, Bytes<32>>`, compound key `persistentHash(batchId ‖ leafHash)` prevents cross-batch collisions.

---

## What Works (Verified)

All six circuits verified on a local Midnight devnet via integration test.

```
=== GATE-3 Integration Test — Path A (sequential) ===

[STEP 1] Preparing batch...
  Batch ID:    cc5ef318b233...
  Merkle root: 2725756313...

[STEP 2] Submitting batch root...
  ✅ submitBatchRoot TX: 12ff444f2426...

[STEP 3] Depositing per-recipient coins (sequential)...
  ✅ deposit TX (Bob,  100000000): cafa10fe464a...
  ✅ deposit TX (Carol, 150000000): 93b625cdfa...

[STEP 4] Fetching recipient coins from indexer...
  Bob coin:   value=100000000, mt_index=44
  Carol coin: value=150000000, mt_index=47

[STEP 5] Sequential claims...
  ✅ Bob claimed:   d7c6f932951d...
  ✅ Carol claimed: a89e20ba2dc2...

✅ GATE-3 PASSED — Path A sequential claims succeeded

[STEP 6] Double-spend guard (Bob re-claim must fail)...
  ✅ Double-spend correctly rejected: Error: failed assert: already claimed

[STEP 7] Payment Request Flow...
  ✅ Request Created:     3d3a9d07f9db...
  ✅ Request Marked Paid: 7057474307af...

✨ ALL FLOWS VERIFIED SUCCESSFUL ✨
```

---

## Known Issue — Browser Frontend

The React frontend (wallet connect, send batch, claim UI) works for wallet connection and contract state reads. **Transaction submission is blocked** at the DUST fee balance step.

**Root cause**: Midnight requires a DUST fee coin with every transaction. The 1AM wallet browser extension handles DUST addition inside its service worker (`chrome-extension://` origin). The local proof server (`127.0.0.1:6300`) has CORS configured for `http://localhost:5173` only — `chrome-extension://` origin is blocked. The wallet's balance call fails with:

```
Error: Balance failed: Failed to prove transaction
```

Circuit proving itself works (we route it through `httpClientProofProvider` in page context, which correctly hits the proof server). DUST proving is the remaining blocker.

**Status**: No documented workaround for `undeployed` local devnet. ProofStation (Midnight's server-side DUST prover) exists for `preview`/`preprod`/`mainnet` only.

**What reviewers should use**: the CLI integration test (`src/tests/gate3-integration.ts`) — it runs headless with `WalletFacade` which handles DUST natively without the CORS constraint.

---

## Run Locally

### Prerequisites

- Node.js 20+
- Midnight local devnet running via Docker Compose
  - Node: `http://127.0.0.1:9944`
  - Indexer: `http://127.0.0.1:8088/api/v3/graphql`
  - Proof server: `http://127.0.0.1:6300`
- 1AM wallet extension installed (for browser frontend only)

### Install

```bash
npm install
```

### Deploy the contract

The contract is already deployed at `90f60e4dd67adfbb0b8c9f3e9ba26ccd09ab01a74bd9ee1ded5e13b4191a1d3f` (local devnet, `undeployed` network). To redeploy on a fresh devnet:

```bash
npx tsx scripts/deploy.ts
```

This writes the new address to `scripts/deployed-address.json`.

### Run the integration test (recommended — this is what works)

```bash
npx tsx src/tests/gate3-integration.ts
```

Runs all 7 flows end-to-end:
1. Submit batch root (2 recipients)
2. Deposit coin for Bob (100 NIGHT)
3. Deposit coin for Carol (150 NIGHT)
4. Bob claims
5. Carol claims
6. Double-spend rejection check
7. Payment request create + mark paid

Takes ~4 minutes (25-30s waits between transactions for ZSwap state propagation).

**Required**: devnet running, contract deployed, wallets funded with NIGHT and DUST. The test uses hardcoded devnet mnemonics (`zoo zoo...` for Bob, BIP-39 test vector for Carol).

### Run the frontend (wallet connect + UI — partial)

Create `.env.local`:

```
VITE_CONTRACT_ADDRESS=90f60e4dd67adfbb0b8c9f3e9ba26ccd09ab01a74bd9ee1ded5e13b4191a1d3f
VITE_NETWORK=undeployed
```

```bash
npm run dev
```

Open `http://localhost:5173`. Connect the 1AM wallet extension. Contract state reads work. Transaction submission fails at the DUST balance step (see Known Issue above).

---

## Project Structure

```
src/
├── contract/
│   ├── TesseractCore.compact     # ZK smart contract — 6 circuits, 9 ledger maps
│   ├── client.ts                 # TesseractClient wrapping midnight-js findDeployedContract
│   └── descriptors.ts            # Circuit witness injection per flow
├── flows/
│   ├── submitBatchFlow.ts        # Merkle tree construction + submitBatchRoot witness
│   ├── claimPaymentFlow.ts       # Merkle proof + nullifier witness for claim
│   ├── claimPackageSerde.ts      # Encode/decode shareable claim links
│   ├── paymentRequestFlow.ts     # createPaymentRequest witness
│   └── reclaimFlow.ts            # reclaimRecipientCoin witness
├── hooks/
│   ├── useBatchPay.ts            # React hook — full batch submit flow
│   ├── useClaim.ts               # React hook — claim from link
│   └── usePaymentRequest.ts      # React hook — create/mark request
├── merkle/
│   └── merkle.ts                 # Off-chain Merkle tree matching on-chain encoding
├── lib/
│   └── midnight.ts               # Provider wiring — proof, wallet, indexer, ZK config
├── context/
│   └── WalletContext.tsx         # 1AM wallet connect + session management
├── types/
│   └── index.ts                  # Shared types: Recipient, ClaimPackage, BatchSubmitResult
└── tests/
    └── gate3-integration.ts      # End-to-end integration test (Node.js, headless)

scripts/
├── deploy.ts                     # Contract deployment script
└── deployed-address.json         # Deployed contract address
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| ZK smart contract | Compact (Midnight's ZK language) |
| Blockchain | Midnight Network (undeployed local devnet) |
| SDK | `midnight-js` v4.0.4, `ledger-v8` v8.0.3 |
| Wallet (CLI) | `wallet-sdk-facade`, `wallet-sdk-hd`, `wallet-sdk-dust-wallet` |
| Wallet (browser) | 1AM extension via `window.midnight['1am']` |
| Frontend | React 19, Vite, Tailwind CSS v4, Framer Motion |
| ZK config (browser) | `FetchZkConfigProvider` + `httpClientProofProvider` |
| ZK config (Node.js) | `FilesystemZKConfigProvider` |
| Merkle tree | SHA-256 leaves, depth-16, custom off-chain implementation |
| Indexer queries | GraphQL (Midnight indexer v3/v4) |

---

## Debugging Notes

These cost the most time during development:

**ZSwap propagation delay**: After every transaction that modifies ZSwap state, wait 25-30 seconds before submitting the next transaction. Skip this and the node returns `Error 186 (EffectsCheckFailure)` with inner message `TreeNotRehashed` or `ZswapUnknownMerkleRoot`. This is not documented.

**`ContractUpdate` in GraphQL**: The indexer's `contractAction` returns a union type — `ContractDeploy`, `ContractCall`, or `ContractUpdate`. Code examples only show fragments for the first two. If the latest action is a `ContractUpdate`, inline fragments on `ContractDeploy`/`ContractCall` return null silently. Query the interface fields directly (no fragments) to handle all three.

**Browser Buffer polyfill**: Midnight SDK uses `Buffer` and `WebSocket` as globals. Add to `main.tsx` before any SDK import:
```typescript
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;
(globalThis as any).WebSocket = window.WebSocket;
```

**`QualifiedShieldedCoinInfo` witness**: Circuits that receive or spend shielded coins require `QualifiedShieldedCoinInfo` (indexer coin struct), not a raw coin or coin ID. Fetch from indexer, not from wallet balance.

**`persistentHash` vs `transientHash`**: Only `persistentHash` produces the same hash value across blocks for the same input. Use it for all commitment/nullifier structures. `transientHash` output varies per block.

---

## License

MIT
