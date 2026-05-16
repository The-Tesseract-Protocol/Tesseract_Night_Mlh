// @ts-ignore
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';
// @ts-ignore
globalThis.WebSocket = WebSocket;
globalThis.Buffer = Buffer;

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

setNetworkId('undeployed');

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i*2, i*2+2), 16);
  return bytes;
}

const CONTRACT_ADDR = 'a54d29fa687c32eb7769e506cfbca79b24dcfe644db4643601930bbf17aa2a3f';

const res = await fetch('http://127.0.0.1:8088/api/v3/graphql', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ contractAction(address: "${CONTRACT_ADDR}") { ... on ContractCall { zswapState state } ... on ContractDeploy { zswapState state } } }` }),
});
const json = await res.json() as any;
const action = json.data.contractAction;
console.log('zswapState hex len:', action.zswapState?.length);

const chainState = ledger.ZswapChainState.deserialize(fromHex(action.zswapState));
const stateStr = JSON.stringify(chainState);
console.log('chainState serialized len:', stateStr.length);
console.log('sample:', stateStr.slice(0, 500));
const rehashed = chainState.postBlockUpdate(new Date());
console.log('postBlockUpdate OK. Rehashed type:', typeof rehashed);
process.exit(0);
