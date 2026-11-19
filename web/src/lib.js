// Shared helpers: the analysis client, colour families and small utilities.
import { analyze } from '../../src/index.js';

// ── Colour families ───────────────────────────────────────────────────────────
// Nine categories collapse into three families, each with one hue. The hue tells you
// what kind of tell it is; the strength of the colour tells you how much it counts.
export const FAMILY_OF = {
  artifact: 'lang', phrase: 'lang', vocab: 'lang', structure: 'lang',
  format: 'form', rhythm: 'form',
  comments: 'code', scaffold: 'code', template: 'code',
};
export const FAMILIES = {
  lang: { label: 'Language', hint: 'Phrases, words and sentence shapes' },
  form: { label: 'Form', hint: 'Formatting and rhythm' },
  code: { label: 'Code & web', hint: 'Comments, placeholders and template pages' },
};
export const VERDICT_TONE = { human: 'human', mixed: 'mixed', slop: 'slop' };

// ── Analysis client: a worker when possible, the main thread otherwise ────────
let worker = null;
let seq = 0;
const waiting = new Map();
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const job = waiting.get(data.id);
    if (!job) return;
    waiting.delete(data.id);
    if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
  };
  worker.onerror = (e) => {
    e.preventDefault?.();
    worker = null;
    for (const [id, job] of waiting) { waiting.delete(id); job.resolve(analyze(job.text, job.opts)); }
  };
} catch { worker = null; }

export function analyzeAsync(text, opts) {
  if (!worker) return Promise.resolve(analyze(text, opts));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject, text, opts });
    worker.postMessage({ id, text, opts });
  });
}

// While the worker works, keep existing highlights pinned to the text around the edit.
export function projectFindings(before, after, findings) {
  if (!findings || before === after) return findings || [];
  const max = Math.min(before.length, after.length);
  let p = 0;
  while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++;
  let s = 0;
  while (s < max - p && before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)) s++;
  const oldEnd = before.length - s;
  const delta = after.length - before.length;
  return findings
    .filter((f) => f.end <= p || f.start >= oldEnd)
    .map((f) => (f.start >= oldEnd ? { ...f, start: f.start + delta, end: f.end + delta } : f));
}

// Findings that can be drawn without overlapping one another.
export function drawable(findings) {
  const out = [];
  let at = 0;
  for (const f of findings) {
    if (f.start < at) continue;
    out.push(f);
    at = f.end;
  }
  return out;
}

export const fmtPts = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`;
export const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toUpperCase().slice(0, 4) || '';
export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
