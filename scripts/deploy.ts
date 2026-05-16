/**
 * TesseractCore contract deployment script for local devnet.
 * Run: npx tsx scripts/deploy.ts
 */

// @ts-ignore
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';
// @ts-ignore
globalThis.WebSocket = WebSocket;
// @ts-ignore
globalThis.Buffer = Buffer;

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import pino from 'pino';
import * as Rx from 'rxjs';

// Midnight Network
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import {
  ZKConfigProvider,
  createProverKey,
  createVerifierKey,
  createZKIR,
  SucceedEntirely,
} from '@midnight-ntwrk/midnight-js-types';
import type {
  FinalizedTxData,
  MidnightProviders,
  PrivateStateId,
} from '@midnight-ntwrk/midnight-js-types';
import type { ContractAddress, FinalizedTransaction, UnboundTransaction } from '@midnight-ntwrk/ledger-v8';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';

// Wallet SDK
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade, type DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey as UnshieldedPublicKey,
  UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { HttpProverClient } from '@midnight-ntwrk/wallet-sdk-prover-client';

// Compiled contract
import { Contract } from '../src/contract/compiled/contract/index.js';
import type { Witnesses } from '../src/contract/compiled/contract/index.js';

// ────────────────────────── Config ──────────────────────────

const NETWORK_ID = 'undeployed';
const NODE_URL = 'http://127.0.0.1:9944';
const INDEXER_HTTP = 'http://127.0.0.1:8088/api/v3/graphql';
const INDEXER_WS = 'ws://127.0.0.1:8088/api/v3/graphql/ws';
const PROOF_SERVER = 'http://127.0.0.1:6300';
// Genesis wallet has shielded NIGHT + DUST — use for deployment fees
const GENESIS_SEED_HEX = '0000000000000000000000000000000000000000000000000000000000000001';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = path.resolve(__dirname, '..', 'src', 'contract', 'compiled', 'keys');
const ZKIR_DIR = path.resolve(__dirname, '..', 'src', 'contract', 'compiled', 'zkir');
const COMPILED_DIR = path.resolve(__dirname, '..', 'src', 'contract', 'compiled');
const OUT_FILE = path.resolve(__dirname, 'deployed-address.json');

setNetworkId(NETWORK_ID);

const log = pino({
  level: 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } },
});

// ────────────────────────── ZK Config Provider ──────────────────────────

class FilesystemZKConfigProvider extends ZKConfigProvider<string> {
  async getZKIR(circuitId: string) {
    const bytes = fs.readFileSync(path.join(ZKIR_DIR, `${circuitId}.bzkir`));
    return createZKIR(new Uint8Array(bytes));
  }
  async getProverKey(circuitId: string) {
    const bytes = fs.readFileSync(path.join(KEYS_DIR, `${circuitId}.prover`));
    return createProverKey(new Uint8Array(bytes));
  }
  async getVerifierKey(circuitId: string) {
    const bytes = fs.readFileSync(path.join(KEYS_DIR, `${circuitId}.verifier`));
    return createVerifierKey(new Uint8Array(bytes));
  }
}

// ────────────────────────── Private State Provider ──────────────────────────

class InMemoryPrivateStateProvider {
  private states = new Map<string, unknown>();
  private signingKeys = new Map<string, ledger.SigningKey>();
  private contractAddr = '';

