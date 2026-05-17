import { useState, useCallback, useEffect } from 'react';
import { prepareSubmitBatch, isEligibleForReclaim, type PayerRecord } from '../flows/submitBatchFlow.js';
import { prepareReclaimLeaf } from '../flows/reclaimFlow.js';
import { fromHex } from '../types/index.js';
import type { TesseractClient } from '../contract/client.js';

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

export interface BatchSummary {
  batchId: string;
  totalAmount: bigint;
  deadline: bigint;
  isReclaimed?: boolean;
  claimPackages: Array<{ amount: string; shareableLink: string }>;
}

export function useBatchPay(
  client: TesseractClient | null,
  coinPublicKey: string | null,
) {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    loadAllRecords().then(records => {
      setBatches(records.map(r => ({
        batchId: r.batchIdHex,
        totalAmount: BigInt(r.totalAmount),
        deadline: BigInt(r.deadline),
        claimPackages: r.claimPackages.map(p => ({ amount: p.amount, shareableLink: p.shareableLink })),
      })));
    }).catch(() => {});
  }, []);

  const createBatch = useCallback(async (
    recipients: Array<{ key: string; amount: bigint }>,
    deadlineHours: number,
    auditorPublicKeyHex?: string,
  ) => {
    if (!coinPublicKey || !client) throw new Error('Wallet or contract not connected');

    setIsLoading(true);
    setError(null);
    try {
      const { batchId, batchIdHex, deadline, privateState, deposits, claimPackages, payerRecord } =
        prepareSubmitBatch({
          recipients,
          deadlineHours,
          payerKeyHex: coinPublicKey,
          auditorPublicKeyHex,
        });

      // Phase 1: submit batch root
      const txHash = await client.submitBatch(batchId, deadline, privateState);

      // Phase 2: deposit per recipient
      for (const dep of deposits) {
        await client.depositCoin(dep.batchId, dep.recipientLeafHash, dep.coin);
      }

      await saveRecord(payerRecord);
      setBatches(prev => [...prev, {
        batchId: batchIdHex,
        totalAmount: BigInt(payerRecord.totalAmount),
        deadline,
        claimPackages: payerRecord.claimPackages.map(p => ({ amount: p.amount, shareableLink: p.shareableLink })),
      }]);

      return { txHash, claimPackages };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Batch creation failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [coinPublicKey, client]);

  const reclaim = useCallback(async (batchId: string): Promise<number> => {
    if (!client) throw new Error('Contract not connected');

    setIsLoading(true);
    setError(null);
    try {
      const records = await loadAllRecords();
      const record = records.find(r => r.batchIdHex === batchId);
      if (!record) throw new Error('Batch record not found in local storage');
      if (!isEligibleForReclaim(record)) throw new Error('Batch deadline has not passed yet');

      const batchIdBytes = fromHex(record.batchIdHex);
      let reclaimedCount = 0;

      for (const leafHashHex of record.leafHashes) {
        const coin = await client.getRecipientCoin(batchIdBytes, fromHex(leafHashHex));
        if (!coin) continue; // already claimed or never deposited

        const { batchId: bId, recipientLeafHash, privateState } = prepareReclaimLeaf({
          batchIdHex: record.batchIdHex,
          leafHashHex,
          payerKeyHex: record.payerKeyHex,
          batchNonceHex: record.batchNonceHex,
          reclaimCoin: coin,
        });

        await client.reclaimRecipientCoin(bId, recipientLeafHash, privateState);
        reclaimedCount++;
      }

      if (reclaimedCount > 0) {
        setBatches(prev => prev.map(b =>
          b.batchId === batchId ? { ...b, isReclaimed: true } : b,
        ));
      }

      return reclaimedCount;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Reclaim failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  return { createBatch, reclaim, batches, isLoading, error, clearError };
}
