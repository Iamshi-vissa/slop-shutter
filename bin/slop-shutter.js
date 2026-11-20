#!/usr/bin/env node
// Slop Shutter command line: scan files, folders and URLs; train a model; serve the web UI.

import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { join, extname, basename, resolve } from 'node:path';
import { analyze, formatText, formatMarkdown, toJSON, train, evaluate, DEFAULT_MODEL } from '../src/index.js';

const HELP = `slop-shutter — flag AI slop and generated-text patterns in prose and web code

Usage
  slop-shutter [scan] <file|dir|url>...   Scan files, folders (recursively) or web pages
  slop-shutter scan -                      Read from standard input
  slop-shutter train --human <dir> --ai <dir> [-o model.json]
  slop-shutter serve [--port 4173] [--host 127.0.0.1]   Run the web app and HTTP API

Scan options
  --json               Print results as JSON
  --md                 Print a Markdown report
  --verbose, -v        List every flagged passage with its line and column
  --kind <k>           Treat input as prose, html or code instead of guessing
  --context <c>        auto (default), technical or general: how to read word use and formats
  --model <file>       Score with a trained model instead of the default
  --fail-above <n>     Exit with status 1 if any file scores n or more (for CI)
  --min-score <n>      Only report files scoring n or more
  --no-color           Disable colour

Exit status: 0 clean, 1 a file crossed --fail-above, 2 usage or input error.`;

const SCANNABLE = new Set(['.txt', '.md', '.markdown', '.mdx', '.rst', '.html', '.htm', '.js', '.mjs', '.cjs',
  '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro', '.css', '.scss', '.less', '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.swift', '.php', '.c', '.h', '.cpp', '.cs', '.sh', '.sql', '.lua', '.yaml', '.yml']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', 'vendor', '__pycache__', '.venv', 'venv', 'coverage']);
const MAX_BYTES = 2_000_000;

function parseArgs(argv) {
  const opts = { _: [], color: process.stdout.isTTY && !process.env.NO_COLOR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) fail(`${a} needs a value`); return argv[++i]; };
    const num = (lo, hi) => {
      const v = val();
      const n = Number(v);
      if (v.trim() === '' || !Number.isFinite(n) || n < lo || n > hi) fail(`${a} must be a number from ${lo} to ${hi}`);
      return n;
    };
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '--json': opts.json = true; break;
      case '--md': case '--markdown': opts.md = true; break;
      case '-v': case '--verbose': opts.verbose = true; break;
      case '--no-color': opts.color = false; break;
      case '--kind':
        opts.kind = val();
        if (!['prose', 'html', 'code'].includes(opts.kind)) fail('--kind must be prose, html or code');
        break;
      case '--context':
        opts.context = val();
        if (!['auto', 'technical', 'general'].includes(opts.context)) fail('--context must be auto, technical or general');
        break;
      case '--model': opts.model = val(); break;
      case '--fail-above': opts.failAbove = num(0, 100); break;
      case '--min-score': opts.minScore = num(0, 100); break;
      case '--human': opts.human = val(); break;
      case '--ai': opts.ai = val(); break;
      case '-o': case '--out': opts.out = val(); break;
      case '--port': opts.port = num(1, 65535); break;
      case '--host': opts.host = val(); break;
      default:
        if (a.startsWith('--')) fail(`unknown option ${a}`);
        opts._.push(a);
    }
  }
  return opts;
}

function fail(msg) {
  process.stderr.write(`slop-shutter: ${msg}\n`);
  process.exit(2);
}

function* walk(path) {
  const st = statSync(path);
  if (st.isFile()) { yield path; return; }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    const p = join(path, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) yield* walk(p); }
    else if (SCANNABLE.has(extname(entry.name).toLowerCase())) yield p;
  }
}

