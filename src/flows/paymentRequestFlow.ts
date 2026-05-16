/**
 * paymentRequestFlow — Create and mark paid private payment requests.
 *
 * createPaymentRequest flow:
 * 1. Generate requestId + requestNonce
 * 2. Build witness private state (requesterKey, requestNonce)
 * 3. Return for circuit call: createPaymentRequest(requestId, deadline)
 *
 * markRequestPaid flow:
 * 1. Load requestId + requesterKey + requestNonce from storage
 * 2. Build witness private state
 * 3. Return for circuit call: markRequestPaid(requestId)
 */

import type { PaymentRequestPrivateState, HexString } from '../types/index.js';
import { toHex, fromHex, randomBytes32, deadlineFromHours } from '../types/index.js';

// ── Create Payment Request ───────────────────────────────────────────────────

export interface CreateRequestInput {
  requesterKeyHex: HexString;    // ZswapCoinPublicKey.bytes as hex
  deadlineHours: number;
  appBaseUrl?: string;
  // Off-chain metadata (stored locally, never on-chain)
  description?: string;
  amount?: bigint;
  currency?: string;
}

export interface CreateRequestOutput {
  requestId: Uint8Array;
  requestIdHex: HexString;
  deadline: bigint;
  privateState: PaymentRequestPrivateState;
  paymentLink: string;
  /** Persist to storage keyed by requestIdHex */
  requesterRecord: RequesterRecord;
}

export interface RequesterRecord {
  requestIdHex: HexString;
  requesterKeyHex: HexString;
  requestNonceHex: HexString;
  deadline: number;
  description: string;
  amount: string;  // bigint as string or ""
  currency: string;
  status: 'open' | 'paid' | 'expired';
  createdAt: number;
}

export function prepareCreatePaymentRequest(input: CreateRequestInput): CreateRequestOutput {
  const {
    requesterKeyHex,
    deadlineHours,
    appBaseUrl = '/',
    description = '',
    amount,
    currency = 'NIGHT',
  } = input;

  const requestIdBytes = randomBytes32();
  const requestNonceBytes = randomBytes32();
  const requestIdHex = toHex(requestIdBytes);
  const requestNonceHex = toHex(requestNonceBytes);
  const deadline = deadlineFromHours(deadlineHours);
  const requesterKeyBytes = fromHex(requesterKeyHex);

  const privateState: PaymentRequestPrivateState = {
    requesterKey: { bytes: requesterKeyBytes },
    requestNonce: requestNonceBytes,
  };

  const params = new URLSearchParams({
    requestId: requestIdHex,
    requesterKey: requesterKeyHex,
    deadline: deadline.toString(),
    ...(amount !== undefined ? { amount: amount.toString() } : {}),
    ...(description ? { description } : {}),
  });
  const paymentLink = `${appBaseUrl}pay?${params.toString()}`;

  const requesterRecord: RequesterRecord = {
    requestIdHex,
    requesterKeyHex,
    requestNonceHex,
    deadline: Number(deadline),
    description,
    amount: amount?.toString() ?? '',
    currency,
    status: 'open',
    createdAt: Date.now(),
  };

  return {
    requestId: requestIdBytes,
    requestIdHex,
    deadline,
    privateState,
    paymentLink,
    requesterRecord,
  };
}

/**
 * Build witnesses for createPaymentRequest circuit.
 */
export function buildCreateRequestWitnesses(state: PaymentRequestPrivateState) {
  return {
    getBatchCoin: () => { throw new Error('wrong circuit'); },
    getMerkleRoot: () => { throw new Error('wrong circuit'); },
    getTotalAmount: () => { throw new Error('wrong circuit'); },
    getPayerKey: () => { throw new Error('wrong circuit'); },
    getBatchNonce: () => { throw new Error('wrong circuit'); },
    getClaimAmount: () => { throw new Error('wrong circuit'); },
    getMerkleProof: () => { throw new Error('wrong circuit'); },
    getLeafKey: () => { throw new Error('wrong circuit'); },
    getClaimSecret: () => { throw new Error('wrong circuit'); },
    getReclaimPayerKey: () => { throw new Error('wrong circuit'); },
    getReclaimBatchNonce: () => { throw new Error('wrong circuit'); },
    getRequesterKey: () => state.requesterKey,
    getRequestNonce: () => state.requestNonce,
    getMarkRequesterKey: () => { throw new Error('wrong circuit'); },
    getMarkRequestNonce: () => { throw new Error('wrong circuit'); },
  };
}

// ── Mark Request Paid ────────────────────────────────────────────────────────

export interface MarkPaidInput {
  requestIdHex: HexString;
  requesterKeyHex: HexString;
  requestNonceHex: HexString;
}

export interface MarkPaidOutput {
  requestId: Uint8Array;
  privateState: PaymentRequestPrivateState;
}

export function prepareMarkRequestPaid(input: MarkPaidInput): MarkPaidOutput {
  const { requestIdHex, requesterKeyHex, requestNonceHex } = input;
  const requestId = fromHex(requestIdHex);
  const requesterKeyBytes = fromHex(requesterKeyHex);
  const requestNonceBytes = fromHex(requestNonceHex);

  const privateState: PaymentRequestPrivateState = {
    requesterKey: { bytes: requesterKeyBytes },
    requestNonce: requestNonceBytes,
  };

  return { requestId, privateState };
}

/**
 * Build witnesses for markRequestPaid circuit.
 */
export function buildMarkPaidWitnesses(state: PaymentRequestPrivateState) {
  return {
    getBatchCoin: () => { throw new Error('wrong circuit'); },
    getMerkleRoot: () => { throw new Error('wrong circuit'); },
    getTotalAmount: () => { throw new Error('wrong circuit'); },
    getPayerKey: () => { throw new Error('wrong circuit'); },
    getBatchNonce: () => { throw new Error('wrong circuit'); },
    getClaimAmount: () => { throw new Error('wrong circuit'); },
    getMerkleProof: () => { throw new Error('wrong circuit'); },
    getLeafKey: () => { throw new Error('wrong circuit'); },
    getClaimSecret: () => { throw new Error('wrong circuit'); },
    getReclaimPayerKey: () => { throw new Error('wrong circuit'); },
    getReclaimBatchNonce: () => { throw new Error('wrong circuit'); },
    getRequesterKey: () => { throw new Error('wrong circuit'); },
    getRequestNonce: () => { throw new Error('wrong circuit'); },
    getMarkRequesterKey: () => state.requesterKey,
    getMarkRequestNonce: () => state.requestNonce,
  };
}

/**
 * Parse a payment request URL into display data (for payer's screen).
 */
export function parsePaymentRequestUrl(url: string): {
  requestId: HexString;
  requesterKey: HexString;
  deadline: bigint;
  amount?: bigint;
  description?: string;
} | null {
  try {
    const params = new URL(url).searchParams;
    const amount = params.get('amount');
    const description = params.get('description');
    return {
      requestId: params.get('requestId')!,
      requesterKey: params.get('requesterKey')!,
      deadline: BigInt(params.get('deadline')!),
      ...(amount ? { amount: BigInt(amount) } : {}),
      ...(description ? { description } : {}),
    };
  } catch {
    return null;
  }
}
