/**
 * useAuditDecrypt — Auditor hook for decrypting on-chain audit memos.
 * Reads encrypted memos from chain events / local cache, decrypts with auditor key.
 */

import { useState, useCallback } from 'react';
import { decryptAuditMemo } from '../crypto/memo.js';
import { fromHex, toHex } from '../types/index.js';
import type { AuditEntry } from '../../agents/interfaces/claimPaymentFlow.js';

export function useAuditDecrypt(
  /** Fetch encrypted memos from indexer/ledger — provided by contract client */
  fetchMemos?: (batchId?: string) => Promise<Array<{ txHash: string; encryptedMemo: Uint8Array }>>,
) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decrypt = useCallback(async (
    auditorPrivKeyHex: string,
    batchId?: string,
  ): Promise<AuditEntry[]> => {
    if (!fetchMemos) throw new Error('fetchMemos not provided');

    setIsLoading(true);
    setError(null);
    try {
      const privKey = fromHex(auditorPrivKeyHex);
      const rawMemos = await fetchMemos(batchId);

      const decrypted = await Promise.all(
        rawMemos.map(async ({ txHash, encryptedMemo }) => {
          const record = await decryptAuditMemo(encryptedMemo, privKey);
          return {
            txHash,
            encryptedMemo: toHex(encryptedMemo),
            decrypted: record,
          } satisfies AuditEntry;
        }),
      );

      setEntries(decrypted);
      return decrypted;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Decryption failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [fetchMemos]);

  return { decrypt, entries, isLoading, error };
}
