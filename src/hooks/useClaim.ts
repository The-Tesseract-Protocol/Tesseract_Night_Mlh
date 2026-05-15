/**
 * useClaim — React hook for the claimPayment flow.
 * Parses URL params, encrypts audit memo, calls circuit.
 */

import { useState, useCallback } from 'react';
import { prepareClaimPayment, buildClaimWitnesses, parseClaimUrl } from '../flows/claimPaymentFlow.js';
import type { ClaimParams, ClaimResult } from '../../agents/interfaces/claimPaymentFlow.js';
import { deserializeClaimPackage } from '../flows/claimPackageSerde.js';
import { hashClaimNullifier } from '../contract/descriptors.js';
import { fromHex, toHex } from '../types/index.js';

export function useClaim(
  callCircuit?: (circuitName: string, witnesses: object, args: unknown[]) => Promise<string>,
  auditorPublicKeyHex?: string,
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const parseCurrentUrl = useCallback((): ClaimParams | null => {
    const parsed = parseClaimUrl(window.location.href);
    if (!parsed) return null;
    return {
      batchId: parsed.batchIdHex,
      leafIndex: parsed.leafIndex,
      amount: parsed.amount,
      claimSecret: parsed.claimSecretHex,
      leafKey: parsed.leafKeyHex,
    };
  }, []);

  const claim = useCallback(async (params: ClaimParams): Promise<ClaimResult> => {
    if (!callCircuit) throw new Error('Contract not connected');

    setIsLoading(true);
    setError(null);
    try {
      const auditorPublicKey = auditorPublicKeyHex
        ? fromHex(auditorPublicKeyHex)
        : undefined;

      const { batchId, encryptedAuditMemo, privateState } = await prepareClaimPayment({
        batchIdHex: params.batchId,
        leafIndex: params.leafIndex,
        amount: params.amount,
        claimSecretHex: params.claimSecret,
        leafKeyHex: params.leafKey,
        serializedProof: params.merkleProof,
        auditorPublicKey,
      });

      const witnesses = buildClaimWitnesses(privateState);
      const txHash = await callCircuit('claimPayment', witnesses, [batchId, encryptedAuditMemo]);

      // Compute nullifier for display
      const nullifierBytes = hashClaimNullifier(
        privateState.claimSecret,
        privateState.merkleProof.leaf,
        batchId,
      );
      const nullifier = toHex(nullifierBytes);

      return { txHash, nullifier, claimedAmount: params.amount };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Claim failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [callCircuit, auditorPublicKeyHex]);

  return { parseCurrentUrl, claim, isLoading, error, clearError };
}
