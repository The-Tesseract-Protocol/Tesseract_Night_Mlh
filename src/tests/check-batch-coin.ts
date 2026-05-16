import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import { fromHex } from '../types/index.js';
import { Contract } from '../contract/compiled/contract/index.js';

const INDEXER_HTTP = 'http://127.0.0.1:8088/api/v3/graphql';
const DEPLOYED_ADDRESS = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'deployed-address.json'), 'utf-8'),
).contractAddress;

async function gqlFetch(query: string) {
  const res = await fetch(INDEXER_HTTP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data!;
}

async function main() {
  const data = await gqlFetch(`{ contractAction(address: "${DEPLOYED_ADDRESS}") { ... on ContractDeploy { state } ... on ContractCall { state } ... on ContractUpdate { state } } }`);
  const hexState = (data as any).contractAction?.state;
  if (!hexState) { console.log('No state'); return; }
  const state = ContractState.deserialize(fromHex(hexState));

  const contract = new Contract({
    getMerkleRoot: () => { throw new Error(); },
    getPayerKey: () => { throw new Error(); },
    getBatchNonce: () => { throw new Error(); },
    getBatchCoin: () => { throw new Error(); },
    getClaimAmount: () => { throw new Error(); },
    getMerkleProof: () => { throw new Error(); },
    getLeafKey: () => { throw new Error(); },
    getClaimSecret: () => { throw new Error(); },
    getReclaimPayerKey: () => { throw new Error(); },
    getReclaimBatchNonce: () => { throw new Error(); },
    getRequesterKey: () => { throw new Error(); },
    getRequestNonce: () => { throw new Error(); },
    getMarkRequesterKey: () => { throw new Error(); },
    getMarkRequestNonce: () => { throw new Error(); },
  } as any);
  const ledger = contract.ledger(state);
  console.log('Got ledger. Querying recipientCoins...');
  console.log('recipientCoins size:', ledger.recipientCoins.size());
}
main().catch(console.error);
