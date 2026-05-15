/**
 * Serialization/deserialization for ClaimPackage Merkle proofs.
 * Needed because MerkleTreePath contains Uint8Array and bigint which
 * don't JSON-serialize directly.
 */

import { MerkleTreePath } from '@midnight-ntwrk/compact-runtime';
import { fromHex, toHex } from '../types/index.js';
import type { SerializedClaimPackage } from './submitBatchFlow.js';

type SerializedProof = SerializedClaimPackage['merkleProof'];

export function serializeProof(proof: MerkleTreePath<Uint8Array>): SerializedProof {
  return {
    leaf: toHex(proof.leaf),
    path: proof.path.map(e => ({
      sibling: { field: e.sibling.field.toString() },
      goes_left: e.goes_left,
    })),
  };
}

export function deserializeClaimPackage(serialized: SerializedProof): MerkleTreePath<Uint8Array> {
  return {
    leaf: fromHex(serialized.leaf),
    path: serialized.path.map(e => ({
      sibling: { field: BigInt(e.sibling.field) },
      goes_left: e.goes_left,
    })),
  };
}
