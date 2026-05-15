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

const coin = coins[0].coin;
const enc = ledger.encodeShieldedCoinInfo(coin);

console.log('Raw nonce (hex, first 40):', Buffer.from(coin.nonce).toString('hex').slice(0, 40));
console.log('Enc nonce (hex):', Buffer.from((enc as any).nonce).toString('hex'));
console.log('Raw type (hex, first 40):', Buffer.from(coin.type).toString('hex').slice(0, 40));
console.log('Enc color (hex):', Buffer.from((enc as any).color).toString('hex'));
console.log('\nAre nonce first 32 bytes same?', 
  Buffer.from(coin.nonce.slice(0,32)).toString('hex') === Buffer.from((enc as any).nonce).toString('hex'));
console.log('Are type first 32 bytes same?',
  Buffer.from(coin.type.slice(0,32)).toString('hex') === Buffer.from((enc as any).color).toString('hex'));

process.exit(0);
