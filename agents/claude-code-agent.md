---
title: "Claude Code Agent — Rules + Responsibilities"
type: agent-rules
status: active
last_updated: 2026-05-15
owner: claude-code
---

# Claude Code Agent — Rules + Responsibilities

You are the **backend + contracts agent** for Tesseract. You own circuits, TypeScript flows, and integration.

---

## Session Start Protocol

1. Read `AGENTS.md` (this folder) — understand full coordination model
2. Read `task-tracker.md` — find your current phase and next uncompleted task
3. Read `../PRD.md` — full product spec (if not yet read this session)
4. Check `interfaces/` — what gates are already open?
5. State: current phase, last completed task, what you will do this session
6. Do NOT start coding until you have confirmed the above

**On first session only — also read in order:**
- `../PRD.md` Section 12 (Vault File Index) — read all listed files before writing circuits

---

## What You Own

| Area | Files/Folders | Notes |
|---|---|---|
| Compact contract | `src/contract/TesseractCore.compact` | All 5 circuits + ledger state |
| TypeScript flows | `src/flows/` | One file per flow |
| Merkle builder | `src/merkle/merkle.ts` | Must match circuit exactly |
| Crypto utils | `src/crypto/memo.ts` | X25519+ChaCha20 audit memo |
| Contract client | `src/contract/client.ts` | Deployment + connection |
| React hooks | `src/hooks/` | Thin wrappers over flows — Gemini imports these |
| Integration tests | `src/tests/` | Mandatory gate |
| Gate files | `agents/interfaces/` | Publish here when flows are ready |
| App routing | `src/App.tsx` | You wire routes to screens |

---

## Gate Publishing Rules

When you complete a flow, you MUST:

1. Write a typed interface file to `agents/interfaces/<flowName>.ts`
2. The file must export all types Gemini needs to call the hook
3. Update `task-tracker.md` — mark task done, mark gate status

**Interface file format:**
```typescript
// agents/interfaces/submitBatchFlow.ts
// Published by: Claude Code
// Date: YYYY-MM-DD
// Unblocks: Screen 2 (Send Batch) in Gemini

export interface Recipient {
  key: string;     // ZswapCoinPublicKey as hex string
  amount: bigint;
}

export interface BatchResult {
  batchId: string;
  claimPackages: ClaimPackage[];
  txHash: string;
}

export interface ClaimPackage {
  batchId: string;
  merkleProof: string[];
  amount: bigint;
  claimSecret: string;
  leafKey: string;
  leafIndex: number;
  shareableLink: string;
}

// Hook signature (you will implement in src/hooks/useBatchPay.ts):
// export function useBatchPay(): {
//   createBatch: (recipients: Recipient[], deadlineHours: number) => Promise<BatchResult>;
//   isLoading: boolean;
//   error: string | null;
// }
```

---

## Build Phases + Your Tasks

### Phase 0 — Environment + Skeleton (Hour 0–3)

**Pre-conditions:** None. Start immediately on Abhinav's prompt.

Tasks:
- [ ] Init repo (Compact project scaffold + Vite React monorepo)
- [ ] Docker proof server: `docker run -p 6300:6300 midnightnetwork/proof-server:6.1.0-alpha.6`
- [ ] Confirm testnet-02 endpoints (fallback: local devnet)
- [ ] Write `TesseractCore.compact`: all 11 ledger maps + 5 circuit stubs (signatures only, no bodies)
- [ ] Compile stub — no syntax errors
- [ ] Deploy empty contract to testnet
- [ ] **Publish `agents/interfaces/contract-deployed.md`** ← GATE-1

`contract-deployed.md` format:
```markdown
# Contract Deployed
Date: YYYY-MM-DD HH:MM
Network: testnet-02 (or devnet)
Contract address: 0x...
txHash: 0x...
Proof server: http://localhost:6300
Status: READY
```

---

### Phase 1 — Core Circuits (Hour 3–14)

**Pre-conditions:** GATE-1 open.

**Archive port (3 circuits):**
- [ ] `submitBatchRoot`: port from archive + OQ-16 fix (`batchCoins.insertCoin`)
- [ ] `claimPayment`: port from archive + remove `contractCoin` witness + add `batchCoins.lookup` + store change coin via `insertCoin`
- [ ] `reclaimExpiredBatch`: port from archive + same `batchCoins.lookup` fix
- [ ] Compile all 3 — fix type errors
- [ ] Benchmark: `claimPayment` D=16 → record k + rows (must be < 14,000)
- [ ] Drop to D=8 if proof > 60s (still supports 256 recipients — sufficient for demo)

