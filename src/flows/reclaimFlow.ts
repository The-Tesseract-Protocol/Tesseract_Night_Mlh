/**
 * reclaimFlow — Payer recovers unclaimed funds after batch deadline.
 *
 * Flow:
 * 1. Load payerKey + batchNonce from storage (saved at submitBatch time)
 * 2. Build witness private state
 * 3. Return for circuit call: reclaimExpiredBatch(batchId)
 *
 * Circuit checks:
 * - blockTimeGt(deadline) — deadline must have passed
 * - !batchReclaimed — not already reclaimed
 * - persistentHash(payerKey, batchNonce) == storedCommitment — payer identity
 */

import {
  ReclaimPrivateState,
  HexString,
  fromHex,
} from '../types/index.js';
import type { PayerRecord } from './submitBatchFlow.js';

export interface ReclaimFlowInput {
  batchIdHex: HexString;
  payerKeyHex: HexString;
  batchNonceHex: HexString;
}

export interface ReclaimFlowOutput {
  batchId: Uint8Array;
  privateState: ReclaimPrivateState;
}

export function prepareReclaim(input: ReclaimFlowInput): ReclaimFlowOutput {
  const { batchIdHex, payerKeyHex, batchNonceHex } = input;

  const batchId = fromHex(batchIdHex);
  const payerKeyBytes = fromHex(payerKeyHex);
  const batchNonceBytes = fromHex(batchNonceHex);

  const privateState: ReclaimPrivateState = {
    payerKey: { bytes: payerKeyBytes },
    batchNonce: batchNonceBytes,
  };

  return { batchId, privateState };
}

/**
 * Build witnesses for reclaimExpiredBatch circuit.
 */
export function buildReclaimWitnesses(state: ReclaimPrivateState) {
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
    getReclaimPayerKey: () => state.payerKey,
    getReclaimBatchNonce: () => state.batchNonce,
    getRequesterKey: () => { throw new Error('wrong circuit'); },
    getRequestNonce: () => { throw new Error('wrong circuit'); },
    getMarkRequesterKey: () => { throw new Error('wrong circuit'); },
    getMarkRequestNonce: () => { throw new Error('wrong circuit'); },
  };
}

/**
 * Load reclaim input from a stored PayerRecord.
 */
export function reclaimFromPayerRecord(record: PayerRecord): ReclaimFlowInput {
  return {
    batchIdHex: record.batchIdHex,
    payerKeyHex: record.payerKeyHex,
    batchNonceHex: record.batchNonceHex,
  };
}

/**
 * Check if a batch is eligible for reclaim (client-side, not authoritative).
 */
export function isEligibleForReclaim(record: PayerRecord): boolean {
  return Date.now() / 1000 > record.deadline;
}