  setContractAddress(address: ContractAddress): void { this.contractAddr = address; }
  async set(id: string, state: unknown): Promise<void> { this.states.set(`${this.contractAddr}:${id}`, state); }
  async get(id: string): Promise<unknown | null> { return this.states.get(`${this.contractAddr}:${id}`) ?? null; }
  async remove(id: string): Promise<void> { this.states.delete(`${this.contractAddr}:${id}`); }
  async clear(): Promise<void> { this.states.clear(); }
  async setSigningKey(address: ContractAddress, key: ledger.SigningKey): Promise<void> { this.signingKeys.set(address, key); }
  async getSigningKey(address: ContractAddress): Promise<ledger.SigningKey | null> { return this.signingKeys.get(address) ?? null; }
  async removeSigningKey(address: ContractAddress): Promise<void> { this.signingKeys.delete(address); }
  async clearSigningKeys(): Promise<void> { this.signingKeys.clear(); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async exportPrivateStates(): Promise<any> { throw new Error('not implemented'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async importPrivateStates(): Promise<any> { throw new Error('not implemented'); }
}

// ────────────────────────── Public Data Provider ──────────────────────────

async function gqlFetch(query: string) {
  const res = await fetch(INDEXER_HTTP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json() as { data?: Record<string, unknown>; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data!;
}

type IndexerTx = { id: number; hash: string; protocolVersion: number; block: { height: number; timestamp: number; hash: string; author: string | null } };

async function pollForTx(identifier: string): Promise<IndexerTx> {
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const data = await gqlFetch(`{ transactions(offset: { identifier: "${identifier}" }) { id hash protocolVersion block { height timestamp hash author } } }`);
    const txs = data['transactions'] as IndexerTx[];
    if (txs.length > 0) {
      log.info(`TX confirmed at block ${txs[0].block.height}`);
      return txs[0];
    }
    if (i % 5 === 0) log.info(`Still waiting for tx ${identifier}...`);
  }
  throw new Error(`TX ${identifier} never confirmed`);
}

function toFinalizedTxData(tx: IndexerTx): FinalizedTxData {
  return {
    tx: null as never,
    status: SucceedEntirely,
    txId: tx.hash,
    identifiers: [tx.hash],
    txHash: tx.hash,
    blockHash: tx.block.hash,
    blockHeight: tx.block.height,
    blockTimestamp: tx.block.timestamp,
    blockAuthor: tx.block.author,
    indexerId: tx.id,
    protocolVersion: tx.protocolVersion,
  };
}

// ────────────────────────── Wallet Setup ──────────────────────────

async function buildWallet() {
  const seed = Buffer.from(GENESIS_SEED_HEX, 'hex');
  const hd = HDWallet.fromSeed(seed);
  if (hd.type !== 'seedOk') throw new Error('HDWallet init failed');

  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Key derivation failed');
  hd.hdWallet.clear();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(derived.keys[Roles.NightExternal], NETWORK_ID);

  const config: DefaultConfiguration = {
    networkId: NETWORK_ID,
    indexerClientConnection: { indexerHttpUrl: INDEXER_HTTP, indexerWsUrl: INDEXER_WS },
    provingServerUrl: new URL(PROOF_SERVER),
    relayURL: new URL(NODE_URL.replace(/^http/, 'ws')),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };

  const facade = await WalletFacade.init({
    configuration: config,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(UnshieldedPublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await facade.start(shieldedSecretKeys, dustSecretKey);

  return { facade, shieldedSecretKeys, dustSecretKey };
}

// ────────────────────────── Stub Witnesses (deploy only — constructor has no witnesses) ──────────────────────────

const deployWitnesses: Witnesses<undefined> = {
  getBatchCoin: () => { throw new Error('not called during deploy'); },
  getMerkleRoot: () => { throw new Error('not called during deploy'); },
  getPayerKey: () => { throw new Error('not called during deploy'); },
  getBatchNonce: () => { throw new Error('not called during deploy'); },
  getClaimAmount: () => { throw new Error('not called during deploy'); },
  getMerkleProof: () => { throw new Error('not called during deploy'); },
  getLeafKey: () => { throw new Error('not called during deploy'); },
  getClaimSecret: () => { throw new Error('not called during deploy'); },
  getReclaimPayerKey: () => { throw new Error('not called during deploy'); },
  getReclaimBatchNonce: () => { throw new Error('not called during deploy'); },
  getReclaimCoin: () => { throw new Error('not called during deploy'); },
  getRequesterKey: () => { throw new Error('not called during deploy'); },
  getRequestNonce: () => { throw new Error('not called during deploy'); },
  getMarkRequesterKey: () => { throw new Error('not called during deploy'); },
  getMarkRequestNonce: () => { throw new Error('not called during deploy'); },
};

// ────────────────────────── Main ──────────────────────────

log.info('=== TesseractCore Deployment ===');
log.info(`Network: ${NETWORK_ID} | Node: ${NODE_URL} | Proof: ${PROOF_SERVER}`);

log.info('Building genesis wallet...');
const { facade, shieldedSecretKeys, dustSecretKey } = await buildWallet();

log.info('Waiting for wallet sync...');
await Rx.firstValueFrom(
  facade.state().pipe(
    Rx.throttleTime(5_000),
    Rx.tap((s) => log.info(`Synced: ${s.isSynced}`)),
    Rx.filter((s) => s.isSynced),
  ),
);

const zkConfigProvider = new FilesystemZKConfigProvider();
const privateStateProvider = new InMemoryPrivateStateProvider();

// Proof provider — delegate to HttpProverClient
const httpProver = new HttpProverClient({ url: new URL(PROOF_SERVER) });
const costModel = ledger.CostModel.initialCostModel();
const proofProvider = {
  async proveTx(unprovenTx: Parameters<typeof httpProver.proveTransaction>[0]) {
    log.info('Generating ZK proof (this may take a minute)...');
    const proven = await httpProver.proveTransaction(unprovenTx, costModel);
    log.info('Proof generated.');
    return proven as UnboundTransaction;
  },
};

// Wallet provider — wrap WalletFacade
const walletProvider = {
  getCoinPublicKey() { return shieldedSecretKeys.coinPublicKey; },
  getEncryptionPublicKey() { return shieldedSecretKeys.encryptionPublicKey; },
  async balanceTx(tx: UnboundTransaction) {
    log.info('Balancing transaction (DUST fee payment)...');
    const ttl = new Date(Date.now() + 3_600_000);
    const recipe = await facade.balanceUnboundTransaction(
      tx,
      { shieldedSecretKeys, dustSecretKey },
      { ttl },
    );
    return facade.finalizeRecipe(recipe) as Promise<FinalizedTransaction>;
  },
};

// Midnight provider — submit via WalletFacade
const midnightProvider = {
  async submitTx(tx: FinalizedTransaction) {
    log.info('Submitting transaction...');
    const id = await facade.submitTransaction(tx);
    log.info(`TX submitted: ${id}`);
    return id;
  },
};

// Public data provider — minimal implementation for deploy
const publicDataProvider = {
  async queryContractState() { return null; },
  async queryZSwapAndContractState() { return null; },
  async queryDeployContractState() { return null; },
  async queryUnshieldedBalances() { return null; },
  async watchForContractState() { throw new Error('not needed for deploy'); },
  async watchForUnshieldedBalances() { throw new Error('not needed for deploy'); },
  async watchForDeployTxData() { throw new Error('not needed for deploy'); },
  async watchForTxData(txId: string) {
    const tx = await pollForTx(txId);
    return toFinalizedTxData(tx);
  },
  contractStateObservable() { throw new Error('not needed for deploy'); },
  unshieldedBalancesObservable() { throw new Error('not needed for deploy'); },
};

const providers = {
  zkConfigProvider,
  privateStateProvider,
  publicDataProvider,
  walletProvider,
  midnightProvider,
  proofProvider,
} as unknown as MidnightProviders<string, PrivateStateId, undefined>;

// Build compiled contract with witnesses + ZK assets path
const compiledContract = CompiledContract.make('TesseractCore', Contract).pipe(
  (c) => CompiledContract.withWitnesses(c, deployWitnesses),
  (c) => CompiledContract.withCompiledFileAssets(c, COMPILED_DIR),
);

log.info('\nDeploying TesseractCore to local devnet...');

const deployed = await deployContract(providers, {
  compiledContract,
  privateStateId: 'tesseract-core',
  initialPrivateState: undefined,
});

const contractAddress = deployed.deployTxData.public.contractAddress;
log.info(`\n✅ TesseractCore deployed!`);
log.info(`Contract address: ${contractAddress}`);

const out = {
  contractAddress,
  network: NETWORK_ID,
  node: NODE_URL,
  indexer: INDEXER_HTTP,
  deployedAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
log.info(`Saved to ${OUT_FILE}`);

process.exit(0);
