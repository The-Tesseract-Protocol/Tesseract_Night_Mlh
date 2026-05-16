/**
 * GATE-3 Integration Test — 2 recipients, 1 batch, 2 sequential claims
 *
 * Run: npx tsx src/tests/gate3-integration.ts
 *
 * Scenario:
 *  Alice (payer): submits batch with Bob + Carol as recipients
 *  Bob:   claims his payment (first)
 *  Carol: claims her payment (after Bob's block processed — no Error 186)
 *
 * Verifies:
 *  - submitBatchRoot circuit accepts valid Merkle root
 *  - depositRecipientCoin deposits one coin per recipient (sequential)
 *  - claimPayment accepts valid Merkle proof + nullifier (sequential)
 *  - Double-spend rejected (Bob cannot claim twice)
 *  - createPaymentRequest + markRequestPaid circuits
 *
 * KEY CONSTRAINT: Each TX that changes ZSwap Merkle root must be confirmed
 * and the wallet must process the block before the next TX is built.
 * Error 186 (EffectsCheckFailure) occurs when declared effects don't match
 * the on-chain state — caused by stale wallet UTXO / Merkle tree.
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
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import {
  ZKConfigProvider,
  createProverKey,
  createVerifierKey,
  createZKIR,
  SucceedEntirely,
} from '@midnight-ntwrk/midnight-js-types';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import type { MidnightProviders, PrivateStateId } from '@midnight-ntwrk/midnight-js-types';
import type { UnprovenTransaction } from '@midnight-ntwrk/ledger-v8';

import { TesseractClient } from '../contract/client.js';
import { prepareSubmitBatch } from '../flows/submitBatchFlow.js';
import { prepareClaimPayment } from '../flows/claimPaymentFlow.js';
import { prepareCreatePaymentRequest } from '../flows/paymentRequestFlow.js';
import { toHex, fromHex } from '../types/index.js';

// ── Config ───────────────────────────────────────────────────────────────────

const NETWORK_ID = 'undeployed';
const NODE_URL = 'http://127.0.0.1:9944';
const INDEXER_HTTP = 'http://127.0.0.1:8088/api/v3/graphql';
const INDEXER_WS = 'ws://127.0.0.1:8088/api/v3/graphql/ws';
const PROOF_SERVER = 'http://127.0.0.1:6300';

// Devnet block time = 6s, finality ~18s.
// syncPause after each TX gives wallet time to apply the block's ZSwap update.
const POST_TX_SLEEP_MS = 25_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const COMPILED_DIR = path.resolve(PROJECT_ROOT, 'src', 'contract', 'compiled');
const KEYS_DIR = path.resolve(COMPILED_DIR, 'keys');
const ZKIR_DIR = path.resolve(COMPILED_DIR, 'zkir');

const DEPLOYED_ADDRESS = JSON.parse(
  fs.readFileSync(path.resolve(PROJECT_ROOT, 'scripts', 'deployed-address.json'), 'utf-8'),
).contractAddress as string;

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
  return _buildWallet(Buffer.from(hexSeed, 'hex'));
}

async function buildWalletFromMnemonic(mnemonic: string) {
  const { mnemonicToSeed } = await import('@scure/bip39');
  return _buildWallet(Buffer.from(await mnemonicToSeed(mnemonic.trim())));
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

// ── Indexer helpers ───────────────────────────────────────────────────────────

type IndexerTx = {
  id: number; hash: string; protocolVersion: number;
  block: { height: number; timestamp: number; hash: string; author: string | null };
};

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

/**
 * Poll indexer for a transaction by hash or submission identifier.
 *
 * The indexer's TransactionOffset type supports two lookup fields:
 *   hash:       32-byte tx hash (64 hex chars) — from callTx result via _hash()
 *   identifier: 33-byte submission ID (66 hex chars) — from facade.submitTransaction()
 *
 * This function auto-detects which field to use based on string length.
 * Internal SDK calls (watchForTxData) use the submission identifier.
 * External verification calls use the tx hash.
 */
