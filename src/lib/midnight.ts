import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import type { MidnightProviders, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import { LedgerParameters, ZswapChainState } from '@midnight-ntwrk/ledger-v8';
import { toHex, fromHex } from '../types/index.js';

export function createPatchedPublicDataProvider(queryUrl: string, subscriptionUrl: string) {
  // Explicitly pass window.WebSocket to avoid isomorphic-ws browser bugs
  const wsImpl = typeof window !== 'undefined' ? window.WebSocket : (globalThis as any).WebSocket;
  const base = indexerPublicDataProvider(queryUrl, subscriptionUrl, wsImpl);

  async function queryLatest(query: string, address: string) {
    const res = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables: { address } }),
    });
    if (!res.ok) throw new Error(`Indexer HTTP error: ${res.status}`);
    const payload = await res.json();
    if (payload.errors?.length) throw new Error(payload.errors.map((e: any) => e.message).join('; '));
    return payload.data?.contractAction ?? null;
  }

  return {
    ...base,
    async queryContractState(contractAddress: string, config?: any) {
      if (config) return base.queryContractState(contractAddress, config);

      const action = await queryLatest(`
        query LATEST_CONTRACT_STATE($address: HexEncoded!) {
          contractAction(address: $address) { state }
        }`, contractAddress);
      return action ? ContractState.deserialize(fromHex(action.state)) : null;
    },
    async queryZSwapAndContractState(contractAddress: string, config?: any) {
      if (config) return base.queryZSwapAndContractState(contractAddress, config);

      const action = await queryLatest(`
        query LATEST_BOTH_STATE($address: HexEncoded!) {
          contractAction(address: $address) {
            state
            zswapState
            transaction { block { ledgerParameters } }
          }
        }`, contractAddress);

      if (!action?.zswapState) return null;
      return [
        ZswapChainState.deserialize(fromHex(action.zswapState)),
        ContractState.deserialize(fromHex(action.state)),
        action.transaction?.block?.ledgerParameters
          ? LedgerParameters.deserialize(fromHex(action.transaction.block.ledgerParameters))
          : LedgerParameters.initialParameters(),
      ] as [ZswapChainState, ContractState, LedgerParameters];
    },
  };
}

export function createPrivateStateProvider() {
  let scope = '';
  const stateStore = new Map<string, unknown>();
  const signingKeyStore = new Map<string, unknown>();
  const key = (id: string) => `${scope}:${id}`;

  return {
    setContractAddress(address: string) { scope = address; },
    async set(id: string, state: unknown) { stateStore.set(key(id), state); },
    async get(id: string) { return stateStore.get(key(id)) ?? null; },
    async remove(id: string) { stateStore.delete(key(id)); },
    async clear() { stateStore.clear(); },
    async setSigningKey(addr: string, k: unknown) { signingKeyStore.set(addr, k); },
    async getSigningKey(addr: string) { return signingKeyStore.get(addr) ?? null; },
    async removeSigningKey(addr: string) { signingKeyStore.delete(addr); },
    async clearSigningKeys() { signingKeyStore.clear(); },
    async exportPrivateStates(): Promise<never> { throw new Error('Not implemented.'); },
    async importPrivateStates(): Promise<never> { throw new Error('Not implemented.'); },
    async exportSigningKeys(): Promise<never> { throw new Error('Not implemented.'); },
    async importSigningKeys(): Promise<never> { throw new Error('Not implemented.'); },
  };
}

export async function createConnectedSession(api: any, zkAssetBasePath: string): Promise<MidnightProviders<string, any, undefined>> {
  const [config, shieldedAddress] = await Promise.all([
    api.getConfiguration(),
    api.getShieldedAddresses(),
  ]);

  console.log('[session] config:', {
    networkId: config.networkId,
    proverServerUri: config.proverServerUri,
    indexerUri: config.indexerUri,
    indexerWsUri: config.indexerWsUri,
  });

  setNetworkId(config.networkId);

  // Strip trailing slash: FetchZkConfigProvider constructs "${baseURL}/${type}/${id}.ext"
  // so the base must NOT end with "/" or we get double-slash in the path.
  const zkBaseUrl = new URL(zkAssetBasePath, window.location.origin).toString().replace(/\/$/, '');
  console.log('[session] zkBaseUrl:', zkBaseUrl);

  const baseZkProvider = new FetchZkConfigProvider(
    zkBaseUrl,
    window.fetch.bind(window),
  );

  // Register zkConfigProvider with wallet (needed for wallet's DUST proving in
  // balanceUnsealedTransaction — without this call the wallet has no registered
  // provider and DUST proving fails with "Failed to prove transaction").
  // We discard the returned provingProvider; we don't use it for circuit proving
  // because it runs in the extension background context, which is blocked by the
  // proof server's CORS policy (chrome-extension:// origin ≠ http://localhost:5173).
  try {
    await api.getProvingProvider(baseZkProvider);
    console.log('[session] getProvingProvider: registered zkConfigProvider with wallet');
  } catch (e) {
    console.warn('[session] getProvingProvider registration failed (non-fatal):', e);
  }

  // httpClientProofProvider runs in page context (http://localhost:5173) — CORS ok.
  const proverUrl = config.proverServerUri ?? 'http://127.0.0.1:6300';
  console.log('[session] proverUrl:', proverUrl);

  const proofProvider = httpClientProofProvider(proverUrl, baseZkProvider);

  const walletProvider: WalletProvider = {
    getCoinPublicKey: () => shieldedAddress.shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shieldedAddress.shieldedEncryptionPublicKey,
    balanceTx: async (tx: any) => {
      console.log('[walletProvider] balanceTx called');
      try {
        // api.balanceTransaction(tx) returns a fn that accepts a proving provider.
        // Passing proofProvider (httpClientProofProvider) ensures any residual proving
        // calls go through page context (http://localhost:5173), not extension background.
        const walletFn = await api.balanceTransaction(tx);
        console.log('[walletProvider] balanceTransaction: walletFn acquired');
        const balanced = await walletFn(proofProvider);
        console.log('[walletProvider] balanceTx OK, type:', typeof balanced);
        return balanced;
      } catch (e) {
        console.error('[walletProvider] balanceTx FAILED:', e);
        throw e;
      }
    },
  };

  const midnightProvider = {
    submitTx: async (tx: any) => {
      console.log('[midnightProvider] submitTx called');
      try {
        const txHex = toHex(tx.serialize());
        const result = await api.submitTransaction(txHex);
        console.log('[midnightProvider] submitTx result:', result);
        if (typeof result === 'string' && result) return result;
        if (result?.transactionId) return result.transactionId;
        if (result?.id) return result.id;
        return txHex.slice(0, 64);
      } catch (e) {
        console.error('[midnightProvider] submitTx FAILED:', e);
        throw e;
      }
    },
  };

  const publicDataProvider = createPatchedPublicDataProvider(config.indexerUri, config.indexerWsUri);

  return {
    privateStateProvider: createPrivateStateProvider() as any,
    publicDataProvider,
    zkConfigProvider: baseZkProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  };
}