**New circuits (2):**
- [ ] `createPaymentRequest`: write from PRD Section 4.4
- [ ] `markRequestPaid`: write from PRD Section 4.5
- [ ] Compile both
- [ ] Deploy full 5-circuit contract to testnet — update `interfaces/contract-deployed.md`

**Critical — confirm at first compile:**
- `sendShielded` return type: verify `.change` field name (see PRD Risk Register)
- `kernel.blockTimeLessThan` exact signature

---

### Phase 2 — TypeScript Flows (Hour 14–22)

**Pre-conditions:** All 5 circuits deployed (Phase 1 complete).

Publish gate after each flow:

- [ ] `submitBatchFlow()`: coin selection → Merkle tree build → circuit call → claim package persist (IndexedDB)
  → **Publish `interfaces/submitBatchFlow.ts`** ← GATE-2A

- [ ] `claimPaymentFlow()`: load package → audit memo encrypt → circuit call
  → **Publish `interfaces/claimPaymentFlow.ts`** ← GATE-2B

- [ ] `createPaymentRequestFlow()` + `payRequestFlow()` + `markRequestPaidFlow()`
  → **Publish `interfaces/paymentRequestFlow.ts`** ← GATE-2C

- [ ] `reclaimFlow()`: deadline check → circuit call
  → **Publish `interfaces/reclaimFlow.ts`** ← GATE-2D

- [ ] **Merkle root parity test (MANDATORY)**: build same 2-leaf tree in web app + circuit stub — roots MUST match. No real txs until this passes.

- [ ] Write React hooks in `src/hooks/`: `useBatchPay`, `useClaim`, `usePaymentRequest`, `useReclaim`

- [ ] Integration test: 2 recipients, 1 batch, 2 claims — all succeed on testnet
  → **Publish `interfaces/integration-test-pass.md`** ← GATE-3

---

### Phase 3 — Integration (Hour 22–34, parallel with Gemini UI wiring)

**Pre-conditions:** GATE-3 open.

- [ ] Wire `src/App.tsx` routes to Gemini's screens
- [ ] Review all hooks — confirm Gemini is calling them correctly
- [ ] Fix any prop mismatches between Gemini's screens and your hooks
- [ ] Full e2e: 3 flows per demo script (Section 9 of PRD)

---

### Phase 4 — Demo + Submission (Hour 34–47)

- [ ] Seed 3 demo wallets with testnet NIGHT
- [ ] Set batch deadline to 30-minute window for demo speed
- [ ] README.md (Devpost required)
- [ ] Record 3-minute demo video (mandatory backup)
- [ ] Midnight explorer screenshots for README
- [ ] Devpost submission

---

## Rules

1. **Never write a React component.** That's Gemini's job. If you need a UI wrapper, write a hook and let Gemini consume it.
2. **Compile before claiming done.** A circuit or flow is not done until it compiles clean.
3. **Test before publishing a gate.** An interface is not published until the flow it describes actually runs on testnet.
4. **Update task-tracker.md after every task.** Not at end of session — after each task.
5. **If proof time > 60s for D=16, drop to D=8 and document it.** Don't ask — just do it and note in task-tracker.md.
6. **If testnet is down, use local devnet.** Update `contract-deployed.md` with devnet endpoints. Don't block.

---

## Key Technical Reminders

- `encrypt()` does NOT exist in Compact — all memos are app-side X25519+ChaCha20
- `claimNullifiers` key is `Bytes<32>` not `Bytes<64>`
- `Map.insertCoin(key, coin)` exists — confirmed for `Map<K, QualifiedShieldedCoinInfo>`
- DApp Connector v4: `connect(networkId)` only — no `enable()`. `getShieldedAddresses()` plural
- `WalletBuilder.build()` not `buildFromSeed()` (deprecated)
- All maps must be flat — no struct maps (`BlockLimitExceeded` at runtime)
- `persistentHash` always returns `Bytes<32>` regardless of input count/size

Full corrections: `../../research/midnight-validation-round1.md`
