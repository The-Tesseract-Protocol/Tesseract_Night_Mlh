/**
 * Merkle tree builder matching TesseractCore circuit (D=16, merkleTreePathRootNoLeafHash).
 *
 * Algorithm:
 * 1. Leaf bytes → field element via degradeToTransient
 * 2. Internal nodes: transientHash(Vec2Field, [left, right]) — same as circuit
 * 3. Empty leaf = transientHash(Vec2Field, [0n, 0n]) propagated up
 *
 * MerkleTreePath uses goes_left (snake_case) to match compiled contract types.
 */

import type { MerkleTreePath, MerkleTreePathEntry } from '@midnight-ntwrk/compact-runtime';
import { merkleInternalHash, leafToField } from '../contract/descriptors.js';

export const TREE_DEPTH = 16;
const MAX_LEAVES = 1 << TREE_DEPTH; // 65536

// Empty leaf field value (zeroed 32 bytes degraded to field)
const EMPTY_LEAF_FIELD = leafToField(new Uint8Array(32));

export interface MerkleTreeResult {
  root: bigint; // Field value — stored in batchMerkleRoots on-chain
  proofs: Array<MerkleTreePath<Uint8Array>>; // One per leaf, in insertion order
  leafFields: bigint[]; // Field elements of each leaf (for debugging/parity)
}

/**
 * Build a depth-16 Merkle tree from pre-hashed leaf bytes.
 * Each leaf must be a 32-byte Uint8Array (output of persistentHash).
 */
export function buildMerkleTree(leaves: Uint8Array[]): MerkleTreeResult {
  if (leaves.length === 0) throw new Error('At least one leaf required');
  if (leaves.length > MAX_LEAVES) throw new Error(`Max ${MAX_LEAVES} leaves`);

  // Build level 0 (leaves) as field elements, pad to MAX_LEAVES
  const level0: bigint[] = [];
  for (let i = 0; i < MAX_LEAVES; i++) {
    level0.push(i < leaves.length ? leafToField(leaves[i]) : EMPTY_LEAF_FIELD);
  }

  // Build all levels bottom-up
  const levels: bigint[][] = [level0];
  for (let d = 0; d < TREE_DEPTH; d++) {
    const prev = levels[d];
    const next: bigint[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(merkleInternalHash(prev[i], prev[i + 1]));
    }
    levels.push(next);
  }

  const root = levels[TREE_DEPTH][0];

  // Build proofs for each actual leaf
  const proofs: Array<MerkleTreePath<Uint8Array>> = [];
  for (let leafIdx = 0; leafIdx < leaves.length; leafIdx++) {
    const path: MerkleTreePathEntry[] = [];
    let idx = leafIdx;
    for (let d = 0; d < TREE_DEPTH; d++) {
      const isLeft = idx % 2 === 0;
      const siblingIdx = isLeft ? idx + 1 : idx - 1;
      const sibling = levels[d][siblingIdx];
      path.push({
        sibling: { field: sibling },
        goes_left: isLeft, // goes_left = true means this node is the LEFT child (matches circuit _merkleTreePathEntryRoot_0)
      });
      idx = Math.floor(idx / 2);
    }
    proofs.push({ leaf: leaves[leafIdx], path });
  }

  return {
    root,
    proofs,
    leafFields: leaves.map(leafToField),
  };
}

/**
 * Verify a Merkle proof against a root — matches merkleTreePathRootNoLeafHash circuit.
 */
export function verifyMerkleProof(proof: MerkleTreePath<Uint8Array>, root: bigint): boolean {
  let current = leafToField(proof.leaf);
  for (const entry of proof.path) {
    const left = entry.goes_left ? current : entry.sibling.field;
    const right = entry.goes_left ? entry.sibling.field : current;
    current = merkleInternalHash(left, right);
  }
  return current === root;
}
