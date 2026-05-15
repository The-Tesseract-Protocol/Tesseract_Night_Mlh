// @ts-ignore
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';
// @ts-ignore
globalThis.WebSocket = WebSocket;
// @ts-ignore
globalThis.Buffer = Buffer;

// Patch the prover client to log the check payload
const origFetch = globalThis.fetch;
globalThis.fetch = async (url: any, opts: any) => {
  if (url?.toString().includes('/check')) {
    console.log('[INTERCEPT] /check request, payload size:', opts?.body?.length || 'unknown');
    const res = await origFetch(url, opts);
    const clone = res.clone();
    const text = await clone.text();
    console.log('[INTERCEPT] /check response status:', res.status);
    console.log('[INTERCEPT] /check response body (first 200):', text.slice(0, 200));
    return res;
  }
  return origFetch(url, opts);
};

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Rx from 'rxjs';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { encodeShieldedCoinInfo, encodeCoinPublicKey } from '@midnight-ntwrk/ledger-v8';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { createKeystore, InMemoryTransactionHistoryStorage, PublicKey as UnshieldedPublicKey, UnshieldedWallet } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { HttpProverClient } from '@midnight-ntwrk/wallet-sdk-prover-client';
import { ZKConfigProvider, createProverKey, createVerifierKey, createZKIR, SucceedEntirely } from '@midnight-ntwrk/midnight-js-types';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import { TesseractClient } from '../contract/client.js';
import { prepareSubmitBatch } from '../flows/submitBatchFlow.js';
import { toHex, fromHex, randomBytes32, deadlineFromHours } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const COMPILED_DIR = path.resolve(PROJECT_ROOT, 'src', 'contract', 'compiled');
const KEYS_DIR = path.resolve(COMPILED_DIR, 'keys');
const ZKIR_DIR = path.resolve(COMPILED_DIR, 'zkir');
const DEPLOYED_ADDRESS = JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, 'scripts', 'deployed-address.json'), 'utf-8')).contractAddress;

const NETWORK_ID = 'undeployed';
const NODE_URL = 'http://127.0.0.1:9944';
const INDEXER_HTTP = 'http://127.0.0.1:8088/api/v3/graphql';
const INDEXER_WS = 'ws://127.0.0.1:8088/api/v3/graphql/ws';
const PROOF_SERVER = 'http://127.0.0.1:6300';

setNetworkId(NETWORK_ID);

function gqlFetch(query: string) {
  return fetch(INDEXER_HTTP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
    .then(r => r.json() as Promise<any>)
    .then(j => { if (j.errors) throw new Error(j.errors[0].message); return j.data; });
}

async function pollForTx(id: string): Promise<any> {
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const d = await gqlFetch(`{ transactions(offset: { identifier: "${id}" }) { id hash protocolVersion block { height timestamp hash author } } }`);
    if (d.transactions.length > 0) return d.transactions[0];
  }
  throw new Error('TX timeout');
}

const seed = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
const hd = HDWallet.fromSeed(seed);
if (hd.type !== 'seedOk') throw new Error();
const derived = hd.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
if (derived.type !== 'keysDerived') throw new Error();
const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);
const unshieldedKeystore = createKeystore(derived.keys[Roles.NightExternal], NETWORK_ID);

const config = {
  networkId: NETWORK_ID,
  indexerClientConnection: { indexerHttpUrl: INDEXER_HTTP, indexerWsUrl: INDEXER_WS },
  provingServerUrl: new URL(PROOF_SERVER),
  relayURL: new URL(NODE_URL.replace(/^http/, 'ws')),
  costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
};

const facade = await WalletFacade.init({
  configuration: config,
  shielded: (cfg: any) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
  unshielded: (cfg: any) => UnshieldedWallet(cfg).startWithPublicKey(UnshieldedPublicKey.fromKeyStore(unshieldedKeystore)),
  dust: (cfg: any) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
});
await facade.start(shieldedSecretKeys, dustSecretKey);
await Rx.firstValueFrom((facade.state() as any).pipe(Rx.filter((s: any) => s.isSynced)));
const state = await facade.waitForSyncedState() as any;

const coins = state.shielded.availableCoins;
const useCoin = coins.reduce((a: any, b: any) => a.coin.value <= b.coin.value ? a : b);
const encodedCoin = encodeShieldedCoinInfo(useCoin.coin);
const genesisKeyHex = toHex(encodeCoinPublicKey(shieldedSecretKeys.coinPublicKey));
const TOTAL_AMOUNT = useCoin.coin.value;

const batchPrep = prepareSubmitBatch({
  recipients: [{ key: genesisKeyHex, amount: TOTAL_AMOUNT }],
  deadlineHours: 72,
  payerKeyHex: genesisKeyHex,
  coin: { nonce: (encodedCoin as any).nonce, color: (encodedCoin as any).color, value: TOTAL_AMOUNT },
  appBaseUrl: 'http://localhost:5173/',
});

