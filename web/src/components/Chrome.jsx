import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { extOf } from '../lib.js';

export function Mark({ className = 'mark' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect className="mark-frame" x="2.5" y="2.5" width="27" height="27" rx="3" />
      <rect className="mark-slat s1" x="8" y="8.5" width="16" height="3" />
      <rect className="mark-slat s2" x="8" y="14.5" width="16" height="3" />
      <rect className="mark-slat s3" x="8" y="20.5" width="9" height="3" />
    </svg>
  );
}

export function TopBar({ busy, lastMs, onOpen, onShortcuts, onTheme, theme }) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Slop Shutter, start over">
        <Mark />
        <span className="wordmark">Slop Shutter</span>
      </a>
      <span className={`telemetry${busy ? ' busy' : ''}`} role="status">
        <i aria-hidden="true" />
        {busy ? 'Analysing' : 'Local engine'}
        {lastMs != null && !busy && <span className="dim"> · {lastMs < 1 ? '<1' : Math.round(lastMs)} ms</span>}
      </span>
      <nav className="top-actions" aria-label="App">
        <button type="button" className="btn ghost" onClick={onOpen} title="Open files (Ctrl+O)">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 13.5v2.5h12v-2.5M10 3.5v9M6.5 7 10 3.5 13.5 7" /></svg>
          <span className="label">Open</span>
        </button>
        <button type="button" className="btn ghost icon" onClick={onShortcuts} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="5" width="15" height="10" rx="1.5" /><path d="M5.5 8h1M9.5 8h1M13.5 8h1M6 11.5h8" /></svg>
        </button>
        <button type="button" className="btn ghost icon" onClick={onTheme} title="Switch theme" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark'
            ? <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></svg>
            : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z" /></svg>}
        </button>
      </nav>
    </header>
  );
}

export function Tabs({ docs, activeId, onSelect, onClose, onNew }) {
  return (
    <div className="tabs" role="tablist" aria-label="Documents">
      {docs.map((d) => {
        const r = d.result;
        const active = d.id === activeId;
        return (
          <div
            key={d.id}
            role="tab"
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            className="tab"
            title={d.name}
            onClick={() => !active && onSelect(d.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(d.id); } }}
          >
            {active && <motion.span layoutId="tab-ink" className="tab-ink" transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />}
            {extOf(d.name) && <span className="tab-ext">{extOf(d.name)}</span>}
            <span className="tab-name">{d.name}</span>
            {r && <span className={`score-chip tone-${r.verdict.id}`}>{r.score}</span>}
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${d.name}`}
              onClick={(e) => { e.stopPropagation(); onClose(d.id); }}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9" /></svg>
            </button>
          </div>
        );
      })}
      <button type="button" className="tab-add" onClick={onNew} title="New document (Alt+N)" aria-label="New document">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
      </button>
    </div>
  );
}

const KINDS = [['auto', 'Auto'], ['prose', 'Prose'], ['html', 'Web page'], ['code', 'Code']];

export function Toolbar({ doc, detected, onKind, onContext, fetchEnabled, onFetch, fetching, urlRef }) {
  return (
    <div className="toolbar">
      <div className="segmented" role="radiogroup" aria-label="Read input as">
        {KINDS.map(([id, label]) => (
          <button
            type="button"
            role="radio"
            key={id}
            aria-checked={doc.kind === id}
            onClick={() => onKind(id)}
          >
            {doc.kind === id && <motion.span layoutId="seg-thumb" className="seg-thumb" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
            <span className="seg-label">{label}</span>
          </button>
        ))}
      </div>
      <label className="select" title="How to read word use and formats">
        <span>Context</span>
        <select value={doc.context} onChange={(e) => onContext(e.target.value)}>
          <option value="auto">Auto</option>
          <option value="technical">Technical</option>
          <option value="general">General</option>
        </select>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8l4 4 4-4" /></svg>
      </label>
      {detected && <span className="detected">{detected}</span>}
      {fetchEnabled && (
        <form
          className={`url-form${fetching ? ' loading' : ''}`}
          onSubmit={(e) => { e.preventDefault(); onFetch(urlRef.current.value); }}
        >
          <label className="visually-hidden" htmlFor="url">Web page address</label>
          <span className="url-prefix" aria-hidden="true">URL</span>
          <input id="url" ref={urlRef} type="text" inputMode="url" placeholder="example.com/page" autoComplete="off" spellCheck={false} />
          <kbd className="url-kbd">Ctrl K</kbd>
          <button type="submit" className="btn small primary" disabled={fetching}>{fetching ? 'Fetching' : 'Scan'}</button>
        </form>
      )}
    </div>
  );
}

export function Shortcuts({ open, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const rows = [
    [['F8'], 'Next flag'], [['Shift', 'F8'], 'Previous flag'], [['Alt', '↓ / ↑'], 'Next or previous flag'],
    [['Ctrl', 'O'], 'Open files'], [['Ctrl', 'K'], 'Scan a web page'], [['Alt', 'N'], 'New document'],
    [['Esc'], 'Clear highlight focus'], [['?'], 'This list'],
  ];
  return (
    <dialog className="dialog" ref={ref} onClose={onClose} aria-labelledby="keys-title">
      <h2 id="keys-title" className="kicker">Keyboard</h2>
      <dl className="keys">
        {rows.map(([keys, what]) => (
          <div key={what}><dt>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt><dd>{what}</dd></div>
        ))}
      </dl>
      <p className="fineprint">On macOS, use ⌘ for Ctrl.</p>
      <button type="button" className="btn primary wide" onClick={onClose}>Done</button>
    </dialog>
  );
}

export function DropZone({ visible }) {
  if (!visible) return null;
  return (
    <div className="dropzone">
      <div className="drop-frame">
        <span className="c tl" /><span className="c tr" /><span className="c bl" /><span className="c br" />
        <Mark className="drop-mark" />
        <p>Drop to scan</p>
        <span>Text, Markdown, HTML, CSS and code</span>
      </div>
    </div>
  );
}
