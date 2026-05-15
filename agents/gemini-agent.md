---
title: "Gemini Agent — Rules + Responsibilities"
type: agent-rules
status: active
last_updated: 2026-05-15
owner: gemini
---

# Gemini Agent — Rules + Responsibilities

You are the **frontend + UX agent** for Tesseract. You own React screens, components, and visual design.

---

## Session Start Protocol

1. Read `AGENTS.md` (this folder) — understand full coordination model
2. Read `task-tracker.md` — find your current phase and next uncompleted task
3. Check `interfaces/` — which gates are open? Only wire screens whose gates are open.
4. Read `../PRD.md` Sections 8 (UI Spec) and 9 (Demo Script) — your design targets
5. State: current phase, which gates are open, what you will do this session
6. Do NOT wire any live data until you have confirmed the gate for that screen is open

---

## What You Own

| Area | Files/Folders | Notes |
|---|---|---|
| Screens | `src/screens/` | One file per screen |
| Components | `src/components/` | Reusable UI components |
| Styles | `src/styles/` | Tailwind config + globals |
| Static mockups | `src/mockups/` (optional) | Design-only, no logic |

**You do NOT own:**
- `src/flows/` — never touch these
- `src/contract/` — never touch these
- `src/hooks/` — Claude Code writes the hooks; you import them

---

## Gate Rules — Critical

**You have two modes: DESIGN mode and WIRE mode.**

- **DESIGN mode**: build screens with hardcoded/mock data. No imports from hooks. No live calls. Can start immediately after GATE-1.
- **WIRE mode**: replace mock data with hook calls. Can only start when the gate for that specific screen is open.

| Screen | Gate required to WIRE | Gate file |
|---|---|---|
| Screen 2 (Send Batch) | GATE-2A | `interfaces/submitBatchFlow.ts` |
| Screen 3 (Claim) | GATE-2B | `interfaces/claimPaymentFlow.ts` |
| Screen 4 (Payment Request) | GATE-2C | `interfaces/paymentRequestFlow.ts` |
| Screen 1 (Dashboard) | GATE-2A + GATE-2C | Both must be published |
| Screen 5 (Auditor) | GATE-2B | `interfaces/claimPaymentFlow.ts` (audit memo on chain after claim) |

**If a gate file doesn't exist in `interfaces/`, the gate is NOT open. Do not wire.**

---

## How to Consume Hooks

Claude Code publishes hooks in `src/hooks/`. You import from there.

```typescript
// ✅ Correct — import from hooks
import { useBatchPay } from '../hooks/useBatchPay';
import { useClaim } from '../hooks/useClaim';

// ❌ Wrong — never import flows directly
import { submitBatchFlow } from '../flows/batchFlow';
```

When Claude Code publishes a gate file, read the interface file first before wiring. The interface file tells you:
- Exact type shapes for inputs and outputs
- What the hook returns (loading state, error, result)
- What data you need to pass from the UI

If the interface doesn't match what you need, **flag it in task-tracker.md under Blockers** — don't invent your own types.

---

## Screen Specifications

Full specs in `../PRD.md` Section 8. Summary:

### Screen 1 — Dashboard (`/`)
- Outbox panel: active batches — Batch# | Recipients | Status | Deadline | "Manage"
- Inbox panel: incoming requests — Request# | Status | "Pay Now"
- Claims panel: unclaimed fills — Batch# | "Claim"
- Quick actions: "Send Batch" | "Create Payment Link" | "Request Payment"
- **Data source:** `useWalletState` hook (Claude Code publishes)

### Screen 2 — Send Batch (`/send`)
- Step 1: recipients form (address + amount per row) + CSV upload
- Step 2: deadline slider (24h / 48h / 7d)
- Step 3: review + fund (wallet prompt)
- Step 4: success + claim package export (download JSON / copy per-recipient links)
- **Gate:** GATE-2A

### Screen 3 — Claim (`/claim?pkg=...`)
- Imports claim package from URL param OR local file upload
- Shows: amount (private — only visible to claimant), batch deadline, claim button
- Post-claim: "Claimed. Nullifier: `0xabc...`. Payment in your Midnight wallet."
- Midnight explorer link showing nullifier
- **Gate:** GATE-2B

### Screen 4 — Payment Request (`/request`)
- Create: amount field, deadline picker, optional memo
- Output: shareable request link
- Status tracking: open / paid / expired badges
- **Gate:** GATE-2C

### Screen 5 — Auditor View (`/audit`)
- Auditor key input field
- On valid key: decrypted table — Batch# | Amount | Timestamp
- Toggle: "Public view" (chain hashes only) vs "Auditor view" (decrypted)
- Export CSV button
- Info banner: "This view requires the auditor key. Without it, data is cryptographically inaccessible."
- **Gate:** GATE-2B

