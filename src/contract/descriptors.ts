/**
 * CompactType descriptors for TesseractCore structs.
 * Used to call persistentHash on the TypeScript side, matching circuit behavior.
 * Struct field order MUST match TesseractCore.compact exactly.
 */

import {
  CompactTypeBytes,
  CompactTypeVector,
  CompactTypeField,
  CompactTypeUnsignedInteger,
  ZswapCoinPublicKeyDescriptor,
  persistentHash,
  transientHash,
  degradeToTransient,
} from '@midnight-ntwrk/compact-runtime';

const Bytes32 = new CompactTypeBytes(32);
const Uint128 = new CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

// Vector<2, Field> — used by merkle tree transient hash
const Vec2Field = new CompactTypeVector(2, CompactTypeField);

// PayerCommitInput { payerKey: ZswapCoinPublicKey; batchNonce: Bytes<32>; }
class _PayerCommitInputType {
  alignment() {
    return ZswapCoinPublicKeyDescriptor.alignment().concat(Bytes32.alignment());
  }
  fromValue(_v: ReturnType<typeof ZswapCoinPublicKeyDescriptor.fromValue & object>): never {
    throw new Error('fromValue not needed');
  }
  toValue(v: { payerKey: { bytes: Uint8Array }; batchNonce: Uint8Array }) {
    return ZswapCoinPublicKeyDescriptor.toValue(v.payerKey)
      .concat(Bytes32.toValue(v.batchNonce));
  }
}
const PayerCommitInputType = new _PayerCommitInputType() as unknown as Parameters<typeof persistentHash>[0];

// ClaimNullifierInput { claimSecret: Bytes<32>; leaf: Bytes<32>; batchId: Bytes<32>; }
class _ClaimNullifierInputType {
  alignment() {
    return Bytes32.alignment().concat(Bytes32.alignment().concat(Bytes32.alignment()));
  }
  fromValue(_v: unknown): never {
    throw new Error('fromValue not needed');
  }
  toValue(v: { claimSecret: Uint8Array; leaf: Uint8Array; batchId: Uint8Array }) {
    return Bytes32.toValue(v.claimSecret)
      .concat(Bytes32.toValue(v.leaf).concat(Bytes32.toValue(v.batchId)));
  }
}
const ClaimNullifierInputType = new _ClaimNullifierInputType() as unknown as Parameters<typeof persistentHash>[0];

// RequesterCommitInput { requesterKey: ZswapCoinPublicKey; requestNonce: Bytes<32>; }
class _RequesterCommitInputType {
  alignment() {
    return ZswapCoinPublicKeyDescriptor.alignment().concat(Bytes32.alignment());
  }
  fromValue(_v: unknown): never {
    throw new Error('fromValue not needed');
  }
  toValue(v: { requesterKey: { bytes: Uint8Array }; requestNonce: Uint8Array }) {
    return ZswapCoinPublicKeyDescriptor.toValue(v.requesterKey)
      .concat(Bytes32.toValue(v.requestNonce));
  }
}
const RequesterCommitInputType = new _RequesterCommitInputType() as unknown as Parameters<typeof persistentHash>[0];

// PaymentLeafInput — defined by web app for leaf computation { recipientKey: ZswapCoinPublicKey; amount: Uint<128> }
class _PaymentLeafInputType {
  alignment() {
    return ZswapCoinPublicKeyDescriptor.alignment().concat(Uint128.alignment());
  }
  fromValue(_v: unknown): never {
    throw new Error('fromValue not needed');
  }
  toValue(v: { recipientKey: { bytes: Uint8Array }; amount: bigint }) {
    return ZswapCoinPublicKeyDescriptor.toValue(v.recipientKey)
      .concat(Uint128.toValue(v.amount));
  }
}
const PaymentLeafInputType = new _PaymentLeafInputType() as unknown as Parameters<typeof persistentHash>[0];

// CoinMapKey { batchId: Bytes<32>; leaf: Bytes<32>; }
// Used to compute the recipientCoins map key — prevents cross-batch collision.
class _CoinMapKeyType {
  alignment() {
    return Bytes32.alignment().concat(Bytes32.alignment());
  }
  fromValue(_v: unknown): never {
    throw new Error('fromValue not needed');
  }
  toValue(v: { batchId: Uint8Array; leaf: Uint8Array }) {
    return Bytes32.toValue(v.batchId).concat(Bytes32.toValue(v.leaf));
  }
}
const CoinMapKeyType = new _CoinMapKeyType() as unknown as Parameters<typeof persistentHash>[0];

export function hashPayerCommit(payerKey: { bytes: Uint8Array }, batchNonce: Uint8Array): Uint8Array {
  return persistentHash(PayerCommitInputType, { payerKey, batchNonce } as never);
}

export function hashClaimNullifier(
  claimSecret: Uint8Array,
  leaf: Uint8Array,
  batchId: Uint8Array,
): Uint8Array {
  return persistentHash(ClaimNullifierInputType, { claimSecret, leaf, batchId } as never);
}

export function hashRequesterCommit(
  requesterKey: { bytes: Uint8Array },
  requestNonce: Uint8Array,
): Uint8Array {
  return persistentHash(RequesterCommitInputType, { requesterKey, requestNonce } as never);
}

export function hashPaymentLeaf(recipientKey: { bytes: Uint8Array }, amount: bigint): Uint8Array {
  return persistentHash(PaymentLeafInputType, { recipientKey, amount } as never);
}

export function hashCoinKey(batchId: Uint8Array, leaf: Uint8Array): Uint8Array {
  return persistentHash(CoinMapKeyType, { batchId, leaf } as never);
}

// Merkle internal node hash — matches _merkleTreePathEntryRoot in compiled contract
// Uses transientHash(Vec2Field, [left, right])
export function merkleInternalHash(left: bigint, right: bigint): bigint {
  return transientHash(Vec2Field, [left, right]);
}

// Convert Bytes<32> leaf to field element (matches _degradeToTransient in circuit)
export function leafToField(leafBytes: Uint8Array): bigint {
  return degradeToTransient(leafBytes);
}
