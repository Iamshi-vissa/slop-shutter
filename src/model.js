// Training: fit the feature weights of the scoring model to labelled examples.
//
// The detector's features (rule hit densities and document signals) are fixed; what can
// be learned is how much each one should count. This fits an L2-regularised logistic
// regression with plain batch gradient descent. Weights start at the default model, and
// the regulariser pulls them back toward it, so a small corpus nudges rather than
// overwrites the hand-tuned priors.

import { analyze, DEFAULT_MODEL, logit } from './engine.js';

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * @param {{text: string, filename?: string, label: 0|1}[]} examples  label 1 = generated
 * @param {{epochs?: number, rate?: number, l2?: number, base?: object}} [opts]
 */
export function train(examples, opts = {}) {
  const { epochs = 400, rate = 0.1, l2 = 0.05, base = DEFAULT_MODEL } = opts;
  if (!examples.some((e) => e.label === 1) || !examples.some((e) => e.label === 0)) {
    throw new Error('Training needs at least one human (0) and one generated (1) example.');
  }
  const rows = examples.map((e) => ({
    x: analyze(e.text, { filename: e.filename, model: base }).features,
    y: e.label,
  }));
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.x)))];
  const prior = Object.fromEntries(keys.map((k) => [k, base.weights[k] ?? base.scale]));
  const w = { ...prior };
  let bias = base.bias;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const grad = Object.fromEntries(keys.map((k) => [k, 0]));
    let gb = 0;
    for (const { x, y } of rows) {
      const p = sigmoid(logit(x, { bias, weights: w, scale: base.scale }));
      const err = p - y;
      gb += err;
      for (const [k, v] of Object.entries(x)) grad[k] += err * v;
    }
    bias -= (rate * gb) / rows.length;
    for (const k of keys) {
      w[k] -= rate * (grad[k] / rows.length + l2 * (w[k] - prior[k]));
    }
  }

  const model = {
    name: opts.name || 'trained',
    bias: Math.round(bias * 1000) / 1000,
    scale: base.scale,
    weights: Object.fromEntries(keys.map((k) => [k, Math.round(w[k] * 1000) / 1000])),
    trainedOn: { human: rows.filter((r) => r.y === 0).length, generated: rows.filter((r) => r.y === 1).length },
  };
  return { model, metrics: evaluate(examples, model) };
}

/** Accuracy, precision and recall at a score threshold of 50. */
export function evaluate(examples, model = DEFAULT_MODEL) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const e of examples) {
    const hit = analyze(e.text, { filename: e.filename, model }).score >= 50;
    if (hit && e.label === 1) tp++;
    else if (hit) fp++;
    else if (e.label === 1) fn++;
    else tn++;
  }
  const r = (a, b) => (b ? Math.round((a / b) * 1000) / 1000 : null);
  return { n: examples.length, accuracy: r(tp + tn, examples.length), precision: r(tp, tp + fp), recall: r(tp, tp + fn), tp, fp, tn, fn };
}
