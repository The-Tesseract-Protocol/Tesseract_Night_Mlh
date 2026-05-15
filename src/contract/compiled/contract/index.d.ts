import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  getMerkleRoot(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  getPayerKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { bytes: Uint8Array
                                                                          }];
  getBatchNonce(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getClaimAmount(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  getMerkleProof(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                               path: { sibling: { field: bigint
                                                                                                },
                                                                                       goes_left: boolean
                                                                                     }[]
                                                                             }];
  getLeafKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { bytes: Uint8Array
                                                                         }];
  getClaimSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getReclaimPayerKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { bytes: Uint8Array
                                                                                 }];
  getReclaimBatchNonce(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getRequesterKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { bytes: Uint8Array
                                                                              }];
  getRequestNonce(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getMarkRequesterKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { bytes: Uint8Array
                                                                                  }];
  getMarkRequestNonce(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  submitBatchRoot(context: __compactRuntime.CircuitContext<PS>,
                  batchId_0: Uint8Array,
                  deadline_0: bigint,
                  coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint
                          }): __compactRuntime.CircuitResults<PS, []>;
  claimPayment(context: __compactRuntime.CircuitContext<PS>,
               batchId_0: Uint8Array,
               encryptedAuditMemo_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reclaimExpiredBatch(context: __compactRuntime.CircuitContext<PS>,
                      batchId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  createPaymentRequest(context: __compactRuntime.CircuitContext<PS>,
                       requestId_0: Uint8Array,
                       deadline_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  markRequestPaid(context: __compactRuntime.CircuitContext<PS>,
                  requestId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  submitBatchRoot(context: __compactRuntime.CircuitContext<PS>,
                  batchId_0: Uint8Array,
                  deadline_0: bigint,
                  coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint
                          }): __compactRuntime.CircuitResults<PS, []>;
  claimPayment(context: __compactRuntime.CircuitContext<PS>,
               batchId_0: Uint8Array,
               encryptedAuditMemo_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reclaimExpiredBatch(context: __compactRuntime.CircuitContext<PS>,
                      batchId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  createPaymentRequest(context: __compactRuntime.CircuitContext<PS>,
                       requestId_0: Uint8Array,
                       deadline_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  markRequestPaid(context: __compactRuntime.CircuitContext<PS>,
                  requestId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  submitBatchRoot(context: __compactRuntime.CircuitContext<PS>,
                  batchId_0: Uint8Array,
                  deadline_0: bigint,
                  coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint
                          }): __compactRuntime.CircuitResults<PS, []>;
  claimPayment(context: __compactRuntime.CircuitContext<PS>,
               batchId_0: Uint8Array,
               encryptedAuditMemo_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reclaimExpiredBatch(context: __compactRuntime.CircuitContext<PS>,
                      batchId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  createPaymentRequest(context: __compactRuntime.CircuitContext<PS>,
                       requestId_0: Uint8Array,
                       deadline_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  markRequestPaid(context: __compactRuntime.CircuitContext<PS>,
                  requestId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  batchCoins: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { nonce: Uint8Array,
                                 color: Uint8Array,
                                 value: bigint,
                                 mt_index: bigint
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { nonce: Uint8Array, color: Uint8Array, value: bigint, mt_index: bigint }]>
  };
  batchMerkleRoots: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  batchDeadlines: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  batchClaimedAmounts: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  payerCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  batchReclaimed: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  claimNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  requestExists: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  requestStatus: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  requestDeadlines: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  requestPayeeHash: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
