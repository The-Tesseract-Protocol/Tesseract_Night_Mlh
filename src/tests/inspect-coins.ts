// @ts-ignore
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';
// @ts-ignore
globalThis.WebSocket = WebSocket;
// @ts-ignore
globalThis.Buffer = Buffer;

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { createKeystore, InMemoryTransactionHistoryStorage, PublicKey as UnshieldedPublicKey, UnshieldedWallet } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as Rx from 'rxjs';

setNetworkId('undeployed');
const INDEXER_HTTP = 'http://127.0.0.1:8088/api/v3/graphql';
const INDEXER_WS = 'ws://127.0.0.1:8088/api/v3/graphql/ws';
const PROOF_SERVER = 'http://127.0.0.1:6300';
const NODE_URL = 'ws://127.0.0.1:9944';

const seed = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
const hd = HDWallet.fromSeed(seed);
if (hd.type !== 'seedOk') throw new Error('HDWallet fail');
const derived = hd.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
if (derived.type !== 'keysDerived') throw new Error('Key derivation fail');

const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);
const unshieldedKeystore = createKeystore(derived.keys[Roles.NightExternal], 'undeployed');

const config = {
  networkId: 'undeployed',
  indexerClientConnection: { indexerHttpUrl: INDEXER_HTTP, indexerWsUrl: INDEXER_WS },
  provingServerUrl: new URL(PROOF_SERVER),
  relayURL: new URL(NODE_URL),
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

console.log('Available coins:', coins.length);
for (const c of coins.slice(0, 3)) {
  const coinKeys = Object.keys(c.coin);
  console.log('Coin keys:', coinKeys.join(', '));
  console.log('  value:', c.coin.value?.toString());
  console.log('  has nonce:', 'nonce' in c.coin, 'nonce len:', c.coin.nonce?.length);
  console.log('  has type:', 'type' in c.coin, 'type len:', c.coin.type?.length);
  console.log('  has color:', 'color' in c.coin, 'color len:', c.coin.color?.length);
}

const enc = ledger.encodeShieldedCoinInfo(coins[0].coin);
console.log('\nEncoded coin keys:', Object.keys(enc).join(', '));
console.log('  nonce len:', (enc as any).nonce?.length);
console.log('  color len:', (enc as any).color?.length);
console.log('  type field:', (enc as any).type);
process.exit(0);
