import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/slop-shutter.js', import.meta.url));
const samples = fileURLToPath(new URL('../samples/', import.meta.url));
const run = (args, input) => spawnSync(process.execPath, [bin, ...args], { input, encoding: 'utf8' });

test('scans a folder and summarises', () => {
  const r = run([samples, '--no-color']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /7 files · 4 likely generated/);
});

test('--fail-above exits 1 when a file crosses the threshold', () => {
  assert.equal(run([samples + 'ai-script.py', '--fail-above', '60']).status, 1);
  assert.equal(run([samples + 'human-script.py', '--fail-above', '60']).status, 0);
});

test('--json reads stdin', () => {
  const r = run(['-', '--json'], 'As an AI language model, I cannot browse.');
  const out = JSON.parse(r.stdout);
  assert.equal(out.filename, '(stdin)');
  assert.ok(out.findings.some((f) => f.rule === 'as-an-ai'));
});

test('unknown options and missing files are usage errors', () => {
  assert.equal(run(['--nope']).status, 2);
  assert.equal(run(['/no/such/file']).status, 2);
});
