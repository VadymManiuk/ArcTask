// Read-only deployment check: signs short-lived access messages, never transactions.
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { getDeploymentScope } from '../lib/arc-network.mjs';
import { loadLocalEnv } from './load-env.mjs';
loadLocalEnv();
const base = process.argv.find(arg => arg.startsWith('--base='))?.slice(7);
const jobId = process.argv.find(arg => arg.startsWith('--job='))?.slice(6) ?? '3000000';
if (!base) throw new Error('Pass --base=https://your-deployment and optionally --job=ID.');
const key = process.env.ARC_AGENT_PRIVATE_KEY || process.env.ARC_MAINNET_DEPLOYER_PRIVATE_KEY;
if (!key) throw new Error('An already-authorized local wallet key is required.');
const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
const scope = getDeploymentScope(process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS, process.env.NEXT_PUBLIC_ERC8183_ESCROW_V4_ADDRESS);
const endpoint = new URL(`/api/deliverables/${jobId}`, base);
async function post(body, headers = {}) {
  return fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
}
assert.equal((await fetch(new URL('/api/deliverables/0', base))).status, 400);
assert.equal((await post({})).status, 401);
assert.equal((await post({ address: account.address, issuedAt: new Date().toISOString(), nonce: 'forged', signature: `0x${'00'.repeat(65)}` }, { 'x-arctask-forwarded-wallet-proof': '1', 'x-arctask-deployment': scope })).status, 401);
const challengeResponse = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
assert.equal(challengeResponse.status, 200);
const challenge = await challengeResponse.json();
const proof = { address: account.address, issuedAt: challenge.issuedAt, nonce: challenge.nonce, signature: '' };
const message = ['ArcTask deliverable access', `Deployment: ${scope}`, `Onchain job ID: ${jobId}`, `Wallet: ${proof.address}`, `Issued at: ${proof.issuedAt}`, `Nonce: ${proof.nonce}`, 'Purpose: view private worker deliverable'].join('\n');
assert.equal((await post({ ...proof, signature: `0x${'00'.repeat(65)}` })).status, 401);
proof.signature = await account.signMessage({ message });
const valid = await post(proof);
assert.equal(valid.status, 200, await valid.clone().text());
const report = (await valid.json()).deliverable;
assert.ok(report?.summary);
assert.equal(valid.headers.get('x-arctask-deployment'), scope);
assert.equal((await post(proof)).status, 401);
console.log(JSON.stringify({ base, jobId, invalidId: 400, anonymous: 401, forgedForwardingHeader: 401, invalidSignature: 401, authorized: 200, replay: 401, reportHash: report.deliverableHash, ok: true }, null, 2));
