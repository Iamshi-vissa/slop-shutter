// Slop Shutter web interface. All analysis runs in the browser with the same engine as the CLI.

import { analyze, CATEGORIES, formatMarkdown, toJSON } from '../src/index.js';

const $ = (id) => document.getElementById(id);
const el = {
  tabs: $('tabs'), input: $('input'), layer: $('layer'), scroll: $('editor-scroll'), empty: $('empty'),
  samples: $('samples'), kind: $('kind'), detected: $('detected'), urlForm: $('url-form'), url: $('url'),
  scorecard: $('scorecard'), scoreNum: $('score-num'), verdict: $('verdict'), verdictMeta: $('verdict-meta'),
  marker: $('meter-marker'), breakdownPanel: $('breakdown-panel'), breakdown: $('breakdown'),
  signalsPanel: $('signals-panel'), signals: $('signals'), signalCount: $('signal-count'), chips: $('chips'),
  fileInput: $('file-input'), context: $('context'), verdictContext: $('verdict-context'), capped: $('capped'),
  checked: $('checked'), checkedList: $('checked-list'), checkedCount: $('checked-count'), dropzone: $('dropzone'), toast: $('toast'),
};

const SAMPLES = [
  { file: 'ai-blog-post.md', label: 'Generated blog post' },
  { file: 'ai-landing-page.html', label: 'Generated landing page' },
  { file: 'ai-script.py', label: 'Generated Python' },
  { file: 'ai-component.jsx', label: 'Generated React' },
  { file: 'ai-readme.md', label: 'Generated README' },
  { file: 'human-notes.md', label: 'Hand-written notes', human: true },
  { file: 'human-readme.md', label: 'Hand-written README', human: true },
  { file: 'handmade-page.html', label: 'Hand-made web page', human: true },
];
const KIND_LABEL = { prose: 'prose', html: 'web page', code: 'code' };
const STORE_KEY = 'slop-shutter:v1';
const MAX_HITS = 40;

let nextId = 1;
const state = {
  docs: [],
  active: null,
  filter: 'all',
  open: new Set(),
  hot: null,
};

// ── Persistence (per-viewer convenience only; the app works without it) ──────
function save() {
  try {
    const docs = state.docs.map(({ id, name, text, kind, context }) => ({ id, name, text, kind, context }));
    const payload = JSON.stringify({ docs, active: state.active });
    if (payload.length < 1_500_000) localStorage.setItem(STORE_KEY, payload);
  } catch { /* storage unavailable */ }
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved?.docs?.length) return false;
    state.docs = saved.docs.map((d) => ({ ...d, result: null }));
    nextId = Math.max(...state.docs.map((d) => d.id)) + 1;
    state.active = state.docs.some((d) => d.id === saved.active) ? saved.active : state.docs[0].id;
    return true;
  } catch { return false; }
}

// ── Documents ─────────────────────────────────────────────────────────────────
const current = () => state.docs.find((d) => d.id === state.active);

function addDoc(name, text = '', kind = 'auto') {
  const doc = { id: nextId++, name, text, kind, context: 'auto', result: null };
  // Replace the active tab if it is an empty Untitled one, rather than piling up blanks.
  const cur = current();
  const i = cur && !cur.text && cur.name === 'Untitled' && name !== 'Untitled' ? state.docs.indexOf(cur) : -1;
  if (i >= 0) state.docs.splice(i, 1, doc); else state.docs.push(doc);
  select(doc.id);
  return doc;
}

function closeDoc(id) {
  const i = state.docs.findIndex((d) => d.id === id);
  if (i === -1) return;
  state.docs.splice(i, 1);
  if (!state.docs.length) { addDoc('Untitled'); return; }
  if (state.active === id) select(state.docs[Math.max(0, i - 1)].id);
  else renderTabs();
  save();
}

function select(id) {
  state.active = id;
  state.open.clear();
  state.hot = null;
  const doc = current();
  el.input.value = doc.text;
  el.scroll.scrollTop = 0;
  run();
}

