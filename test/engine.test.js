import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { analyze, train, evaluate, prepare, detect, RULES, CATEGORIES, formatMarkdown } from '../src/index.js';

const dir = new URL('../samples/', import.meta.url);
const sample = (f) => readFileSync(new URL(f, dir), 'utf8');

test('generated samples score as likely AI', () => {
  for (const f of readdirSync(dir).filter((f) => f.startsWith('ai-'))) {
    const r = analyze(sample(f), { filename: f });
    assert.ok(r.score >= 60, `${f} scored ${r.score}`);
    assert.equal(r.verdict.id, 'slop');
  }
});

test('hand-written samples score as human', () => {
  for (const f of readdirSync(dir).filter((f) => !f.startsWith('ai-'))) {
    const r = analyze(sample(f), { filename: f });
    assert.ok(r.score < 30, `${f} scored ${r.score}`);
  }
});

test('empty and plain input stays low', () => {
  assert.ok(analyze('').score < 30);
  assert.ok(analyze('The bus was late again, so I walked.').score < 30);
});

test('scores are clamped to 1–99', () => {
  const r = analyze(sample('ai-blog-post.md'), { filename: 'x.md' });
  assert.ok(r.score <= 99 && r.score >= 1);
});

test('finding offsets point at the matched text in the original source', () => {
  for (const f of readdirSync(dir)) {
    const src = sample(f);
    for (const x of analyze(src, { filename: f }).findings) {
      assert.equal(src.slice(x.start, x.end), x.text, `${f} ${x.rule}`);
      const lineStart = src.split('\n').slice(0, x.line - 1).join('\n').length + (x.line > 1 ? 1 : 0);
      assert.equal(lineStart + x.col - 1, x.start);
    }
  }
});

test('surfaces keep the length of the source', () => {
  for (const f of readdirSync(dir)) {
    const doc = prepare(sample(f), f);
    assert.equal(doc.text.length, doc.raw.length, f);
  }
});

test('code: only comments are read as prose, strings are not', () => {
  const src = 'const s = "delve into the tapestry";\n// This is plain.\n';
  const r = analyze(src, { filename: 'a.js' });
  assert.equal(r.findings.filter((f) => f.rule === 'model-vocab').length, 0);
  const r2 = analyze('// we delve into the tapestry\nx = 1;\n', { filename: 'a.js' });
  assert.ok(r2.findings.some((f) => f.rule === 'model-vocab'));
});

test('html: markup is ignored for prose rules but checked for template styling', () => {
  const src = '<div class="delve">Hello there</div><style>.h{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}</style>';
  const r = analyze(src, { filename: 'a.html' });
  assert.ok(!r.findings.some((f) => f.rule === 'model-vocab'));
  assert.ok(r.findings.some((f) => f.rule === 'default-gradient'));
});

test('kind detection', () => {
  assert.equal(detect('', 'page.html').kind, 'html');
  assert.equal(detect('', 'notes.md').kind, 'prose');
  assert.equal(detect('', 'x.py').lang, 'hash');
  assert.equal(detect('', 'App.tsx').web, true);
  assert.equal(detect('import os\ndef f():\n    return 1\n').kind, 'code');
  assert.equal(detect('<!doctype html><p>hi</p>').kind, 'html');
  assert.equal(detect('Just a sentence about my day.').kind, 'prose');
});

test('chatbot residue is a strong signal on its own', () => {
  const r = analyze('Certainly! Here is a revised version of your email. I hope this helps!');
  assert.ok(r.score >= 60, `scored ${r.score}`);
});

test('casual register counts toward human', () => {
  const r = analyze('ngl the gig was kinda rough lol. sound was bad and we left early tbh.');
  assert.ok(r.signals.some((s) => s.id === 'casual-register' && s.contribution < 0));
});

test('every rule has a known category and compiles', () => {
  for (const r of RULES) {
    assert.ok(CATEGORIES[r.category], r.id);
    assert.ok(r.pattern || r.terms, r.id);
    assert.ok(r.why && r.label, r.id);
  }
});

test('training fits the samples and returns a usable model', () => {
  const examples = readdirSync(dir).map((f) => ({ filename: f, text: sample(f), label: f.startsWith('ai-') ? 1 : 0 }));
  const { model, metrics } = train(examples, { epochs: 50 });
  assert.equal(metrics.accuracy, 1);
  assert.equal(typeof model.bias, 'number');
  assert.equal(evaluate(examples, model).accuracy, 1);
  assert.throws(() => train(examples.filter((e) => e.label === 1)));
});

test('markdown report lists every file', () => {
  const md = formatMarkdown([analyze('hello', { filename: 'a.txt' }), analyze(sample('ai-script.py'), { filename: 'b.py' })]);
  assert.match(md, /a\.txt/);
  assert.match(md, /b\.py/);
});