async function pollForTx(hashOrId: string): Promise<IndexerTx> {
  const field = hashOrId.length === 66 ? 'identifier' : 'hash';
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const data = await gqlFetch(
      `{ transactions(offset: { ${field}: "${hashOrId}" }) { id hash protocolVersion block { height timestamp hash author } } }`
    );
    const txs = data['transactions'] as IndexerTx[];
    if (txs.length > 0) {
      log.info(`  TX confirmed: block=${txs[0].block.height} hash=${txs[0].hash.slice(0, 12)}...`);
      return txs[0];
    }
    if (i % 5 === 0) log.info(`  Waiting for tx ${hashOrId.slice(0, 12)}...`);
  }
  throw new Error(`TX ${hashOrId} never confirmed after 10 minutes`);
}

// ── Private state provider ────────────────────────────────────────────────────

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

// ── Provider builder ──────────────────────────────────────────────────────────

function buildProviders(
  wallet: { facade: WalletFacade; shieldedSecretKeys: ledger.ZswapSecretKeys; dustSecretKey: ledger.DustSecretKey },
  feeWallet?: { facade: WalletFacade; shieldedSecretKeys: ledger.ZswapSecretKeys; dustSecretKey: ledger.DustSecretKey }
): MidnightProviders<string, PrivateStateId, undefined> {
  const { shieldedSecretKeys } = wallet;
  const payer = feeWallet || wallet;
  const zkConfigProvider = new FilesystemZKConfigProvider();

  return {
    zkConfigProvider,
    privateStateProvider: new InMemoryPrivateStateProvider() as any,
    publicDataProvider: {
      async queryContractState(contractAddress: string) {
        const data = await gqlFetch(`{ contractAction(address: "${contractAddress}") { state } }`);
        const hexState = (data as any).contractAction?.state;
        if (!hexState) return null;
        return ContractState.deserialize(fromHex(hexState));
      },
      async queryZSwapAndContractState(contractAddress: string) {
        const data = await gqlFetch(`{ contractAction(address: "${contractAddress}") { state zswapState transaction { block { ledgerParameters } } } }`);
        const action = (data as any).contractAction;
        if (!action?.state || !action?.zswapState) return null;
        const lpHex = action.transaction?.block?.ledgerParameters;
        return [
          ledger.ZswapChainState.deserialize(fromHex(action.zswapState)),
          ContractState.deserialize(fromHex(action.state)),
          lpHex ? ledger.LedgerParameters.deserialize(fromHex(lpHex)) : ledger.LedgerParameters.initialParameters(),
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
          tx: null as never, status: SucceedEntirely,
          txId: tx.hash, identifiers: [tx.hash], txHash: tx.hash,
          blockHash: tx.block.hash, blockHeight: tx.block.height,
          blockTimestamp: tx.block.timestamp, blockAuthor: tx.block.author,
          indexerId: tx.id, protocolVersion: tx.protocolVersion,
        };
      },
      async watchForTxData(txId: string) {
        // txId from facade.submitTransaction() is 66 hex chars (33-byte submission identifier)
        const tx = await pollForTx(txId);
        return {
          tx: null as never, status: SucceedEntirely,
          txId: tx.hash, identifiers: [tx.hash], txHash: tx.hash,
          blockHash: tx.block.hash, blockHeight: tx.block.height,
          blockTimestamp: tx.block.timestamp, blockAuthor: tx.block.author,
          indexerId: tx.id, protocolVersion: tx.protocolVersion,
        };
      },
      contractStateObservable() { throw new Error('not needed'); },
      unshieldedBalancesObservable() { throw new Error('not needed'); },
    } as any,
    walletProvider: {
      getCoinPublicKey() {
        return typeof shieldedSecretKeys.coinPublicKey === 'string'
          ? shieldedSecretKeys.coinPublicKey
          : toHex(shieldedSecretKeys.coinPublicKey);
      },
      getEncryptionPublicKey() {
        return typeof shieldedSecretKeys.encryptionPublicKey === 'string'
          ? shieldedSecretKeys.encryptionPublicKey
          : toHex(shieldedSecretKeys.encryptionPublicKey);
      },
      async balanceTx(tx: UnprovenTransaction) {
        const ttl = new Date(Date.now() + 3_600_000);
        const recipe = await payer.facade.balanceUnboundTransaction(
          tx as any,
          { shieldedSecretKeys: payer.shieldedSecretKeys, dustSecretKey: payer.dustSecretKey },
          { ttl },
        );
        return payer.facade.finalizeRecipe(recipe) as any;
      },
    } as any,
    midnightProvider: {
      async submitTx(tx: any) {
        const id = await payer.facade.submitTransaction(tx);
        log.info(`  TX submitted id=${id.slice(0, 12)}...`);
        return id;
      },
    } as any,
    proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
  } as any;
}

