/**
 * useBatchPay — React hook for Submit Batch + Reclaim flows.
 * Wraps submitBatchFlow and reclaimFlow with state management and IndexedDB persistence.
 */

import { useState, useCallback, useEffect } from 'react';
import { prepareSubmitBatch, isEligibleForReclaim, type PayerRecord } from '../flows/submitBatchFlow.js';
import { toHex } from '../types/index.js';
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

export function useBatchPay(
  _contractAddress: string | null,
  coinPublicKey: string | null,
  /** Call circuit — provided by contract client layer */
  callCircuit?: (circuitName: string, args: unknown[]) => Promise<string>,
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
        claimedAmount: 0n,
        deadline: BigInt(r.deadline),
        isReclaimed: false,
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
      const { batchId, batchIdHex, deadline, privateState, deposits, claimPackages, payerRecord } =
        prepareSubmitBatch({
          recipients,
          deadlineHours,
          payerKeyHex: coinPublicKey,
        });

      // Phase 1: submit batch root
      const txHash = await callCircuit('submitBatchRoot', [batchId, deadline, privateState]);

      // Phase 2: deposit per recipient (sequential)
      for (const dep of deposits) {
        await callCircuit('depositRecipientCoin', [dep.batchId, dep.recipientLeafHash, dep.coin]);
      }

      await saveRecord(payerRecord);

      const batchState: BatchState = {
        batchId: batchIdHex,
        totalAmount: BigInt(payerRecord.totalAmount),
        claimedAmount: 0n,
        deadline,
        isReclaimed: false,
        claimCount: recipients.length,
        claimPackages: claimPackages.map(p => ({
          batchId: p.batchId,
          leafIndex: p.leafIndex,
          amount: p.amount,
          claimSecret: p.claimSecret,
          leafKey: p.leafKey,
          merkleProof: {
            leaf: toHex(p.merkleProof.leaf),
            path: p.merkleProof.path.map((e: { sibling: { field: bigint }; goes_left: boolean }) => ({
              sibling: { field: e.sibling.field.toString() },
              goes_left: e.goes_left,
            })),
          },
          shareableLink: p.shareableLink,
        })),
      };
      setBatches(prev => [...prev, batchState]);

      return {
        batchId: batchIdHex,
        merkleRoot: privateState.merkleRoot.toString(),
        totalAmount: BigInt(payerRecord.totalAmount),
        claimPackages: claimPackages.map(p => ({
          batchId: p.batchId,
          leafIndex: p.leafIndex,
          amount: p.amount,
          claimSecret: p.claimSecret,
          leafKey: p.leafKey,
          shareableLink: p.shareableLink,
          merkleProof: {
            leaf: toHex(p.merkleProof.leaf),
            path: p.merkleProof.path.map((e: { sibling: { field: bigint }; goes_left: boolean }) => ({
              sibling: { field: e.sibling.field.toString() },
              goes_left: e.goes_left,
            })),
          },
        })),
        deadline,
        txHash,
      };
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

    // Path A reclaim is per-leaf; full implementation in Task 12
    throw new Error('Per-leaf reclaim not yet implemented in hook; use TesseractClient directly');
  }, [callCircuit]);

  return { createBatch, reclaim, batches, isLoading, error, clearError };
}
