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
  SubmitBatchPrivateState,
  ClaimPrivateState,
  ReclaimPrivateState,
  PaymentRequestPrivateState,
  HexString,
} from '../types/index.js';
import { toHex } from '../types/index.js';

// ── Witness state holder — mutated before each circuit call ──────────────────

type PendingWitnessState = {
  submit: SubmitBatchPrivateState | null;
  claim: ClaimPrivateState | null;
  reclaim: ReclaimPrivateState | null;
  request: PaymentRequestPrivateState | null;
  markPaid: PaymentRequestPrivateState | null;
};

function makeWitnesses(pending: PendingWitnessState): Witnesses<undefined> {
  return {
    getMerkleRoot: () => [undefined, pending.submit!.merkleRoot] as any,
    getPayerKey: () => [undefined, pending.submit!.payerKey] as any,
    getBatchNonce: () => [undefined, pending.submit!.batchNonce] as any,
    getClaimAmount: () => [undefined, pending.claim!.claimAmount] as any,
    getMerkleProof: () => [undefined, pending.claim!.merkleProof] as any,
    getLeafKey: () => [undefined, pending.claim!.leafKey] as any,
    getClaimSecret: () => [undefined, pending.claim!.claimSecret] as any,
    getReclaimPayerKey: () => [undefined, pending.reclaim!.payerKey] as any,
    getReclaimBatchNonce: () => [undefined, pending.reclaim!.batchNonce] as any,
    getRequesterKey: () => [undefined, pending.request!.requesterKey] as any,
    getRequestNonce: () => [undefined, pending.request!.requestNonce] as any,
    getMarkRequesterKey: () => [undefined, pending.markPaid!.requesterKey] as any,
    getMarkRequestNonce: () => [undefined, pending.markPaid!.requestNonce] as any,
  };
}

// ── Client ───────────────────────────────────────────────────────────────────

const PRIVATE_STATE_ID = 'tesseract-core';

export class TesseractClient {
  private constructor(
    private readonly callTx: Awaited<ReturnType<typeof findDeployedContract>>['callTx'],
    private readonly publicDataProvider: MidnightProviders<string, PrivateStateId, undefined>['publicDataProvider'],
    private readonly pending: PendingWitnessState,
  ) {}

  static async connect(
    providers: MidnightProviders<string, PrivateStateId, undefined>,
    contractAddress: string,
    compiledDir: string,
  ): Promise<TesseractClient> {
    const pending: PendingWitnessState = {
      submit: null, claim: null, reclaim: null, request: null, markPaid: null,
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

    return new TesseractClient(found.callTx as any, providers.publicDataProvider, pending);
  }

  // ── submitBatchRoot ─────────────────────────────────────────────────────────

  async submitBatch(
    batchId: Uint8Array,
    deadline: bigint,
    coin: { nonce: Uint8Array; color: Uint8Array; value: bigint },
    state: SubmitBatchPrivateState,
  ): Promise<HexString> {
    this.pending.submit = state;
    try {
      const result = await (this.callTx as any).submitBatchRoot(batchId, deadline, coin);
      return this._extractTxHash(result);
    } finally {
      this.pending.submit = null;
    }
  }

  // ── claimPayment ────────────────────────────────────────────────────────────

  async claimPayment(
    batchId: Uint8Array,
    encryptedAuditMemo: Uint8Array,
    state: ClaimPrivateState,
  ): Promise<HexString> {
    this.pending.claim = state;
    try {
      const result = await (this.callTx as any).claimPayment(batchId, encryptedAuditMemo);
      return this._extractTxHash(result);
    } finally {
      this.pending.claim = null;
    }
  }

  // ── reclaimExpiredBatch ─────────────────────────────────────────────────────

  async reclaimBatch(
    batchId: Uint8Array,
    state: ReclaimPrivateState,
  ): Promise<HexString> {
    this.pending.reclaim = state;
    try {
      const result = await (this.callTx as any).reclaimExpiredBatch(batchId);
      return this._extractTxHash(result);
    } finally {
      this.pending.reclaim = null;
    }
  }

  // ── createPaymentRequest ────────────────────────────────────────────────────

  async createRequest(
    requestId: Uint8Array,
    deadline: bigint,
    state: PaymentRequestPrivateState,
  ): Promise<HexString> {
    this.pending.request = state;
    try {
      const result = await (this.callTx as any).createPaymentRequest(requestId, deadline);
      return this._extractTxHash(result);
    } finally {
      this.pending.request = null;
    }
  }

  // ── markRequestPaid ─────────────────────────────────────────────────────────

  async markPaid(
    requestId: Uint8Array,
    state: PaymentRequestPrivateState,
  ): Promise<HexString> {
    this.pending.markPaid = state;
    try {
      const result = await (this.callTx as any).markRequestPaid(requestId);
      return this._extractTxHash(result);
    } finally {
      this.pending.markPaid = null;
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private _extractTxHash(result: any): HexString {
    // FinalizedCallTxData shape: { public: { txHash, contractAddress }, private: { nextPrivateState } }
    const txHash =
      result?.public?.txHash ??
      result?.txHash ??
      result?.txId ??
      result?.public?.txId;
    if (!txHash) throw new Error(`No txHash in result: ${JSON.stringify(result)}`);
    return typeof txHash === 'string' ? txHash : toHex(txHash);
  }
}
