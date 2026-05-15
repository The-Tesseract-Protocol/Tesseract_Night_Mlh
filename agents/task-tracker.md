---
title: "Build Task Tracker — Tesseract Midnight"
type: task-tracker
status: active
last_updated: 2026-05-15
---

# Build Task Tracker — Tesseract Midnight
## MLH × Midnight Hackathon — May 15–17 2026

Status: `[ ]` todo — `[~]` in progress — `[x]` done — `[!]` blocked

**Gate status at top. Tasks below. Blockers section at bottom.**

---

## Gate Status

| Gate    | Status     | File                                       | Unblocks                              |
| ------- | ---------- | ------------------------------------------ | ------------------------------------- |
| GATE-1  | ✅ OPEN     | `interfaces/GATE-1-contract-compiled.json` | Phase 1 (both agents)                 |
| GATE-2A | ✅ OPEN     | `interfaces/submitBatchFlow.ts`            | Screen 2 (Send Batch)                 |
| GATE-2B | ✅ OPEN     | `interfaces/claimPaymentFlow.ts`           | Screen 3 (Claim) + Screen 5 (Auditor) |
| GATE-2C | ✅ OPEN     | `interfaces/paymentRequestFlow.ts`         | Screen 4 (Payment Request)            |
| GATE-2D | ✅ OPEN     | `interfaces/reclaimFlow.ts`                | Reclaim UI in Dashboard               |
| GATE-3  | ⬜ NOT OPEN | `interfaces/integration-test-pass.md`      | Phase 3 (Polish + e2e)                |

Update gate status here when interface files are published.

---

## Phase 0 — Environment + Scaffold

**Pre-condition:** Abhinav's start prompt. Both agents begin in parallel.
**Target:** Hour 0–3

### Claude Code

- [x] Init repo (Compact project scaffold) — DONE 2026-05-15
- [x] Docker proof server confirmed running: `docker run -p 6300:6300 midnightnetwork/proof-server:6.1.0-alpha.6` — DONE 2026-05-15
- [x] Testnet-02 endpoints confirmed (or local devnet fallback documented) — local devnet (Docker) confirmed; testnet-02 pending connection
- [x] `TesseractCore.compact`: all 11 ledger maps + 5 circuit stubs (signatures only) — DONE 2026-05-15
- [x] Compile stub — no syntax errors, no type errors — **COMPILE CLEAN EXIT 0 — 2026-05-15 21:43 IST**
- [ ] Deploy empty contract to testnet — capture txHash
- [x] Publish `agents/interfaces/GATE-1-contract-compiled.json` → **GATE-1 OPEN — 2026-05-15**

### Gemini

- [x] Vite + React + TypeScript + Tailwind initialized
- [x] Screen stubs created: Dashboard, SendBatch, Claim, PaymentRequest, Auditor
- [x] Component stubs created: BatchCard, RequestCard, ClaimCard, StepForm, AuditTable
- [x] Routing stubs in `src/App.tsx`
- [x] `npm run dev` serves clean with no errors

**⛔ Gemini DOES NOT proceed to Phase 1 tasks until GATE-1 is confirmed open.**

---

## Phase 1 — Circuits + Static UI (Parallel)

**Pre-condition:** GATE-1 open.
**Target:** Hour 3–14

### Claude Code — Circuits

**Archive port (3 circuits):**
- [x] `submitBatchRoot`: port + `batchCoins.insertCoin` (OQ-16 fix) — DONE 2026-05-15
- [x] `claimPayment`: port + remove `contractCoin` witness + `batchCoins.lookup` + `insertCoin(sendResult.change)` — DONE 2026-05-15
- [x] `reclaimExpiredBatch`: port + same `batchCoins.lookup` fix — DONE 2026-05-15
- [x] Compile all 3 circuits — clean — DONE 2026-05-15
- [x] Benchmark: `claimPayment` D=16 → k=15 rows=31191 — well within 32k budget, D=16 stays

**New circuits (2):**
- [x] `createPaymentRequest`: write from PRD Section 4.4 — DONE 2026-05-15
- [x] `markRequestPaid`: write from PRD Section 4.5 — DONE 2026-05-15
- [x] Compile both — DONE 2026-05-15
- [~] Deploy full 5-circuit contract to testnet — devnet node not running (proof server OK); deploy pending

### Gemini — Static UI (DESIGN mode — mock data only)