// ── Sync helpers ──────────────────────────────────────────────────────────────

/** Initial wallet sync — waits for first isSynced emission. */
async function waitInitialSync(facade: WalletFacade, name: string) {
  log.info(`Syncing ${name}...`);
  await Rx.firstValueFrom(facade.state().pipe(Rx.filter((s: any) => s.isSynced)));
  log.info(`${name} synced.`);
}

/**
 * Post-TX block propagation pause.
 *
 * WalletFacade.waitForSyncedState() resolves immediately if the wallet already
 * reports isSynced — it does NOT wait for the NEXT block. After a TX is
 * confirmed on-chain, the wallet needs time to apply the block update
 * (ZSwap apply_collapsed_update) so its local UTXO set reflects the change.
 *
 * Without this pause, the next TX is built against stale wallet state,
 * causing Error 186 (EffectsCheckFailure / nullifier/commitment mismatch).
 *
 * Devnet block time = 6s. 25s > 4 block times — guarantees propagation.
 */
async function syncPause(label: string, ms = POST_TX_SLEEP_MS, ...facades: WalletFacade[]) {
  log.info(`  [sync] ${label}: waiting ${ms / 1000}s for ZSwap block propagation...`);
  await new Promise(r => setTimeout(r, ms));
  // After sleep, confirm each wallet has processed the new block.
  // firstValueFrom resolves immediately if already isSynced; waits if still processing.
  if (facades.length > 0) {
    await Promise.all(
      facades.map(f => Rx.firstValueFrom(f.state().pipe(Rx.filter((s: any) => s.isSynced))))
    );
  }
  log.info(`  [sync] ${label}: ready.`);
}

// ── Integration Test ──────────────────────────────────────────────────────────

log.info('=== GATE-3 Integration Test — Path A (sequential) ===');
log.info(`Contract: ${DEPLOYED_ADDRESS}`);

const genesis = await buildWalletFromHexSeed(GENESIS_SEED_HEX);
const bob     = await buildWalletFromMnemonic(BOB_MNEMONIC);
const carol   = await buildWalletFromMnemonic(CAROL_MNEMONIC);

await Promise.all([
  waitInitialSync(genesis.facade, 'Genesis'),
  waitInitialSync(bob.facade,     'Bob'),
  waitInitialSync(carol.facade,   'Carol'),
]);

const syncedState = await genesis.facade.waitForSyncedState();
log.info(`Genesis balance: ${Object.entries(syncedState.shielded.balances).map(([k, v]) => `${k}:${v}`).join(', ')}`);

const genesisKeyHex = typeof genesis.shieldedSecretKeys.coinPublicKey === 'string'
  ? genesis.shieldedSecretKeys.coinPublicKey
  : toHex(genesis.shieldedSecretKeys.coinPublicKey);
const bobKey = typeof bob.shieldedSecretKeys.coinPublicKey === 'string'
  ? bob.shieldedSecretKeys.coinPublicKey
  : toHex(bob.shieldedSecretKeys.coinPublicKey);
const carolKey = typeof carol.shieldedSecretKeys.coinPublicKey === 'string'
  ? carol.shieldedSecretKeys.coinPublicKey
  : toHex(carol.shieldedSecretKeys.coinPublicKey);
log.info(`Bob key:   ${bobKey}`);
log.info(`Carol key: ${carolKey}`);

// ── Step 1: Prepare batch ────────────────────────────────────────────────────
log.info('\n[STEP 1] Preparing batch...');

