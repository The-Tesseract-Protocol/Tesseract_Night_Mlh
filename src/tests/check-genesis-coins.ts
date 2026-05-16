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
import { WalletFacade, type DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { createKeystore, InMemoryTransactionHistoryStorage, PublicKey as UnshieldedPublicKey, UnshieldedWallet } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as Rx from 'rxjs';

setNetworkId('undeployed');

const seed = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
const hd = HDWallet.fromSeed(seed);
if (hd.type !== 'seedOk') throw new Error('HDWallet init failed');
const derived = hd.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
if (derived.type !== 'keysDerived') throw new Error('Key derivation failed');
hd.hdWallet.clear();

const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);
const unshieldedKeystore = createKeystore(derived.keys[Roles.NightExternal], 'undeployed');

const config: DefaultConfiguration = {
  networkId: 'undeployed',
  indexerClientConnection: { indexerHttpUrl: 'http://127.0.0.1:8088/api/v3/graphql', indexerWsUrl: 'ws://127.0.0.1:8088/api/v3/graphql/ws' },
  provingServerUrl: new URL('http://127.0.0.1:6300'),
  relayURL: new URL('ws://127.0.0.1:9944'),
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

await Rx.firstValueFrom(facade.state().pipe(Rx.filter((s: any) => s.isSynced)));
const state = await facade.waitForSyncedState() as any;
const coins = state.shielded.availableCoins;
console.log('Available coins:', coins.length);
for (const c of coins) {
  console.log('  coin: value=' + c.coin.value + ' mt_index=' + c.coin.mt_index);
}
const dustBal = state.dust?.balances ?? {};
console.log('Dust balances:', JSON.stringify(Object.entries(dustBal).map(([k,v]) => `${k}:${v}`)));
process.exit(0);
