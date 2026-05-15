/**
 * claimPaymentFlow — Recipient proves Merkle inclusion and receives shielded UTXO.
 *
 * Flow:
 * 1. Parse / load claim package (from URL params or IndexedDB)
 * 2. Encrypt audit memo (X25519+AES-GCM)
 * 3. Build witness private state
 * 4. Return witnesses + encryptedAuditMemo for circuit call
 *
 * Caller must:
 * - Call contract.impureCircuits.claimPayment(context, batchId, encryptedAuditMemo)
 * - With the witnesses returned here
 */

import { encryptAuditMemo, EMPTY_MEMO, type AuditRecord } from '../crypto/memo.js';
import { deserializeClaimPackage } from './claimPackageSerde.js';
import {
  ClaimPrivateState,
  HexString,
  toHex,
  fromHex,
} from '../types/index.js';
import type { SerializedClaimPackage } from './submitBatchFlow.js';

export interface ClaimFlowInput {
  /** From URL params or claim package JSON */
  batchIdHex: HexString;
  leafIndex: number;
  amount: bigint;
  claimSecretHex: HexString;
  leafKeyHex: HexString;
  /** Merkle proof — from serialized claim package or URL param */
  serializedProof?: SerializedClaimPackage['merkleProof'];
  /** Auditor public key — if undefined, uses EMPTY_MEMO */
  auditorPublicKey?: Uint8Array;
  /** Off-chain description for audit record */
  description?: string;
}

export interface ClaimFlowOutput {
  batchId: Uint8Array;
  encryptedAuditMemo: Uint8Array;  // Bytes<128> — passed to circuit
  privateState: ClaimPrivateState;
}

export async function prepareClaimPayment(input: ClaimFlowInput): Promise<ClaimFlowOutput> {
  const {
    batchIdHex,
    leafIndex,
    amount,
    claimSecretHex,
    leafKeyHex,
    serializedProof,
    auditorPublicKey,
  } = input;

  if (!serializedProof) throw new Error('merkleProof required');

  const batchId = fromHex(batchIdHex);
  const claimSecret = fromHex(claimSecretHex);
  const leafKey = fromHex(leafKeyHex);

  // Deserialize proof from serialized format
  const merkleProof = deserializeClaimPackage(serializedProof);

  // Build audit record
  const record: AuditRecord = {
    batchId: batchIdHex,
    leafIndex,
    amount: amount.toString(),
    recipientKeyHex: leafKeyHex,
    timestamp: Date.now(),
  };

  // Encrypt memo
  let encryptedAuditMemo: Uint8Array;
  if (auditorPublicKey) {
    encryptedAuditMemo = await encryptAuditMemo(record, auditorPublicKey);
  } else {
    encryptedAuditMemo = EMPTY_MEMO;
  }

  const privateState: ClaimPrivateState = {
    claimAmount: amount,
    merkleProof,
    leafKey: { bytes: leafKey },
    claimSecret,
  };

  return { batchId, encryptedAuditMemo, privateState };
}

/**
 * Build witnesses for claimPayment circuit.
 */
export function buildClaimWitnesses(state: ClaimPrivateState) {
  return {
    getBatchCoin: () => { throw new Error('getBatchCoin: wrong circuit'); },
    getMerkleRoot: () => { throw new Error('getMerkleRoot: wrong circuit'); },
    getTotalAmount: () => { throw new Error('getTotalAmount: wrong circuit'); },
    getPayerKey: () => { throw new Error('getPayerKey: wrong circuit'); },
    getBatchNonce: () => { throw new Error('getBatchNonce: wrong circuit'); },
    getClaimAmount: () => state.claimAmount,
    getMerkleProof: () => state.merkleProof,
    getLeafKey: () => state.leafKey,
    getClaimSecret: () => state.claimSecret,
    getReclaimPayerKey: () => { throw new Error('getReclaimPayerKey: wrong circuit'); },
    getReclaimBatchNonce: () => { throw new Error('getReclaimBatchNonce: wrong circuit'); },
    getRequesterKey: () => { throw new Error('getRequesterKey: wrong circuit'); },
    getRequestNonce: () => { throw new Error('getRequestNonce: wrong circuit'); },
    getMarkRequesterKey: () => { throw new Error('getMarkRequesterKey: wrong circuit'); },
    getMarkRequestNonce: () => { throw new Error('getMarkRequestNonce: wrong circuit'); },
  };
}

/**
 * Parse claim params from a shareable URL.
 * URL format: /claim?batchId=...&leafIndex=...&amount=...&claimSecret=...&leafKey=...
 */
export function parseClaimUrl(url: string): Omit<ClaimFlowInput, 'serializedProof'> | null {
  try {
    const params = new URL(url).searchParams;
    return {
      batchIdHex: params.get('batchId')!,
      leafIndex: parseInt(params.get('leafIndex')!),
      amount: BigInt(params.get('amount')!),
      claimSecretHex: params.get('claimSecret')!,
      leafKeyHex: params.get('leafKey')!,
    };
  } catch {
    return null;
  }
}

/**
 * Compute the nullifier for a claim (for display/double-spend checking).
 * Nullifier = persistentHash(ClaimNullifierInput { claimSecret, leaf, batchId })
 */
export { hashClaimNullifier as computeNullifier } from '../contract/descriptors.js';
