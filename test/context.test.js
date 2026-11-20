import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from '../src/index.js';

const sample = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const counted = (r, rule) => r.findings.filter((f) => f.rule === rule && f.counted);
const vocab = (r) => counted(r, 'model-vocab').map((f) => f.text.toLowerCase());

test('technical senses of model-favoured words are not counted', () => {
  const cases = [
    'Users authenticate against the Kerberos realm before the job starts.',
    'Navigate to the settings page and open the Tokens tab.',
    'The viewer supports portrait and landscape mode on tablets.',
    'The installer needs elevated privileges on Windows.',
    'We use a robust estimator so outliers do not skew the mean.',
    'Replace spaces with an underscore in file names.',
    'The test harness replays a week of recorded traffic.',
    'The BLE beacon reader drops packets when many sensors are in range.',
    'Map the user journey before the onboarding redesign.',
    'This is a classic dynamic programming problem.',
  ];
  for (const text of cases) {
    const r = analyze(text);
    assert.deepEqual(vocab(r), [], text);
    assert.ok(r.findings.some((f) => f.discount?.reason.startsWith('Technical sense')), text);
  }
});

test('the same words in their figurative sense still count', () => {
  const r = analyze('We embark on a journey into the realm of ideas, a vibrant tapestry that will elevate your soul.');
  for (const w of ['realm', 'tapestry', 'vibrant', 'elevate']) assert.ok(vocab(r).includes(w), w);
});

test('code inside Markdown is not read as prose', () => {
  const md = 'Run it:\n\n```js\n// delve into the tapestry\nconst seamless = true;\n```\n\nSet `robust_mode` in the config.\n';
  const r = analyze(md, { filename: 'README.md' });
  assert.deepEqual(vocab(r), []);
});

test('placeholder keys in setup instructions are expected', () => {
  const r = analyze(sample('human-readme.md'), { filename: 'README.md' });
  assert.equal(counted(r, 'api-key-placeholder').length, 0);
  assert.equal(r.context.genre, 'technical');
});

test('bold labels that name code identifiers are a reference format', () => {
  const r = analyze('# Options\n\n- **`retention`:** days to keep\n- **`port`:** port to bind\n- **`host`:** address\n');
  assert.equal(counted(r, 'bold-label-bullet').length, 0);
});

test('placeholder data in test files is expected', () => {
  const r = analyze(sample('human-test.js'), { filename: 'test/users.test.js' });
  assert.equal(r.context.testFile, true);
  assert.equal(r.findings.filter((f) => f.category === 'scaffold' && f.counted).length, 0);
  assert.ok(r.score < 30, `scored ${r.score}`);
});

test('one-off habits are shown but only counted when repeated', () => {
  const one = analyze('// Initialize the cache before the first request.\nconst cache = new Map();\n', { filename: 'a.js' });
  assert.equal(counted(one, 'narrating-comment').length, 0);
  const many = analyze(sample('ai-script.py'), { filename: 'a.py' });
  assert.ok(counted(many, 'narrating-comment').length >= 3);
});

test('a single kind of evidence cannot produce a likely-AI verdict', () => {
  const r = analyze('A vibrant, bustling hall. Its intricate tapestry is meticulous, multifaceted and pivotal, a commendable beacon.');
  assert.ok(r.capped);
  assert.equal(r.verdict.id, 'mixed');
});

test('chatbot residue is conclusive on its own', () => {
  const r = analyze('Certainly! As an AI language model, I cannot browse the web. I hope this helps!');
  assert.equal(r.capped, null);
  assert.equal(r.verdict.id, 'slop');
});

test('technical context does not hide slop', () => {
  const r = analyze(sample('ai-readme.md'), { filename: 'README.md' });
  assert.equal(r.context.genre, 'technical');
  assert.equal(r.verdict.id, 'slop', `scored ${r.score}`);
});

test('context can be set by hand', () => {
  const text = sample('human-readme.md');
  assert.equal(analyze(text, { context: 'general' }).context.genre, 'general');
  assert.equal(analyze('Short note.', { context: 'technical' }).context.genre, 'technical');
});

test('phrases quoted as examples are mentions, not uses', () => {
  const r = analyze('Avoid openers like "In today\'s fast-paced world" and words such as "delve".');
  assert.equal(r.findings.filter((f) => f.counted).length, 0);
  const list = analyze('Banned words: delve, tapestry, multifaceted, meticulous.');
  assert.deepEqual(vocab(list), []);
});

test('a quoted sentence of slop still counts', () => {
  const r = analyze('"Our platform is a testament to innovation and will elevate your workflow," said the CEO.');
  assert.ok(counted(r, 'testament').length === 1);
});

test('this project\'s own README is not flagged for quoting the patterns it detects', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(analyze(readme, { filename: 'README.md' }).score < 30);
});

test('quotes in code are string literals, not mentions', () => {
  const r = analyze('API_KEY = "your-api-key-here"\nclient = Client(API_KEY)\n', { filename: 'app.py' });
  assert.equal(counted(r, 'api-key-placeholder').length, 1);
});

test('test files are recognised by name or content, not by their folder', () => {
  const code = 'API_KEY = "your-api-key-here"\nrequests.get(URL, headers={"key": API_KEY})\n';
  for (const name of ['examples/app.py', 'test/fixtures/app.py', 'tests/helpers.py']) {
    assert.equal(analyze(code, { filename: name }).context.testFile, false, name);
  }
  for (const name of ['test_app.py', 'app.test.js', 'app_test.go', '.env.example']) {
    assert.equal(analyze(code, { filename: name }).context.testFile, true, name);
  }
  const tests = "test('a', () => {});\ntest('b', () => {});\n";
  assert.equal(analyze(tests, { filename: 'helpers.js' }).context.testFile, true);
});
