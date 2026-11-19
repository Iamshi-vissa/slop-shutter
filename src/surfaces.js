// Document preparation: decide what kind of file this is and build the "text" surface.
//
// Every surface is the same length as the source, with the parts that are not readable
// text blanked to spaces (newlines are kept). That way a match offset in any surface is
// also an offset in the original file, and highlights never need remapping.

import { codeRegions } from './context.js';

const EXT = {
  prose: ['txt', 'md', 'markdown', 'mdx', 'rst', 'text', 'adoc', 'org', 'tex', 'rtf', 'eml'],
  html: ['html', 'htm', 'xhtml', 'shtml'],
  // code, grouped by comment syntax
  c: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'java', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'go',
    'rs', 'swift', 'kt', 'kts', 'scala', 'dart', 'php', 'vue', 'svelte', 'astro', 'css', 'scss',
    'less', 'sass', 'json5', 'zig'],
  hash: ['py', 'rb', 'sh', 'bash', 'zsh', 'fish', 'pl', 'r', 'yaml', 'yml', 'toml', 'ini',
    'conf', 'cfg', 'dockerfile', 'makefile', 'mk', 'ps1', 'jl', 'ex', 'exs', 'nim', 'cr'],
  dash: ['sql', 'lua', 'hs', 'elm'],
};

// Code files that usually carry markup, styling or user-facing copy.
const WEB = new Set(['jsx', 'tsx', 'vue', 'svelte', 'astro', 'css', 'scss', 'less', 'sass', 'php']);

export const KINDS = ['prose', 'html', 'code'];

export function extensionOf(filename = '') {
  const base = filename.split(/[\\/]/).pop().toLowerCase();
  if (base === 'dockerfile' || base === 'makefile') return base;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1) : '';
}

/** Guess kind and comment syntax from the file name, falling back to the content. */
export function detect(source, filename = '') {
  const ext = extensionOf(filename);
  if (EXT.html.includes(ext)) return { kind: 'html', lang: 'html', web: true };
  if (EXT.prose.includes(ext)) return { kind: 'prose', lang: 'prose', web: false };
  for (const lang of ['c', 'hash', 'dash']) {
    if (EXT[lang].includes(ext)) return { kind: 'code', lang, web: WEB.has(ext) };
  }
  return sniff(source);
}

function sniff(source) {
  const head = source.slice(0, 4000);
  if (/^\s*(?:<!doctype html|<html[\s>])/i.test(head)) return { kind: 'html', lang: 'html', web: true };
  const lines = head.split('\n').filter((l) => l.trim());
  if (!lines.length) return { kind: 'prose', lang: 'prose', web: false };
  const codeish = lines.filter((l) => /[{};]\s*$|^\s*(?:import|export|from|def|class|function|const|let|var|return|if|for|while|#include|package|use|fn|pub|async)\b|=>|\)\s*\{|^\s*@\w+/.test(l)).length;
  const tags = (head.match(/<\/?(?:div|p|section|span|a|body|head|h[1-6]|ul|li|main|nav|header|footer|button)\b/gi) || []).length;
  if (codeish / lines.length > 0.3) {
    const hash = /^\s*(?:def |import \w+$|from [\w.]+ import|#!.*(?:python|bash|sh))/m.test(head) || (/^\s*#\s/m.test(head) && !/\/\//.test(head));
    return { kind: 'code', lang: hash ? 'hash' : 'c', web: tags >= 2 || /className=/.test(head) };
  }
  if (tags >= 4) return { kind: 'html', lang: 'html', web: true };
  return { kind: 'prose', lang: 'prose', web: false };
}

const blank = (s) => s.replace(/[^\n]/g, ' ');

/** Keep visible text of an HTML document; blank tags, scripts, styles and comments. */
export function htmlText(src) {
  return src
    .replace(/<(script|style|noscript|template|svg|pre|code|kbd|samp|var)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<\/?[a-zA-Z!][^>]*>/g, blank)
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => (m === '&mdash;' || m === '&#8212;' ? m : blank(m)));
}

/**
 * Keep comments (and Python-style docstrings); blank code and string literals.
 * Returns the masked text and the comment ranges, used for comment density.
 */
export function codeComments(src, lang) {
  const out = new Array(src.length);
  const ranges = [];
  const n = src.length;
  let i = 0;
  const copy = (from, to) => { for (let k = from; k < to; k++) out[k] = src[k]; ranges.push([from, to]); };
  const skip = (from, to) => { for (let k = from; k < to; k++) out[k] = src[k] === '\n' ? '\n' : ' '; };
  const lineEnd = (from) => { const e = src.indexOf('\n', from); return e === -1 ? n : e; };

  while (i < n) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    const three = src.slice(i, i + 3);
    if (lang === 'c' && two === '//') { const e = lineEnd(i); copy(i, e); i = e; continue; }
    if (lang === 'c' && two === '/*') { let e = src.indexOf('*/', i + 2); e = e === -1 ? n : e + 2; copy(i, e); i = e; continue; }
    if (lang === 'hash' && c === '#') { const e = lineEnd(i); copy(i, e); i = e; continue; }
    if (lang === 'dash' && two === '--') { const e = lineEnd(i); copy(i, e); i = e; continue; }
    if (lang === 'hash' && (three === '"""' || three === "'''")) {
      // Docstrings read as prose; other triple-quoted strings are rare enough to accept.
      let e = src.indexOf(three, i + 3); e = e === -1 ? n : e + 3; copy(i, e); i = e; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let e = i + 1;
      while (e < n && src[e] !== c) { if (src[e] === '\\') e++; else if (src[e] === '\n' && c !== '`') break; e++; }
      skip(i, Math.min(e + 1, n)); i = e + 1; continue;
    }
    out[i] = c === '\n' ? '\n' : ' ';
    i++;
  }
  return { text: out.join(''), ranges };
}

function blankRanges(src, ranges) {
  if (!ranges.length) return src;
  const out = src.split('');
  for (const [a, b] of ranges) for (let i = a; i < b; i++) if (out[i] !== '\n') out[i] = ' ';
  return out.join('');
}

/** Build the document record the engine works on. */
export function prepare(source, filename = '', kindOverride) {
  const raw = String(source ?? '').replace(/\r\n?/g, '\n');
  let info = detect(raw, filename);
  if (kindOverride && KINDS.includes(kindOverride) && kindOverride !== info.kind) {
    info = kindOverride === 'code'
      ? { kind: 'code', lang: sniff(raw).lang === 'hash' ? 'hash' : 'c', web: info.web }
      : { kind: kindOverride, lang: kindOverride, web: kindOverride === 'html' };
  }
  let text = raw;
  let commentRanges = [];
  const regions = info.kind === 'code' ? [] : codeRegions(raw, info.kind);
  if (info.kind === 'prose') text = blankRanges(raw, regions);
  if (info.kind === 'html') text = htmlText(raw);
  if (info.kind === 'code') ({ text, ranges: commentRanges } = codeComments(raw, info.lang));
  // Code spans inside comments, and web addresses anywhere, are not prose.
  if (info.kind === 'code') text = text.replace(/`[^`\n]+`/g, blank);
  text = text.replace(/\bhttps?:\/\/[^\s)>\]"'`]+|\]\([^)\s]+\)/g, blank);
  return { filename, ...info, raw, text, commentRanges, codeRegions: regions };
}