const batchPrep = prepareSubmitBatch({
  recipients: [
    { key: bobKey,   amount: 100_000_000n },
    { key: carolKey, amount: 150_000_000n },
  ],
  deadlineHours: 72,
  payerKeyHex: genesisKeyHex,
  appBaseUrl: 'http://localhost:5173/',
});
log.info(`Batch ID:    ${batchPrep.batchIdHex}`);
log.info(`Merkle root: ${batchPrep.privateState.merkleRoot}`);

const genesisProviders = buildProviders(genesis);
const genesisClient    = await TesseractClient.connect(genesisProviders, DEPLOYED_ADDRESS, COMPILED_DIR);

// ── Step 2: submitBatchRoot ──────────────────────────────────────────────────
log.info('\n[STEP 2] Submitting batch root...');
const submitTxHash = await genesisClient.submitBatch(
  batchPrep.batchId,
  batchPrep.deadline,
  batchPrep.privateState,
);
log.info(`✅ submitBatchRoot TX: ${submitTxHash}`);
// Must wait before deposits — genesis wallet needs to process the block
// and get the change note from the submitBatch fee payment.
await syncPause('Genesis post-submitBatch', POST_TX_SLEEP_MS, genesis.facade);

// ── Step 3: depositRecipientCoin (sequential, one per recipient) ─────────────
log.info('\n[STEP 3] Depositing per-recipient coins (sequential)...');
for (let i = 0; i < batchPrep.deposits.length; i++) {
  const dep = batchPrep.deposits[i];
  log.info(`  Deposit ${i + 1}/${batchPrep.deposits.length}: amount=${dep.coin.value}`);
  const depTxHash = await genesisClient.depositCoin(dep.batchId, dep.recipientLeafHash, dep.coin);
  log.info(`  ✅ deposit TX: ${depTxHash}`);
  // Between deposits: sync so change note from deposit fee is available for next TX
  if (i < batchPrep.deposits.length - 1) {
    await syncPause(`Genesis deposit ${i + 1}`, POST_TX_SLEEP_MS, genesis.facade);
  }
}
// After last deposit: extra time for Bob + Carol wallets to see committed coins
await syncPause('All wallets post-deposits', 30_000, genesis.facade, bob.facade, carol.facade);

// ── Step 4: Fetch recipient coins from indexer ────────────────────────────────
log.info('\n[STEP 4] Fetching recipient coins from indexer...');

const bobPkg      = batchPrep.claimPackages[0];
const carolPkg    = batchPrep.claimPackages[1];
const bobLeafHash   = fromHex(batchPrep.payerRecord.leafHashes[0]);
const carolLeafHash = fromHex(batchPrep.payerRecord.leafHashes[1]);

let bobCoin   = await genesisClient.getRecipientCoin(batchPrep.batchId, bobLeafHash);
let carolCoin = await genesisClient.getRecipientCoin(batchPrep.batchId, carolLeafHash);

for (let attempt = 0; attempt < 5 && (!bobCoin || !carolCoin); attempt++) {
  await new Promise(r => setTimeout(r, 3000));
  if (!bobCoin)   bobCoin   = await genesisClient.getRecipientCoin(batchPrep.batchId, bobLeafHash);
  if (!carolCoin) carolCoin = await genesisClient.getRecipientCoin(batchPrep.batchId, carolLeafHash);
}
if (!bobCoin)   throw new Error('Bob coin not found in indexer');
if (!carolCoin) throw new Error('Carol coin not found in indexer');
log.info(`Bob coin:   value=${bobCoin.value}, mt_index=${bobCoin.mt_index}`);
log.info(`Carol coin: value=${carolCoin.value}, mt_index=${carolCoin.mt_index}`);

// ── Step 5: Sequential claims ─────────────────────────────────────────────────
// SERIAL only — each claim changes ZSwap Merkle root.
// Next claimer's wallet must process the previous claim's block before building its proof.
log.info('\n[STEP 5] Sequential claims...');

const bobProviders   = buildProviders(bob, genesis);
const carolProviders = buildProviders(carol, genesis);
const bobClient      = await TesseractClient.connect(bobProviders,   DEPLOYED_ADDRESS, COMPILED_DIR);
const carolClient    = await TesseractClient.connect(carolProviders, DEPLOYED_ADDRESS, COMPILED_DIR);

