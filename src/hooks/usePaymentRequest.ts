/**
 * usePaymentRequest — React hook for createPaymentRequest + markRequestPaid flows.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  prepareCreatePaymentRequest,
  buildCreateRequestWitnesses,
  prepareMarkRequestPaid,
  buildMarkPaidWitnesses,
  parsePaymentRequestUrl,
  type RequesterRecord,
} from '../flows/paymentRequestFlow.js';
import type {
  CreateRequestParams,
  CreateRequestResult,
  PaymentRequest,
  PaymentRequestUrlData,
} from '../../agents/interfaces/paymentRequestFlow.js';

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

function recordToRequest(r: RequesterRecord): PaymentRequest {
  return {
    requestId: r.requestIdHex,
    paymentLink: '',  // reconstructed at load time — not stored
    deadline: BigInt(r.deadline),
    description: r.description,
    amount: r.amount ? BigInt(r.amount) : null,
    currency: r.currency,
    status: r.status,
    createdAt: r.createdAt,
  };
}

export function usePaymentRequest(
  coinPublicKey: string | null,
  callCircuit?: (circuitName: string, witnesses: object, args: unknown[]) => Promise<string>,
) {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    loadAllRecords()
      .then(records => setRequests(records.map(recordToRequest)))
      .catch(() => {});
  }, []);

  const createRequest = useCallback(async (
    params: CreateRequestParams,
  ): Promise<CreateRequestResult> => {
    if (!coinPublicKey) throw new Error('Wallet not connected');
    if (!callCircuit) throw new Error('Contract not connected');

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

      const witnesses = buildCreateRequestWitnesses(privateState);
      const txHash = await callCircuit('createPaymentRequest', witnesses, [requestId, deadline]);

      await saveRecord(requesterRecord);

      const request = recordToRequest({ ...requesterRecord, status: 'open' });
      request.paymentLink = paymentLink;
      setRequests(prev => [...prev, request]);

      return { request, txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request creation failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [coinPublicKey, callCircuit]);

  const markPaid = useCallback(async (requestId: string): Promise<{ txHash: string }> => {
    if (!callCircuit) throw new Error('Contract not connected');
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
      const witnesses = buildMarkPaidWitnesses(privateState);
      const txHash = await callCircuit('markRequestPaid', witnesses, [requestIdBytes]);

      await updateStatus(requestId, 'paid');
      setRequests(prev => prev.map(r =>
        r.requestId === requestId ? { ...r, status: 'paid', txHash } : r,
      ));

      return { txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Mark paid failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [callCircuit]);

  const parsePaymentLink = useCallback((url: string): PaymentRequestUrlData | null => {
    return parsePaymentRequestUrl(url);
  }, []);

  return { createRequest, markPaid, parsePaymentLink, requests, isLoading, error, clearError };
}
