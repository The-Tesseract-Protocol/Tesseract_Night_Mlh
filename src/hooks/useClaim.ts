import { useState, useCallback } from 'react';
import { prepareClaimPayment, parseClaimUrl } from '../flows/claimPaymentFlow.js';
import type { TesseractClient } from '../contract/client.js';
import { hashClaimNullifier } from '../contract/descriptors.js';
import { fromHex, toHex } from '../types/index.js';

export function useClaim(
  client: TesseractClient | null,
  auditorPublicKeyHex?: string,
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const parseCurrentUrl = useCallback(() => {
    return parseClaimUrl(window.location.href);
  }, []);

  const claim = useCallback(async (params: any) => {
    if (!client) throw new Error('Contract not connected');
    if (!params.serializedProof) throw new Error('Invalid claim link — missing merkle proof');

    setIsLoading(true);
    setError(null);
    try {
      // URL-embedded key takes priority; localStorage key is fallback for same-device demos
      const resolvedAuditorKey = params.auditorPublicKey
        ?? (auditorPublicKeyHex ? fromHex(auditorPublicKeyHex) : undefined);
      const recipientCoin = await client.getRecipientCoin(
        fromHex(params.batchIdHex),
        fromHex(params.leafHashHex),
      );

      if (!recipientCoin) throw new Error(`No coin found for batch ${params.batchIdHex} — deposit not yet confirmed`);

      const { batchId, encryptedAuditMemo, privateState } = await prepareClaimPayment({
        batchIdHex: params.batchIdHex,
        leafIndex: params.leafIndex,
        amount: params.amount,
        claimSecretHex: params.claimSecretHex,
        leafKeyHex: params.leafKeyHex,
        serializedProof: params.serializedProof,
        recipientCoin,
        auditorPublicKey: resolvedAuditorKey,
      });

      const txHash = await client.claimPayment(batchId, encryptedAuditMemo, privateState);

      const nullifierBytes = hashClaimNullifier(
        privateState.claimSecret,
        privateState.merkleProof.leaf,
        batchId,
      );

      return { txHash, nullifier: toHex(nullifierBytes), claimedAmount: params.amount };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Claim failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [client, auditorPublicKeyHex]);

  return { parseCurrentUrl, claim, isLoading, error, clearError };
}
