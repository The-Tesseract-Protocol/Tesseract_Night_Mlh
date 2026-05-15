/**
 * submitBatchFlow — Payer locks funds and commits Merkle root on-chain.
 *
 * Flow:
 * 1. Validate inputs
 * 2. Generate batchId (random) + batchNonce (random)
 * 3. For each recipient, generate claimSecret (random), compute leaf = hashPaymentLeaf(key, amount)
 * 4. Build Merkle tree → merkleRoot (Field)
 * 5. Compute payerCommitment hash (off-chain, for reclaim verification later)
 * 6. Return witnesses (private state) for circuit call + claim packages
 *
 * Caller must:
 * - Obtain the ShieldedCoinInfo from wallet (coin with value = sum of all amounts)
 * - Pass witnesses to contract.impureCircuits.submitBatchRoot(context, batchId, deadline)
 * - Persist claim packages to IndexedDB / distribute to recipients
 */

import { hashPaymentLeaf, hashPayerCommit } from '../contract/descriptors.js';
import { buildMerkleTree } from '../merkle/merkle.js';
import {
  Recipient,
  ClaimPackage,
  BatchSubmitResult,
  SubmitBatchPrivateState,
  HexString,
  toHex,
  fromHex,
  randomBytes32,
  deadlineFromHours,
} from '../types/index.js';

export interface SubmitBatchFlowInput {
  recipients: Recipient[];
  deadlineHours: number;
  payerKeyHex: HexString;  // ZswapCoinPublicKey.bytes as hex
  coin: {
    nonce: Uint8Array;
    color: Uint8Array;
    value: bigint;
  };
  appBaseUrl?: string; // for generating shareable links, default "/"
}

export interface SubmitBatchFlowOutput {
  batchId: Uint8Array;
  batchIdHex: HexString;
  deadline: bigint;
  privateState: SubmitBatchPrivateState;
  result: BatchSubmitResult;
  /** Persist to storage: key = batchIdHex, value = this object */
  payerRecord: PayerRecord;
}

export interface PayerRecord {
  batchIdHex: HexString;
  payerKeyHex: HexString;
  batchNonceHex: HexString;
  deadline: number;
  totalAmount: string;
  claimPackages: SerializedClaimPackage[];
  createdAt: number;
}

export interface SerializedClaimPackage {
  batchId: HexString;
  leafIndex: number;
  amount: string;       // bigint as string
  claimSecret: HexString;
  leafKey: HexString;
  merkleProof: {
    leaf: HexString;
    path: Array<{ sibling: { field: string }; goes_left: boolean }>;
  };
  shareableLink: string;
}

