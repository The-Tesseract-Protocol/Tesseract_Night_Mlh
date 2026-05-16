/**
 * reclaimFlow — payer reclaims unclaimed coins per leaf (Path A).
 *
 * For each unclaimed leaf, builds ReclaimPrivateState with reclaimCoin
 * from indexer. Caller iterates and calls reclaimRecipientCoin per leaf.
 */

import type { ReclaimPrivateState, HexString } from '../types/index.js';
import { fromHex } from '../types/index.js';
import type { PayerRecord } from './submitBatchFlow.js';

export interface ReclaimLeafInput {
  batchIdHex: HexString;
  leafHashHex: HexString;
  payerKeyHex: HexString;
  batchNonceHex: HexString;
  reclaimCoin: { nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint };
}

export interface ReclaimLeafOutput {
  batchId: Uint8Array;
  recipientLeafHash: Uint8Array;
  privateState: ReclaimPrivateState;
}

export function prepareReclaimLeaf(input: ReclaimLeafInput): ReclaimLeafOutput {
  return {
    batchId: fromHex(input.batchIdHex),
    recipientLeafHash: fromHex(input.leafHashHex),
    privateState: {
      payerKey: { bytes: fromHex(input.payerKeyHex) },
      batchNonce: fromHex(input.batchNonceHex),
      reclaimCoin: input.reclaimCoin,
    },
  };
}

export function isEligibleForReclaim(record: PayerRecord): boolean {
  return Date.now() > record.deadline;
}

export function reclaimLeafInputsFromRecord(
  record: PayerRecord,
  coins: Array<{ leafHashHex: HexString; coin: { nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint } }>,
): ReclaimLeafInput[] {
  return coins.map(({ leafHashHex, coin }) => ({
    batchIdHex: record.batchIdHex,
    leafHashHex,
    payerKeyHex: record.payerKeyHex,
    batchNonceHex: record.batchNonceHex,
    reclaimCoin: coin,
  }));
}