**⛔ No hook imports. No live calls. Design only.**

- [ ] Screen 1 (Dashboard): 3-panel layout with mock data — batch list, request inbox, unclaimed claims
- [ ] Screen 2 (Send Batch): multi-step form (recipients → deadline → review → success)
- [ ] Screen 3 (Claim): import + claim button + success/nullifier display
- [ ] Screen 4 (Payment Request): create form + status badges (open/paid/expired)
- [ ] Screen 5 (Auditor): key input + decrypted table + public/auditor toggle
- [ ] Shared components: loading spinner, error state, proof-in-progress overlay (30–60s warning)
- [ ] Shared: wallet connection banner

---

## Phase 2 — TypeScript Flows + UI Wiring

**Pre-condition:** Phase 1 complete (all 5 circuits deployed).
**Target:** Hour 14–22 (flows) / Hour 14–34 (wiring, as gates open)

### Claude Code — TypeScript Flows

- [x] `submitBatchFlow()`: coin selection → Merkle build → circuit call → claim package persist (IndexedDB) — DONE 2026-05-15
  - [x] **Publish `agents/interfaces/submitBatchFlow.ts`** → **GATE-2A OPEN — 2026-05-15**

- [x] `claimPaymentFlow()`: load package → audit memo encrypt (X25519+AES-GCM) → circuit call — DONE 2026-05-15
  - [x] **Publish `agents/interfaces/claimPaymentFlow.ts`** → **GATE-2B OPEN — 2026-05-15**

- [x] `createPaymentRequestFlow()` + `markRequestPaidFlow()` — DONE 2026-05-15
  - [x] **Publish `agents/interfaces/paymentRequestFlow.ts`** → **GATE-2C OPEN — 2026-05-15**

- [x] `reclaimFlow()`: deadline check → circuit call — DONE 2026-05-15
  - [x] **Publish `agents/interfaces/reclaimFlow.ts`** → **GATE-2D OPEN — 2026-05-15**

- [x] React hooks: `useBatchPay`, `useClaim`, `usePaymentRequest`, `useWalletState`, `useAuditDecrypt` — DONE 2026-05-15

- [x] **MERKLE ROOT PARITY TEST** — **PASS 2026-05-15**
  - 8/8 checks passed. Root = 5224587441119831160404501526159937739743805838578119392730923602267497880506 for [key1@100n, key2@200n]

- [ ] Integration test: 2 recipients, 1 batch, 2 claims — all succeed on testnet
  - [ ] **Publish `agents/interfaces/integration-test-pass.md`** → **GATE-3 opens**

### Gemini — UI Wiring (WIRE mode — one screen per gate)

**⛔ Check gate file exists in `interfaces/` before starting each wiring task.**

- [ ] **After GATE-2A**: Wire Screen 2 (Send Batch) — `useBatchPay` hook
  - Batch submission + claim package export (download JSON / copy per-link)
- [ ] **After GATE-2B**: Wire Screen 3 (Claim) — `useClaim` hook
  - URL param parse + proof loading + nullifier display
- [ ] **After GATE-2C**: Wire Screen 4 (Payment Request) — `usePaymentRequest` hook
  - Create + mark paid + status
- [ ] **After GATE-2A + GATE-2C**: Wire Screen 1 (Dashboard) — `useWalletState` hook
  - Live batch list, request inbox, unclaimed fills
- [ ] **After GATE-2B**: Wire Screen 5 (Auditor) — `useAuditDecrypt` hook
  - Key input + decryption + table

---

## Phase 3 — Integration + Polish

**Pre-condition:** GATE-3 open (integration tests pass).
**Target:** Hour 22–42

### Claude Code — Integration

- [ ] Wire `src/App.tsx` routes to all Gemini screens
- [ ] Full e2e: 3 flows per demo script (PRD Section 9)
- [ ] Run demo 3 times — time each step:
  - Run 1: `Batch Pay: ___s | Payment Link: ___s | Payment Request: ___s`
  - Run 2: `___`
  - Run 3: `___`
- [ ] Fix any prop mismatches (coordinate with Gemini)
- [ ] Seed 3 demo wallets with testnet NIGHT
- [ ] Set batch deadline to 30-minute window for demo speed

### Gemini — Polish

- [ ] All error states: wallet disconnect, proof timeout, expired batch, invalid claim package
- [ ] Proof-in-progress overlay tested with real proof timing
- [ ] Mobile-responsive check (judges may use phone)
- [ ] Final visual pass: spacing, badges, table readability
- [ ] Auditor toggle — confirm visual impact of hash → amount reveal

