import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { keccak256, stringToHex, parseAbi } from 'viem';
import { acquireProcessLock, durableJson, readDurableJson, recoverSubmissions, submitDurably } from '../scripts/worker-durability.mjs';

const address = '0x1111111111111111111111111111111111111111';
const job = { client: address, agentOwner: address, evaluator: address, agentId: 1n, deadline: 4_000_000_000n,
  jobURI: 'original brief', rewardAmount: 100n, executionVersion: 1, executionBudgetAmount: 100n, updatedAt: 1n, status: 0 };
const missing = () => { const error = new Error('not found'); error.name = 'TransactionReceiptNotFoundError'; throw error; };
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arctask-journal-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const state = { generated: 0, signed: 0, sent: [], receipt: null, latest: 7, pending: 7, current: { ...job } };
  const client = {
    async getTransactionCount({ blockTag }) { return state[blockTag]; },
    async getTransactionReceipt() { return state.receipt ?? missing(); },
    async getTransaction() { return missing(); },
    async sendRawTransaction({ serializedTransaction }) { state.sent.push(serializedTransaction); throw new Error('lost acknowledgement'); }
  };
  const args = { directory: path.join(root, 'submissions'), outputDir: path.join(root, 'reports'), chainId: 5042,
    escrow: address, abi: parseAbi(['function submitDeliverable(uint256,bytes32)']), jobId: 3n, job,
    account: { address }, client, explorerUrl: 'https://arc-scan.org',
    wallet: { async prepareTransactionRequest(request) { return { ...request, gas: 100n, maxFeePerGas: 1n }; },
      async signTransaction() { state.signed++; return '0x1234'; } },
    async readJob() { return state.current; },
    async generate() { state.generated++; const report = { result: 'saved result' }; return { report, hash: keccak256(stringToHex(JSON.stringify(report, null, 2))) }; }
  };
  const recover = () => recoverSubmissions({ ...args, escrowAddresses: [address] });
  return { root, args, state, recover };
}

test('lost broadcast acknowledgement preserves signed bytes and private report; recovery never regenerates AI', async t => {
  const { args, state, recover } = setup(t);
  assert.equal(await submitDurably(args), false);
  assert.equal(state.generated, 1); assert.equal(state.signed, 1);
  const file = path.join(args.outputDir, 'job-3.json');
  assert.equal(readDurableJson(file).result, 'saved result');
  fs.unlinkSync(file);
  assert.deepEqual(await recover(), { ready: false, confirmed: 0 });
  assert.equal(readDurableJson(file).result, 'saved result');
  assert.deepEqual(state.sent, ['0x1234', '0x1234']);
  state.receipt = { status: 'success', blockNumber: 99n };
  assert.deepEqual(await recover(), { ready: true, confirmed: 1 });
  assert.deepEqual(await recover(), { ready: true, confirmed: 0 });
  assert.equal(state.generated, 1); assert.equal(state.signed, 1);
});

test('an occupied shared nonce stops AI spending and never sends a replacement', async t => {
  const { args, state, recover } = setup(t);
  state.pending = 8;
  await assert.rejects(submitDurably(args), /pending transaction/);
  assert.equal(state.generated, 0);
  state.pending = 7;
  await submitDurably(args);
  state.pending = 8;
  assert.deepEqual(await recover(), { ready: false, confirmed: 0 });
  assert.equal(state.sent.length, 1);
  state.latest = 8;
  await assert.rejects(recover(), /Nonce consumed/);
  assert.equal(state.sent.length, 1);
});

test('changed brief after generation is never signed and the prepared report is reused', async t => {
  const { args, state } = setup(t);
  state.current.jobURI = 'revised while AI was running';
  assert.equal(await submitDurably(args), false);
  assert.equal(state.generated, 1); assert.equal(state.signed, 0);
  state.current = { ...job };
  await submitDurably(args);
  assert.equal(state.generated, 1); assert.equal(state.signed, 1);
});

test('gas cap keeps prepared work without a signature or further AI billing', async t => {
  const { args, state } = setup(t);
  args.wallet.prepareTransactionRequest = async request => ({ ...request, gas: 10n ** 18n, maxFeePerGas: 1n });
  await assert.rejects(submitDurably(args), /gas exceeds/);
  await assert.rejects(submitDurably(args), /gas exceeds/);
  assert.equal(state.generated, 1); assert.equal(state.signed, 0);
});

test('reverted receipt is recorded and cannot trigger a new signature', async t => {
  const { args, state, recover } = setup(t);
  await submitDurably(args);
  state.receipt = { status: 'reverted', blockNumber: 99n };
  await assert.rejects(recover(), /reverted/);
  await assert.rejects(submitDurably(args), /reverted/);
  assert.equal(state.signed, 1);
});

test('journal deployment and report integrity failures stop recovery', async t => {
  const { args, recover } = setup(t);
  await submitDurably(args);
  const file = path.join(args.directory, fs.readdirSync(args.directory)[0]);
  const journal = readDurableJson(file);
  journal.deliverable.report.result = 'tampered'; durableJson(file, journal);
  await assert.rejects(recover(), /integrity/);
  journal.chainId = 1; durableJson(file, journal);
  await assert.rejects(recover(), /different deployment/);
});

test('locks never expire while their owner is alive; malformed state fails closed', t => {
  const { root } = setup(t);
  const file = path.join(root, 'worker.lock');
  const lock = acquireProcessLock(file);
  fs.utimesSync(file, new Date(0), new Date(0));
  assert.equal(acquireProcessLock(file), null);
  lock.release();
  const next = acquireProcessLock(file); assert.ok(next); next.release();
  fs.writeFileSync(file, '{broken');
  assert.throws(() => acquireProcessLock(file), SyntaxError);
  assert.throws(() => readDurableJson(file, {}), SyntaxError);
});

test('a lagging RPC pending count cannot make a second job reuse an unresolved signed nonce', async t => {
  const { args, state } = setup(t);
  await submitDurably(args);
  // Both counts still say 7 after broadcast, simulating an out-of-sync RPC.
  await assert.rejects(submitDurably({ ...args, jobId: 4n }), /unresolved saved submission/);
  assert.equal(state.generated, 1); assert.equal(state.signed, 1);
});
