// agents/interfaces/paymentRequestFlow.ts
// Published by: Claude Code
// Date: 2026-05-15
// Unblocks: Screen 4 (Payment Request) in Gemini
// Implementation: src/flows/paymentRequestFlow.ts
// Hook: src/hooks/usePaymentRequest.ts

// ── Types Gemini needs ────────────────────────────────────────────────────────

export interface CreateRequestParams {
  deadlineHours: number;
  description?: string;
  amount?: bigint;
  currency?: string;  // default "NIGHT"
}

export interface PaymentRequest {
  requestId: string;     // 64-char hex
  paymentLink: string;   // URL to share with payer
  deadline: bigint;      // Unix timestamp seconds
  description: string;
  amount: bigint | null;
  currency: string;
  status: 'open' | 'paid' | 'expired';
  createdAt: number;
  txHash?: string;
}

export interface CreateRequestResult {
  request: PaymentRequest;
  txHash: string;
}

// ── Parsed from URL by payer ──────────────────────────────────────────────────

export interface PaymentRequestUrlData {
  requestId: string;
  requesterKey: string;  // 64-char hex
  deadline: bigint;
  amount?: bigint;
  description?: string;
}

// ── Hook signature ─────────────────────────────────────────────────────────────

export interface UsePaymentRequestReturn {
  /** Create a new payment request and submit to chain */
  createRequest: (params: CreateRequestParams) => Promise<CreateRequestResult>;
  /** Mark a request as paid (called by requester after receiving payment) */
  markPaid: (requestId: string) => Promise<{ txHash: string }>;
  /** Parse a payment link URL into display data */
  parsePaymentLink: (url: string) => PaymentRequestUrlData | null;
  requests: PaymentRequest[];
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

// Hook usage example (Screen 4 — requester):
// const { createRequest, markPaid, requests } = usePaymentRequest();
// const result = await createRequest({ deadlineHours: 48, amount: 500n, description: "Invoice #123" });
// // Share result.request.paymentLink with payer
// // After off-chain payment confirmed, call:
// await markPaid(result.request.requestId);

// Hook usage example (Screen 4 — payer viewing a link):
// const { parsePaymentLink } = usePaymentRequest();
// const data = parsePaymentLink(window.location.href);
// // Show data.amount, data.description, data.deadline to payer
