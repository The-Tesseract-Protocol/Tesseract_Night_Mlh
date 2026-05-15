// @ts-ignore
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';
// @ts-ignore
globalThis.WebSocket = WebSocket;
// @ts-ignore
globalThis.Buffer = Buffer;

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { encodeShieldedCoinInfo, encodeCoinPublicKey } from '@midnight-ntwrk/ledger-v8';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { createKeystore, InMemoryTransactionHistoryStorage, PublicKey as UnshieldedPublicKey, UnshieldedWallet } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as Rx from 'rxjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Contract } from '../contract/compiled/contract/index.js';
import { toHex, fromHex, deadlineFromHours, randomBytes32 } from '../types/index.js';
import { buildMerkleTree } from '../merkle/merkle.js';
import { hashPaymentLeaf } from '../contract/descriptors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const COMPILED_DIR = path.resolve(PROJECT_ROOT, 'src', 'contract', 'compiled');
const KEYS_DIR = path.resolve(COMPILED_DIR, 'keys');

setNetworkId('undeployed');
const config = {
  networkId: 'undeployed',
  indexerClientConnection: { indexerHttpUrl: 'http://127.0.0.1:8088/api/v3/graphql', indexerWsUrl: 'ws://127.0.0.1:8088/api/v3/graphql/ws' },
  provingServerUrl: new URL('http://127.0.0.1:6300'),
  relayURL: new URL('ws://127.0.0.1:9944'),
  costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
};

const seed = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
const hd = HDWallet.fromSeed(seed);
if (hd.type !== 'seedOk') throw new Error();
const derived = hd.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
if (derived.type !== 'keysDerived') throw new Error();
const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);
const unshieldedKeystore = createKeystore(derived.keys[Roles.NightExternal], 'undeployed');

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
const payerKeyBytes = encodeCoinPublicKey(shieldedSecretKeys.coinPublicKey);

console.log('Coin value:', useCoin.coin.value.toString());
console.log('Encoded coin nonce len:', (encodedCoin as any).nonce.length);
console.log('Encoded coin color len:', (encodedCoin as any).color.length);
console.log('Payer key len:', payerKeyBytes.length);
console.log('mt_index of coin:', useCoin.coin.mt_index?.toString());

// Build minimal batch
const recipient1Key = fromHex('a57ca60820991dc4c72543529b612292d895b72de345def0f75b9dafdd3e33c6');
const leaf1 = hashPaymentLeaf({ bytes: recipient1Key }, useCoin.coin.value);
const { root: merkleRoot } = buildMerkleTree([leaf1]);
const batchNonce = randomBytes32();
const batchId = randomBytes32();
const deadline = deadlineFromHours(72);

console.log('\nMerkle root:', merkleRoot.toString());
console.log('Deadline:', deadline.toString());
console.log('Now epoch:', BigInt(Math.floor(Date.now()/1000)).toString());
console.log('Deadline is in future:', deadline > BigInt(Math.floor(Date.now()/1000)));

// Build witnesses for manual circuit invocation
const pendingState = {
  coin: { nonce: (encodedCoin as any).nonce, color: (encodedCoin as any).color, value: useCoin.coin.value },
  merkleRoot,
  totalAmount: useCoin.coin.value,
  payerKey: { bytes: payerKeyBytes },
  batchNonce,
};

const witnesses = {
  getBatchCoin: (ctx: any) => [ctx.privateState, pendingState.coin],
  getMerkleRoot: (ctx: any) => [ctx.privateState, pendingState.merkleRoot],
  getTotalAmount: (ctx: any) => [ctx.privateState, pendingState.totalAmount],
  getPayerKey: (ctx: any) => [ctx.privateState, pendingState.payerKey],
  getBatchNonce: (ctx: any) => [ctx.privateState, pendingState.batchNonce],
  getClaimAmount: () => { throw new Error('wrong circuit'); },
  getMerkleProof: () => { throw new Error('wrong circuit'); },
  getLeafKey: () => { throw new Error('wrong circuit'); },
  getClaimSecret: () => { throw new Error('wrong circuit'); },
  getReclaimPayerKey: () => { throw new Error('wrong circuit'); },
  getReclaimBatchNonce: () => { throw new Error('wrong circuit'); },
  getRequesterKey: () => { throw new Error('wrong circuit'); },
  getRequestNonce: () => { throw new Error('wrong circuit'); },
  getMarkRequesterKey: () => { throw new Error('wrong circuit'); },
  getMarkRequestNonce: () => { throw new Error('wrong circuit'); },
};

const contract = new Contract(witnesses as any);
console.log('\nContract initialized OK');
console.log('DONE — no direct circuit execution in debug mode');
console.log('\nKey question: does the proof server version (8.0.3) match the compiler version (0.31.0)?');
console.log('Let us check what node version and runtime version the proof server expects...');

process.exit(0);