// ── Analysis ─────────────────────────────────────────────────────────────────
function run() {
  const doc = current();
  doc.result = doc.text.trim()
    ? analyze(doc.text, {
      filename: doc.name === 'Untitled' ? '' : doc.name,
      kind: doc.kind === 'auto' ? undefined : doc.kind,
      context: doc.context || 'auto',
    })
    : null;
  renderTabs();
  renderToolbar();
  renderLayer();
  renderReport();
  save();
}

let pending = 0;
el.input.addEventListener('input', () => {
  const doc = current();
  doc.text = el.input.value;
  // Keep the layer's text in step immediately so its height never lags the textarea;
  // re-run the analysis right away for normal sizes, debounced for very large inputs.
  if (doc.text.length < 60_000) { run(); return; }
  el.layer.textContent = doc.text + '\n';
  clearTimeout(pending);
  pending = setTimeout(run, 250);
});

// ── Rendering: tabs and toolbar ──────────────────────────────────────────────
const ICON_X = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>';

function renderTabs() {
  el.tabs.replaceChildren(...state.docs.map((d) => {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(d.id === state.active));
    tab.tabIndex = d.id === state.active ? 0 : -1;
    tab.title = d.name;
    const r = d.result;
    tab.innerHTML = `<span class="tab-name"></span>${r ? `<span class="pill ${r.verdict.id}" title="${r.verdict.label}">${r.score}</span>` : ''}<button class="tab-close" aria-label="Close ${escapeAttr(d.name)}">${ICON_X}</button>`;
    tab.querySelector('.tab-name').textContent = d.name;
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) { e.stopPropagation(); closeDoc(d.id); return; }
      if (d.id !== state.active) select(d.id);
    });
    tab.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(d.id); } });
    return tab;
  }), Object.assign(document.createElement('button'), {
    className: 'tab-add', innerHTML: ICON_PLUS, title: 'New document', ariaLabel: 'New document',
    onclick: () => { addDoc('Untitled'); el.input.focus(); },
  }));
}

function renderToolbar() {
  const doc = current();
  for (const b of el.kind.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.kind === doc.kind));
  el.context.value = doc.context || 'auto';
  const r = doc.result;
  el.detected.textContent = r && doc.kind === 'auto' ? `Reading as ${KIND_LABEL[r.kind]}${r.kind === 'code' ? ' (comments and copy)' : ''}` : '';
}

el.context.addEventListener('change', () => {
  current().context = el.context.value;
  run();
});

el.kind.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-kind]');
  if (!b) return;
  current().kind = b.dataset.kind;
  run();
});

// ── Rendering: highlight layer ───────────────────────────────────────────────
function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

function renderLayer() {
  const doc = current();
  const text = doc.text;
  el.empty.hidden = Boolean(text);
  const r = doc.result;
  if (!r) { el.layer.textContent = text + '\n'; return; }
  // Findings come sorted by start; skip any that overlap one already drawn.
  const ruleCategory = Object.fromEntries(r.rules.map((x) => [x.id, x.category]));
  let html = '';
  let at = 0;
  for (const f of r.findings) {
    if (f.start < at) continue;
    const eff = f.weight * (f.discount ? f.discount.factor : 1);
    const w = !f.counted ? 'off' : eff >= 2.5 ? 'w3' : eff >= 1.2 ? 'w2' : 'w1';
    const dim = state.filter !== 'all' && ruleCategory[f.rule] !== state.filter ? ' dim' : '';
    const hot = state.hot === f.rule ? ' hot' : '';
    html += escapeHtml(text.slice(at, f.start));
    html += `<mark class="${w}${dim}${hot}" data-f="${f.id}" data-rule="${f.rule}">${escapeHtml(text.slice(f.start, f.end))}</mark>`;
    at = f.end;
  }
  html += escapeHtml(text.slice(at)) + '\n';
  el.layer.innerHTML = html;
}

function setHot(rule) {
  if (state.hot === rule) return;
  state.hot = rule;
  for (const m of el.layer.querySelectorAll('mark')) m.classList.toggle('hot', m.dataset.rule === rule);
}

