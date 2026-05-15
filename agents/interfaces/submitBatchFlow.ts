// agents/interfaces/submitBatchFlow.ts
// Published by: Claude Code
// Date: 2026-05-15
// Unblocks: Screen 2 (Send Batch) in Gemini
// Implementation: src/flows/submitBatchFlow.ts
// Hook: src/hooks/useBatchPay.ts

// ── Types Gemini needs ────────────────────────────────────────────────────────

export interface Recipient {
  key: string;     // ZswapCoinPublicKey.bytes as 64-char hex
  amount: bigint;
}

export interface ClaimPackage {
  batchId: string;        // 64-char hex
  leafIndex: number;
  amount: bigint;
  claimSecret: string;    // 64-char hex (secret to recipient)
  leafKey: string;        // recipient key hex
  shareableLink: string;  // URL with all claim params
  merkleProof: {
    leaf: string;         // 64-char hex
    path: Array<{ sibling: { field: string }; goes_left: boolean }>;
  };
}

export interface BatchResult {
  batchId: string;
  merkleRoot: string;        // bigint as string (Field value)
  totalAmount: bigint;
  claimPackages: ClaimPackage[];
  deadline: bigint;          // Unix timestamp seconds
  txHash: string;            // after circuit submission
}

export interface BatchState {
  batchId: string;
  totalAmount: bigint;
  claimedAmount: bigint;     // from ledger
  deadline: bigint;
  isReclaimed: boolean;
  claimCount: number;
  claimPackages: ClaimPackage[];
}

// ── Hook signature ─────────────────────────────────────────────────────────────
// Implemented in: src/hooks/useBatchPay.ts

export interface UseBatchPayReturn {
  createBatch: (recipients: Recipient[], deadlineHours: number) => Promise<BatchResult>;
  reclaim: (batchId: string) => Promise<{ txHash: string }>;
  batches: BatchState[];
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

// Hook usage example:
// const { createBatch, isLoading, error } = useBatchPay();
// const result = await createBatch([{ key: "abc...", amount: 100n }], 24);
// // result.claimPackages[0].shareableLink → share with recipient
