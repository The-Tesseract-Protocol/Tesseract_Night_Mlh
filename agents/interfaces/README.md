# interfaces/

Gate files published by Claude Code. Gemini reads before wiring each screen.

| File | Gate | Published | Unblocks |
|---|---|---|---|
| `contract-deployed.md` | GATE-1 | ⬜ | Phase 1 (both agents) |
| `submitBatchFlow.ts` | GATE-2A | ⬜ | Screen 2 (Send Batch) |
| `claimPaymentFlow.ts` | GATE-2B | ⬜ | Screen 3 (Claim) + Screen 5 (Auditor) |
| `paymentRequestFlow.ts` | GATE-2C | ⬜ | Screen 4 (Payment Request) |
| `reclaimFlow.ts` | GATE-2D | ⬜ | Reclaim UI |
| `integration-test-pass.md` | GATE-3 | ⬜ | Phase 3 (polish + e2e) |

**Claude Code:** Update `⬜` to `✅ YYYY-MM-DD` when publishing.
**Gemini:** Never modify files here. Read only.