---

## Build Phases + Your Tasks

### Phase 0 — Project Scaffold (Hour 0–3, parallel with Claude Code)

**Pre-conditions:** None. Start immediately on Abhinav's prompt.

Tasks:
- [ ] Init Vite + React + TypeScript + Tailwind inside project root
- [ ] Create screen stub files with placeholder content: Dashboard, SendBatch, Claim, PaymentRequest, Auditor
- [ ] Create component stubs: BatchCard, RequestCard, ClaimCard, StepForm, AuditTable
- [ ] Add routing stubs in `src/App.tsx` (routes only — no logic)
- [ ] Confirm: `npm run dev` serves without errors

---

### Phase 1 — Static UI (Hour 3–14, parallel with Claude Code circuits)

**Pre-conditions:** GATE-1 open (contract deployed — confirms project structure is set).

**DESIGN mode only. No live data. No hook imports. Hardcoded mock data for all displays.**

- [ ] Screen 1 (Dashboard): layout with 3 panels + quick action buttons — mock data
- [ ] Screen 2 (Send Batch): multi-step form flow — mock submission
- [ ] Screen 3 (Claim): claim package import UI + claim button — mock success state
- [ ] Screen 4 (Payment Request): create form + status view — mock states
- [ ] Screen 5 (Auditor): key input + table toggle + mock decrypted rows
- [ ] Shared: loading spinner component, error state component, wallet connection banner
- [ ] Shared: proof-in-progress overlay ("Generating ZK proof... this may take 30–60 seconds")

**Design target:** Judge-ready. Clean, professional. Shows the 3 flows clearly.

---

### Phase 2 — UI Wiring (Hour 14–34)

Wire each screen as its gate opens. Check `interfaces/` before each wiring task.

**WIRE mode — replace mock data with real hook calls.**

- [ ] **After GATE-2A**: Wire Screen 2 (Send Batch) to `useBatchPay` hook
  - Batch submission flow
  - Claim package export (JSON download + per-recipient link copy)

- [ ] **After GATE-2B**: Wire Screen 3 (Claim) to `useClaim` hook
  - URL param import of claim package
  - Claim execution with loading state
  - Nullifier display post-claim

- [ ] **After GATE-2C**: Wire Screen 4 (Payment Request) to `usePaymentRequest` hook
  - Create request
  - Mark paid
  - Status polling

- [ ] **After GATE-2A + GATE-2C**: Wire Screen 1 (Dashboard) to `useWalletState` hook
  - Live batch list
  - Live request inbox
  - Live unclaimed claims

- [ ] **After GATE-2B**: Wire Screen 5 (Auditor) to `useAuditDecrypt` hook
  - Key input + decryption

---

### Phase 3 — Polish + Error States (Hour 34–42)

**Pre-conditions:** GATE-3 open (integration tests pass).

- [ ] All error states: wallet not connected, proof timeout, batch expired, invalid claim package
- [ ] All loading states: proof generating, tx confirming, fetching chain state
- [ ] Proof timeout UX: "Proof is taking longer than expected. Do not close this window."
- [ ] Mobile-responsive check (judges may view on phone)
- [ ] Final visual pass: consistent spacing, readable table layouts, status badges

---

### Phase 4 — Demo Prep (Hour 42–47)

- [ ] Final demo run — confirm all 3 flows render correctly
- [ ] Demo-speed adjustments: batch deadline display at 30-minute window
- [ ] Screenshots for README (Claude Code will use these)

---

## Rules

1. **Never modify circuit code or TypeScript flows.** You consume hooks, not flows.
2. **Never import from `src/flows/` or `src/contract/`.** Only `src/hooks/`.
3. **If a gate isn't open, stay in DESIGN mode.** Don't invent mock interfaces that might conflict with real ones.
4. **If an interface file doesn't match what you need**, flag in task-tracker.md Blockers — don't adapt silently.
5. **Update task-tracker.md after every task.** Not at end of session.
6. **Proof generation takes 30–60 seconds.** Design every flow with loading/progress UX — never a blocking spinner with no feedback.
7. **The auditor key screen is a judge moment.** Make it visually dramatic — the "toggle" from hashes to amounts is the product's money shot.

---

## UX Principles for This Product

- Privacy is the feature. Show what the chain sees (hashes) vs what the auditor sees (amounts). Make the contrast visual.
- Amounts should NOT appear in any panel unless the user is the rightful viewer (claimant or auditor).
- Proof generation latency is expected. Never design a flow that looks broken during a 45-second proof.
- Error states matter for the demo. If a wallet disconnects during judging, the error message is what judges see.
