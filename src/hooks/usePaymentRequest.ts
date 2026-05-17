import { useState, useCallback, useEffect } from 'react';
import {
  prepareCreatePaymentRequest,
  prepareMarkRequestPaid,
  type RequesterRecord,
} from '../flows/paymentRequestFlow.js';
import type { TesseractClient } from '../contract/client.js';

const DB_NAME = 'tesseract-requests';
const STORE_NAME = 'requester-records';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'requestIdHex' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRecord(record: RequesterRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadAllRecords(): Promise<RequesterRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as RequesterRecord[]);
    req.onerror = () => reject(req.error);
  });
}

async function updateStatus(
  requestIdHex: string,
  status: RequesterRecord['status'],
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(requestIdHex);
    req.onsuccess = () => {
      const record = { ...req.result, status } as RequesterRecord;
      store.put(record);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function usePaymentRequest(
  client: TesseractClient | null,
  coinPublicKey: string | null,
) {
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    loadAllRecords()
      .then(records => setRequests(records))
      .catch(() => {});
  }, []);

  const createRequest = useCallback(async (params: any) => {
    if (!coinPublicKey || !client) throw new Error('Wallet or contract not connected');

    setIsLoading(true);
    setError(null);
    try {
      const { requestId, deadline, privateState, paymentLink, requesterRecord } =
        prepareCreatePaymentRequest({
          requesterKeyHex: coinPublicKey,
          deadlineHours: params.deadlineHours,
          description: params.description,
          amount: params.amount,
          currency: params.currency,
        });

      const txHash = await client.createRequest(requestId, deadline, privateState);

      await saveRecord(requesterRecord);
      setRequests(prev => [...prev, requesterRecord]);

      return { request: requesterRecord, txHash, paymentLink };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request creation failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [coinPublicKey, client]);

  const markPaid = useCallback(async (requestId: string) => {
    if (!client) throw new Error('Contract not connected');
    const records = await loadAllRecords();
    const record = records.find(r => r.requestIdHex === requestId);
    if (!record) throw new Error('Request record not found');

    setIsLoading(true);
    setError(null);
    try {
      const { requestId: requestIdBytes, privateState } = prepareMarkRequestPaid({
        requestIdHex: requestId,
        requesterKeyHex: record.requesterKeyHex,
        requestNonceHex: record.requestNonceHex,
      });
      
      const txHash = await client.markPaid(requestIdBytes, privateState);

      await updateStatus(requestId, 'paid');
      setRequests(prev => prev.map(r =>
        r.requestIdHex === requestId ? { ...r, status: 'paid', txHash } : r,
      ));

      return { txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Mark paid failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  return { createRequest, markPaid, requests, isLoading, error, clearError };
}
