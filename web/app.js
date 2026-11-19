// Slop Shutter web app. Analysis runs in the browser (in a worker when available) with the
// same engine as the command line and the HTTP API.

import { analyze, CATEGORIES, formatMarkdown, toJSON } from '../src/index.js';

const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'), status: $('status'), statusText: $('status-text'),
  tabs: $('tabs'), kind: $('kind'), context: $('context'), detected: $('detected'),
  urlForm: $('url-form'), url: $('url'),
  wrap: $('editor-wrap'), scroll: $('editor-scroll'), layer: $('layer'), input: $('input'),
  hero: $('hero'), samples: $('samples'), minimap: $('minimap'),
  flagnav: $('flagnav'), flagnavText: $('flagnav-text'),
  report: $('report'), scorecard: $('scorecard'), shutter: $('shutter'), scoreNum: $('score-num'),
  verdict: $('verdict'), scoreMeta: $('score-meta'), marker: $('meter-marker'),
  contextLine: $('context-line'), capped: $('capped'),
  breakdownPanel: $('breakdown-panel'), breakdown: $('breakdown'),
  signalsPanel: $('signals-panel'), signals: $('signals'), signalCount: $('signal-count'), chips: $('chips'),
  checked: $('checked'), checkedList: $('checked-list'), checkedCount: $('checked-count'),
  exportBtn: $('export-btn'), exportMenu: $('export-menu'), copyCurl: $('copy-curl'),
  mobileScore: $('mobile-score'), fileInput: $('file-input'), dropzone: $('dropzone'), toast: $('toast'),
  shortcuts: $('shortcuts-dialog'),
};

const SAMPLES = [
  { file: 'ai-blog-post.md', label: 'Blog post', type: 'MD' },
  { file: 'ai-landing-page.html', label: 'Landing page', type: 'HTML' },
  { file: 'ai-script.py', label: 'Python script', type: 'PY' },
  { file: 'ai-component.jsx', label: 'React component', type: 'JSX' },
  { file: 'ai-readme.md', label: 'Project README', type: 'MD' },
  { file: 'human-readme.md', label: 'Technical README', type: 'MD', human: true },
  { file: 'human-notes.md', label: 'Personal notes', type: 'MD', human: true },
  { file: 'handmade-page.html', label: 'Community web page', type: 'HTML', human: true },
];
const KIND_LABEL = { prose: 'prose', html: 'web page', code: 'code' };
const STORE_KEY = 'slop-shutter:v2';
const MAX_HITS = 40;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  docs: [],
  active: null,
  filter: 'all',
  open: new Set(),
  hot: null,
  cursor: -1,
  editing: false,
  api: { analyze: false, fetch: false },
};
let nextId = 1;
const current = () => state.docs.find((d) => d.id === state.active);

// ── Analysis: in a worker, falling back to the main thread ────────────────────
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

function analyzeAsync(text, opts) {
  if (!worker) return Promise.resolve(analyze(text, opts));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject, text, opts });
    worker.postMessage({ id, text, opts });
  });
}

const optsFor = (doc) => ({
  filename: doc.name === 'Untitled' ? '' : doc.name,
  kind: doc.kind === 'auto' ? undefined : doc.kind,
  context: doc.context || 'auto',
});

let busyTimer = 0;
function setBusy(on, text) {
  clearTimeout(busyTimer);
  if (on) {
    busyTimer = setTimeout(() => {
      el.status.classList.add('busy');
      el.statusText.textContent = text || 'Analyzing…';
    }, text ? 0 : 160);
  } else {
    el.status.classList.remove('busy');
    el.statusText.textContent = 'Live · runs in your browser';
  }
}

async function run(doc, { reveal = false } = {}) {
  const ver = (doc.ver = (doc.ver || 0) + 1);
  if (!doc.text.trim()) {
    doc.result = null;
    doc.shown = '';
    if (doc.id === state.active) renderAll();
    else renderTabs();
    save();
    return;
  }
  setBusy(true);
  let result;
  try {
    result = await analyzeAsync(doc.text, optsFor(doc));
  } catch (err) {
    setBusy(false);
    toast(`Analysis failed: ${err.message}`);
    return;
  }
  setBusy(false);
  if (ver !== doc.ver) return; // a newer edit is already being analysed
  doc.result = result;
  doc.shown = doc.text;
  if (doc.id === state.active) renderAll({ reveal });
  else renderTabs();
  save();
}