export function prepareSubmitBatch(input: SubmitBatchFlowInput): SubmitBatchFlowOutput {
  const { recipients, deadlineHours, payerKeyHex, coin, appBaseUrl = '/' } = input;

  if (recipients.length === 0) throw new Error('No recipients');
  if (recipients.length > 65536) throw new Error('Max 65536 recipients');

  const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0n);
  if (coin.value !== totalAmount) {
    throw new Error(`Coin value ${coin.value} != sum of amounts ${totalAmount}`);
  }

  // Generate batch identifiers
  const batchIdBytes = randomBytes32();
  const batchNonceBytes = randomBytes32();
  const batchIdHex = toHex(batchIdBytes);
  const batchNonceHex = toHex(batchNonceBytes);
  const deadline = deadlineFromHours(deadlineHours);
  const payerKeyBytes = fromHex(payerKeyHex);

  // Build leaves: one per recipient with unique claimSecret
  const claimSecrets: Uint8Array[] = [];
  const leafBytes: Uint8Array[] = [];

  for (const recipient of recipients) {
    const recipientKeyBytes = fromHex(recipient.key);
    const claimSecret = randomBytes32();
    claimSecrets.push(claimSecret);

    const leaf = hashPaymentLeaf({ bytes: recipientKeyBytes }, recipient.amount);
    leafBytes.push(leaf);
  }

  // Build Merkle tree
  const { root: merkleRoot, proofs } = buildMerkleTree(leafBytes);

  // Build claim packages
  const claimPackages: ClaimPackage[] = [];
  const serializedPackages: SerializedClaimPackage[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const claimSecretHex = toHex(claimSecrets[i]);
    const proof = proofs[i];

    const params = new URLSearchParams({
      batchId: batchIdHex,
      leafIndex: i.toString(),
      amount: recipient.amount.toString(),
      claimSecret: claimSecretHex,
      leafKey: recipient.key,
    });
    const shareableLink = `${appBaseUrl}claim?${params.toString()}`;

    claimPackages.push({
      batchId: batchIdHex,
      leafIndex: i,
      amount: recipient.amount,
      claimSecret: claimSecretHex,
      leafKey: recipient.key,
      merkleProof: proof,
      shareableLink,
    });

    serializedPackages.push({
      batchId: batchIdHex,
      leafIndex: i,
      amount: recipient.amount.toString(),
      claimSecret: claimSecretHex,
      leafKey: recipient.key,
      merkleProof: {
        leaf: toHex(proof.leaf),
        path: proof.path.map(e => ({
          sibling: { field: e.sibling.field.toString() },
          goes_left: e.goes_left,
        })),
      },
      shareableLink,
    });
  }

  // Private state for circuit witnesses
  const privateState: SubmitBatchPrivateState = {
    coin,
    merkleRoot,
    totalAmount,
    payerKey: { bytes: payerKeyBytes },
    batchNonce: batchNonceBytes,
  };

  const payerRecord: PayerRecord = {
    batchIdHex,
    payerKeyHex,
    batchNonceHex,
    deadline: Number(deadline),
    totalAmount: totalAmount.toString(),
    claimPackages: serializedPackages,
    createdAt: Date.now(),
  };

  return {
    batchId: batchIdBytes,
    batchIdHex,
    deadline,
    privateState,
    result: {
      batchId: batchIdHex,
      merkleRoot,
      totalAmount,
      claimPackages,
      deadline,
    },
    payerRecord,
  };
}

/**
 * Build the witnesses object for the submitBatchRoot circuit.
 * Pass this as the Contract constructor argument.
 */
export function buildSubmitBatchWitnesses(state: SubmitBatchPrivateState) {
  return {
    getBatchCoin: () => state.coin,
    getMerkleRoot: () => state.merkleRoot,
    getTotalAmount: () => state.totalAmount,
    getPayerKey: () => state.payerKey,
    getBatchNonce: () => state.batchNonce,
    // Unused witnesses for other circuits — provide stubs
    getClaimAmount: () => { throw new Error('getClaimAmount: wrong circuit'); },
    getMerkleProof: () => { throw new Error('getMerkleProof: wrong circuit'); },
    getLeafKey: () => { throw new Error('getLeafKey: wrong circuit'); },
    getClaimSecret: () => { throw new Error('getClaimSecret: wrong circuit'); },
    getReclaimPayerKey: () => { throw new Error('getReclaimPayerKey: wrong circuit'); },
    getReclaimBatchNonce: () => { throw new Error('getReclaimBatchNonce: wrong circuit'); },
    getRequesterKey: () => { throw new Error('getRequesterKey: wrong circuit'); },
    getRequestNonce: () => { throw new Error('getRequestNonce: wrong circuit'); },
    getMarkRequesterKey: () => { throw new Error('getMarkRequesterKey: wrong circuit'); },
    getMarkRequestNonce: () => { throw new Error('getMarkRequestNonce: wrong circuit'); },
  };
}

/** Verify payer commitment matches what's stored on-chain (for reclaim eligibility) */
export function verifyPayerCommitment(
  payerKeyHex: HexString,
  batchNonceHex: HexString,
  storedCommitment: Uint8Array,
): boolean {
  const payerKeyBytes = fromHex(payerKeyHex);
  const batchNonceBytes = fromHex(batchNonceHex);
  const computed = hashPayerCommit({ bytes: payerKeyBytes }, batchNonceBytes);
  return computed.every((b, i) => b === storedCommitment[i]);
}
