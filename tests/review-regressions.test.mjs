import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { getJobDeadlineMs } from '../lib/job-deadline.ts';
import { isOnchainId, readBoundedJson } from '../lib/request-validation.ts';
import { mergeOnchainJobStatus } from '../lib/network-snapshot.ts';
import { reserveTokenUsage, settleTokenReservation, getMonthlyUsage, getUsageBudgetState } from '../lib/usage-budget.mjs';

test('AI reservations survive restart and settle in their original billing month', () => {
  const now = Date.parse('2026-09-30T23:59:59Z');
  const usage = { jobId: '1', inputTokens: 100, outputTokens: 300, totalTokens: 400, costUsd: 0.04 };
  const ledger = JSON.parse(JSON.stringify(reserveTokenUsage({}, 'request-1', usage, now)));
  assert.equal(getMonthlyUsage(ledger, now).costUsd, 0.04);
  assert.equal(getUsageBudgetState(ledger, { jobId: '1', jobTokenBudget: 400, jobCostBudgetUsd: 0.04 }, now).jobCostExceeded, true);
  const settled = settleTokenReservation(ledger, 'request-1', { ...usage, outputTokens: 100, totalTokens: 200, costUsd: 0.02 });
  assert.equal(getMonthlyUsage(settled, now).costUsd, 0.02);
  assert.equal(getMonthlyUsage(settled, Date.parse('2026-10-01')).costUsd, 0);
  assert.equal(settled.jobs['1'].requests, 1);
  assert.throws(() => settleTokenReservation(settled, 'request-1', usage), /missing/);
});

test('known quota rejection releases its reservation without erasing prior usage', () => {
  let ledger = reserveTokenUsage({}, 'a', { jobId: '1', costUsd: 1, totalTokens: 200 });
  ledger = reserveTokenUsage(ledger, 'b', { jobId: '1', costUsd: 2, totalTokens: 300 });
  ledger = settleTokenReservation(ledger, 'b', null);
  assert.equal(ledger.jobs['1'].costUsd, 1);
  assert.equal(ledger.jobs['1'].totalTokens, 200);
  assert.equal(ledger.jobs['1'].requests, 1);
});

test('canonical IDs, real calendar dates, and streaming JSON size limits are enforced', async () => {
  for (const bad of ['0', '-1', '01', '1e3', '../1', (1n << 256n).toString()]) assert.equal(isOnchainId(bad), false);
  assert.equal(isOnchainId(((1n << 256n) - 1n).toString()), true);
  assert.throws(() => getJobDeadlineMs('2026-02-30'));
  assert.throws(() => getJobDeadlineMs('2026-2-1'));
  await assert.rejects(readBoundedJson(new Request('https://test.local', { method: 'POST', body: 'x'.repeat(9) }), 8));
  assert.deepEqual(await readBoundedJson(new Request('https://test.local', { method: 'POST', body: '{"ok":1}' }), 8), { ok: 1 });
});

test('same-second revisions are accepted only from a newer block; final settlements stay final', () => {
  const freshness = { currentUpdatedAt: '2026-09-16', incomingUpdatedAt: '2026-09-16', currentBlock: '10', incomingBlock: '11' };
  assert.equal(mergeOnchainJobStatus('SUBMITTED', 'FUNDED', freshness), 'FUNDED');
  assert.equal(mergeOnchainJobStatus('SUBMITTED', 'FUNDED', { ...freshness, incomingBlock: '9' }), 'SUBMITTED');
  assert.equal(mergeOnchainJobStatus('ACCEPTED', 'FUNDED', freshness), 'ACCEPTED');
});

test('consumed access nonces cannot be replayed after a server process restart', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arctask-nonces-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const env = { ...process.env, ARCTASK_ACCESS_NONCE_SECRET: 'test-only-nonce-secret', TEST_NONCE_DIR: directory };
  function run(source, extra = {}) {
    const child = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--input-type=module', '-e', source], { env: { ...env, ...extra }, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr); return child.stdout.trim();
  }
  const nonce = run("import {createDeliverableNonce} from './lib/server-deliverable-nonce.ts'; console.log(createDeliverableNonce('1').nonce)");
  const source = "import {consumeDeliverableNonce} from './lib/server-deliverable-nonce.ts'; console.log(consumeDeliverableNonce('1',process.env.TEST_NONCE,process.env.TEST_NONCE_DIR))";
  assert.equal(run(source, { TEST_NONCE: nonce }), 'true');
  assert.equal(run(source, { TEST_NONCE: nonce }), 'false');
});

test('invalid persisted billing values stop execution instead of disabling the budget guard', () => {
  assert.throws(() => getMonthlyUsage({ days: { '2026-09-01': { costUsd: 'broken' } } }, Date.parse('2026-09-16')), /reconciliation/);
});

test('EOA access signatures verify without an RPC call, while non-EOA proofs still use chain verification', async () => {
  const { createPublicClient, custom } = await import('viem');
  const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts');
  const signer = privateKeyToAccount(generatePrivateKey());
  let calls = 0;
  const client = createPublicClient({ transport: custom({ async request() { calls++; throw new Error('RPC deliberately unavailable'); } }, { retryCount: 0 }) });
  const message = 'Disposable private access test';
  const signature = await signer.signMessage({ message });
  assert.equal(await client.verifyMessage({ address: signer.address, message, signature, mode: 'eoa' }), true);
  assert.equal(calls, 0);
  assert.equal(await client.verifyMessage({ address: '0x1111111111111111111111111111111111111111', message, signature, mode: 'eoa' }), false);
  assert.ok(calls > 0);
});