// ── Documents ─────────────────────────────────────────────────────────────────
function addDoc(name, text = '', { kind = 'auto', context = 'auto' } = {}) {
  const doc = { id: nextId++, name, text, kind, context, result: null, shown: '' };
  const cur = current();
  const i = cur && !cur.text && cur.name === 'Untitled' && name !== 'Untitled' ? state.docs.indexOf(cur) : -1;
  if (i >= 0) state.docs.splice(i, 1, doc); else state.docs.push(doc);
  select(doc.id, { reveal: true });
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

function select(id, { reveal = false } = {}) {
  state.active = id;
  state.open.clear();
  state.hot = null;
  state.cursor = -1;
  state.filter = 'all';
  const doc = current();
  el.input.value = doc.text;
  el.scroll.scrollTop = 0;
  if (doc.result && doc.shown === doc.text) renderAll({ reveal });
  else {
    renderAll();
    run(doc, { reveal: true });
  }
  if (reveal && doc.text) scan();
}

// While the worker works, keep existing highlights pinned to the text around the edit.
function projectFindings(before, after, findings) {
  if (before === after) return findings;
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

el.input.addEventListener('input', () => {
  const doc = current();
  doc.text = el.input.value;
  const findings = doc.result ? projectFindings(doc.shown, doc.text, doc.result.findings) : [];
  renderLayer(doc.text, findings);
  updateHero();
  run(doc);
});
el.input.addEventListener('focus', () => { state.editing = true; updateHero(); });
el.input.addEventListener('blur', () => { state.editing = false; setTimeout(updateHero, 120); });

// ── Rendering ─────────────────────────────────────────────────────────────────
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');
const fmtPts = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`;
const capitalise = (s) => s[0].toUpperCase() + s.slice(1);
const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toUpperCase().slice(0, 4) || '';

function renderAll({ reveal = false } = {}) {
  const doc = current();
  renderTabs();
  renderToolbar();
  renderLayer(doc.text, doc.result?.findings || [], { reveal });
  renderReport({ reveal });
  updateHero();
}

function updateHero() {
  const doc = current();
  el.hero.hidden = Boolean(doc?.text) || state.editing;
}

const ICON_X = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>';
const ICON_CHEV = '<svg class="chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8l4 4 4-4"/></svg>';

function renderTabs() {
  const tabs = state.docs.map((d) => {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(d.id === state.active));
    tab.tabIndex = d.id === state.active ? 0 : -1;
    tab.title = d.name;
    const r = d.result;
    const ext = extOf(d.name);
    tab.innerHTML = `${ext ? `<span class="tab-kind">${ext}</span>` : ''}<span class="tab-name"></span><span class="pill ${r ? r.verdict.id : ''}">${r ? r.score : ''}</span><button class="tab-close" aria-label="Close ${escapeAttr(d.name)}">${ICON_X}</button>`;
    tab.querySelector('.tab-name').textContent = d.name;
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) { e.stopPropagation(); closeDoc(d.id); return; }
      if (d.id !== state.active) select(d.id, { reveal: true });
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(d.id, { reveal: true }); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const i = state.docs.indexOf(d) + (e.key === 'ArrowRight' ? 1 : -1);
        const next = state.docs[(i + state.docs.length) % state.docs.length];
        select(next.id);
        el.tabs.querySelector('[aria-selected="true"]')?.focus();
      }
    });
    return tab;
  });
  const add = document.createElement('button');
  add.className = 'tab-add';
  add.innerHTML = ICON_PLUS;
  add.title = 'New document (Alt+N)';
  add.setAttribute('aria-label', 'New document');
  add.onclick = newDoc;
  el.tabs.replaceChildren(...tabs, add);
  const r = current()?.result;
  el.mobileScore.textContent = r ? r.score : '';
  el.mobileScore.className = `pill ${r ? r.verdict.id : ''}`;
}

function newDoc() {
  // A new tab opens on the start screen; typing anywhere goes into the editor.
  addDoc('Untitled');
  state.editing = false;
  el.input.blur();
  updateHero();
}

function moveThumb(container, thumb, active) {
  if (!active) return;
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
}

function renderToolbar() {
  const doc = current();
  let active = null;
  for (const b of el.kind.querySelectorAll('button')) {
    const on = b.dataset.kind === doc.kind;
    b.setAttribute('aria-checked', String(on));
    if (on) active = b;
  }
  moveThumb(el.kind, el.kind.querySelector('.seg-thumb'), active);
  el.context.value = doc.context || 'auto';
  const r = doc.result;
  el.detected.textContent = r && doc.kind === 'auto' ? `Reading as ${KIND_LABEL[r.kind]}` : '';
}

el.kind.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-kind]');
  if (!b) return;
  current().kind = b.dataset.kind;
  renderToolbar();
  run(current());
});
el.kind.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const buttons = [...el.kind.querySelectorAll('button')];
  const i = buttons.findIndex((b) => b.dataset.kind === current().kind) + (e.key === 'ArrowRight' ? 1 : -1);
  const b = buttons[(i + buttons.length) % buttons.length];
  b.focus();
  b.click();
});
el.context.addEventListener('change', () => { current().context = el.context.value; run(current()); });

// Highlight layer
function drawnFindings(findings) {
  const out = [];
  let at = 0;
  for (const f of findings) {
    if (f.start < at) continue;
    out.push(f);
    at = f.end;
  }
  return out;
}

function renderLayer(text, findings, { reveal = false } = {}) {
  const drawn = drawnFindings(findings);
  let html = '';
  let at = 0;
  for (const f of drawn) {
    const eff = f.weight * (f.discount ? f.discount.factor : 1);
    const w = f.counted === false ? 'off' : eff >= 2.5 ? 'w3' : eff >= 1.2 ? 'w2' : 'w1';
    const dim = state.filter !== 'all' && f.category !== state.filter ? ' dim' : '';
    const hot = state.hot && state.hot === f.rule ? ' hot' : '';
    html += escapeHtml(text.slice(at, f.start));
    html += `<mark class="${w}${dim}${hot}" data-f="${f.id}" data-rule="${escapeAttr(f.rule)}">${escapeHtml(text.slice(f.start, f.end))}</mark>`;
    at = f.end;
  }
  html += `${escapeHtml(text.slice(at))}\n`;
  el.layer.innerHTML = html;
  el.layer.classList.toggle('reveal', reveal && !reduceMotion.matches);
  if (reveal) {
    // Stagger highlights top to bottom; set through the CSSOM so a strict CSP is fine.
    const marks = el.layer.querySelectorAll('mark');
    const H = Math.max(1, el.layer.offsetHeight);
    for (const m of marks) m.style.setProperty('--d', `${Math.round((m.offsetTop / H) * 1400)}ms`);
    setTimeout(() => el.layer.classList.remove('reveal'), 2200);
  }
  state.drawn = drawn;
  requestAnimationFrame(renderMinimap);
  renderFlagnav();
}

function renderMinimap() {
  const H = el.layer.offsetHeight;
  if (!H) return;
  const marks = [...el.layer.querySelectorAll('mark')].slice(0, 800);
  el.minimap.replaceChildren(...marks.map((m) => {
    const t = document.createElement('span');
    t.className = `tick ${m.classList.contains('off') ? 'off' : m.classList.contains('w1') ? 'w1' : ''}`;
    t.dataset.rule = m.dataset.rule;
    t.style.top = `${(m.offsetTop / H) * 100}%`;
    t.title = 'Jump to flag';
    t.onclick = () => {
      const f = current().result?.findings[Number(m.dataset.f)];
      if (f) reveal(f);
    };
    return t;
  }));
}

function scan() {
  if (reduceMotion.matches) return;
  el.wrap.classList.remove('scanning');
  void el.wrap.offsetWidth;
  el.wrap.classList.add('scanning');
}
el.wrap.addEventListener('animationend', (e) => { if (e.animationName === 'scan') el.wrap.classList.remove('scanning'); });

function setHot(rule) {
  if (state.hot === rule) return;
  state.hot = rule;
  for (const m of el.layer.querySelectorAll('mark')) m.classList.toggle('hot', m.dataset.rule === rule);
  for (const t of el.minimap.children) t.classList.toggle('hot', t.dataset.rule === rule);
}

function reveal(finding) {
  const mark = el.layer.querySelector(`mark[data-f="${finding.id}"]`);
  if (el.app.dataset.view === 'report' && matchMedia('(max-width: 920px)').matches) setView('text');
  el.input.focus({ preventScroll: true });
  el.input.setSelectionRange(finding.start, finding.end);
  if (mark) {
    const top = mark.offsetTop - el.scroll.clientHeight / 3;
    el.scroll.scrollTo({ top: Math.max(0, top), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    mark.classList.remove('flash');
    void mark.offsetWidth;
    mark.classList.add('flash');
  }
  const counted = (state.drawn || []).filter((f) => f.counted !== false);
  const i = counted.findIndex((f) => f.id === finding.id);
  if (i >= 0) { state.cursor = i; renderFlagnav(); }
}

// Flag navigator
function renderFlagnav() {
  const counted = (state.drawn || []).filter((f) => f.counted !== false);
  el.flagnav.hidden = !counted.length;
  if (!counted.length) return;
  el.flagnavText.textContent = state.cursor >= 0 && state.cursor < counted.length
    ? `${state.cursor + 1} of ${counted.length}`
    : `${counted.length} flag${counted.length > 1 ? 's' : ''}`;
}
function stepFlag(dir) {
  const counted = (state.drawn || []).filter((f) => f.counted !== false);
  if (!counted.length) return;
  if (state.cursor < 0) {
    // Start from the caret position.
    const caret = el.input.selectionStart || 0;
    const i = dir > 0 ? counted.findIndex((f) => f.start >= caret) : counted.findLastIndex((f) => f.start < caret);
    state.cursor = i === -1 ? (dir > 0 ? 0 : counted.length - 1) : i;
  } else {
    state.cursor = (state.cursor + dir + counted.length) % counted.length;
  }
  reveal(counted[state.cursor]);
}
$('flag-next').onclick = () => stepFlag(1);
$('flag-prev').onclick = () => stepFlag(-1);

// Report
const SLATS = Array.from({ length: 10 }, (_, i) => {
  const s = document.createElement('i');
  s.style.setProperty('--i', i);
  return s;
});
el.shutter.replaceChildren(...SLATS);

let shownScore = null;
let numberAnim = 0;
function animateNumber(to) {
  cancelAnimationFrame(numberAnim);
  const from = shownScore ?? 0;
  shownScore = to;
  if (reduceMotion.matches || from === to) { el.scoreNum.textContent = to; return; }
  const dur = Math.min(900, 260 + Math.abs(to - from) * 8);
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - t) ** 3;
    el.scoreNum.textContent = Math.round(from + (to - from) * e);
    if (t < 1) numberAnim = requestAnimationFrame(step);
  };
  numberAnim = requestAnimationFrame(step);
}

function renderReport({ reveal = false } = {}) {
  const r = current().result;
  el.report.classList.toggle('has-result', Boolean(r));
  if (reveal && !reduceMotion.matches) {
    el.report.classList.remove('reveal');
    void el.report.offsetWidth;
    el.report.classList.add('reveal');
    clearTimeout(renderReport.t);
    renderReport.t = setTimeout(() => el.report.classList.remove('reveal'), 1600);
  }
  el.scorecard.dataset.verdict = r ? r.verdict.id : '';
  const lit = r ? Math.round(r.score / 10) : 0;
  SLATS.forEach((s, i) => s.classList.toggle('on', i < lit));
  if (!r) {
    shownScore = null;
    el.scoreNum.textContent = '–';
    el.verdict.textContent = 'Waiting for input';
    el.scoreMeta.textContent = 'Scores how much the text reads as generated.';
    el.marker.style.opacity = '0';
    el.contextLine.hidden = true;
    el.capped.hidden = true;
    el.breakdownPanel.hidden = true;
    el.signalsPanel.hidden = true;
    return;
  }
  animateNumber(r.score);
  el.verdict.textContent = r.verdict.label;
  const size = r.kind === 'code' ? `${r.stats.codeLines} lines` : `${r.stats.words.toLocaleString()} words`;
  el.scoreMeta.textContent = `${capitalise(KIND_LABEL[r.kind])} · ${size} · ${r.confidence} confidence${r.confidence === 'low' ? ' (short input)' : ''}`;
  el.marker.style.left = `${r.score}%`;
  el.marker.style.opacity = '1';

  const ctx = r.context;
  el.contextLine.hidden = false;
  el.contextLine.innerHTML = '<b></b><span></span>';
  el.contextLine.firstChild.textContent = ctx.label;
  el.contextLine.lastChild.textContent = ctx.markers.length ? ctx.markers.join(' · ') : 'no technical markers';
  el.capped.hidden = !r.capped;
  if (r.capped) el.capped.textContent = `Held at ${r.score} (would be ${r.capped.from}). ${r.capped.reason}`;

  renderBreakdown(r);
  renderSignals(r);
  renderChecked(r);
}

function renderBreakdown(r) {
  const cats = r.categories.filter((c) => Math.abs(c.contribution) >= 0.05);
  el.breakdownPanel.hidden = !cats.length;
  const max = Math.max(...cats.map((c) => Math.abs(c.contribution)), 1);
  el.breakdown.replaceChildren(...cats.map((c, i) => {
    const li = document.createElement('li');
    if (c.contribution < 0) li.className = 'neg';
    li.title = c.blurb;
    li.innerHTML = '<span class="name"></span><span class="bar"><span></span></span><span class="pts"></span>';
    li.querySelector('.name').textContent = c.label;
    const bar = li.querySelector('.bar span');
    bar.style.transform = `scaleX(${Math.abs(c.contribution) / max})`;
    bar.style.setProperty('--i', i);
    li.querySelector('.pts').textContent = fmtPts(c.contribution);
    return li;
  }));
}

function signalItem({ key, sev, label, cat, n, pts, ptsClass = '', body }, i) {
  const li = document.createElement('li');
  li.className = `signal${state.open.has(key) ? ' open' : ''}`;
  li.style.setProperty('--i', Math.min(i, 20));
  li.innerHTML = `
    <button class="signal-head" aria-expanded="${state.open.has(key)}">
      <span class="sev ${sev}"></span>
      <span><span class="signal-label"></span><span class="signal-cat"></span></span>
      <span class="signal-n"></span>
      <span class="signal-pts ${ptsClass}"></span>
      ${ICON_CHEV}
    </button>
    <div class="signal-body"><div class="signal-inner"></div></div>`;
  li.querySelector('.signal-label').textContent = label;
  const catEl = li.querySelector('.signal-cat');
  if (cat) catEl.textContent = cat; else catEl.remove();
  li.querySelector('.signal-n').textContent = n;
  li.querySelector('.signal-pts').textContent = pts;
  const inner = li.querySelector('.signal-inner');
  const fill = () => { if (!inner.childElementCount) inner.append(...body()); };
  if (state.open.has(key)) fill();
  const head = li.firstElementChild;
  head.onclick = () => {
    fill();
    const open = !state.open.has(key);
    if (open) state.open.add(key); else state.open.delete(key);
    li.classList.toggle('open', open);
    head.setAttribute('aria-expanded', String(open));
  };
  return li;
}

function hitButton(f, note) {
  const b = document.createElement('button');
  b.className = 'hit';
  b.innerHTML = '<span class="hit-pos"></span><span class="hit-text"></span>';
  b.children[0].textContent = `${f.line}:${f.col}`;
  b.children[1].textContent = f.text.replace(/\s+/g, ' ');
  if (note) {
    const n = document.createElement('span');
    n.className = 'hit-note';
    n.textContent = note;
    b.append(n);
  }
  b.title = 'Show in the text';
  b.onclick = () => reveal(f);
  b.onmouseenter = () => setHot(f.rule);
  const li = document.createElement('li');
  li.append(b);
  return li;
}

function hitList(findings, noteFor) {
  const nodes = [];
  const ul = document.createElement('ul');
  ul.className = 'hits';
  ul.append(...findings.slice(0, MAX_HITS).map((f) => hitButton(f, noteFor?.(f))));
  nodes.push(ul);
  if (findings.length > MAX_HITS) {
    const more = document.createElement('p');
    more.className = 'more';
    more.textContent = `…and ${findings.length - MAX_HITS} more`;
    nodes.push(more);
  }
  return nodes;
}

function renderSignals(r) {
  const items = [
    ...r.rules.map((x) => ({ ...x, type: 'rule' })),
    ...r.signals.map((s) => ({ ...s, type: 'signal', why: s.detail, count: null })),
  ].sort((a, b) => b.contribution - a.contribution);

  el.signalsPanel.hidden = false;
  const counted = r.findings.filter((f) => f.counted).length;
  el.signalCount.textContent = counted ? `· ${counted} flagged` : '';
  el.copyCurl.hidden = !state.api.analyze;

  const present = [...new Set(items.map((i) => i.category))];
  if (state.filter !== 'all' && !present.includes(state.filter)) state.filter = 'all';
  el.chips.hidden = present.length < 2;
  el.chips.replaceChildren(...['all', ...present].map((id) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = id === 'all' ? 'All' : CATEGORIES[id].label;
    b.setAttribute('aria-pressed', String(state.filter === id));
    b.onclick = () => {
      state.filter = id;
      for (const m of el.layer.querySelectorAll('mark')) {
        const f = r.findings[Number(m.dataset.f)];
        m.classList.toggle('dim', id !== 'all' && f && f.category !== id);
      }
      renderSignals(r);
    };
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

  el.signals.replaceChildren(...shown.map((item, i) => {
    const neg = item.contribution < 0;
    const li = signalItem({
      key: `${item.type}:${item.id}`,
      sev: neg ? 'neg' : item.contribution >= 1.5 ? 's3' : item.contribution >= 0.7 ? 's2' : 's1',
      label: item.label,
      cat: CATEGORIES[item.category].label,
      n: item.count ? `×${item.count}` : 'whole text',
      pts: fmtPts(item.contribution),
      ptsClass: neg ? 'neg' : '',
      body: () => {
        const why = document.createElement('p');
        why.className = 'signal-why';
        why.textContent = item.why;
        if (item.type !== 'rule') return [why];
        return [why, ...hitList(r.findings.filter((f) => f.rule === item.id && f.counted))];
      },
    }, i);
    if (item.type === 'rule') {
      const head = li.firstElementChild;
      head.onmouseenter = () => setHot(item.id);
      head.onmouseleave = () => setHot(null);
      head.onfocus = () => setHot(item.id);
      head.onblur = () => setHot(null);
    }
    return li;
  }));
}

function renderChecked(r) {
  const groups = r.discounted.filter((d) => d.factor === 0);
  const n = groups.reduce((a, g) => a + g.count, 0);
  el.checked.hidden = !n;
  el.checkedCount.textContent = n ? `· ${n}` : '';
  el.checkedList.replaceChildren(...groups.map((g, i) => signalItem({
    key: `checked:${g.reason}`,
    sev: 'off',
    label: g.reason,
    n: `×${g.count}`,
    pts: '0',
    ptsClass: 'zero',
    body: () => hitList(g.findings.map((id) => r.findings[id]), (f) => `${f.label} · ${f.discount.reason}`),
  }, i)));
}

// ── Files, samples, URLs, clipboard ───────────────────────────────────────────
async function openFiles(files) {
  let opened = 0;
  for (const file of files) {
    if (file.size > 3_000_000) { toast(`${file.name} is larger than 3 MB`); continue; }
    const text = await file.text();
    if (/\u0000/.test(text.slice(0, 4000))) { toast(`${file.name} looks like a binary file`); continue; }
    addDoc(file.name, text);
    opened++;
  }
  if (opened > 1) toast(`Opened ${opened} files`);
}
const pickFiles = () => el.fileInput.click();
$('open-file').onclick = pickFiles;
$('hero-open').onclick = pickFiles;
el.fileInput.onchange = () => { openFiles([...el.fileInput.files]); el.fileInput.value = ''; };

$('hero-paste').onclick = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) { toast('The clipboard is empty'); return; }
    addDoc('Pasted text', text);
  } catch {
    toast('Clipboard access was blocked. Press Ctrl+V instead.');
    state.editing = true;
    updateHero();
    el.input.focus();
  }
};

// Paste anywhere while the start screen is showing.
document.addEventListener('paste', (e) => {
  if (!el.hero.hidden && document.activeElement !== el.url) {
    const text = e.clipboardData?.getData('text');
    if (text?.trim()) { e.preventDefault(); addDoc('Pasted text', text); }
  }
});

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

el.samples.replaceChildren(...SAMPLES.map((s) => {
  const b = document.createElement('button');
  b.className = `sample${s.human ? ' human' : ''}`;
  b.innerHTML = '<span class="sample-type"></span><span class="sample-name"></span><span class="sample-tag"></span>';
  b.children[0].textContent = s.type;
  b.children[1].textContent = s.label;
  b.children[2].textContent = s.human ? 'Hand-written' : 'Generated';
  b.onclick = async () => {
    try {
      const res = await fetch(new URL(`../samples/${s.file}`, import.meta.url));
      if (!res.ok) throw new Error(String(res.status));
      addDoc(s.file, await res.text());
    } catch {
      toast('Could not load the sample');
    }
  };
  return b;
}));

el.hero.addEventListener('click', (e) => {
  if (e.target.closest('button, a')) return;
  state.editing = true;
  updateHero();
  el.input.focus();
});

// The HTTP API is only there when the app is served by its own server or functions.
fetch(new URL('../api/health', import.meta.url), { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : null))
  .then((h) => {
    if (!h?.ok) return;
    state.api = { analyze: true, fetch: h.fetch !== false };
    el.urlForm.hidden = !state.api.fetch;
    el.copyCurl.hidden = false;
  })
  .catch(() => {});

el.urlForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  let url = el.url.value.trim();
  if (!url) { el.url.focus(); return; }
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const button = el.urlForm.querySelector('button');
  button.disabled = true;
  el.urlForm.classList.add('loading');
  setBusy(true, 'Fetching page…');
  try {
    const res = await fetch(new URL(`../api/fetch?url=${encodeURIComponent(url)}`, import.meta.url));
    const page = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(page.error || `HTTP ${res.status}`);
    const u = new URL(page.url);
    const html = /html/i.test(page.contentType);
    const doc = addDoc(`${u.host}${u.pathname.replace(/\/$/, '')}`, page.text, { kind: html ? 'html' : 'auto' });
    if (page.status >= 400) toast(`${doc.name} answered with HTTP ${page.status}`);
    el.url.value = '';
  } catch (err) {
    toast(err.message || 'Could not fetch that page');
  } finally {
    button.disabled = false;
    el.urlForm.classList.remove('loading');
    setBusy(false);
  }
});

// ── Export ────────────────────────────────────────────────────────────────────
function toggleMenu(open = el.exportMenu.hidden) {
  el.exportMenu.hidden = !open;
  el.exportBtn.setAttribute('aria-expanded', String(open));
  if (open) el.exportMenu.querySelector('button:not([hidden])')?.focus();
}
el.exportBtn.onclick = (e) => { e.stopPropagation(); toggleMenu(); };
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) toggleMenu(false); });

async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { toast('Clipboard is not available here'); }
}
$('copy-md').onclick = () => {
  toggleMenu(false);
  const d = current();
  if (d.result) copy(formatMarkdown([{ ...d.result, filename: d.name }]), 'Report copied as Markdown');
};
$('download-json').onclick = () => {
  toggleMenu(false);
  const d = current();
  if (!d.result) return;
  const blob = new Blob([JSON.stringify(toJSON({ ...d.result, filename: d.name }), null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${d.name.replace(/[^\w.-]+/g, '_')}.slop.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
el.copyCurl.onclick = () => {
  toggleMenu(false);
  const d = current();
  const body = JSON.stringify({ text: d.text, filename: d.name === 'Untitled' ? '' : d.name, context: d.context || 'auto' });
  const endpoint = new URL('../api/analyze', import.meta.url).href;
  copy(`curl -s -X POST '${endpoint}' -H 'content-type: application/json' -d '${body.replace(/'/g, "'\\''")}'`, 'API request copied');
};

