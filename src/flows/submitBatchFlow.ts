/**
 * submitBatchFlow — 2-phase payer flow for Path A (Pre-Split UTXO).
 *
 * Phase 1: prepareSubmitBatch() → witnesses for submitBatchRoot (no coin, metadata only)
 * Phase 2: deposits[] in return value → caller calls depositRecipientCoin per entry
 *
 * Bearer mode: pass bearerMode:true per recipient — claimSecret bytes used
 * as the leaf key input instead of recipientKey.
 */

import { hashPaymentLeaf, hashPayerCommit } from '../contract/descriptors.js';
import { buildMerkleTree } from '../merkle/merkle.js';
import type {
  RecipientEntry,
  DepositCoinInput,
  ClaimPackage,
  SubmitBatchPrivateState,
  HexString,
} from '../types/index.js';
import {
  toHex,
  fromHex,
  randomBytes32,
  deadlineFromHours,
} from '../types/index.js';

export interface SubmitBatchInput {
  recipients: Array<{ key: string; amount: bigint; bearerMode?: boolean }>;
  deadlineHours: number;
  payerKeyHex: HexString;
  auditorPublicKeyHex?: HexString; // if set, embedded in every claim URL
  appBaseUrl?: string;
}

export interface SerializedMerkleProof {
  leaf: HexString;
  path: Array<{ sibling: { field: string }; goes_left: boolean }>;
}

export interface SerializedClaimPackage {
  batchId: HexString;
  leafIndex: number;
  leafHash: HexString;
  amount: string;
  claimSecret: HexString;
  leafKey: HexString;
  bearerMode: boolean;
  merkleProof: SerializedMerkleProof;
  shareableLink: string;
}

export interface PayerRecord {
  batchIdHex: HexString;
  payerKeyHex: HexString;
  batchNonceHex: HexString;
  deadline: number;
  totalAmount: string;
  leafHashes: HexString[];
  claimPackages: SerializedClaimPackage[];
  createdAt: number;
}

export interface SubmitBatchOutput {
  batchId: Uint8Array;
  batchIdHex: HexString;
  deadline: bigint;
  privateState: SubmitBatchPrivateState;
  deposits: DepositCoinInput[];
  claimPackages: ClaimPackage[];
  payerRecord: PayerRecord;
}

export function prepareSubmitBatch(input: SubmitBatchInput): SubmitBatchOutput {
  const { recipients, deadlineHours, payerKeyHex, auditorPublicKeyHex, appBaseUrl = '/' } = input;

  if (recipients.length === 0) throw new Error('No recipients');
  if (recipients.length > 65536) throw new Error('Max 65536 recipients');

  // Generate batch identifiers
  const batchIdBytes = randomBytes32();
  const batchNonceBytes = randomBytes32();
  const batchIdHex = toHex(batchIdBytes);
  const deadline = deadlineFromHours(deadlineHours);
  const payerKeyBytes = fromHex(payerKeyHex);

  // Build entries
  const entries: RecipientEntry[] = recipients.map(r => {
    const claimSecret = randomBytes32();
    const bearerMode = r.bearerMode ?? false;
    const leafKeyInput = bearerMode ? claimSecret : fromHex(r.key);
    const leafHash = hashPaymentLeaf({ bytes: leafKeyInput }, r.amount);
    return { key: r.key, amount: r.amount, leafHash, claimSecret, bearerMode };
  });

  const { root: merkleRoot, proofs } = buildMerkleTree(entries.map(e => e.leafHash));

  const privateState: SubmitBatchPrivateState = {
    merkleRoot,
    payerKey: { bytes: payerKeyBytes },
    batchNonce: batchNonceBytes,
  };

  // Phase 2: DepositCoinInput per recipient
  // coin values need a valid random nonce for ZSwap, color is all zeros for NIGHT
  const deposits: DepositCoinInput[] = entries.map(e => ({
    batchId: batchIdBytes,
    recipientLeafHash: e.leafHash,
    coin: {
      nonce: randomBytes32(),
      color: new Uint8Array(32),
      value: e.amount,
    },
  }));

  const claimPackages: ClaimPackage[] = [];
  const serializedPackages: SerializedClaimPackage[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const proof = proofs[i];
    const leafKeyForLink = entry.bearerMode ? toHex(entry.claimSecret) : entry.key;

    const serializedProof: SerializedMerkleProof = {
      leaf: toHex(proof.leaf),
      path: proof.path.map((n: any) => ({
        sibling: { field: n.sibling.field.toString() },
        goes_left: n.goes_left,
      })),
    };

    const urlParams: Record<string, string> = {
      batchId: batchIdHex,
      leafIndex: i.toString(),
      leafHash: toHex(entry.leafHash),
      amount: entry.amount.toString(),
      claimSecret: toHex(entry.claimSecret),
      leafKey: leafKeyForLink,
      bearer: entry.bearerMode ? '1' : '0',
      proof: btoa(JSON.stringify(serializedProof)),
    };
    if (auditorPublicKeyHex) urlParams.auditor = auditorPublicKeyHex;
    const params = new URLSearchParams(urlParams);
    const shareableLink = `${appBaseUrl}claim?${params.toString()}`;

    claimPackages.push({
      batchId: batchIdHex,
      leafIndex: i,
      amount: entry.amount,
      claimSecret: toHex(entry.claimSecret),
      leafKey: leafKeyForLink,
      merkleProof: proof,
      shareableLink,
    });

    serializedPackages.push({
      batchId: batchIdHex,
      leafIndex: i,
      leafHash: toHex(entry.leafHash),
      amount: entry.amount.toString(),
      claimSecret: toHex(entry.claimSecret),
      leafKey: leafKeyForLink,
      bearerMode: entry.bearerMode,
      merkleProof: serializedProof,
      shareableLink,
    });
  }

  const payerRecord: PayerRecord = {
    batchIdHex,
    payerKeyHex,
    batchNonceHex: toHex(batchNonceBytes),
    deadline: Number(deadline),
    totalAmount: entries.reduce((s, e) => s + e.amount, 0n).toString(),
    leafHashes: entries.map(e => toHex(e.leafHash)),
    claimPackages: serializedPackages,
    createdAt: Date.now(),
  };

  return {
    batchId: batchIdBytes,
    batchIdHex,
    deadline,
    privateState,
    deposits,
    claimPackages,
    payerRecord,
  };
}

export function isEligibleForReclaim(record: PayerRecord): boolean {
  return Date.now() > record.deadline;
}

export function verifyPayerCommitment(
  payerKeyHex: HexString,
  batchNonceHex: HexString,
  storedCommitment: Uint8Array,
): boolean {
  const payerKeyBytes = fromHex(payerKeyHex);
  const batchNonceBytes = fromHex(batchNonceHex);
  const computed = hashPayerCommit({ bytes: payerKeyBytes }, batchNonceBytes);
  return computed.every((b: number, i: number) => b === storedCommitment[i]);
}
