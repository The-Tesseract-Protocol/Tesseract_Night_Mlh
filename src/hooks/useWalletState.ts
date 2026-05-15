/**
 * useWalletState — Midnight Lace wallet connection via DApp Connector v4.
 * Provides wallet key, connection status, and balance.
 */

import { useState, useCallback, useEffect } from 'react';

declare global {
  interface Window {
    midnight?: {
      mnLace?: {
        enable: () => Promise<MidnightAPI>;
        isEnabled: () => Promise<boolean>;
        apiVersion: () => string;
        name: () => string;
      };
    };
  }
}

interface MidnightAPI {
  getUsedAddresses: () => Promise<string[]>;
  getShieldedAddresses?: () => Promise<Array<{ coinPublicKey: string; encPublicKey: string }>>;
  getBalance: () => Promise<{ unshielded: bigint; shielded: bigint }>;
  signTx: (tx: unknown) => Promise<unknown>;
  submitTx: (tx: unknown) => Promise<string>;
}

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  coinPublicKey: string | null;  // ZswapCoinPublicKey hex — needed for flows
  encPublicKey: string | null;   // Encryption public key hex
  balance: { unshielded: bigint; shielded: bigint } | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseWalletStateReturn extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  api: MidnightAPI | null;
}

export function useWalletState(): UseWalletStateReturn {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    address: null,
    coinPublicKey: null,
    encPublicKey: null,
    balance: null,
    isLoading: false,
    error: null,
  });
  const [api, setApi] = useState<MidnightAPI | null>(null);

  const connect = useCallback(async () => {
    if (!window.midnight?.mnLace) {
      setState(s => ({ ...s, error: 'Midnight Lace wallet not found. Install from lace.io' }));
      return;
    }
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const walletApi = await window.midnight.mnLace.enable();
      setApi(walletApi);

      const addresses = await walletApi.getUsedAddresses();
      const balance = await walletApi.getBalance();

      // Get ZswapCoinPublicKey if available
      let coinPublicKey: string | null = null;
      let encPublicKey: string | null = null;
      if (walletApi.getShieldedAddresses) {
        const shielded = await walletApi.getShieldedAddresses();
        if (shielded.length > 0) {
          coinPublicKey = shielded[0].coinPublicKey;
          encPublicKey = shielded[0].encPublicKey;
        }
      }

      setState({
        isConnected: true,
        address: addresses[0] ?? null,
        coinPublicKey,
        encPublicKey,
        balance,
        isLoading: false,
        error: null,
      });
    } catch (e) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: e instanceof Error ? e.message : 'Connection failed',
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setApi(null);
    setState({
      isConnected: false,
      address: null,
      coinPublicKey: null,
      encPublicKey: null,
      balance: null,
      isLoading: false,
      error: null,
    });
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!api) return;
    try {
      const balance = await api.getBalance();
      setState(s => ({ ...s, balance }));
    } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : 'Balance refresh failed' }));
    }
  }, [api]);

  // Auto-reconnect if previously enabled
  useEffect(() => {
    const check = async () => {
      if (window.midnight?.mnLace && await window.midnight.mnLace.isEnabled()) {
        await connect();
      }
    };
    check().catch(() => {});
  }, [connect]);

  return { ...state, connect, disconnect, refreshBalance, api };
}
