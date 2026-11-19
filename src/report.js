// Formatting results for terminals, Markdown and JSON.

import { CATEGORIES } from './rules.js';

const ESC = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
const plain = (s) => s;

export function palette(color) {
  return color
    ? { bold: ESC('1'), dim: ESC('2'), red: ESC('31'), yellow: ESC('33'), green: ESC('32'), cyan: ESC('36') }
    : { bold: plain, dim: plain, red: plain, yellow: plain, green: plain, cyan: plain };
}

const bar = (score, width = 20) => {
  const n = Math.round((score / 100) * width);
  return '█'.repeat(n) + '░'.repeat(width - n);
};

/** Human-readable terminal report for one result. */
export function formatText(result, { color = false, verbose = false, max = 12 } = {}) {
  const c = palette(color);
  const tone = result.verdict.id === 'slop' ? c.red : result.verdict.id === 'mixed' ? c.yellow : c.green;
  const out = [];
  const name = result.filename || '(input)';
  out.push(`${c.bold(name)}  ${c.dim(`${result.kind} · ${result.stats.words} words · ${result.confidence} confidence`)}`);
  out.push(`  ${tone(bar(result.score))} ${tone(c.bold(String(result.score).padStart(3)))}  ${tone(result.verdict.label)}`);
  const ctx = result.context;
  out.push(c.dim(`  Context: ${ctx.label}${ctx.markers.length ? ` (${ctx.markers.join(', ')})` : ''}`));
  if (result.capped) out.push(c.yellow(`  Capped from ${result.capped.from}: ${result.capped.reason}`));

  const top = [
    ...result.rules.map((r) => ({ label: r.label, n: r.count, pts: r.contribution, cat: r.category })),
    ...result.signals.map((s) => ({ label: s.label, n: null, pts: s.contribution, cat: s.category, detail: s.detail })),
  ].sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));

  if (top.length) {
    out.push('');
    for (const t of top.slice(0, verbose ? top.length : max)) {
      const pts = (t.pts > 0 ? '+' : '') + t.pts.toFixed(1);
      const count = t.n ? c.dim(` ×${t.n}`) : '';
      out.push(`  ${(t.pts > 0 ? c.red : c.green)(pts.padStart(5))}  ${t.label}${count}  ${c.dim(CATEGORIES[t.cat].label)}`);
      if (verbose && t.detail) out.push(`         ${c.dim(t.detail)}`);
    }
    if (!verbose && top.length > max) out.push(c.dim(`         …and ${top.length - max} more (use --verbose)`));
  }

  const off = result.discounted.filter((d) => d.factor === 0);
  if (off.length) {
    const n = off.reduce((a, d) => a + d.count, 0);
    out.push('', c.dim(`  Checked, not counted (${n}):`));
    for (const d of off) out.push(c.dim(`    ${String(d.count).padStart(3)}× ${d.reason}`));
  }

  if (verbose && result.findings.length) {
    out.push('');
    for (const f of result.findings) {
      const snippet = f.text.replace(/\s+/g, ' ').slice(0, 70);
      const note = f.discount ? c.dim(f.counted ? `  (reduced: ${f.discount.reason})` : `  (not counted: ${f.discount.reason})`) : '';
      const label = f.counted ? f.label.padEnd(34) : c.dim(f.label.padEnd(34));
      out.push(`  ${c.cyan(`${f.line}:${f.col}`.padEnd(8))} ${label} ${c.dim(snippet)}${note}`);
    }
  }
  return out.join('\n');
}

/** Markdown report covering one or more results. */
export function formatMarkdown(results) {
  const out = ['# Slop Shutter report', ''];
  out.push('| File | Score | Verdict | Flags |', '| --- | ---: | --- | ---: |');
  for (const r of results) out.push(`| ${r.filename || '(input)'} | ${r.score} | ${r.verdict.label} | ${r.findings.length} |`);
  for (const r of results) {
    out.push('', `## ${r.filename || '(input)'} — ${r.score}/100, ${r.verdict.label.toLowerCase()}`, '');
    out.push(`${r.context.label}, ${r.stats.words} words, ${r.confidence} confidence.`, '');
    if (r.capped) out.push(`> Capped from ${r.capped.from}. ${r.capped.reason}`, '');
    const items = [...r.rules, ...r.signals].sort((a, b) => b.contribution - a.contribution);
    if (!items.length) { out.push('No signals found.'); continue; }
    out.push('| Signal | Category | Hits | Points |', '| --- | --- | ---: | ---: |');
    for (const it of items) {
      out.push(`| ${it.label.replace(/\|/g, '\\|')} | ${CATEGORIES[it.category].label} | ${it.count ?? '—'} | ${it.contribution > 0 ? '+' : ''}${it.contribution.toFixed(2)} |`);
    }
    const off = r.discounted.filter((d) => d.factor === 0);
    if (off.length) out.push('', '**Checked, not counted:** ' + off.map((d) => `${d.reason} (${d.count})`).join('; ') + '.');
    const lines = r.findings.filter((f) => f.counted).slice(0, 50).map((f) => `- \`${f.line}:${f.col}\` ${f.label}: “${f.text.replace(/\s+/g, ' ').slice(0, 90)}”`);
    if (lines.length) out.push('', '<details><summary>Flagged passages</summary>', '', ...lines, '', '</details>');
  }
  out.push('', '_Scores are statistical evidence, not proof of authorship._');
  return out.join('\n');
}

/** Compact JSON-safe result (drops the raw feature map unless asked). */
export function toJSON(result, { features = false } = {}) {
  const { features: f, ...rest } = result;
  return features ? result : rest;
}
