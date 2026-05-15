---
title: "Agent Coordination — Tesseract Midnight Build"
type: coordination
status: active
last_updated: 2026-05-15
---

# Agent Coordination — Tesseract Midnight Build
## MLH × Midnight Hackathon — May 15–17 2026

**Two agents. One product. Read this before anything else.**

---

## Agent Roster

| Agent | Identity | Owns |
|---|---|---|
| **Claude Code** | Backend + contracts agent | Compact circuits, TypeScript flows, contract deployment, integration |
| **Gemini** | Frontend + UX agent | React screens, component design, UI polish, static mockups |
| **Abhinav** | Human coordinator | Start/stop prompts, gate approvals, conflict resolution |

---

## Ownership Boundaries — Hard Lines

### Claude Code owns (exclusively):
- `TesseractCore.compact` — all circuit code
- `src/flows/` — all TypeScript flow functions (`submitBatchFlow`, `claimPaymentFlow`, etc.)
- `src/contract/` — contract deployment + connection logic
- `src/merkle/` — Merkle tree builder
- `src/crypto/` — X25519+ChaCha20 memo encryption
- `agents/interfaces/` — publishes typed TS interfaces here as gates for Gemini

### Gemini owns (exclusively):
- `src/components/` — all React components
- `src/screens/` — all screen-level files (Dashboard, SendBatch, Claim, PaymentRequest, Auditor)
- `src/styles/` — Tailwind config + global styles
- Static mockup files (if needed for design review)

### Shared (integration — Claude Code leads):
- `src/App.tsx` — routing + top-level wiring
- `src/hooks/` — React hooks that call TypeScript flows
- Any file that connects a UI component to a backend flow

**Rule: Gemini never imports from `src/flows/` directly. Gemini imports from `src/hooks/`. Claude Code writes the hooks.**

---

## Gate System

Gates are explicit checkpoints. Neither agent advances past a gate without it being satisfied.

**How gates work:**
1. A gate condition is a specific file or test output that must exist
2. Claude Code satisfies backend gates by publishing to `agents/interfaces/`
3. Gemini checks `agents/interfaces/` — if the file isn't there, the gate is NOT open
4. Abhinav triggers phase starts by prompting each agent

**Gate files live at:** `agents/interfaces/`

| Gate | File | Content | Who publishes |
|---|---|---|---|
| GATE-1 | `interfaces/contract-deployed.md` | txHash + network + contract address | Claude Code |
| GATE-2A | `interfaces/submitBatchFlow.ts` | Typed TS interface for batch submit | Claude Code |
| GATE-2B | `interfaces/claimPaymentFlow.ts` | Typed TS interface for claim | Claude Code |
| GATE-2C | `interfaces/paymentRequestFlow.ts` | Typed TS interface for request flows | Claude Code |
| GATE-2D | `interfaces/reclaimFlow.ts` | Typed TS interface for reclaim | Claude Code |
| GATE-3 | `interfaces/integration-test-pass.md` | Test run output, all green | Claude Code |

**Gemini reads gate files before wiring any screen. Never assume an interface — always read the file.**

---

## Communication Protocol

### When Claude Code finishes a flow:
1. Write the typed interface to `agents/interfaces/<flowName>.ts`
2. Update `task-tracker.md` — mark task `[x]`, update gate status
3. Note in the interface file: which screen(s) can now be wired

### When Gemini finishes a screen:
1. Update `task-tracker.md` — mark task `[x]`
2. Note any props or data shapes that don't match the interface (escalate to Abhinav)

### When there's a conflict:
- Gemini does NOT change TypeScript flow interfaces — escalate to Abhinav
- Claude Code does NOT change component prop shapes — escalate to Abhinav
- Disagreements on shared files (`App.tsx`, hooks) → stop, flag in task-tracker.md under `## Blockers`, wait for Abhinav

### What Abhinav does:
- Prompts Claude Code to start Phase 1 → receives confirmation
- Prompts Gemini to start static mockups → receives confirmation
- Approves gates: checks `agents/interfaces/` for gate files, then prompts next phase
- Resolves blockers flagged in task-tracker.md

---

## Phase Overview

```
Phase 0 (PARALLEL): Environment + project scaffold
  ├── Claude Code: repo init, proof server, Compact compile stub, deploy empty contract
  └── Gemini:      Vite + React + Tailwind init, screen stubs, component scaffold

  ── GATE-1: contract-deployed.md exists ──

Phase 1 (PARALLEL): Core circuits + static UI
  ├── Claude Code: all 5 circuits compiled + deployed
  └── Gemini:      static UI screens (NO live data, NO flow calls — design only)

  ── GATE-2A/B/C/D: flow interfaces published ──
  (published incrementally — Gemini wires each screen as its gate opens)

Phase 2 (PARALLEL): TS flows + UI wiring
  ├── Claude Code: all 6 TypeScript flows + Merkle root parity test
  └── Gemini:      wire each screen to hooks (one per gate opened)

  ── GATE-3: integration-test-pass.md exists ──

Phase 3 (PARALLEL): Integration + UI polish
  ├── Claude Code: full e2e integration, fix any wiring issues
  └── Gemini:      error states, loading states, proof timeout UX

Phase 4: Demo prep + submission
  ├── Claude Code: demo wallets, README, Devpost
  └── Gemini:      demo video screenshots, final UI pass
```

---

## Do NOT Rules (both agents)

- Do NOT modify circuit code without updating `agents/interfaces/` if the change affects TS layer
- Do NOT start a new task in the tracker without marking prior task complete or explicitly flagging blocked
- Do NOT delete or move files owned by the other agent
- Do NOT make assumptions about what the other agent has done — read the tracker + interface files
- Do NOT continue working if a blocker flag is raised — stop and note it

---

## Product Reference

Full spec: `../PRD.md` (one level up from this folder)
Architecture decisions: `../../../../../../raw/unsorted/tesseract-pay-archive/architecture-decisions.md`
API corrections: `../../research/midnight-validation-round1.md`