function reveal(finding) {
  const mark = el.layer.querySelector(`mark[data-f="${finding.id}"]`);
  el.input.focus({ preventScroll: true });
  el.input.setSelectionRange(finding.start, finding.end);
  if (mark) {
    const top = mark.offsetTop - el.scroll.clientHeight / 3;
    el.scroll.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    mark.classList.remove('flash');
    void mark.offsetWidth;
    mark.classList.add('flash');
  }
}

// ── Rendering: report ────────────────────────────────────────────────────────
const fmtPts = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`;

function renderReport() {
  const r = current().result;
  el.scorecard.dataset.verdict = r ? r.verdict.id : '';
  if (!r) {
    el.scoreNum.textContent = '–';
    el.verdict.textContent = 'Waiting for input';
    el.verdictMeta.textContent = 'Scores how much the text looks generated.';
    el.marker.style.opacity = 0;
    el.breakdownPanel.hidden = true;
    el.signalsPanel.hidden = true;
    el.verdictContext.textContent = '';
    el.capped.hidden = true;
    return;
  }
  el.scoreNum.textContent = r.score;
  el.verdict.textContent = r.verdict.label;
  const words = r.kind === 'code' ? `${r.stats.codeLines} lines` : `${r.stats.words} words`;
  el.verdictMeta.textContent = `${capitalise(KIND_LABEL[r.kind])} · ${words} · ${r.confidence} confidence${r.confidence === 'low' ? ' (short input)' : ''}`;
  const ctx = r.context;
  el.verdictContext.textContent = `${ctx.label}${ctx.markers.length ? `: ${ctx.markers.join(', ')}` : ''}`;
  el.capped.hidden = !r.capped;
  if (r.capped) el.capped.textContent = `Held at ${r.score} (would be ${r.capped.from}). ${r.capped.reason}`;
  el.marker.style.left = `${r.score}%`;
  el.marker.style.opacity = 1;

  renderBreakdown(r);
  renderSignals(r);
}

function renderBreakdown(r) {
  const cats = r.categories.filter((c) => Math.abs(c.contribution) >= 0.05);
  el.breakdownPanel.hidden = !cats.length;
  const max = Math.max(...cats.map((c) => Math.abs(c.contribution)), 1);
  el.breakdown.replaceChildren(...cats.map((c) => {
    const li = document.createElement('li');
    if (c.contribution < 0) li.className = 'neg';
    li.title = c.blurb;
    li.innerHTML = `<span class="name"></span><span class="bar"><span style="width:${(Math.abs(c.contribution) / max) * 100}%"></span></span><span class="pts">${fmtPts(c.contribution)}</span>`;
    li.querySelector('.name').textContent = c.label;
    return li;
  }));
}

function renderSignals(r) {
  const items = [
    ...r.rules.map((x) => ({ ...x, kind: 'rule' })),
    ...r.signals.map((s) => ({ ...s, kind: 'signal', why: s.detail, count: null })),
  ].sort((a, b) => b.contribution - a.contribution);

  el.signalsPanel.hidden = false;
  const counted = r.findings.filter((f) => f.counted).length;
  el.signalCount.textContent = counted ? `${counted} flagged` : '';
  renderChecked(r);

  // Category chips, only for categories present.
  const present = [...new Set(items.map((i) => i.category))];
  if (state.filter !== 'all' && !present.includes(state.filter)) state.filter = 'all';
  el.chips.hidden = present.length < 2;
  el.chips.replaceChildren(...['all', ...present].map((id) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = id === 'all' ? 'All' : CATEGORIES[id].label;
    b.setAttribute('aria-pressed', String(state.filter === id));
    b.onclick = () => { state.filter = id; renderLayer(); renderSignals(r); };
    return b;
  }));

  const shown = items.filter((i) => state.filter === 'all' || i.category === state.filter);
  if (!shown.length) {
    const p = document.createElement('p');
    p.className = 'none';
    p.textContent = 'No generated-text patterns found.';
    el.signals.replaceChildren(p);
    return;
  }

  el.signals.replaceChildren(...shown.map((item) => {
    const li = document.createElement('li');
    li.className = 'signal';
    const key = `${item.kind}:${item.id}`;
    const isOpen = state.open.has(key);
    const neg = item.contribution < 0;
    const sev = neg ? 'neg' : item.contribution >= 1.5 ? 's3' : item.contribution >= 0.7 ? 's2' : 's1';
    li.innerHTML = `
      <button class="signal-head" aria-expanded="${isOpen}">
        <span class="sev ${sev}"></span>
        <span><span class="signal-label"></span><span class="signal-cat"></span></span>
        <span class="signal-n">${item.count ? `×${item.count}` : 'whole text'}</span>
        <span class="signal-pts${neg ? ' neg' : ''}">${fmtPts(item.contribution)}</span>
      </button>`;
    li.querySelector('.signal-label').textContent = item.label;
    li.querySelector('.signal-cat').textContent = CATEGORIES[item.category].label;
    const head = li.firstElementChild;
    head.onclick = () => {
      if (state.open.has(key)) state.open.delete(key); else state.open.add(key);
      renderSignals(r);
    };
    if (item.kind === 'rule') {
      head.onmouseenter = () => setHot(item.id);
      head.onmouseleave = () => setHot(null);
      head.onfocus = () => setHot(item.id);
      head.onblur = () => setHot(null);
    }
    if (isOpen) li.append(signalBody(item, r));
    return li;
  }));
}

function signalBody(item, r) {
  const body = document.createElement('div');
  body.className = 'signal-body';
  const why = document.createElement('p');
  why.className = 'signal-why';
  why.textContent = item.why;
  body.append(why);
  if (item.kind !== 'rule') return body;
  const hits = r.findings.filter((f) => f.rule === item.id && f.counted);
  const ul = document.createElement('ul');
  ul.className = 'hits';
  for (const f of hits.slice(0, MAX_HITS)) {
    const b = document.createElement('button');
    b.className = 'hit';
    b.innerHTML = '<span class="hit-pos"></span><span class="hit-text"></span>';
    b.firstChild.textContent = `${f.line}:${f.col}`;
    b.lastChild.textContent = f.text.replace(/\s+/g, ' ');
    b.title = 'Show in the text';
    b.onclick = () => reveal(f);
    b.onmouseenter = () => setHot(item.id);
    const li = document.createElement('li');
    li.append(b);
    ul.append(li);
  }
  body.append(ul);
  if (hits.length > MAX_HITS) {
    const more = document.createElement('p');
    more.className = 'more';
    more.textContent = `…and ${hits.length - MAX_HITS} more`;
    body.append(more);
  }
  return body;
}

// Flags that context set aside, grouped by reason, each with its passages.
function renderChecked(r) {
  const groups = r.discounted.filter((d) => d.factor === 0);
  const n = groups.reduce((a, g) => a + g.count, 0);
  el.checked.hidden = !n;
  el.checkedCount.textContent = n ? `${n}` : '';
  el.checkedList.replaceChildren(...groups.map((g) => {
    const li = document.createElement('li');
    li.className = 'signal';
    const key = `checked:${g.reason}`;
    const isOpen = state.open.has(key);
    li.innerHTML = `
      <button class="signal-head" aria-expanded="${isOpen}">
        <span class="sev off"></span>
        <span class="signal-label"></span>
        <span class="signal-n">×${g.count}</span>
        <span class="signal-pts neg">0</span>
      </button>`;
    li.querySelector('.signal-label').textContent = g.reason;
    li.firstElementChild.onclick = () => {
      if (state.open.has(key)) state.open.delete(key); else state.open.add(key);
      renderChecked(r);
    };
    if (isOpen) {
      const ul = document.createElement('ul');
      ul.className = 'hits signal-body';
      for (const id of g.findings.slice(0, MAX_HITS)) {
        const f = r.findings[id];
        const b = document.createElement('button');
        b.className = 'hit';
        b.innerHTML = '<span class="hit-pos"></span><span class="hit-text"></span><span class="hit-note"></span>';
        b.children[0].textContent = `${f.line}:${f.col}`;
        b.children[1].textContent = `${f.label} · ${f.text.replace(/\s+/g, ' ')}`;
        b.children[2].textContent = f.discount.reason;
        b.onclick = () => reveal(f);
        const item = document.createElement('li');
        item.append(b);
        ul.append(item);
      }
      li.append(ul);
    }
    return li;
  }));
}

const capitalise = (s) => s[0].toUpperCase() + s.slice(1);

// ── Files, samples, URLs ─────────────────────────────────────────────────────
async function openFiles(files) {
  let opened = 0;
  for (const file of files) {
    if (file.size > 3_000_000) { toast(`${file.name} is larger than 3 MB`); continue; }
    const text = await file.text();
    if (/\u0000/.test(text.slice(0, 2000))) { toast(`${file.name} looks like a binary file`); continue; }
    addDoc(file.name, text);
    opened++;
  }
  if (opened > 1) toast(`Opened ${opened} files`);
}

$('open-file').onclick = () => el.fileInput.click();
el.fileInput.onchange = () => { openFiles([...el.fileInput.files]); el.fileInput.value = ''; };

let dragDepth = 0;
addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; el.dropzone.hidden = false; } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; el.dropzone.hidden = true; } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  el.dropzone.hidden = true;
  if (e.dataTransfer?.files.length) openFiles([...e.dataTransfer.files]);
});

function renderSamples() {
  const label = document.createElement('p');
  label.className = 'samples-label';
  label.textContent = 'Or try a sample';
  el.samples.replaceChildren(label, ...SAMPLES.map((s) => {
    const b = document.createElement('button');
    b.className = 'sample';
    b.innerHTML = `<span class="dot${s.human ? ' h' : ''}"></span>`;
    b.append(s.label);
    b.onclick = async () => {
      try {
        const res = await fetch(new URL(`../samples/${s.file}`, import.meta.url));
        if (!res.ok) throw new Error(res.status);
        addDoc(s.file, await res.text());
      } catch {
        toast('Could not load the sample');
      }
    };
    return b;
  }));
}

// The URL field needs the local server's fetch endpoint; hide it when that is not available.
fetch(new URL('../api/health', import.meta.url)).then((r) => { if (r.ok) el.urlForm.hidden = false; }).catch(() => {});
el.urlForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  let url = el.url.value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const button = el.urlForm.querySelector('button');
  button.disabled = true;
  button.textContent = 'Fetching…';
  try {
    const res = await fetch(new URL(`../api/fetch?url=${encodeURIComponent(url)}`, import.meta.url));
    if (!res.ok) throw new Error(await res.text());
    const page = await res.json();
    const html = /html/i.test(page.contentType);
    const doc = addDoc(new URL(page.url).host + new URL(page.url).pathname.replace(/\/$/, ''), page.text, html ? 'html' : 'auto');
    if (page.status >= 400) toast(`${doc.name} answered with HTTP ${page.status}`);
    el.url.value = '';
  } catch (err) {
    toast(err.message || 'Could not fetch that page');
  } finally {
    button.disabled = false;
    button.textContent = 'Fetch';
  }
});

// ── Export ───────────────────────────────────────────────────────────────────
$('copy-md').onclick = async () => {
  const r = current().result;
  if (!r) return;
  try {
    await navigator.clipboard.writeText(formatMarkdown([{ ...r, filename: current().name }]));
    toast('Report copied as Markdown');
  } catch {
    toast('Clipboard is not available here');
  }
};
$('download-json').onclick = () => {
  const r = current().result;
  if (!r) return;
  const blob = new Blob([JSON.stringify(toJSON({ ...r, filename: current().name }), null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${current().name.replace(/[^\w.-]+/g, '_')}.slop.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// ── Theme, keyboard, toast ───────────────────────────────────────────────────
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
try { applyTheme(localStorage.getItem('slop-shutter:theme')); } catch { /* ignore */ }
$('theme').onclick = () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('slop-shutter:theme', next); } catch { /* ignore */ }
};

addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); el.fileInput.click(); }
});

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

// ── Start ────────────────────────────────────────────────────────────────────
renderSamples();
if (restore()) select(state.active);
else addDoc('Untitled');
