import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import solc from 'solc';
import { createPublicClient, createTestClient, createWalletClient, defineChain, http, keccak256, stringToHex } from 'viem';

// All transactions in this file use disposable, unlocked Anvil accounts.
test('escrow lifecycle and fund conservation on an actual local EVM', { timeout: 90_000 }, async t => {
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const node = spawn(process.execPath, ['node_modules/@foundry-rs/anvil/bin.mjs', '--port', String(port), '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; node.stderr.on('data', chunk => { stderr += chunk; });
  t.after(async () => { if (node.exitCode === null) { node.kill('SIGTERM'); await once(node, 'exit'); } });
  const chain = defineChain({ id: 31337, name: 'Disposable test chain', nativeCurrency: { name: 'Test', symbol: 'TEST', decimals: 18 }, rpcUrls: { default: { http: [`http://127.0.0.1:${port}`] } } });
  const transport = http(chain.rpcUrls.default.http[0], { retryCount: 0, timeout: 1_000 });
  const client = createPublicClient({ chain, transport, pollingInterval: 10 });
  const wallet = createWalletClient({ chain, transport });
  const evm = createTestClient({ chain, transport, mode: 'anvil' });
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try { await client.getChainId(); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  assert.ok(ready, stderr);
  const [admin, agent, customer, evaluator, treasury, arbitrator, stranger] = await wallet.getAddresses();
  const files = ['ArcTaskAgentRegistry.sol', 'ArcTaskEscrowV2.sol'];
  const input = { language: 'Solidity', sources: Object.fromEntries(files.map(file => [file, { content: fs.readFileSync(`contracts/${file}`, 'utf8') }])), settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  assert.deepEqual((output.errors ?? []).filter(e => e.severity === 'error'), []);
  async function deploy(file, name, args = []) {
    const compiled = output.contracts[file][name];
    const hash = await wallet.deployContract({ account: admin, abi: compiled.abi, bytecode: `0x${compiled.evm.bytecode.object}`, args });
    const receipt = await client.waitForTransactionReceipt({ hash }); assert.equal(receipt.status, 'success');
    return { address: receipt.contractAddress, abi: compiled.abi };
  }
  const registry = await deploy(files[0], 'ArcTaskAgentRegistry');
  const escrow = await deploy(files[1], 'ArcTaskEscrowV2', [registry.address, treasury, arbitrator, 3_000_000n]);
  const read = (contract, functionName, args = []) => client.readContract({ ...contract, functionName, args });
  async function write(contract, account, functionName, args = [], value = 0n) {
    const hash = await wallet.writeContract({ ...contract, account, functionName, args, value });
    const receipt = await client.waitForTransactionReceipt({ hash }); assert.equal(receipt.status, 'success'); return receipt;
  }
  const rejects = (contract, account, functionName, args = [], value = 0n) => assert.rejects(client.simulateContract({ ...contract, account, functionName, args, value }));
  await write(registry, agent, 'registerAgent', [agent, 'data:application/json,{"name":"test"}']);
  await write(registry, admin, 'setEscrowAuthorization', [escrow.address, true]);
  const hash = keccak256(stringToHex('test report'));
  let totalFunded = 0n;
  async function create(reward = 10_003n) {
    const id = await read(escrow, 'nextJobId');
    const deadline = (await client.getBlock()).timestamp + 10_000n;
    const quote = await read(escrow, 'quoteFunding', [reward]);
    await write(escrow, customer, 'createJob', [1n, reward, deadline, evaluator, 'original brief'], quote[0]);
    totalFunded += quote[0]; return { id, deadline, reward, quote };
  }
  async function advance(seconds) { await evm.increaseTime({ seconds }); await evm.mine({ blocks: 1 }); }
  const status = async id => (await read(escrow, 'jobs', [id]))[8];
  const credit = address => read(escrow, 'claimable', [address]);

  await t.test('access controls and submission/acceptance pay exactly the quoted amounts', async () => {
    const { id, reward, quote } = await create();
    await rejects(escrow, stranger, 'submitDeliverable', [id, hash]);
    await rejects(escrow, customer, 'acceptWork', [id]);
    await write(escrow, agent, 'submitDeliverable', [id, hash]);
    assert.equal(await credit(agent), quote[1]);
    await rejects(escrow, stranger, 'acceptWork', [id]);
    await write(escrow, evaluator, 'acceptWork', [id]);
    assert.equal(await status(id), 2);
    assert.equal(await credit(agent), reward);
    assert.equal(await credit(customer), quote[2]);
    assert.equal(await credit(treasury), quote[3]);
    assert.equal(await credit(evaluator), quote[4]);
    await rejects(escrow, evaluator, 'acceptWork', [id]);
  });

  await t.test('revision removes the old hash and requires new funding; expiry returns uncredited retry compute', async () => {
    const { id, deadline, reward, quote } = await create();
    const before = await credit(customer);
    await write(escrow, agent, 'submitDeliverable', [id, hash]);
    await write(escrow, evaluator, 'requestRevision', [id, 'fix a calculation']);
    assert.equal(await status(id), 0);
    assert.equal((await read(escrow, 'jobs', [id]))[7], `0x${'0'.repeat(64)}`);
    await rejects(escrow, agent, 'submitDeliverable', [id, hash]);
    const retry = await read(escrow, 'quoteFunding', [reward]);
    await write(escrow, customer, 'fundRetry', [id, reward, deadline, 'revised brief'], retry[0]); totalFunded += retry[0];
    assert.equal(Number((await read(escrow, 'getJobExecution', [id]))[0]), 2);
    await advance(10_001);
    await write(escrow, customer, 'refundExpired', [id]);
    assert.equal(await status(id), 4);
    assert.equal((await credit(customer)) - before, reward * 2n - quote[1] + quote[2] * 2n + quote[4] * 2n);
  });

  await t.test('unsubmitted expiry and automatic review settlement have exclusive deadlines', async () => {
    const first = await create();
    await rejects(escrow, customer, 'refundExpired', [first.id]);
    await advance(10_001); await write(escrow, customer, 'refundExpired', [first.id]);
    const second = await create(); await write(escrow, agent, 'submitDeliverable', [second.id, hash]);
    await rejects(escrow, stranger, 'finalizeReview', [second.id]);
    const period = Number(await read(escrow, 'REVIEW_PERIOD')); await advance(period + 1);
    await rejects(escrow, evaluator, 'requestRevision', [second.id, 'late']);
    await write(escrow, stranger, 'finalizeReview', [second.id]); assert.equal(await status(second.id), 2);
  });

  for (const award of [0, 10_000]) await t.test(`arbitration award ${award} conserves funds and enforces arbitrator access`, async () => {
    const { id } = await create(); await write(escrow, agent, 'submitDeliverable', [id, hash]);
    await write(escrow, evaluator, 'openDispute', [id, hash]);
    await rejects(escrow, customer, 'resolveDispute', [id, award, hash]);
    await rejects(escrow, arbitrator, 'resolveDispute', [id, 10_001, hash]);
    await write(escrow, arbitrator, 'resolveDispute', [id, award, hash]); assert.equal(await status(id), award === 0 ? 3 : 2);
  });

  await t.test('stale dispute settlement and registry outage remain recoverable', async () => {
    const { id } = await create(); await write(escrow, agent, 'submitDeliverable', [id, hash]);
    await write(escrow, evaluator, 'openDispute', [id, hash]);
    await rejects(escrow, stranger, 'finalizeStaleDispute', [id]);
    await write(registry, admin, 'setEscrowAuthorization', [escrow.address, false]);
    await advance(Number(await read(escrow, 'DISPUTE_PERIOD')) + 1);
    await rejects(escrow, arbitrator, 'resolveDispute', [id, 10_000, hash]);
    await write(escrow, stranger, 'finalizeStaleDispute', [id]); assert.equal(await status(id), 3);
    const pending = await read(escrow, 'getJobOutcomeSync', [id]); assert.equal(pending[0], true);
    await write(registry, admin, 'setEscrowAuthorization', [escrow.address, true]);
    await write(escrow, stranger, 'retryRecordOutcome', [id]);
    await rejects(escrow, stranger, 'retryRecordOutcome', [id]);
  });

  await t.test('all terminal credits equal all deposits; withdrawals leave no stranded funds', async () => {
    const recipients = [agent, customer, evaluator, treasury, arbitrator];
    const credits = await Promise.all(recipients.map(credit));
    assert.equal(credits.reduce((sum, value) => sum + value, 0n), totalFunded);
    assert.equal(await client.getBalance({ address: escrow.address }), totalFunded);
    for (let i = 0; i < recipients.length; i++) if (credits[i] > 0n) await write(escrow, recipients[i], 'withdraw');
    assert.equal(await client.getBalance({ address: escrow.address }), 0n);
    await rejects(escrow, agent, 'withdraw');
  });
});
