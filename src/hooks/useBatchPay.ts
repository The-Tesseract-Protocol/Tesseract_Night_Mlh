/**
 * useBatchPay — React hook for Submit Batch + Reclaim flows.
 * Wraps submitBatchFlow and reclaimFlow with state management and IndexedDB persistence.
 */

import { useState, useCallback, useEffect } from 'react';
import { prepareSubmitBatch, buildSubmitBatchWitnesses, type PayerRecord } from '../flows/submitBatchFlow.js';
import { prepareReclaim, buildReclaimWitnesses, isEligibleForReclaim } from '../flows/reclaimFlow.js';
import type { Recipient, BatchResult, BatchState } from '../../agents/interfaces/submitBatchFlow.js';

const DB_NAME = 'tesseract-payer';
const STORE_NAME = 'payer-records';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'batchIdHex' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRecord(record: PayerRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadAllRecords(): Promise<PayerRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as PayerRecord[]);
    req.onerror = () => reject(req.error);
  });
}

async function updateRecord(batchIdHex: string, patch: Partial<PayerRecord>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(batchIdHex);
    req.onsuccess = () => {
      const record = { ...req.result, ...patch } as PayerRecord;
      store.put(record);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function useBatchPay(
  contractAddress: string | null,
  coinPublicKey: string | null,
  /** Call circuit — provided by contract client layer */
  callCircuit?: (circuitName: string, witnesses: object, args: unknown[]) => Promise<string>,
) {
  const [batches, setBatches] = useState<BatchState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Load stored payer records on mount
  useEffect(() => {
    loadAllRecords().then(records => {
      const states: BatchState[] = records.map(r => ({
        batchId: r.batchIdHex,
        totalAmount: BigInt(r.totalAmount),
        claimedAmount: 0n, // will be updated from ledger
        deadline: BigInt(r.deadline),
        isReclaimed: false, // will be updated from ledger
        claimCount: r.claimPackages.length,
        claimPackages: r.claimPackages.map(p => ({
          batchId: p.batchId,
          leafIndex: p.leafIndex,
          amount: BigInt(p.amount),
          claimSecret: p.claimSecret,
          leafKey: p.leafKey,
          merkleProof: p.merkleProof,
          shareableLink: p.shareableLink,
        })),
      }));
      setBatches(states);
    }).catch(() => {});
  }, []);

  const createBatch = useCallback(async (
    recipients: Recipient[],
    deadlineHours: number,
  ): Promise<BatchResult> => {
    if (!coinPublicKey) throw new Error('Wallet not connected');
    if (!callCircuit) throw new Error('Contract not connected');

    setIsLoading(true);
    setError(null);
    try {
      // Build private state (merkle tree, etc.)
      // Coin must come from wallet — using placeholder here
      // In production: obtain coin via wallet.getShieldedCoin(totalAmount)
      const totalAmount = recipients.reduce((s, r) => s + r.amount, 0n);
      const placeholderCoin = {
        nonce: new Uint8Array(32),
        color: new Uint8Array(32),
        value: totalAmount,
      };

      const { batchId, batchIdHex, deadline, privateState, result, payerRecord } =
        prepareSubmitBatch({
          recipients,
          deadlineHours,
          payerKeyHex: coinPublicKey,
          coin: placeholderCoin,
        });

      const witnesses = buildSubmitBatchWitnesses(privateState);

      // Call circuit
      const txHash = await callCircuit('submitBatchRoot', witnesses, [batchId, deadline]);

      // Persist payer record
      await saveRecord(payerRecord);

      // Update local state
      const batchState: BatchState = {
        batchId: batchIdHex,
        totalAmount,
        claimedAmount: 0n,
        deadline,
        isReclaimed: false,
        claimCount: recipients.length,
        claimPackages: result.claimPackages.map(p => ({
          ...p,
          merkleProof: {
            leaf: Buffer.from(p.merkleProof.leaf).toString('hex'),
            path: p.merkleProof.path.map(e => ({
              sibling: { field: e.sibling.field.toString() },
              goes_left: e.goes_left,
            })),
          },
        })),
      };
      setBatches(prev => [...prev, batchState]);

      return { ...result, txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Batch creation failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [coinPublicKey, callCircuit]);

  const reclaim = useCallback(async (batchId: string): Promise<{ txHash: string }> => {
    if (!callCircuit) throw new Error('Contract not connected');
    const records = await loadAllRecords();
    const record = records.find(r => r.batchIdHex === batchId);
    if (!record) throw new Error('Batch record not found');
    if (!isEligibleForReclaim(record)) throw new Error('Batch deadline not yet passed');

    setIsLoading(true);
    setError(null);
    try {
      const { batchId: batchIdBytes, privateState } = prepareReclaim({
        batchIdHex: batchId,
        payerKeyHex: record.payerKeyHex,
        batchNonceHex: record.batchNonceHex,
      });
      const witnesses = buildReclaimWitnesses(privateState);
      const txHash = await callCircuit('reclaimExpiredBatch', witnesses, [batchIdBytes]);
      setBatches(prev => prev.map(b =>
        b.batchId === batchId ? { ...b, isReclaimed: true } : b,
      ));
      return { txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Reclaim failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [callCircuit]);

  return { createBatch, reclaim, batches, isLoading, error, clearError };
}
