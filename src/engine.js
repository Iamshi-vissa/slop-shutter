// The detector: pattern rules + document signals → feature vector → logistic model → score.
//
// Features are length-normalised so a long article is not penalised for having more room
// to slip. Each feature's weight lives in a model object, so the default hand-tuned model
// can be replaced by one trained on labelled examples (see model.js).

import { RULES, CATEGORIES } from './rules.js';
import { prepare } from './surfaces.js';
import { documentSignals, countWords, lineAt } from './stats.js';

export const DEFAULT_MODEL = Object.freeze({
  name: 'default',
  bias: -2.1, // a document with no evidence scores about 11
  scale: 0.6, // weight for any feature the model has no specific weight for
  weights: {},
});

export const VERDICTS = [
  { id: 'human', max: 30, label: 'Reads as human' },
  { id: 'mixed', max: 60, label: 'Mixed signals' },
  { id: 'slop', max: 101, label: 'Likely AI-generated' },
];

export const verdictFor = (score) => VERDICTS.find((v) => score < v.max);

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Pre-compile vocabulary terms once.
const compiled = RULES.map((rule) => ({
  ...rule,
  terms: rule.terms?.map(([src, w], i) => ({ i, w, re: new RegExp(`\\b(?:${src})\\b`, 'giu') })),
}));

function surfaceFor(rule, doc) {
  if (doc.web && rule.scope.web) return rule.scope.web === 'raw' ? doc.raw : doc.text;
  const s = rule.scope[doc.kind];
  if (!s) return null;
  return s === 'raw' ? doc.raw : doc.text;
}

function* matches(re, text) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    // Drop sentence-boundary context some patterns match before the phrase itself.
    const lead = m[0].match(/^[\s.!?]*/)[0].length;
    const trail = m[0].match(/\s*$/)[0].length;
    yield { start: m.index + lead, end: m.index + m[0].length - trail, text: m[0].slice(lead, m[0].length - trail) };
  }
}

/** Run every rule over the document. Returns findings ordered by position. */
export function findRules(doc) {
  const found = [];
  const seen = new Set();
  for (const rule of compiled) {
    const surface = surfaceFor(rule, doc);
    if (!surface) continue;
    const push = (m, key, weight) => {
      const tag = `${rule.id}@${m.start}`;
      if (seen.has(tag)) return;
      seen.add(tag);
      found.push({ rule: rule.id, category: rule.category, key, weight, start: m.start, end: m.end, text: m.text });
    };
    if (rule.terms) {
      for (const t of rule.terms) for (const m of matches(t.re, surface)) push(m, `${rule.id}:${t.i}`, t.w);
    } else {
      for (const m of matches(rule.pattern, surface)) {
        if (rule.line) {
          // Extend comment findings to the end of the comment line so the whole remark is marked.
          const eol = surface.indexOf('\n', m.end);
          m.end = (eol === -1 ? surface.length : eol) - (surface.slice(m.end, eol === -1 ? undefined : eol).match(/\s*$/)[0].length);
          m.text = doc.raw.slice(m.start, m.end);
        }
        push(m, rule.id, rule.weight);
      }
    }
  }
  return found.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** Collapse findings and signals into named features. */
export function featurize(findings, signals, units) {
  const norm = Math.max(1, Math.sqrt(units / 300));
  const perKey = new Map();
  for (const f of findings) {
    const e = perKey.get(f.key) || { rule: f.rule, weight: f.weight, count: 0 };
    e.count++;
    perKey.set(f.key, e);
  }
  const features = {};
  for (const { rule, weight, count } of perKey.values()) {
    features[rule] = (features[rule] || 0) + (weight * Math.log2(1 + count)) / norm;
  }
  for (const s of signals) features[`signal:${s.id}`] = s.value;
  return features;
}

export function logit(features, model = DEFAULT_MODEL) {
  let z = model.bias;
  for (const [k, v] of Object.entries(features)) z += (model.weights[k] ?? model.scale) * v;
  return z;
}

/**
 * Analyse one document.
 * @param {string} source  file contents
 * @param {{filename?: string, kind?: 'prose'|'html'|'code', model?: object}} [opts]
 */
export function analyze(source, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const doc = prepare(source, opts.filename || '', opts.kind);
  const raw = findRules(doc);
  const { stats, signals } = documentSignals(doc);
  const units = doc.kind === 'code' ? stats.words : Math.max(stats.proseWords, 1);
  const features = featurize(raw, signals, units);
  const z = logit(features, model);
  // Clamped to 1–99: the detector reports evidence, and is never certain.
  const score = Math.min(99, Math.max(1, Math.round(100 * sigmoid(z))));

  // Explain: per-rule contribution in logit points.
  const weightOf = (k) => model.weights[k] ?? model.scale;
  const ruleMeta = Object.fromEntries(RULES.map((r) => [r.id, r]));
  const lineStarts = [0];
  for (let i = 0; i < doc.raw.length; i++) if (doc.raw[i] === '\n') lineStarts.push(i + 1);

  const findings = raw.map((f, i) => {
    const line = lineAt(lineStarts, f.start);
    return {
      id: i,
      ...f,
      label: ruleMeta[f.rule].terms ? `"${f.text.toLowerCase()}"` : ruleMeta[f.rule].label,
      line: line + 1,
      col: f.start - lineStarts[line] + 1,
    };
  });

  const rules = Object.entries(features)
    .filter(([k]) => !k.startsWith('signal:'))
    .map(([id, value]) => {
      const meta = ruleMeta[id];
      return {
        id,
        category: meta.category,
        label: meta.label,
        why: meta.why,
        count: findings.filter((f) => f.rule === id).length,
        contribution: round(weightOf(id) * value),
      };
    })
    .sort((a, b) => b.contribution - a.contribution);

  const docSignals = signals
    .map((s) => ({ ...s, contribution: round(weightOf(`signal:${s.id}`) * s.value) }))
    .sort((a, b) => b.contribution - a.contribution);

  const categories = Object.entries(CATEGORIES).map(([id, c]) => {
    const parts = [...rules.filter((r) => r.category === id), ...docSignals.filter((s) => s.category === id)];
    return {
      id,
      label: c.label,
      blurb: c.blurb,
      contribution: round(parts.reduce((a, p) => a + p.contribution, 0)),
      count: rules.filter((r) => r.category === id).reduce((a, r) => a + r.count, 0),
    };
  }).filter((c) => c.contribution !== 0 || c.count > 0)
    .sort((a, b) => b.contribution - a.contribution);

  const confidence = units < 60 ? 'low' : units < 200 ? 'medium' : 'high';

  return {
    filename: opts.filename || '',
    kind: doc.kind,
    lang: doc.lang,
    web: doc.web,
    score,
    verdict: verdictFor(score),
    confidence,
    model: model.name || 'custom',
    logit: round(z),
    stats,
    categories,
    rules,
    signals: docSignals,
    findings,
    features,
  };
}

function round(x) { return Math.round(x * 100) / 100; }

export { CATEGORIES, RULES, countWords };
