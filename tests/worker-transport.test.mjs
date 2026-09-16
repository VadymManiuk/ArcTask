import assert from 'node:assert/strict';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { requestWorkerJson } from '../lib/server-worker-transport.ts';

test('private report transport verifies TLS, rejects redirects, and bounds time and response size', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arctask-tls-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', `${root}/key.pem`, '-out', `${root}/cert.pem`], { stdio: 'ignore' });
  const ca = fs.readFileSync(`${root}/cert.pem`, 'utf8');
  const server = https.createServer({ key: fs.readFileSync(`${root}/key.pem`), cert: ca }, (req, res) => {
    if (req.url === '/slow') return;
    if (req.url === '/redirect') { res.writeHead(302, { location: 'http://example.invalid' }); res.end(); return; }
    if (req.url === '/large') { res.end('x'.repeat(2 * 1024 * 1024 + 1)); return; }
    res.setHeader('x-arctask-deployment', 'test-scope'); res.end('{"ok":true}');
  });
  server.listen(0); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `https://localhost:${server.address().port}`;
  const response = await requestWorkerJson(new URL(base), { ca });
  assert.equal(response.headers.get('x-arctask-deployment'), 'test-scope');
  assert.deepEqual(await response.json(), { ok: true });
  await assert.rejects(requestWorkerJson(new URL(base), { ca: '' }));
  await assert.rejects(requestWorkerJson(new URL(base.replace('localhost', '127.0.0.1')), { ca }), /altname|hostname|certificate/i);
  await assert.rejects(requestWorkerJson(new URL(`${base}/redirect`), { ca }), /redirect/);
  await assert.rejects(requestWorkerJson(new URL(`${base}/large`), { ca }), /exceeds|interrupted/);
  await assert.rejects(requestWorkerJson(new URL(`${base}/slow`), { ca, timeoutMs: 50 }));
  await assert.rejects(requestWorkerJson(new URL('http://example.invalid')), /HTTPS/);
});
