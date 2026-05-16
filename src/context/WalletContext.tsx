import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface WalletContextValue {
  isConnected: boolean;
  isConnecting: boolean;
  coinPublicKey: string | null;
  contractAddress: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
  callCircuit: ((circuitName: string, args: unknown[]) => Promise<string>) | undefined;
  callCircuitWithWitnesses: ((circuitName: string, witnesses: object, args: unknown[]) => Promise<string>) | undefined;
  getRecipientCoin: ((batchIdHex: string, leafHashHex: string) => Promise<{ nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint } | null>) | undefined;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [coinPublicKey, setCoinPublicKey] = useState<string | null>(null);
  const [contractAddress] = useState<string | null>(CONTRACT_ADDRESS ?? null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const lace = (window as any).midnight?.mnLace;
      if (!lace) {
        throw new Error('Lace wallet not found. Install the Midnight Lace extension.');
      }
      const api = await lace.enable();
      const state = await api.state();
      const pubKey = state?.coinPublicKey
        ?? state?.address
        ?? state?.accounts?.[0]?.coinPublicKey
        ?? null;
      if (!pubKey) throw new Error('Could not get public key from Lace wallet.');
      setCoinPublicKey(pubKey);
      setIsConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setCoinPublicKey(null);
  }, []);

  return (
    <WalletContext.Provider value={{
      isConnected,
      isConnecting,
      coinPublicKey,
      contractAddress,
      connect,
      disconnect,
      error,
      callCircuit: undefined,
      callCircuitWithWitnesses: undefined,
      getRecipientCoin: undefined,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
