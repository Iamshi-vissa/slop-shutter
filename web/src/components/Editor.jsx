import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FAMILY_OF, drawable, escapeHtml, prefersReducedMotion } from '../lib.js';

// A transparent textarea over a highlight layer laid out identically, so flags are drawn
// in place while the text stays fully editable.
const Editor = forwardRef(function Editor({ text, findings, filter, hot, revealKey, onChange, onEditing }, ref) {
  const wrapRef = useRef(null);
  const scrollRef = useRef(null);
  const layerRef = useRef(null);
  const inputRef = useRef(null);
  const [revealing, setRevealing] = useState(false);
  const [ticks, setTicks] = useState([]);
  const [cursor, setCursor] = useState(-1);

  const drawn = useMemo(() => drawable(findings), [findings]);
  const counted = useMemo(() => drawn.filter((f) => f.counted !== false), [drawn]);

  const html = useMemo(() => {
    let out = '';
    let at = 0;
    for (const f of drawn) {
      const eff = f.weight * (f.discount ? f.discount.factor : 1);
      const fam = FAMILY_OF[f.category] || 'lang';
      const w = f.counted === false ? 'off' : eff >= 2.5 ? 'w3' : eff >= 1.2 ? 'w2' : 'w1';
      const dim = filter !== 'all' && fam !== filter ? ' dim' : '';
      const isHot = hot && hot === f.rule ? ' hot' : '';
      out += escapeHtml(text.slice(at, f.start));
      out += `<mark class="f-${fam} ${w}${dim}${isHot}" data-f="${f.id}" data-rule="${f.rule}">${escapeHtml(text.slice(f.start, f.end))}</mark>`;
      at = f.end;
    }
    return `${out}${escapeHtml(text.slice(at))}\n`;
  }, [text, drawn, filter, hot]);

  // Opening a document: a safelight sweep and highlights that draw in top to bottom.
  useEffect(() => {
    setCursor(-1);
    if (!revealKey || prefersReducedMotion()) return undefined;
    setRevealing(true);
    const wrap = wrapRef.current;
    wrap?.classList.remove('scanning');
    void wrap?.offsetWidth;
    wrap?.classList.add('scanning');
    const t = setTimeout(() => setRevealing(false), 2200);
    return () => clearTimeout(t);
  }, [revealKey]);

  useLayoutEffect(() => {
    if (!revealing) return;
    const layer = layerRef.current;
    const h = Math.max(1, layer.offsetHeight);
    for (const m of layer.querySelectorAll('mark')) m.style.setProperty('--d', `${Math.round((m.offsetTop / h) * 1300)}ms`);
  }, [revealing, html]);

  // Minimap ticks, one per drawn flag, placed by its vertical position.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;
    const measure = () => {
      const h = layer.offsetHeight;
      if (!h) return;
      setTicks([...layer.querySelectorAll('mark')].slice(0, 800).map((m) => ({
        id: Number(m.dataset.f),
        top: (m.offsetTop / h) * 100,
        cls: m.className.replace(/\b(hot|dim)\b/g, '').trim(),
        rule: m.dataset.rule,
      })));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(layer);
    return () => ro.disconnect();
  }, [html]);

  const reveal = (f) => {
    const input = inputRef.current;
    input.focus({ preventScroll: true });
    input.setSelectionRange(f.start, f.end);
    const mark = layerRef.current.querySelector(`mark[data-f="${f.id}"]`);
    if (mark) {
      const scroll = scrollRef.current;
      scroll.scrollTo({ top: Math.max(0, mark.offsetTop - scroll.clientHeight / 3), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      mark.classList.remove('flash');
      void mark.offsetWidth;
      mark.classList.add('flash');
    }
    const i = counted.findIndex((c) => c.id === f.id);
    if (i >= 0) setCursor(i);
  };

  const step = (dir) => {
    if (!counted.length) return;
    let i;
    if (cursor < 0) {
      const caret = inputRef.current.selectionStart || 0;
      i = dir > 0 ? counted.findIndex((f) => f.start >= caret) : counted.findLastIndex((f) => f.start < caret);
      if (i === -1) i = dir > 0 ? 0 : counted.length - 1;
    } else {
      i = (cursor + dir + counted.length) % counted.length;
    }
    reveal(counted[i]);
  };

  useImperativeHandle(ref, () => ({ reveal, step, focus: () => inputRef.current?.focus() }));

  const byId = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);

  return (
    <div className="editor-wrap" ref={wrapRef}>
      <div className="editor-scroll" ref={scrollRef}>
        <div className="editor">
          <pre
            className={`layer${revealing ? ' reveal' : ''}`}
            ref={layerRef}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => onEditing(true)}
            onBlur={() => onEditing(false)}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-label="Text or code to scan"
          />
        </div>
      </div>
      <div className="scanline" aria-hidden="true" />
      <div className="minimap" aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t.id}
            className={`tick ${t.cls}${hot === t.rule ? ' hot' : ''}`}
            style={{ top: `${t.top}%` }}
            onClick={() => { const f = byId.get(t.id); if (f) reveal(f); }}
          />
        ))}
      </div>
      {counted.length > 0 && (
        <div className="flagnav">
          <button type="button" onClick={() => step(-1)} aria-label="Previous flag" title="Previous flag (Shift+F8)">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 12l4-4 4 4" /></svg>
          </button>
          <span aria-live="polite">
            {cursor >= 0 && cursor < counted.length
              ? <><b>{String(cursor + 1).padStart(2, '0')}</b> / {String(counted.length).padStart(2, '0')}</>
              : <><b>{counted.length}</b> flag{counted.length > 1 ? 's' : ''}</>}
          </span>
          <button type="button" onClick={() => step(1)} aria-label="Next flag" title="Next flag (F8)">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8l4 4 4-4" /></svg>
          </button>
        </div>
      )}
    </div>
  );
});

export default Editor;
