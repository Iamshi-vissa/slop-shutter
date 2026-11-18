// Document-level signals: properties of the whole text rather than of one span.
// Each signal returns a signed evidence value (positive points toward generated text).

import { HUMAN_MARKERS } from './rules.js';

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export const countWords = (s) => (s.match(WORD) || []).length;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const cv = (xs) => {
  const m = mean(xs);
  if (!m) return 0;
  const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  return sd / m;
};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Split readable text into sentences, treating headings and list items as their own units. */
export function sentences(text) {
  return text
    .replace(/[ \t]+/g, ' ')
    .split(/(?<=[.!?…])["'”’)]*\s+|\n\s*\n|\n(?=\s*(?:[-*•+]|\d+[.)]|#{1,6})\s)/u)
    .map((s) => s.replace(/^\s*(?:[-*•+]|\d+[.)]|#{1,6})\s+/, '').trim())
    .filter((s) => countWords(s) >= 3);
}

export function paragraphs(text) {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => countWords(p) >= 12);
}

/**
 * Compute statistics and document-level signals for a prepared document.
 * Returns { stats, signals: [{ id, category, label, detail, value }] }.
 */
export function documentSignals(doc) {
  const text = doc.text;
  const words = countWords(doc.kind === 'code' ? doc.raw : text);
  const proseWords = countWords(text);
  const sents = sentences(text);
  const lens = sents.map(countWords);
  const paras = paragraphs(text);
  const stats = {
    words,
    proseWords,
    sentences: sents.length,
    meanSentence: round(mean(lens), 1),
    sentenceCV: round(cv(lens)),
    paragraphs: paras.length,
    paragraphCV: round(cv(paras.map(countWords))),
  };
  const signals = [];
  const add = (id, category, label, detail, value) => {
    if (Math.abs(value) >= 0.05) signals.push({ id, category, label, detail, value: round(value) });
  };

  const prosey = doc.kind !== 'code';

  // Burstiness. People mix short and long sentences; models settle into a narrow band.
  if (prosey && sents.length >= 8) {
    const c = stats.sentenceCV;
    if (c < 0.42) {
      add('uniform-sentences', 'rhythm', 'Uniform sentence length',
        `Sentence lengths vary by only ${Math.round(c * 100)}% around a mean of ${stats.meanSentence} words. Hand-written prose usually varies by 55% or more.`,
        clamp((0.42 - c) / 0.14, 0, 1) * 2.5);
    } else if (c > 0.7) {
      add('varied-sentences', 'rhythm', 'Varied sentence rhythm',
        `Sentence lengths vary by ${Math.round(c * 100)}%, which is typical of hand-written prose.`,
        -clamp((c - 0.7) / 0.3, 0, 1) * 1.2);
    }
  }

  // Paragraph uniformity: generated answers come in evenly sized blocks.
  if (prosey && paras.length >= 4 && stats.paragraphCV < 0.3) {
    add('uniform-paragraphs', 'rhythm', 'Evenly sized paragraphs',
      `${paras.length} paragraphs within ${Math.round(stats.paragraphCV * 100)}% of the same length.`,
      clamp((0.3 - stats.paragraphCV) / 0.15, 0, 1) * 1.2);
  }

  // Em dash density, per thousand words of prose.
  const dashes = (text.match(/—|(?<=\w) -- (?=\w)|&mdash;|&#8212;/g) || []).length;
  stats.emDashPer1k = proseWords ? round((dashes / proseWords) * 1000, 1) : 0;
  if (proseWords >= 80 && stats.emDashPer1k > 6) {
    add('em-dash-density', 'format', 'Heavy em dash use',
      `${dashes} em dashes, ${stats.emDashPer1k} per thousand words. Edited human prose rarely passes 5.`,
      clamp((stats.emDashPer1k - 6) / 10, 0, 1) * 2 + 0.5);
  }

  // Comment density in code: generated code explains nearly every line.
  if (doc.kind === 'code') {
    const lines = doc.raw.split('\n');
    const codeLines = lines.filter((l) => l.trim()).length;
    const commentLines = new Set();
    let offset = 0;
    const starts = lines.map((l) => { const s = offset; offset += l.length + 1; return s; });
    for (const [a, b] of doc.commentRanges) {
      for (let li = lineAt(starts, a); li <= lineAt(starts, Math.max(a, b - 1)); li++) commentLines.add(li);
    }
    stats.codeLines = codeLines;
    stats.commentLines = commentLines.size;
    stats.commentRatio = codeLines ? round(commentLines.size / codeLines) : 0;
    if (codeLines >= 15 && stats.commentRatio > 0.3) {
      add('comment-density', 'comments', 'Comment on almost every line',
        `${commentLines.size} of ${codeLines} non-blank lines carry comments (${Math.round(stats.commentRatio * 100)}%).`,
        clamp((stats.commentRatio - 0.3) / 0.25, 0, 1) * 2 + 0.4);
    }
  }

  // Human markers: casual register, hacks, doubled punctuation.
  const human = text.match(HUMAN_MARKERS) || [];
  if (human.length) {
    const sample = [...new Set(human.map((h) => h.toLowerCase()))].slice(0, 4).map((h) => `"${h}"`).join(', ');
    add('casual-register', 'rhythm', 'Casual or idiosyncratic markers',
      `Found ${sample}. Models rarely write this way unless asked to.`,
      -Math.min(2, 0.7 * human.length));
  }

  // Lowercase sentence starts: common in quick human writing, near-absent in model output.
  if (prosey && sents.length >= 5) {
    const lower = sents.filter((s) => /^[a-z]/.test(s)).length;
    if (lower / sents.length > 0.15) {
      add('lowercase-starts', 'rhythm', 'Sentences starting in lowercase',
        `${lower} of ${sents.length} sentences start in lowercase, a habit of quick hand-typed text.`,
        -1);
    }
  }

  return { stats, signals };
}

function lineAt(starts, offset) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export { lineAt };
