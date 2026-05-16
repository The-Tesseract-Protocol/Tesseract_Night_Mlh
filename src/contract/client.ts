/**
 * TesseractClient — binds to a deployed TesseractCore contract and exposes
 * typed methods for each circuit. Works in both CLI (test accounts) and
 * browser (Lace wallet) via the MidnightProviders abstraction.
 *
 * Usage:
 *   const client = await TesseractClient.connect(providers, contractAddress, compiledDir);
 *   const txHash = await client.submitBatch(batchId, deadline, submitPrivateState);
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { SucceedEntirely } from '@midnight-ntwrk/midnight-js-types';
import type { MidnightProviders, PrivateStateId } from '@midnight-ntwrk/midnight-js-types';
import { Contract } from './compiled/contract/index.js';
import type { Witnesses } from './compiled/contract/index.js';
import type {
  SubmitBatchPrivateState, ClaimPrivateState, ReclaimPrivateState,
  PaymentRequestPrivateState, HexString,
} from '../types/index.js';
import { toHex } from '../types/index.js';
import { hashCoinKey } from './descriptors.js';

type PendingWitnessState = {
  submit:   SubmitBatchPrivateState | null;
  deposit:  null;   // depositRecipientCoin has no witnesses
  claim:    ClaimPrivateState | null;
  reclaim:  ReclaimPrivateState | null;
  request:  PaymentRequestPrivateState | null;
  markPaid: PaymentRequestPrivateState | null;
};

function makeWitnesses(pending: PendingWitnessState): Witnesses<undefined> {
  return {
    getMerkleRoot:       () => [undefined, pending.submit!.merkleRoot] as any,
    getPayerKey:         () => [undefined, pending.submit!.payerKey] as any,
    getBatchNonce:       () => [undefined, pending.submit!.batchNonce] as any,
    getBatchCoin:        () => {
      if (pending.claim)   return [undefined, pending.claim.recipientCoin] as any;
      if (pending.reclaim) return [undefined, pending.reclaim.reclaimCoin] as any;
      throw new Error('getBatchCoin: no active claim or reclaim state');
    },
    getClaimAmount:      () => [undefined, pending.claim!.claimAmount] as any,
    getMerkleProof:      () => [undefined, pending.claim!.merkleProof] as any,
    getLeafKey:          () => [undefined, pending.claim!.leafKey] as any,
    getClaimSecret:      () => [undefined, pending.claim!.claimSecret] as any,
    getReclaimPayerKey:  () => [undefined, pending.reclaim!.payerKey] as any,
    getReclaimBatchNonce:() => [undefined, pending.reclaim!.batchNonce] as any,
    getReclaimCoin:      () => [undefined, pending.reclaim!.reclaimCoin] as any,
    getRequesterKey:     () => [undefined, pending.request!.requesterKey] as any,
    getRequestNonce:     () => [undefined, pending.request!.requestNonce] as any,
    getMarkRequesterKey: () => [undefined, pending.markPaid!.requesterKey] as any,
    getMarkRequestNonce: () => [undefined, pending.markPaid!.requestNonce] as any,
  };
}

const PRIVATE_STATE_ID = 'tesseract-core';

export class TesseractClient {
  private constructor(
    private readonly callTx: Awaited<ReturnType<typeof findDeployedContract>>['callTx'],
    private readonly publicDataProvider: MidnightProviders<string, PrivateStateId, undefined>['publicDataProvider'],
    private readonly pending: PendingWitnessState,
    public readonly compiledContract: any,
    public readonly contractAddress: string,
  ) {}

  static async connect(
    providers: MidnightProviders<string, PrivateStateId, undefined>,
    contractAddress: string,
    compiledDir: string,
  ): Promise<TesseractClient> {
    const pending: PendingWitnessState = {
      submit: null, deposit: null, claim: null, reclaim: null, request: null, markPaid: null,
    };
    const witnesses = makeWitnesses(pending);
    const compiledContract = CompiledContract.make('TesseractCore', Contract).pipe(
      (c) => CompiledContract.withWitnesses(c, witnesses),
      (c) => CompiledContract.withCompiledFileAssets(c, compiledDir),
    );
    const found = await findDeployedContract(providers as any, {
      compiledContract: compiledContract as any,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID as PrivateStateId,
      initialPrivateState: {} as any,
    });
    return new TesseractClient(found.callTx as any, providers.publicDataProvider, pending, compiledContract, contractAddress);
  }

  // Phase 1: metadata only, no coin
  async submitBatch(batchId: Uint8Array, deadline: bigint, state: SubmitBatchPrivateState): Promise<HexString> {
    this.pending.submit = state;
    try {
      return this._hash(await (this.callTx as any).submitBatchRoot(batchId, deadline));
    } finally { this.pending.submit = null; }
  }

  // Phase 2: one call per recipient — coin = { nonce, color, value } for that recipient
  async depositCoin(
    batchId: Uint8Array,
    recipientLeafHash: Uint8Array,
    coin: { nonce: Uint8Array; color: Uint8Array; value: bigint },
  ): Promise<HexString> {
    // depositRecipientCoin has zero witnesses — no pending state needed
    return this._hash(await (this.callTx as any).depositRecipientCoin(batchId, recipientLeafHash, coin));
  }

  async claimPayment(batchId: Uint8Array, encryptedMemo: Uint8Array, state: ClaimPrivateState): Promise<HexString> {
    this.pending.claim = state;
    try {
      return this._hash(await (this.callTx as any).claimPayment(batchId, encryptedMemo));
    } finally { this.pending.claim = null; }
  }

  async reclaimRecipientCoin(batchId: Uint8Array, leafHash: Uint8Array, state: ReclaimPrivateState): Promise<HexString> {
    this.pending.reclaim = state;
    try {
      return this._hash(await (this.callTx as any).reclaimRecipientCoin(batchId, leafHash));
    } finally { this.pending.reclaim = null; }
  }

  async createRequest(requestId: Uint8Array, deadline: bigint, state: PaymentRequestPrivateState): Promise<HexString> {
    this.pending.request = state;
    try {
      return this._hash(await (this.callTx as any).createPaymentRequest(requestId, deadline));
    } finally { this.pending.request = null; }
  }

  async markPaid(requestId: Uint8Array, state: PaymentRequestPrivateState): Promise<HexString> {
    this.pending.markPaid = state;
    try {
      return this._hash(await (this.callTx as any).markRequestPaid(requestId));
    } finally { this.pending.markPaid = null; }
  }

  // Query recipient coin from indexer (stable mt_index in Path A)
  async getRecipientCoin(
    batchId: Uint8Array,
    leafHash: Uint8Array,
  ): Promise<{ nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint } | null> {
    const state = await this.publicDataProvider.queryContractState(this.contractAddress);
    if (!state) return null;
    const ledger = this.compiledContract.ledger(state);
    const coinKey = hashCoinKey(batchId, leafHash);
    if (ledger.recipientCoins.member(coinKey)) {
      return ledger.recipientCoins.lookup(coinKey);
    }
    return null;
  }

  private _hash(result: any): HexString {
    const h = result?.public?.txHash ?? result?.txHash ?? result?.txId ?? result?.public?.txId;
    if (!h) throw new Error(`No txHash in result: ${JSON.stringify(result)}`);
    return typeof h === 'string' ? h : toHex(h);
  }
}
