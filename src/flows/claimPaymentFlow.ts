/**
 * claimPaymentFlow — Recipient proves Merkle inclusion and receives shielded UTXO (Path A).
 *
 * Flow:
 * 1. Caller must fetch recipientCoin from indexer (getRecipientCoin(batchId, leafHash))
 * 2. Parse / load claim package (from URL params or IndexedDB)
 * 3. Encrypt audit memo (X25519+AES-GCM)
 * 4. Build witness private state (includes recipientCoin for getBatchCoin)
 * 5. Return witnesses + encryptedAuditMemo for circuit call
 *
 * Bearer mode:
 * - If bearerMode=true, leafKeyHex must be the claimer's own coinPublicKey
 * - claimSecret is derived from the coin's private key
 *
 * Caller must:
 * - Call contract.impureCircuits.claimPayment(context, batchId, encryptedAuditMemo)
 * - With the witnesses returned here
 */

import { encryptAuditMemo, EMPTY_MEMO, type AuditRecord } from '../crypto/memo.js';
import { deserializeClaimPackage } from './claimPackageSerde.js';
import type { ClaimPrivateState, HexString } from '../types/index.js';
import { fromHex } from '../types/index.js';
import type { SerializedClaimPackage } from './submitBatchFlow.js';

export interface ClaimFlowInput {
  /** From URL params or claim package JSON */
  batchIdHex: HexString;
  leafIndex: number;
  leafHashHex?: HexString;   // from URL params; not used in circuit, retained for URL round-trip
  amount: bigint;
  claimSecretHex: HexString;
  leafKeyHex: HexString;  // addressed: recipient key; bearer: own coinPublicKey
  /** Merkle proof — from serialized claim package or URL param */
  serializedProof?: SerializedClaimPackage['merkleProof'];
  /** QualifiedShieldedCoinInfo from indexer for this recipient's coin (Path A) */
  recipientCoin?: { nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint };
  /** Bearer mode: if true, leafKeyHex is the claimer's own coinPublicKey */
  bearerMode?: boolean;
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
    recipientCoin,
    auditorPublicKey,
  } = input;

  if (!serializedProof) throw new Error('merkleProof required');
  if (!recipientCoin) throw new Error('recipientCoin required for Path A');

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
    recipientCoin,
  };

  return { batchId, encryptedAuditMemo, privateState };
}

/**
 * Build witnesses for claimPayment circuit.
 */
export function buildClaimWitnesses(state: ClaimPrivateState) {
  return {
    getBatchCoin: () => state.recipientCoin,
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
    getReclaimCoin: () => { throw new Error('getReclaimCoin: wrong circuit'); },
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
export function parseClaimUrl(url: string): ClaimFlowInput | null {
  try {
    const params = new URL(url).searchParams;
    const proofB64 = params.get('proof');
    const serializedProof = proofB64 ? JSON.parse(atob(proofB64)) : undefined;
    const auditorParam = params.get('auditor');
    return {
      batchIdHex: params.get('batchId')!,
      leafIndex: parseInt(params.get('leafIndex')!),
      leafHashHex: params.get('leafHash')!,
      amount: BigInt(params.get('amount')!),
      claimSecretHex: params.get('claimSecret')!,
      leafKeyHex: params.get('leafKey')!,
      bearerMode: params.get('bearer') === '1',
      serializedProof,
      auditorPublicKey: auditorParam ? fromHex(auditorParam) : undefined,
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