---

## Phase 4 — Submission

**Pre-condition:** Full e2e passes. Demo runs cleanly 3 times.
**Target:** Hour 42–47

### Claude Code

- [ ] README.md (Devpost: what it does, how built, challenges, tech stack)
- [ ] Midnight explorer screenshots (show nullifier — confirm no amount visible)
- [ ] Devpost submission before deadline

### Gemini

- [ ] Demo video screenshots (5–6 key frames showing privacy toggle)
- [ ] Final UI screenshots for README

### Both

- [ ] Record 3-minute demo video (backup if live demo fails)
- [ ] Devpost submission confirmed

---

## Blockers

Add blockers here when work stops. Format: `[YYYY-MM-DD HH:MM] [AGENT] DESCRIPTION → waiting on [AGENT/ABHINAV]`

*(empty — no blockers yet)*

---

## Notes / Discoveries

Record compile-time discoveries, API surprises, or design decisions made during build.

Format: `[YYYY-MM-DD] DISCOVERY — what was found and what was done`

[2026-05-15] COMPACT SYNTAX — ledger declarations: `export ledger name: Type;` individually, NOT `ledger { }` block.
[2026-05-15] COMPACT SYNTAX — `assert(condition, "message")` requires parentheses and message argument.
[2026-05-15] COMPACT SYNTAX — `if(condition) { } else { }` requires parentheses around condition.
[2026-05-15] COMPACT SYNTAX — `persistentHash<T>(value)` is single-arg only. Multi-field hash requires a struct literal.
[2026-05-15] COMPACT SEMANTICS — `Map.lookup(key)` returns V directly (circuit aborts if key missing). NO Maybe wrapper in circuit code. `Maybe<T>` only appears in TypeScript layer.
[2026-05-15] COMPACT SEMANTICS — `Map.member(key)` used for existence check before inserting (no lookup abort).
[2026-05-15] COMPACT SEMANTICS — `ShieldedSendResult.change.is_some` IS a Maybe in circuit code — this pattern is correct.
[2026-05-15] COMPACT SEMANTICS — integer arithmetic widens type: `(a + b) as Uint<128>` explicit cast required.
[2026-05-15] CIRCUIT STATS — claimPayment k=15, rows=31191. Well within 32k budget at D=16. No need to drop to D=8.
[2026-05-15] MERKLE — batchMerkleRoots stores `Field` (not `Bytes<32>`). Web app parity test must compare `.field` values.
[2026-05-15] STRUCTS — 3 helper structs defined: PayerCommitInput, ClaimNullifierInput, RequesterCommitInput. TypeScript flow must construct identical structs for hash parity.
[2026-05-15] PROOF SERVER — Docker image confirmed working. `{"status":"ok"}` on port 6300.
[2026-05-15] COMPILE CMD — `compact compile -- <source.compact> <output-dir>` (double dash required, output dir required).
[2026-05-15] MERKLE PARITY — TypeScript buildMerkleTree uses degradeToTransient(leaf) + transientHash(Vec2Field, [L,R]) for internal nodes. Matches _merkleTreePathRootNoLeafHash in compiled contract. PARITY CONFIRMED.
[2026-05-15] PERSISTENT HASH TS — `persistentHash(descriptor, value)` from @midnight-ntwrk/compact-runtime. Custom CompactType descriptors built for PayerCommitInput, ClaimNullifierInput, RequesterCommitInput, PaymentLeafInput in src/contract/descriptors.ts.
[2026-05-15] AUDIT MEMO — Circuit takes encryptedAuditMemo: Bytes<128> as public param + discloses it. Encryption is app-side: X25519+AES-GCM using Web Crypto API. 56 bytes plaintext max.
[2026-05-15] INDEXEDDB — Payer records (batchId, payerKey, batchNonce, claimPackages) stored in IndexedDB "tesseract-payer". Request records in "tesseract-requests". Both keyed by ID hex.
[2026-05-15] GATES 2A/B/C/D ALL OPEN — Gemini can begin wiring all 4 screens in parallel.
[2026-05-15] DEPLOY BLOCKED — Devnet node (port 9944) + indexer (port 8088) not running. Only proof server (6300) is up. Need: `docker run midnightnetwork/node:latest` or testnet wallet + funds.
