import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import { readFileSync } from 'node:fs';

process.env.RATE_LIMIT_ANALYZE = '25';
const { createApp } = await import('../server.js');
const { safeFetch, checkUrl, isBlockedAddress } = await import('../server/safe-fetch.js');

let server;
let base;
before(async () => {
  server = createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (body, type = 'application/json') => fetch(`${base}/api/analyze`, {
  method: 'POST', headers: { 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('POST /api/analyze scores JSON input', async () => {
  const text = readFileSync(new URL('../samples/ai-script.py', import.meta.url), 'utf8');
  const res = await post({ text, filename: 'script.py' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const r = await res.json();
  assert.equal(r.verdict.id, 'slop');
  assert.ok(Array.isArray(r.findings) && r.findings.length > 0);
  assert.equal(typeof r.elapsedMs, 'number');
  assert.equal(r.features, undefined);
});

test('POST /api/analyze accepts plain text and can omit findings', async () => {
  const r = await (await post('Certainly! As an AI language model, I hope this helps.', 'text/plain')).json();
  assert.equal(r.verdict.id, 'slop');
  const lean = await (await post({ text: 'A quiet note.', findings: false })).json();
  assert.equal(lean.findings, undefined);
});

test('POST /api/analyze validates input', async () => {
  assert.equal((await post({ text: '' })).status, 400);
  assert.equal((await post({ text: 5 })).status, 400);
  assert.equal((await post({ text: 'x', kind: 'pdf' })).status, 400);
  assert.equal((await post({ text: 'x', context: 'legal' })).status, 400);
  assert.equal((await post('{not json')).status, 400);
  assert.equal((await fetch(`${base}/api/analyze`)).status, 405);
  const pre = await fetch(`${base}/api/analyze`, { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
});

test('the fetch endpoint refuses private, local and odd addresses', async () => {
  for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://localhost/', 'http://[::1]/',
    'http://0x7f000001/', 'http://10.0.0.1/', 'file:///etc/passwd', 'https://example.com:8443/',
    'http://user:pass@example.com/', 'http://[::ffff:127.0.0.1]/', 'http://printer.local/']) {
    const res = await fetch(`${base}/api/fetch?url=${encodeURIComponent(url)}`);
    assert.equal(res.status, 400, url);
  }
});

test('a public name that resolves to a private address is refused at connect time', async () => {
  const real = dns.lookup;
  dns.lookup = (host, opts, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]);
  try {
    await assert.rejects(safeFetch('http://rebind.example.com/'), /private or reserved/);
  } finally {
    dns.lookup = real;
  }
});

test('address classification', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '0.0.0.0']) {
    assert.equal(isBlockedAddress(a), true, a);
  }
  for (const a of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(isBlockedAddress(a), false, a);
  assert.equal(checkUrl('https://example.com/a?b=1').hostname, 'example.com');
});

test('only the public folders are served, with security headers', async () => {
  const page = await fetch(`${base}/web/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  for (const p of ['/server.js', '/server/handlers.js', '/package.json', '/test/server.test.js', '/web/../server.js', '/%2e%2e/etc/passwd']) {
    assert.notEqual((await fetch(`${base}${p}`)).status, 200, p);
  }
  assert.equal((await fetch(`${base}/src/index.js`)).status, 200);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('the analysis API is rate limited per client', async () => {
  let limited = null;
  for (let i = 0; i < 40 && !limited; i++) {
    const res = await post({ text: 'hello there' });
    if (res.status === 429) limited = res;
  }
  assert.ok(limited, 'expected a 429');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});
