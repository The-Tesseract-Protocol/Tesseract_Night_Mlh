// agents/interfaces/claimPaymentFlow.ts
// Published by: Claude Code
// Date: 2026-05-15
// Unblocks: Screen 3 (Claim) + Screen 5 (Auditor) in Gemini
// Implementation: src/flows/claimPaymentFlow.ts
// Hook: src/hooks/useClaim.ts + src/hooks/useAuditDecrypt.ts

// ── Types Gemini needs ────────────────────────────────────────────────────────

export interface ClaimParams {
  batchId: string;        // 64-char hex
  leafIndex: number;
  amount: bigint;
  claimSecret: string;    // 64-char hex
  leafKey: string;        // 64-char hex (recipient's key)
  merkleProof?: {
    leaf: string;
    path: Array<{ sibling: { field: string }; goes_left: boolean }>;
  };
}

export interface ClaimResult {
  txHash: string;
  nullifier: string;      // 64-char hex — proves claim uniqueness
  claimedAmount: bigint;
}

export interface AuditRecord {
  batchId: string;
  leafIndex: number;
  amount: string;         // bigint as string
  recipientKeyHex: string;
  timestamp: number;
}

export interface AuditEntry {
  txHash: string;
  encryptedMemo: string;  // hex of Bytes<128>
  decrypted: AuditRecord | null;
}

// ── Hook signatures ───────────────────────────────────────────────────────────

export interface UseClaimReturn {
  /** Parse claim params from current URL (window.location.href) */
  parseCurrentUrl: () => ClaimParams | null;
  /** Execute claim circuit */
  claim: (params: ClaimParams) => Promise<ClaimResult>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

export interface UseAuditDecryptReturn {
  /** Decrypt all audit memos with auditor private key */
  decrypt: (auditorPrivKeyHex: string, batchId?: string) => Promise<AuditEntry[]>;
  entries: AuditEntry[];
  isLoading: boolean;
  error: string | null;
}

// Hook usage example (Screen 3):
// const { parseCurrentUrl, claim, isLoading } = useClaim();
// const params = parseCurrentUrl();
// if (params) {
//   const result = await claim(params);
//   // Show result.nullifier as proof of claim
// }

// Hook usage example (Screen 5):
// const { decrypt, entries } = useAuditDecrypt();
// await decrypt(auditorPrivKeyHex, batchId);
// // entries[i].decrypted.amount shows actual transfer amount