// ── Views, theme, keyboard, toast ─────────────────────────────────────────────
function setView(view) {
  el.app.dataset.view = view;
  for (const b of document.querySelectorAll('.viewswitch button')) b.setAttribute('aria-selected', String(b.dataset.view === view));
}
for (const b of document.querySelectorAll('.viewswitch button')) b.onclick = () => setView(b.dataset.view);

function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = dark ? '#100f0e' : '#f6f4ef';
}
try { applyTheme(localStorage.getItem('slop-shutter:theme')); } catch { /* storage unavailable */ }
$('theme').onclick = (e) => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  try { localStorage.setItem('slop-shutter:theme', next); } catch { /* ignore */ }
  if (!document.startViewTransition || reduceMotion.matches) { applyTheme(next); return; }
  const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  root.style.setProperty('--vt-x', `${x}px`);
  root.style.setProperty('--vt-y', `${y}px`);
  root.style.setProperty('--vt-r', `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
  document.startViewTransition(() => applyTheme(next));
};

$('shortcuts').onclick = () => el.shortcuts.showModal();

const typingIn = (t) => t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable);
addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFiles(); return; }
  if (mod && e.key.toLowerCase() === 'k' && !el.urlForm.hidden) { e.preventDefault(); el.url.focus(); el.url.select(); return; }
  if (e.key === 'F8' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) {
    e.preventDefault();
    stepFlag(e.shiftKey || e.key === 'ArrowUp' ? -1 : 1);
    return;
  }
  if (e.altKey && e.code === 'KeyN') { e.preventDefault(); newDoc(); return; }
  if (e.key === 'Escape') { setHot(null); toggleMenu(false); return; }
  if (typingIn(e.target)) return;
  if (e.key === '?') { e.preventDefault(); el.shortcuts.showModal(); return; }
  // On the start screen, typing goes straight into the editor.
  if (!el.hero.hidden && e.key.length === 1 && !mod && !e.altKey) {
    state.editing = true;
    updateHero();
    el.input.focus();
  }
});

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2800);
}

addEventListener('resize', () => {
  renderToolbar();
  requestAnimationFrame(renderMinimap);
});

// ── Persistence (a per-browser convenience; the app works without it) ─────────
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const docs = state.docs.map(({ id, name, text, kind, context }) => ({ id, name, text, kind, context }));
      const payload = JSON.stringify({ docs, active: state.active });
      if (payload.length < 2_000_000) localStorage.setItem(STORE_KEY, payload);
    } catch { /* storage unavailable or full */ }
  }, 400);
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved?.docs?.length) return false;
    state.docs = saved.docs.map((d) => ({ kind: 'auto', context: 'auto', ...d, result: null, shown: '' }));
    nextId = Math.max(...state.docs.map((d) => d.id)) + 1;
    state.active = state.docs.some((d) => d.id === saved.active) ? saved.active : state.docs[0].id;
    return true;
  } catch { return false; }
}

// ── Start ─────────────────────────────────────────────────────────────────────
$('boot-fail')?.remove();
if (restore()) select(state.active, { reveal: true });
else addDoc('Untitled');
document.fonts?.ready.then(() => { renderToolbar(); requestAnimationFrame(renderMinimap); });
