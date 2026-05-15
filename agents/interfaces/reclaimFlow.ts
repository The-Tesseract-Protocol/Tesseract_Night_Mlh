// agents/interfaces/reclaimFlow.ts
// Published by: Claude Code
// Date: 2026-05-15
// Unblocks: Reclaim UI in Dashboard (Screen 1)
// Implementation: src/flows/reclaimFlow.ts
// Hook: included in useBatchPay (reclaim method)

// ── Types Gemini needs ────────────────────────────────────────────────────────

export interface ReclaimableBatch {
  batchId: string;         // 64-char hex
  totalAmount: bigint;
  claimedAmount: bigint;   // from ledger
  reclaimableAmount: bigint; // = totalAmount - claimedAmount
  deadline: bigint;        // Unix timestamp seconds (already passed)
  isEligible: boolean;     // deadline passed && !reclaimed
}

export interface ReclaimResult {
  txHash: string;
  reclaimedAmount: bigint;
}

// ── Hook (included in useBatchPay) ───────────────────────────────────────────
// reclaim method signature:
// reclaim: (batchId: string) => Promise<ReclaimResult>
//
// Access via useBatchPay().reclaim

// Dashboard usage:
// const { batches, reclaim } = useBatchPay();
// const expired = batches.filter(b => Date.now()/1000 > Number(b.deadline) && !b.isReclaimed);
// // Show reclaim button for each expired batch
// const result = await reclaim(batch.batchId);