class FilesystemZKConfigProvider extends ZKConfigProvider<string> {
  async getZKIR(circuitId: string) { return createZKIR(new Uint8Array(fs.readFileSync(path.join(ZKIR_DIR, `${circuitId}.bzkir`)))); }
  async getProverKey(circuitId: string) { return createProverKey(new Uint8Array(fs.readFileSync(path.join(KEYS_DIR, `${circuitId}.prover`)))); }
  async getVerifierKey(circuitId: string) { return createVerifierKey(new Uint8Array(fs.readFileSync(path.join(KEYS_DIR, `${circuitId}.verifier`)))); }
}

const providers = {
  zkConfigProvider: new FilesystemZKConfigProvider(),
  privateStateProvider: { set: async () => {}, get: async () => null, remove: async () => {}, clear: async () => {}, setSigningKey: async () => {}, getSigningKey: async () => null, removeSigningKey: async () => {}, clearSigningKeys: async () => {}, exportPrivateStates: async () => { throw new Error(); }, importPrivateStates: async () => { throw new Error(); }, setContractAddress: () => {}, scopedKey: () => '' } as any,
  publicDataProvider: {
    async queryContractState(addr: string) { const d = await gqlFetch(`{ contractAction(address: "${addr}") { state } }`); const h = d.contractAction?.state; return h ? ContractState.deserialize(fromHex(h)) : null; },
    async queryZSwapAndContractState(addr: string) { const d = await gqlFetch(`{ contractAction(address: "${addr}") { state zswapState } }`); const a = d.contractAction; if (!a?.state || !a?.zswapState) return null; return [ledger.ZswapChainState.deserialize(fromHex(a.zswapState)), ContractState.deserialize(fromHex(a.state)), ledger.LedgerParameters.initialParameters()]; },
    async queryDeployContractState(addr: string) { return null; },
    async queryUnshieldedBalances() { return null; },
    async watchForContractState() { throw new Error(); },
    async watchForUnshieldedBalances() { throw new Error(); },
    async watchForDeployTxData(addr: string) { throw new Error(); },
    async watchForTxData(id: string) { const tx = await pollForTx(id); return { tx: null as never, status: SucceedEntirely, txId: tx.hash, identifiers: [tx.hash], txHash: tx.hash, blockHash: tx.block.hash, blockHeight: tx.block.height, blockTimestamp: tx.block.timestamp, blockAuthor: tx.block.author, indexerId: tx.id, protocolVersion: tx.protocolVersion }; },
    contractStateObservable() { throw new Error(); },
    unshieldedBalancesObservable() { throw new Error(); },
  } as any,
  walletProvider: {
    getCoinPublicKey() { return shieldedSecretKeys.coinPublicKey; },
    getEncryptionPublicKey() { return shieldedSecretKeys.encryptionPublicKey; },
    async balanceTx(tx: any) { const ttl = new Date(Date.now() + 3_600_000); const recipe = await facade.balanceUnboundTransaction(tx as any, { shieldedSecretKeys, dustSecretKey }, { ttl }); return facade.finalizeRecipe(recipe) as any; },
  } as any,
  midnightProvider: {
    async submitTx(tx: any) { const id = await facade.submitTransaction(tx); console.log('TX submitted:', id); return id; },
  } as any,
  proofProvider: {
    async proveTx(unprovenTx: any) { 
      const costModel = ledger.CostModel.initialCostModel();
      const httpProver = new HttpProverClient({ url: new URL(PROOF_SERVER) });
      return httpProver.proveTransaction(unprovenTx, costModel) as any;
    },
  } as any,
} as any;

console.log('Connecting to contract at:', DEPLOYED_ADDRESS);
const client = await TesseractClient.connect(providers, DEPLOYED_ADDRESS, COMPILED_DIR);

console.log('Submitting batch...');
console.log('Batch ID:', batchPrep.batchIdHex);
console.log('Merkle root:', batchPrep.privateState.merkleRoot.toString());
console.log('Deadline:', batchPrep.deadline.toString());
console.log('Coin value:', batchPrep.privateState.coin.value.toString());
console.log('Total amount:', batchPrep.privateState.totalAmount.toString());
console.log('Coin value == total amount:', batchPrep.privateState.coin.value === batchPrep.privateState.totalAmount);

try {
  const txHash = await client.submitBatch(batchPrep.batchId, batchPrep.deadline, batchPrep.privateState);
  console.log('SUCCESS! TX:', txHash);
} catch (err: any) {
  console.log('ERROR:', err?.message);
  console.log('CAUSE:', err?.cause?.message);
}
process.exit(0);
