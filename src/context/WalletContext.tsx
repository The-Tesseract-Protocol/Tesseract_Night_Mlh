import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { TesseractClient } from '../contract/client';
import { toHex } from '../types';
import { createConnectedSession } from '../lib/midnight';
import { MidnightBech32m } from '@midnight-ntwrk/wallet-sdk-address-format';

interface WalletContextValue {
  isConnected: boolean;
  isConnecting: boolean;
  coinPublicKey: string | null;
  contractAddress: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
  client: TesseractClient | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS as string;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [coinPublicKey, setCoinPublicKey] = useState<string | null>(null);
  const [client, setClient] = useState<TesseractClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const oneam = (window as any).midnight?.['1am'];
      if (!oneam) {
        throw new Error('1AM wallet not found. Install the 1AM wallet extension.');
      }

      // Connect to 1AM wallet
      const network = import.meta.env.VITE_NETWORK || 'undeployed';
      const api = await oneam.connect(network);
      
      // Build the full MidnightProviders session
      const session = await createConnectedSession(api, '/contract/compiled/');
      
      // Get the shielded public key from the connected API
      const shieldedAddresses = await api.getShieldedAddresses();
      const rawKey = shieldedAddresses?.shieldedCoinPublicKey ?? null;

      if (!rawKey) throw new Error('Could not get public key from 1AM wallet.');
      console.log('[WalletContext] shieldedCoinPublicKey type:', typeof rawKey, rawKey instanceof Uint8Array ? `Uint8Array(${rawKey.length})` : Array.isArray(rawKey) ? `Array(${rawKey.length})` : String(rawKey).slice(0, 80));

      // Normalize to exactly 64-char hex (32-byte ZswapCoinPublicKey).
      // Wallet may return: Uint8Array, Buffer, number[], object{bytes}, Bech32m string, or hex string.
      let keyHex: string;
      if (rawKey?.bytes instanceof Uint8Array) {
        // ZswapCoinPublicKey struct { bytes: Uint8Array }
        keyHex = toHex(rawKey.bytes).slice(0, 64);
      } else if (rawKey instanceof Uint8Array || (rawKey && typeof rawKey === 'object' && 'length' in rawKey && typeof rawKey[0] === 'number')) {
        // Uint8Array or number[] — take first 32 bytes
        keyHex = Array.from(rawKey as number[]).map((b: number) => b.toString(16).padStart(2, '0')).join('').slice(0, 64);
      } else if (typeof rawKey === 'string' && rawKey.startsWith('mn_shield-addr')) {
        // Full Bech32m shielded address: decode, take coin key (first 32 bytes)
        const parsed = MidnightBech32m.parse(rawKey);
        keyHex = toHex(new Uint8Array(parsed.data.subarray(0, 32)));
      } else if (typeof rawKey === 'string') {
        // Hex string (with or without 0x) — strip prefix, take first 64 chars = 32 bytes
        keyHex = rawKey.replace(/^0x/, '').slice(0, 64);
      } else {
        throw new Error(`Unrecognized coin public key format from wallet: ${typeof rawKey}`);
      }
      if (keyHex.length !== 64) throw new Error(`Coin public key must be 32 bytes (64 hex chars), got ${keyHex.length / 2}`);

      if (!CONTRACT_ADDRESS) {
        throw new Error('VITE_CONTRACT_ADDRESS is missing in .env. Have you deployed the contract locally?');
      }

      // Initialize TesseractClient with actual providers
      const tesseractClient = await TesseractClient.connect(
        session,
        CONTRACT_ADDRESS,
        '/contract/compiled'
      );

      setClient(tesseractClient);
      setCoinPublicKey(keyHex);
      setIsConnected(true);
    } catch (e) {
      console.error('Connection error:', e);
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setCoinPublicKey(null);
    setClient(null);
  }, []);

  const value = useMemo(() => ({
    isConnected,
    isConnecting,
    coinPublicKey,
    contractAddress: CONTRACT_ADDRESS,
    connect,
    disconnect,
    error,
    client,
  }), [isConnected, isConnecting, coinPublicKey, connect, disconnect, error, client]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
