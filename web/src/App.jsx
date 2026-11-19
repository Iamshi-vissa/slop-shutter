import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatMarkdown, toJSON } from '../../src/index.js';
import Noise from './reactbits/Noise.jsx';
import Editor from './components/Editor.jsx';
import Hero from './components/Hero.jsx';
import Report from './components/Report.jsx';
import { TopBar, Tabs, Toolbar, Shortcuts, DropZone } from './components/Chrome.jsx';
import { analyzeAsync, projectFindings, prefersReducedMotion } from './lib.js';

const STORE_KEY = 'slop-shutter:v3';
const THEME_KEY = 'slop-shutter:theme';
const KIND_LABEL = { prose: 'prose', html: 'web page', code: 'code' };
let nextId = 1;
const makeDoc = (name, text = '', extra = {}) => ({ id: nextId++, name, text, kind: 'auto', context: 'auto', result: null, shown: '', ...extra });

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved?.docs?.length) return null;
    const docs = saved.docs.map((d) => makeDoc(d.name, d.text, { kind: d.kind || 'auto', context: d.context || 'auto' }));
    const i = Math.max(0, saved.docs.findIndex((d) => d.id === saved.active));
    return { docs, active: docs[i].id };
  } catch { return null; }
}

function initialTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; }
}

export default function App() {
  const [boot] = useState(() => restore() || (() => { const d = makeDoc('Untitled'); return { docs: [d], active: d.id }; })());
  const [docs, setDocs] = useState(boot.docs);
  const [activeId, setActiveId] = useState(boot.active);
  const [theme, setTheme] = useState(initialTheme);
  const [view, setView] = useState('text');
  const [filter, setFilter] = useState('all');
  const [hot, setHot] = useState(null);
  const [revealKey, setRevealKey] = useState(1);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastMs, setLastMs] = useState(null);
  const [api, setApi] = useState({ analyze: false, fetch: false });
  const [fetching, setFetching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const urlRef = useRef(null);
  const versions = useRef(new Map());

  const doc = docs.find((d) => d.id === activeId) || docs[0];
  const result = doc.result && doc.text.trim() ? doc.result : null;

  const toast = useCallback((msg) => {
    setToastMsg({ msg, at: Date.now() });
  }, []);
  useEffect(() => {
    if (!toastMsg) return undefined;
    const t = setTimeout(() => setToastMsg(null), 2800);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const patch = useCallback((id, change) => {
    setDocs((all) => all.map((d) => (d.id === id ? { ...d, ...change } : d)));
  }, []);

  // ── Analysis ──────────────────────────────────────────────────────────────
  const run = useCallback(async (d) => {
    const v = (versions.current.get(d.id) || 0) + 1;
    versions.current.set(d.id, v);
    if (!d.text.trim()) { patch(d.id, { result: null, shown: '' }); return; }
    const t0 = performance.now();
    const slow = setTimeout(() => setBusy(true), 140);
    try {
      const r = await analyzeAsync(d.text, {
        filename: d.name === 'Untitled' ? '' : d.name,
        kind: d.kind === 'auto' ? undefined : d.kind,
        context: d.context,
      });
      if (versions.current.get(d.id) !== v) return;
      setLastMs(performance.now() - t0);
      patch(d.id, { result: r, shown: d.text });
    } catch (e) {
      toast(`Analysis failed: ${e.message}`);
    } finally {
      clearTimeout(slow);
      setBusy(false);
    }
  }, [patch, toast]);

  useEffect(() => { run(doc); }, [doc.id, doc.text, doc.kind, doc.context]); // eslint-disable-line react-hooks/exhaustive-deps

  // Score the other restored documents so their tabs show a score.
  useEffect(() => { for (const d of boot.docs) if (d.id !== boot.active) run(d); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persistence (a per-browser convenience) ───────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const payload = JSON.stringify({ docs: docs.map(({ id, name, text, kind, context }) => ({ id, name, text, kind, context })), active: activeId });
        if (payload.length < 2_000_000) localStorage.setItem(STORE_KEY, payload);
      } catch { /* storage unavailable */ }
    }, 400);
    return () => clearTimeout(t);
  }, [docs, activeId]);

  // ── Theme ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0b0c' : '#efede7');
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = (e) => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (!document.startViewTransition || prefersReducedMotion()) { setTheme(next); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const root = document.documentElement.style;
    root.setProperty('--vt-x', `${x}px`);
    root.setProperty('--vt-y', `${y}px`);
    root.setProperty('--vt-r', `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
    document.startViewTransition(() => {
      document.documentElement.dataset.theme = next;
      setTheme(next);
    });
  };

  // ── Documents ─────────────────────────────────────────────────────────────
  const open = useCallback((name, text, extra) => {
    const d = makeDoc(name, text, extra);
    setDocs((all) => {
      const cur = all.find((x) => x.id === activeId);
      if (cur && !cur.text && cur.name === 'Untitled') return all.map((x) => (x.id === cur.id ? d : x));
      return [...all, d];
    });
    setActiveId(d.id);
    setRevealKey((k) => k + 1);
    setFilter('all');
    setEditing(false);
    return d;
  }, [activeId]);

  const select = (id) => { setActiveId(id); setRevealKey((k) => k + 1); setFilter('all'); setHot(null); };
  const close = (id) => {
    setDocs((all) => {
      const i = all.findIndex((d) => d.id === id);
      const rest = all.filter((d) => d.id !== id);
      if (!rest.length) { const d = makeDoc('Untitled'); setActiveId(d.id); return [d]; }
      if (id === activeId) setActiveId(rest[Math.max(0, i - 1)].id);
      return rest;
    });
  };
  const newDoc = () => { const d = makeDoc('Untitled'); setDocs((all) => [...all, d]); setActiveId(d.id); setEditing(false); };

  const openFiles = async (files) => {
    let n = 0;
    for (const f of files) {
      if (f.size > 3_000_000) { toast(`${f.name} is larger than 3 MB`); continue; }
      const text = await f.text();
      if (/\u0000/.test(text.slice(0, 4000))) { toast(`${f.name} looks like a binary file`); continue; }
      open(f.name, text);
      n++;
    }
    if (n > 1) toast(`Opened ${n} files`);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { toast('The clipboard is empty'); return; }
      open('Pasted text', text);
    } catch {
      toast('Clipboard access was blocked. Press Ctrl+V instead.');
      startTyping();
    }
  };

  const startTyping = () => { setEditing(true); requestAnimationFrame(() => editorRef.current?.focus()); };

  // ── API (only when served by the Node server or serverless functions) ─────
  useEffect(() => {
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => { if (h?.ok) setApi({ analyze: true, fetch: h.fetch !== false }); })
      .catch(() => {});
  }, []);

  const fetchPage = async (raw) => {
    let url = String(raw || '').trim();
    if (!url) { urlRef.current?.focus(); return; }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setFetching(true);
    try {
      const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
      const page = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) throw new Error(page.error || `HTTP ${res.status}`);
      const u = new URL(page.url);
      open(`${u.host}${u.pathname.replace(/\/$/, '')}`, page.text, { kind: /html/i.test(page.contentType) ? 'html' : 'auto' });
      if (urlRef.current) urlRef.current.value = '';
      if (page.status >= 400) toast(`The page answered with HTTP ${page.status}`);
    } catch (e) {
      toast(e.message || 'Could not fetch that page');
    } finally {
      setFetching(false);
    }
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const copy = async (text, done) => {
    try { await navigator.clipboard.writeText(text); toast(done); } catch { toast('Clipboard is not available here'); }
  };
  const exportMd = () => result && copy(formatMarkdown([{ ...result, filename: doc.name }]), 'Report copied as Markdown');
  const exportJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(toJSON({ ...result, filename: doc.name }), null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${doc.name.replace(/[^\w.-]+/g, '_')}.slop.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const exportCurl = () => {
    const body = JSON.stringify({ text: doc.text, filename: doc.name === 'Untitled' ? '' : doc.name, context: doc.context });
    copy(`curl -s -X POST '${location.origin}/api/analyze' -H 'content-type: application/json' -d '${body.replace(/'/g, "'\\''")}'`, 'API request copied');
  };

  // ── Global input: keys, paste, drag and drop ──────────────────────────────
  const heroVisible = !doc.text && !editing;
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName);
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); fileRef.current.click(); return; }
      if (mod && e.key.toLowerCase() === 'k' && api.fetch) { e.preventDefault(); urlRef.current?.focus(); urlRef.current?.select(); return; }
      if (e.key === 'F8' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) {
        e.preventDefault();
        editorRef.current?.step(e.shiftKey || e.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (e.altKey && e.code === 'KeyN') { e.preventDefault(); newDoc(); return; }
      if (e.key === 'Escape') { setHot(null); setMenuOpen(false); return; }
      if (typing) return;
      if (e.key === '?') { e.preventDefault(); setKeysOpen(true); return; }
      if (heroVisible && e.key.length === 1 && !mod && !e.altKey) startTyping();
    };
    const onPaste = (e) => {
      if (!heroVisible || e.target === urlRef.current) return;
      const text = e.clipboardData?.getData('text');
      if (text?.trim()) { e.preventDefault(); open('Pasted text', text); }
    };
    let depth = 0;
    const onEnter = (e) => { if (e.dataTransfer?.types.includes('Files')) { depth++; setDragging(true); } };
    const onLeave = () => { if (--depth <= 0) { depth = 0; setDragging(false); } };
    const onOver = (e) => e.preventDefault();
    const onDrop = (e) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) openFiles([...e.dataTransfer.files]);
    };
    addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    addEventListener('dragenter', onEnter);
    addEventListener('dragleave', onLeave);
    addEventListener('dragover', onOver);
    addEventListener('drop', onDrop);
    return () => {
      removeEventListener('keydown', onKey);
      document.removeEventListener('paste', onPaste);
      removeEventListener('dragenter', onEnter);
      removeEventListener('dragleave', onLeave);
      removeEventListener('dragover', onOver);
      removeEventListener('drop', onDrop);
    };
  });

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => { if (!e.target.closest('.menu')) setMenuOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  const findings = useMemo(() => (result ? projectFindings(doc.shown, doc.text, result.findings) : []), [result, doc.shown, doc.text]);
  const reveal = (f) => { setView('text'); requestAnimationFrame(() => editorRef.current?.reveal(f)); };
  const detected = result && doc.kind === 'auto' ? `Reading as ${KIND_LABEL[result.kind]}` : '';

  return (
    <div className="app" data-view={view}>
      <Noise fixed opacity={theme === 'dark' ? 0.07 : 0.05} fps={12} blendMode="overlay" contrast={0.5} zIndex={60} />

      <TopBar
        busy={busy}
        lastMs={lastMs}
        theme={theme}
        onOpen={() => fileRef.current.click()}
        onShortcuts={() => setKeysOpen(true)}
        onTheme={toggleTheme}
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept=".txt,.md,.markdown,.mdx,.rst,.html,.htm,.js,.mjs,.jsx,.ts,.tsx,.vue,.svelte,.astro,.css,.scss,.py,.rb,.go,.rs,.java,.php,.sh,.sql,text/*"
        onChange={(e) => { openFiles([...e.target.files]); e.target.value = ''; }}
      />

      <div className="viewswitch" role="tablist" aria-label="View">
        {['text', 'report'].map((v) => (
          <button type="button" role="tab" key={v} aria-selected={view === v} onClick={() => setView(v)}>
            {v === 'text' ? 'Text' : 'Report'}
            {v === 'report' && result && <span className={`score-chip tone-${result.verdict.id}`}>{result.score}</span>}
          </button>
        ))}
      </div>

      <main className="workspace">
        <section className="source" aria-label="Source">
          <Tabs docs={docs} activeId={activeId} onSelect={select} onClose={close} onNew={newDoc} />
          <Toolbar
            doc={doc}
            detected={detected}
            onKind={(kind) => patch(doc.id, { kind })}
            onContext={(context) => patch(doc.id, { context })}
            fetchEnabled={api.fetch}
            onFetch={fetchPage}
            fetching={fetching}
            urlRef={urlRef}
          />
          <div className="stage">
            <Editor
              ref={editorRef}
              text={doc.text}
              findings={findings}
              filter={filter}
              hot={hot}
              revealKey={revealKey}
              onChange={(text) => patch(doc.id, { text })}
              onEditing={setEditing}
            />
            {heroVisible && (
              <Hero
                theme={theme}
                onPaste={pasteFromClipboard}
                onOpen={() => fileRef.current.click()}
                onSample={(s) => open(s.file, s.text)}
                onStartTyping={startTyping}
              />
            )}
          </div>
        </section>

        <div className="report-col">
          {result && (
            <div className="report-tools menu">
              <button type="button" className="btn ghost small" aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
                Export
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8l4 4 4-4" /></svg>
              </button>
              {menuOpen && (
                <div className="menu-pop" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); exportMd(); }}>Copy Markdown report</button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); exportJson(); }}>Download JSON</button>
                  {api.analyze && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); exportCurl(); }}>Copy API request</button>}
                </div>
              )}
            </div>
          )}
          <Report
            result={result}
            theme={theme}
            revealKey={`${activeId}:${revealKey}`}
            filter={filter}
            setFilter={setFilter}
            setHot={setHot}
            onReveal={reveal}
          />
        </div>
      </main>

      <Shortcuts open={keysOpen} onClose={() => setKeysOpen(false)} />
      <DropZone visible={dragging} />
      <div className={`toast${toastMsg ? ' show' : ''}`} role="status" aria-live="polite">{toastMsg?.msg}</div>
    </div>
  );
}