async function readInputs(targets) {
  const inputs = [];
  for (const t of targets) {
    if (t === '-') {
      inputs.push({ name: '(stdin)', text: readFileSync(0, 'utf8') });
    } else if (/^https?:\/\//i.test(t)) {
      const res = await fetch(t, { headers: { 'user-agent': 'slop-shutter/0.1', accept: 'text/html,text/plain,*/*' } });
      if (!res.ok) fail(`${t}: HTTP ${res.status}`);
      const type = res.headers.get('content-type') || '';
      const text = await res.text();
      const name = /html/.test(type) && !/\.html?$/.test(t) ? `${t} [html]` : t;
      inputs.push({ name, text, kind: /html/.test(type) ? 'html' : undefined });
    } else {
      if (!existsSync(t)) fail(`${t}: no such file or directory`);
      for (const p of walk(t)) {
        if (statSync(p).size > MAX_BYTES) { process.stderr.write(`skipping ${p}: larger than 2 MB\n`); continue; }
        inputs.push({ name: p, text: readFileSync(p, 'utf8') });
      }
    }
  }
  return inputs;
}

const loadModel = (path) => (path ? JSON.parse(readFileSync(path, 'utf8')) : DEFAULT_MODEL);

async function scan(opts) {
  if (!opts._.length) fail('nothing to scan (try --help)');
  const model = loadModel(opts.model);
  const inputs = await readInputs(opts._);
  if (!inputs.length) fail('no scannable files found');
  const results = inputs
    .map((i) => analyze(i.text, { filename: i.name, kind: opts.kind || i.kind, context: opts.context, model }))
    .filter((r) => opts.minScore == null || r.score >= opts.minScore);

  if (opts.json) {
    process.stdout.write(JSON.stringify(results.length === 1 ? toJSON(results[0]) : results.map((r) => toJSON(r)), null, 2) + '\n');
  } else if (opts.md) {
    process.stdout.write(formatMarkdown(results) + '\n');
  } else {
    process.stdout.write(results.map((r) => formatText(r, { color: opts.color, verbose: opts.verbose })).join('\n\n') + '\n');
    if (results.length > 1) {
      const flagged = results.filter((r) => r.verdict.id === 'slop').length;
      const mean = Math.round(results.reduce((a, r) => a + r.score, 0) / results.length);
      process.stdout.write(`\n${results.length} files · ${flagged} likely generated · mean score ${mean}\n`);
    }
  }
  if (opts.failAbove != null && results.some((r) => r.score >= opts.failAbove)) process.exit(1);
}

function readLabelled(dir, label) {
  if (!dir || !existsSync(dir)) fail(`training needs --human <dir> and --ai <dir>`);
  return [...walk(dir)].map((p) => ({ filename: basename(p), text: readFileSync(p, 'utf8'), label }));
}

function trainCmd(opts) {
  const examples = [...readLabelled(opts.human, 0), ...readLabelled(opts.ai, 1)];
  const before = evaluate(examples);
  const { model, metrics } = train(examples, { name: opts.out ? basename(opts.out, '.json') : 'trained' });
  const out = opts.out || 'model.json';
  writeFileSync(out, JSON.stringify(model, null, 2) + '\n');
  const fmt = (m) => `accuracy ${m.accuracy}, precision ${m.precision}, recall ${m.recall} (n=${m.n})`;
  process.stdout.write(`default model: ${fmt(before)}\ntrained model: ${fmt(metrics)}\nwrote ${out}\n`);
  process.stdout.write('These figures are on the training set; hold some files back to check how it generalises.\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = ['scan', 'train', 'serve', 'help'].includes(argv[0]) ? argv.shift() : 'scan';
  const opts = parseArgs(argv);
  if (opts.help || cmd === 'help' || (!argv.length && cmd === 'scan')) { process.stdout.write(HELP + '\n'); return; }
  if (cmd === 'train') return trainCmd(opts);
  if (cmd === 'serve') {
    const { serve } = await import('../server.js');
    return serve({ port: opts.port || Number(process.env.PORT) || 4173, host: opts.host, root: resolve(import.meta.dirname, '..') });
  }
  return scan(opts);
}

main().catch((e) => fail(e.message));
