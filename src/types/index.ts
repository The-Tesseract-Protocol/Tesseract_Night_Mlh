/**
 * Shared TypeScript types for TesseractCore flows.
 * All hex strings are lowercase without 0x prefix.
 */

import { MerkleTreePath } from '@midnight-ntwrk/compact-runtime';

// ── Primitive wrappers ──────────────────────────────────────────────────────

export type HexString = string; // 64-char hex = 32 bytes
export type ZswapKeyHex = string; // 64-char hex = 32 bytes (ZswapCoinPublicKey.bytes)

// ── Batch Pay ────────────────────────────────────────────────────────────────

export interface Recipient {
  key: ZswapKeyHex;   // recipient's ZswapCoinPublicKey as hex
  amount: bigint;
}

export interface ClaimPackage {
  batchId: HexString;
  leafIndex: number;
  amount: bigint;
  claimSecret: HexString;  // random 32 bytes, secret to recipient
  leafKey: ZswapKeyHex;    // recipient's key (= key in Recipient)
  merkleProof: MerkleTreePath<Uint8Array>;
  shareableLink: string;   // URL with claim params base64-encoded
}

export interface BatchSubmitResult {
  batchId: HexString;
  merkleRoot: bigint;         // Field — stored on-chain
  totalAmount: bigint;
  claimPackages: ClaimPackage[];
  deadline: bigint;           // Unix timestamp seconds
}

// ── Claim ────────────────────────────────────────────────────────────────────

export interface ClaimInput {
  batchId: HexString;
  leafIndex: number;
  amount: bigint;
  claimSecret: HexString;
  leafKey: ZswapKeyHex;
  merkleProof: MerkleTreePath<Uint8Array>;
  auditorPublicKey?: Uint8Array;  // optional; uses EMPTY_MEMO if absent
}

export interface ClaimResult {
  nullifier: HexString;
  txHash: HexString;
  claimedAmount: bigint;
}

// ── Payment Request ──────────────────────────────────────────────────────────

export interface PaymentRequestInput {
  requestId: HexString;
  deadline: bigint;    // Unix timestamp seconds
  requesterKey: ZswapKeyHex;
  requestNonce: HexString;
  // Off-chain metadata (not stored on-chain)
  description?: string;
  amount?: bigint;
}

export interface PaymentRequestResult {
  requestId: HexString;
  paymentLink: string;
  txHash: HexString;
}

export interface MarkPaidInput {
  requestId: HexString;
  requesterKey: ZswapKeyHex;
  requestNonce: HexString;
}

// ── Reclaim ──────────────────────────────────────────────────────────────────

export interface ReclaimInput {
  batchId: HexString;
  payerKey: ZswapKeyHex;
  batchNonce: HexString;
}

// ── Witness private state ─────────────────────────────────────────────────────

export interface SubmitBatchPrivateState {
  coin: {
    nonce: Uint8Array;
    color: Uint8Array;
    value: bigint;
  };
  merkleRoot: bigint;
  totalAmount: bigint;
  payerKey: { bytes: Uint8Array };
  batchNonce: Uint8Array;
}

export interface ClaimPrivateState {
  claimAmount: bigint;
  merkleProof: MerkleTreePath<Uint8Array>;
  leafKey: { bytes: Uint8Array };
  claimSecret: Uint8Array;
}

export interface ReclaimPrivateState {
  payerKey: { bytes: Uint8Array };
  batchNonce: Uint8Array;
}

export interface PaymentRequestPrivateState {
  requesterKey: { bytes: Uint8Array };
  requestNonce: Uint8Array;
}

// ── Utility ──────────────────────────────────────────────────────────────────

export function toHex(bytes: Uint8Array): HexString {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: HexString): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function randomBytes32(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function deadlineFromHours(hours: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + hours * 3600);
}
