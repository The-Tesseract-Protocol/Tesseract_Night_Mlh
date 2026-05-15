/**
 * GATE-3 Integration Test — 2 recipients, 1 batch, 2 claims
 *
 * Run: npx tsx src/tests/gate3-integration.ts
 *
 * Scenario:
 *  Alice (payer): submits batch with Bob + Carol as recipients
 *  Bob: claims his payment
 *  Carol: claims her payment
 *
 * Verifies:
 *  - submitBatchRoot circuit accepts valid Merkle root + coin
 *  - claimPayment circuit accepts valid Merkle proof + nullifier
 *  - Double-spend rejected (Bob cannot claim twice)
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
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { encodeShieldedCoinInfo, encodeCoinPublicKey } from '@midnight-ntwrk/ledger-v8';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
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
import {
  ZKConfigProvider,
  createProverKey,
  createVerifierKey,
  createZKIR,
  SucceedEntirely,
} from '@midnight-ntwrk/midnight-js-types';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import type { MidnightProviders, PrivateStateId } from '@midnight-ntwrk/midnight-js-types';
import type { UnboundTransaction } from '@midnight-ntwrk/ledger-v8';

import { TesseractClient } from '../contract/client.js';
import { prepareSubmitBatch } from '../flows/submitBatchFlow.js';
import { prepareClaimPayment } from '../flows/claimPaymentFlow.js';
import { toHex, fromHex } from '../types/index.js';

// ── Config ───────────────────────────────────────────────────────────────────

const NETWORK_ID = 'undeployed';
const NODE_URL = 'http://127.0.0.1:9944';
const INDEXER_HTTP = 'http://127.0.0.1:8088/api/v3/graphql';
const INDEXER_WS = 'ws://127.0.0.1:8088/api/v3/graphql/ws';
const PROOF_SERVER = 'http://127.0.0.1:6300';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const COMPILED_DIR = path.resolve(PROJECT_ROOT, 'src', 'contract', 'compiled');
const KEYS_DIR = path.resolve(COMPILED_DIR, 'keys');
const ZKIR_DIR = path.resolve(COMPILED_DIR, 'zkir');

const DEPLOYED_ADDRESS = JSON.parse(
  fs.readFileSync(path.resolve(PROJECT_ROOT, 'scripts', 'deployed-address.json'), 'utf-8'),
).contractAddress as string;

// Genesis has shielded NIGHT — needed for submitBatchRoot (payer must have shielded coins)
const GENESIS_SEED_HEX = '0000000000000000000000000000000000000000000000000000000000000001';
const BOB_MNEMONIC = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo vote';
const CAROL_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title';

setNetworkId(NETWORK_ID);

const log = pino({
  level: 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } },
});

// ── Wallet builder ────────────────────────────────────────────────────────────

async function buildWalletFromHexSeed(hexSeed: string) {
  const seed = Buffer.from(hexSeed, 'hex');
  return _buildWallet(seed);
}

async function buildWalletFromMnemonic(mnemonic: string) {
  const { mnemonicToSeed } = await import('@scure/bip39');
  const seed = Buffer.from(await mnemonicToSeed(mnemonic.trim()));
  return _buildWallet(seed);
}

async function _buildWallet(seed: Buffer) {
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

// ── ZK Config ─────────────────────────────────────────────────────────────────

class FilesystemZKConfigProvider extends ZKConfigProvider<string> {
  async getZKIR(circuitId: string) {
    return createZKIR(new Uint8Array(fs.readFileSync(path.join(ZKIR_DIR, `${circuitId}.bzkir`))));
  }
  async getProverKey(circuitId: string) {
    return createProverKey(new Uint8Array(fs.readFileSync(path.join(KEYS_DIR, `${circuitId}.prover`))));
  }
  async getVerifierKey(circuitId: string) {
    return createVerifierKey(new Uint8Array(fs.readFileSync(path.join(KEYS_DIR, `${circuitId}.verifier`))));
  }
}

// ── Provider builder ──────────────────────────────────────────────────────────

type IndexerTx = { id: number; hash: string; protocolVersion: number; block: { height: number; timestamp: number; hash: string; author: string | null } };

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

async function pollForTx(identifier: string): Promise<IndexerTx> {
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const data = await gqlFetch(`{ transactions(offset: { identifier: "${identifier}" }) { id hash protocolVersion block { height timestamp hash author } } }`);
    const txs = data['transactions'] as IndexerTx[];
    if (txs.length > 0) {
      log.info(`TX confirmed at block ${txs[0].block.height}`);
      return txs[0];
    }
    if (i % 5 === 0) log.info(`Waiting for tx ${identifier}...`);
  }
  throw new Error(`TX ${identifier} never confirmed`);
}

class InMemoryPrivateStateProvider {
  private states = new Map<string, unknown>();
  private signingKeys = new Map<string, ledger.SigningKey>();
  private contractAddr: string = '';

  private scopedKey(id: string): string {
    if (!this.contractAddr) throw new Error('setContractAddress() must be called first');
    return `${this.contractAddr}:${id}`;
  }

  setContractAddress(address: string): void { this.contractAddr = address; }
  async set(id: string, state: unknown): Promise<void> { this.states.set(this.scopedKey(id), state); }
  async get(id: string): Promise<unknown> {
    const key = this.scopedKey(id);
    return this.states.has(key) ? this.states.get(key) : null;
  }
  async remove(id: string): Promise<void> { this.states.delete(this.scopedKey(id)); }
  async clear(): Promise<void> { this.states.clear(); }
  async setSigningKey(address: string, key: ledger.SigningKey): Promise<void> { this.signingKeys.set(address, key); }
  async getSigningKey(address: string): Promise<ledger.SigningKey | null> { return this.signingKeys.get(address) ?? null; }
  async removeSigningKey(address: string): Promise<void> { this.signingKeys.delete(address); }
  async clearSigningKeys(): Promise<void> { this.signingKeys.clear(); }
  async exportPrivateStates(): Promise<any> { throw new Error('not implemented'); }
  async importPrivateStates(): Promise<any> { throw new Error('not implemented'); }
}

function buildProviders(wallet: { facade: WalletFacade; shieldedSecretKeys: ledger.ZswapSecretKeys; dustSecretKey: ledger.DustSecretKey }): MidnightProviders<string, PrivateStateId, undefined> {
  const { facade, shieldedSecretKeys, dustSecretKey } = wallet;

  const httpProver = new HttpProverClient({ url: new URL(PROOF_SERVER) });
  const costModel = ledger.CostModel.initialCostModel();

  return {
    zkConfigProvider: new FilesystemZKConfigProvider(),
    privateStateProvider: new InMemoryPrivateStateProvider() as any,
    publicDataProvider: {
      async queryContractState(contractAddress: string) {
        const data = await gqlFetch(`{ contractAction(address: "${contractAddress}") { state } }`);
        const hexState = (data as any).contractAction?.state;
        if (!hexState) return null;
        return ContractState.deserialize(fromHex(hexState));
      },
      async queryZSwapAndContractState(contractAddress: string) {
        const data = await gqlFetch(`{ contractAction(address: "${contractAddress}") { state zswapState } }`);
        const action = (data as any).contractAction;
        if (!action?.state || !action?.zswapState) return null;
        return [
          ledger.ZswapChainState.deserialize(fromHex(action.zswapState)),
          ContractState.deserialize(fromHex(action.state)),
          ledger.LedgerParameters.initialParameters(),
        ] as [ledger.ZswapChainState, ContractState, ledger.LedgerParameters];
      },
      async queryDeployContractState(contractAddress: string) {
        const data = await gqlFetch(`{
          contractAction(address: "${contractAddress}") {
            ... on ContractDeploy { state }
            ... on ContractUpdate { state }
            ... on ContractCall {
              deploy { transaction { contractActions { address state } } }
            }
          }
        }`);
        const action = (data as any).contractAction;
        if (!action) return null;
        const stateHex = 'deploy' in action
          ? action.deploy?.transaction?.contractActions?.find((a: any) => a.address === contractAddress)?.state
          : action.state;
        return stateHex ? ContractState.deserialize(fromHex(stateHex)) : null;
      },
      async queryUnshieldedBalances() { return null; },
      async watchForContractState() { throw new Error('not needed'); },
      async watchForUnshieldedBalances() { throw new Error('not needed'); },
      async watchForDeployTxData(contractAddress: string) {
        const data = await gqlFetch(`{ contractAction(address: "${contractAddress}") { transaction { id hash protocolVersion block { height timestamp hash author } } } }`);
        const tx = (data as any).contractAction.transaction;
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
      },
      async watchForTxData(txId: string) {
        const tx = await pollForTx(txId);
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
      },
      contractStateObservable() { throw new Error('not needed'); },
      unshieldedBalancesObservable() { throw new Error('not needed'); },
    } as any,
    walletProvider: {
      getCoinPublicKey() { return shieldedSecretKeys.coinPublicKey; },
      getEncryptionPublicKey() { return shieldedSecretKeys.encryptionPublicKey; },
      async balanceTx(tx: UnboundTransaction) {
        const ttl = new Date(Date.now() + 3_600_000);
        const recipe = await facade.balanceUnboundTransaction(
          tx as any,
          { shieldedSecretKeys, dustSecretKey },
          { ttl },
        );
        return facade.finalizeRecipe(recipe) as any;
      },
    } as any,
    midnightProvider: {
      async submitTx(tx: any) {
        const id = await facade.submitTransaction(tx);
        log.info(`TX submitted: ${id}`);
        return id;
      },
    } as any,
    proofProvider: {
      async proveTx(unprovenTx: any) {
        log.info('Generating ZK proof...');
        const proven = await httpProver.proveTransaction(unprovenTx, costModel);
        log.info('Proof done.');
        return proven as any;
      },
    } as any,
  } as any;
}

// ── Sync helper ───────────────────────────────────────────────────────────────

async function waitSync(facade: WalletFacade, name: string) {
  log.info(`Syncing ${name} wallet...`);
  await Rx.firstValueFrom(
    facade.state().pipe(
      Rx.filter((s) => s.isSynced),
    ),
  );
  log.info(`${name} synced.`);
}

// ── Integration Test ──────────────────────────────────────────────────────────

log.info('=== GATE-3 Integration Test ===');
log.info(`Contract: ${DEPLOYED_ADDRESS}`);

// Build wallets — genesis is payer (has shielded NIGHT), Bob + Carol are recipients
log.info('\nBuilding wallets...');
const genesis = await buildWalletFromHexSeed(GENESIS_SEED_HEX);
const bob = await buildWalletFromMnemonic(BOB_MNEMONIC);
const carol = await buildWalletFromMnemonic(CAROL_MNEMONIC);

await Promise.all([
  waitSync(genesis.facade, 'Genesis'),
  waitSync(bob.facade, 'Bob'),
  waitSync(carol.facade, 'Carol'),
]);

const genesisSyncedState = await genesis.facade.waitForSyncedState();
const genesisBalance = genesisSyncedState.shielded.balances;
log.info(`Genesis shielded balance: ${Object.entries(genesisBalance).map(([k,v]) => `${k}:${v}`).join(', ')}`);

// CoinPublicKey is a string in ledger-v8; use encodeCoinPublicKey to get bytes
const bobKey = toHex(encodeCoinPublicKey(bob.shieldedSecretKeys.coinPublicKey));
const carolKey = toHex(encodeCoinPublicKey(carol.shieldedSecretKeys.coinPublicKey));
log.info(`Bob key:   ${bobKey}`);
log.info(`Carol key: ${carolKey}`);

// ── Step 1: Genesis picks a coin for batch payment ─────────────────────────

log.info('\n[STEP 1] Finding genesis coin for batch...');

const availableCoins = genesisSyncedState.shielded.availableCoins;
log.info(`Genesis has ${availableCoins.length} available shielded coin(s)`);

if (availableCoins.length === 0) {
  log.error('Genesis has no available shielded coins. Chain may need more blocks.');
  process.exit(1);
}

// Pick smallest coin — amounts must sum to EXACTLY coin.value (circuit asserts this)
const useCoin = availableCoins.reduce((a, b) => a.coin.value <= b.coin.value ? a : b);
const encodedCoin = encodeShieldedCoinInfo(useCoin.coin);
const TOTAL_AMOUNT = useCoin.coin.value;
// Split 40/60
const BATCH_AMOUNT_BOB = (TOTAL_AMOUNT * 40n) / 100n;
const BATCH_AMOUNT_CAROL = TOTAL_AMOUNT - BATCH_AMOUNT_BOB;

log.info(`Using coin: value=${TOTAL_AMOUNT} (Bob=${BATCH_AMOUNT_BOB}, Carol=${BATCH_AMOUNT_CAROL})`);

const genesisKeyHex = toHex(encodeCoinPublicKey(genesis.shieldedSecretKeys.coinPublicKey));

// ── Step 2: Alice prepares + submits batch ─────────────────────────────────

log.info('\n[STEP 2] Genesis prepares batch...');
const batchPrep = prepareSubmitBatch({
  recipients: [
    { key: bobKey, amount: BATCH_AMOUNT_BOB },
    { key: carolKey, amount: BATCH_AMOUNT_CAROL },
  ],
  deadlineHours: 72,
  payerKeyHex: genesisKeyHex,
  coin: {
    nonce: encodedCoin.nonce,
    color: encodedCoin.color,
    value: useCoin.coin.value,  // full coin value — circuit locks total amount internally
  },
  appBaseUrl: 'http://localhost:5173/',
});

log.info(`Batch ID:    ${batchPrep.batchIdHex}`);
log.info(`Merkle root: ${batchPrep.privateState.merkleRoot}`);
log.info(`Deadline:    ${batchPrep.deadline}`);

const genesisProviders = buildProviders(genesis);
const genesisClient = await TesseractClient.connect(genesisProviders, DEPLOYED_ADDRESS, COMPILED_DIR);

log.info('Genesis submitting batch...');
const submitTxHash = await genesisClient.submitBatch(
  batchPrep.batchId,
  batchPrep.deadline,
  batchPrep.coin,
  batchPrep.privateState,
);
log.info(`✅ submitBatchRoot TX: ${submitTxHash}`);

// ── Step 3: Bob claims ─────────────────────────────────────────────────────

log.info('\n[STEP 3] Bob claims payment...');
const bobClaim = batchPrep.result.claimPackages[0];
const bobClaimPrep = await prepareClaimPayment({
  batchIdHex: bobClaim.batchId,
  leafIndex: bobClaim.leafIndex,
  amount: bobClaim.amount,
  claimSecretHex: bobClaim.claimSecret,
  leafKeyHex: bobClaim.leafKey,
  serializedProof: {
    leaf: toHex(bobClaim.merkleProof.leaf),
    path: bobClaim.merkleProof.path.map(e => ({
      sibling: { field: e.sibling.field.toString() },
      goes_left: e.goes_left,
    })),
  },
});

const bobProviders = buildProviders(bob);
const bobClient = await TesseractClient.connect(bobProviders, DEPLOYED_ADDRESS, COMPILED_DIR);

const bobClaimTx = await bobClient.claimPayment(
  bobClaimPrep.batchId,
  bobClaimPrep.encryptedAuditMemo,
  bobClaimPrep.privateState,
);
log.info(`✅ claimPayment (Bob) TX: ${bobClaimTx}`);

// ── Step 4: Carol claims ───────────────────────────────────────────────────

log.info('\n[STEP 4] Carol claims payment...');
const carolClaim = batchPrep.result.claimPackages[1];
const carolClaimPrep = await prepareClaimPayment({
  batchIdHex: carolClaim.batchId,
  leafIndex: carolClaim.leafIndex,
  amount: carolClaim.amount,
  claimSecretHex: carolClaim.claimSecret,
  leafKeyHex: carolClaim.leafKey,
  serializedProof: {
    leaf: toHex(carolClaim.merkleProof.leaf),
    path: carolClaim.merkleProof.path.map(e => ({
      sibling: { field: e.sibling.field.toString() },
      goes_left: e.goes_left,
    })),
  },
});

const carolProviders = buildProviders(carol);
const carolClient = await TesseractClient.connect(carolProviders, DEPLOYED_ADDRESS, COMPILED_DIR);

const carolClaimTx = await carolClient.claimPayment(
  carolClaimPrep.batchId,
  carolClaimPrep.encryptedAuditMemo,
  carolClaimPrep.privateState,
);
log.info(`✅ claimPayment (Carol) TX: ${carolClaimTx}`);

// ── Step 5: Double-spend check (Bob tries to claim again) ──────────────────

log.info('\n[STEP 5] Double-spend check — Bob tries to claim again (expect rejection)...');
let doubleSpendRejected = false;
try {
  await bobClient.claimPayment(
    bobClaimPrep.batchId,
    bobClaimPrep.encryptedAuditMemo,
    bobClaimPrep.privateState,
  );
  log.error('DOUBLE SPEND NOT REJECTED — CONTRACT BUG');
} catch (err: any) {
  doubleSpendRejected = true;
  log.info(`✅ Double-spend rejected: ${err?.message?.slice(0, 80) ?? err}`);
}

// ── Summary ────────────────────────────────────────────────────────────────

log.info('\n=== GATE-3 RESULTS ===');
log.info(`submitBatchRoot:   ✅ ${submitTxHash}`);
log.info(`claimPayment Bob:  ✅ ${bobClaimTx}`);
log.info(`claimPayment Carol:✅ ${carolClaimTx}`);
log.info(`Double-spend check:${doubleSpendRejected ? '✅ REJECTED' : '❌ NOT REJECTED'}`);

if (!doubleSpendRejected) {
  log.error('GATE-3 FAILED: double-spend not rejected');
  process.exit(1);
}

// Write GATE-3 artifact
const gate3 = {
  gate: 'GATE-3',
  status: 'PASSED',
  contractAddress: DEPLOYED_ADDRESS,
  submitBatchRoot: { txHash: submitTxHash, batchId: batchPrep.batchIdHex },
  claims: [
    { recipient: 'Bob', txHash: bobClaimTx, amount: BATCH_AMOUNT_BOB.toString() },
    { recipient: 'Carol', txHash: carolClaimTx, amount: BATCH_AMOUNT_CAROL.toString() },
  ],
  doubleSpendRejected,
  passedAt: new Date().toISOString(),
};
const gateFile = path.resolve(PROJECT_ROOT, 'agents', 'interfaces', 'GATE-3-integration.json');
fs.writeFileSync(gateFile, JSON.stringify(gate3, null, 2));
log.info(`\n✅ GATE-3 PASSED — saved to ${gateFile}`);

process.exit(0);