// ── Step 5a: Bob claims ──────────────────────────────────────────────────────
log.info('\n[STEP 5a] Bob claiming...');
const bobClaimPrep = await prepareClaimPayment({
  batchIdHex:     bobPkg.batchId,
  leafIndex:      bobPkg.leafIndex,
  leafHashHex:    batchPrep.payerRecord.leafHashes[0],
  amount:         bobPkg.amount,
  claimSecretHex: bobPkg.claimSecret,
  leafKeyHex:     bobPkg.leafKey,
  serializedProof: {
    leaf: toHex(bobPkg.merkleProof.leaf),
    path: bobPkg.merkleProof.path.map(e => ({
      sibling: { field: e.sibling.field.toString() },
      goes_left: e.goes_left,
    })),
  },
  recipientCoin: bobCoin,
});

const bobTxHash = await bobClient.claimPayment(
  bobClaimPrep.batchId,
  bobClaimPrep.encryptedAuditMemo,
  bobClaimPrep.privateState,
);
log.info(`✅ Bob claimed: ${bobTxHash}`);

// Carol's wallet must process Bob's block — Bob's claim changes ZSwap Merkle root.
// Carol's wallet uses its local ZSwap tree when balancing her claim TX.
// Without this pause, Carol's proof references a stale root → Error 186.
await syncPause('Carol wallet post-Bob-claim', POST_TX_SLEEP_MS, carol.facade, genesis.facade);

// ── Step 5b: Carol claims (proof built + submitted after Bob's block) ─────────
log.info('\n[STEP 5b] Carol claiming...');
const carolClaimPrep = await prepareClaimPayment({
  batchIdHex:     carolPkg.batchId,
  leafIndex:      carolPkg.leafIndex,
  leafHashHex:    batchPrep.payerRecord.leafHashes[1],
  amount:         carolPkg.amount,
  claimSecretHex: carolPkg.claimSecret,
  leafKeyHex:     carolPkg.leafKey,
  serializedProof: {
    leaf: toHex(carolPkg.merkleProof.leaf),
    path: carolPkg.merkleProof.path.map(e => ({
      sibling: { field: e.sibling.field.toString() },
      goes_left: e.goes_left,
    })),
  },
  recipientCoin: carolCoin,
});

const carolTxHash = await carolClient.claimPayment(
  carolClaimPrep.batchId,
  carolClaimPrep.encryptedAuditMemo,
  carolClaimPrep.privateState,
);
log.info(`✅ Carol claimed: ${carolTxHash}`);

log.info('\n✅ GATE-3 PASSED — Path A sequential claims succeeded');

// ── Step 6: Double-spend rejected ─────────────────────────────────────────────
log.info('\n[STEP 6] Double-spend guard (Bob re-claim must fail)...');
try {
  await bobClient.claimPayment(bobClaimPrep.batchId, bobClaimPrep.encryptedAuditMemo, bobClaimPrep.privateState);
  log.error('❌ FAIL: double-spend was NOT rejected');
  process.exit(1);
} catch (e) {
  log.info(`✅ Double-spend correctly rejected: ${(e as Error).message}`);
}

// ── Step 7: Payment Request Flow ──────────────────────────────────────────────
log.info('\n[STEP 7] Payment Request Flow...');
const reqPrep = prepareCreatePaymentRequest({
  requesterKeyHex: genesisKeyHex,
  deadlineHours: 24,
  amount: 500_000n,
  description: 'Hackathon Coffee',
});

const reqTxHash = await genesisClient.createRequest(reqPrep.requestId, reqPrep.deadline, reqPrep.privateState);
log.info(`✅ Request Created: ${reqTxHash}`);
await syncPause('post-createRequest', 15_000, genesis.facade);

const markTxHash = await genesisClient.markPaid(reqPrep.requestId, reqPrep.privateState);
log.info(`✅ Request Marked Paid: ${markTxHash}`);

log.info('\n✨ ALL FLOWS VERIFIED SUCCESSFUL ✨');
process.exit(0);
