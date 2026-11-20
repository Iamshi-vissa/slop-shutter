import { useMemo, useState } from 'react';
import Counter from '../reactbits/Counter.jsx';
import DecryptedText from '../reactbits/DecryptedText.jsx';
import SpotlightCard from '../reactbits/SpotlightCard.jsx';
import FadeContent from '../reactbits/FadeContent.jsx';
import { CATEGORIES } from '../../../src/index.js';
import { FAMILIES, FAMILY_OF, fmtPts } from '../lib.js';

const KIND = { prose: 'Prose', html: 'Web page', code: 'Code' };
const TICKS = 40;

function Reveal({ children, revealKey, delay = 0 }) {
  return (
    <FadeContent key={revealKey} trigger="mount" blur duration={0.55} delay={delay} ease="power3.out">
      {children}
    </FadeContent>
  );
}

// Exposure meter: forty ticks, lit up to the score, with the verdict thresholds marked.
function Exposure({ score }) {
  const lit = score == null ? 0 : Math.round((score / 100) * TICKS);
  return (
    <div className="exposure" aria-hidden="true">
      <div className="exposure-ticks">
        {Array.from({ length: TICKS }, (_, i) => (
          <i
            key={i}
            className={`${i < lit ? 'on' : ''}${i === 12 || i === 24 ? ' thr' : ''}`}
            style={{ transitionDelay: `${i * 12}ms` }}
          />
        ))}
      </div>
      <div className="exposure-scale">
        <span>0 · Human</span><span>30</span><span>60</span><span>Generated · 100</span>
      </div>
    </div>
  );
}

function ScoreCard({ result, theme }) {
  const tone = result?.verdict.id || 'idle';
  const label = result ? result.verdict.label : 'Waiting for text';
  const size = result && (result.kind === 'code' ? `${result.stats.codeLines} lines` : `${result.stats.words.toLocaleString()} words`);
  return (
    <SpotlightCard
      className={`scorecard tone-${tone}`}
      theme={theme}
      spotlightColor={`var(--${tone === 'idle' ? 'text-3' : tone})`}
      intensity={0.12}
      spotlightSize={320}
      borderGlow={0.7}
      style={{ '--spotlight-card-surface': 'var(--panel)', '--spotlight-card-border': 'var(--line)', '--spotlight-card-shadow': 'none' }}
    >
      <div className="score-head">
        <span className="kicker"><span className="kicker-n">A</span> Score</span>
      </div>
      <div className="score-main">
        {result ? (
          <Counter value={result.score} fontSize={92} fontWeight={600} textColor="var(--tone)" duration={0.8} stagger={0.05} />
        ) : (
          <span className="score-empty">00</span>
        )}
        <span className="score-of">/100</span>
      </div>
      <div className="verdict" aria-live="polite">
        <DecryptedText
          key={label}
          text={label.toUpperCase()}
          animateOn="view"
          sequential
          speed={26}
          revealDirection="start"
          characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ#/%<>"
          className="verdict-on"
          encryptedClassName="verdict-enc"
        />
      </div>
      <Exposure score={result?.score} />
      {result ? (
        <dl className="score-facts">
          <div><dt>Read as</dt><dd>{KIND[result.kind]}</dd></div>
          <div><dt>Length</dt><dd>{size}</dd></div>
          <div><dt>Confidence</dt><dd>{result.confidence[0].toUpperCase() + result.confidence.slice(1)}</dd></div>
        </dl>
      ) : (
        <p className="score-idle">Paste or open something to scan. Text is analysed in your browser.</p>
      )}
      {result && (result.context.genre !== 'general' || result.context.markers.length > 0) && (
        <p className="context-note">
          <b>{result.context.label}</b>
          {result.context.markers.length > 0 ? ` · ${result.context.markers.join(' · ')}` : ''}
        </p>
      )}
      {result?.capped && (
        <p className="capped">
          <b>Held at {result.score}</b> (would be {result.capped.from}). {result.capped.reason}
        </p>
      )}
    </SpotlightCard>
  );
}

// Composition: how much each family contributes, as one bar split by colour.
function Composition({ result }) {
  const fams = useMemo(() => {
    const totals = { lang: { pts: 0, cats: [] }, form: { pts: 0, cats: [] }, code: { pts: 0, cats: [] } };
    let human = 0;
    for (const c of result.categories) {
      if (c.contribution <= 0) { human += c.contribution; continue; }
      const f = totals[FAMILY_OF[c.id]];
      f.pts += c.contribution;
      f.cats.push(c);
    }
    return { totals, human };
  }, [result]);
  const sum = Object.values(fams.totals).reduce((a, f) => a + f.pts, 0);
  if (!sum && !fams.human) return null;
  return (
    <section className="panel">
      <h2 className="kicker"><span className="kicker-n">B</span> Composition</h2>
      {sum > 0 && (
        <div className="comp-bar" role="img" aria-label="Share of evidence by family">
          {Object.entries(fams.totals).filter(([, f]) => f.pts > 0).map(([id, f]) => (
            <span key={id} className={`seg f-${id}`} style={{ flexGrow: f.pts }} />
          ))}
        </div>
      )}
      <ul className="comp-list">
        {Object.entries(fams.totals).filter(([, f]) => f.pts > 0).map(([id, f]) => (
          <li key={id}>
            <span className={`swatch f-${id}`} />
            <span className="comp-name">{FAMILIES[id].label}</span>
            <span className="comp-cats">{f.cats.map((c) => c.label).join(' · ')}</span>
            <span className="comp-pct">{Math.round((f.pts / sum) * 100)}%</span>
            <span className="comp-pts">{fmtPts(f.pts)}</span>
          </li>
        ))}
        {fams.human < 0 && (
          <li>
            <span className="swatch f-human" />
            <span className="comp-name">Human markers</span>
            <span className="comp-cats">Casual register, varied rhythm</span>
            <span className="comp-pct" />
            <span className="comp-pts neg">{fmtPts(fams.human)}</span>
          </li>
        )}
      </ul>
    </section>
  );
}

function Severity({ pts }) {
  const n = pts >= 1.5 ? 3 : pts >= 0.7 ? 2 : pts > 0 ? 1 : 0;
  return (
    <span className="sev" aria-label={`${['no', 'low', 'medium', 'high'][n]} weight`}>
      {[0, 1, 2].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  );
}

function Hits({ findings, onReveal, onHot, note }) {
  const shown = findings.slice(0, 40);
  return (
    <>
      <ul className="hits">
        {shown.map((f) => (
          <li key={f.id}>
            <button type="button" className="hit" onClick={() => onReveal(f)} onMouseEnter={() => onHot(f.rule)} title="Show in the text">
              <span className="hit-pos">{f.line}:{f.col}</span>
              <span className="hit-text">{f.text.replace(/\s+/g, ' ')}</span>
              {note && <span className="hit-note">{note(f)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {findings.length > shown.length && <p className="more">and {findings.length - shown.length} more</p>}
    </>
  );
}

function Row({ fam, label, sub, count, pts, open, onToggle, onHot, children, muted }) {
  return (
    <li className={`sig f-${fam}${open ? ' open' : ''}${muted ? ' muted' : ''}`}>
      <button
        type="button"
        className="sig-head"
        aria-expanded={open}
        onClick={onToggle}
        onMouseEnter={onHot && (() => onHot(true))}
        onMouseLeave={onHot && (() => onHot(false))}
        onFocus={onHot && (() => onHot(true))}
        onBlur={onHot && (() => onHot(false))}
      >
        <span className="sig-main">
          <span className="sig-label">{label}</span>
          {sub && <span className="sig-sub">{sub}</span>}
        </span>
        <span className="sig-count">{count}</span>
        {muted ? <span className="sev" /> : <Severity pts={pts} />}
        <span className={`sig-pts${pts < 0 ? ' neg' : ''}`}>{muted ? '0.0' : fmtPts(pts)}</span>
      </button>
      <div className="sig-body"><div className="sig-inner">{open && children}</div></div>
    </li>
  );
}

function Signals({ result, filter, setFilter, setHot, onReveal, letters = ['C', 'D'] }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (k) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const items = useMemo(() => [
    ...result.rules.map((r) => ({ ...r, type: 'rule' })),
    ...result.signals.map((s) => ({ ...s, type: 'signal', why: s.detail, count: null })),
  ].sort((a, b) => b.contribution - a.contribution), [result]);

  const famCounts = useMemo(() => {
    const c = { lang: 0, form: 0, code: 0 };
    for (const f of result.findings) if (f.counted) c[FAMILY_OF[f.category]]++;
    return c;
  }, [result]);

  const shown = items.filter((i) => filter === 'all' || FAMILY_OF[i.category] === filter);
  const checked = result.discounted.filter((d) => d.factor === 0);
  const checkedN = checked.reduce((a, g) => a + g.count, 0);
  const counted = result.findings.filter((f) => f.counted).length;

  return (
    <section className="panel grow">
      <div className="panel-head">
        <h2 className="kicker"><span className="kicker-n">{letters[0]}</span> Signals <span className="dim">{counted} flagged</span></h2>
      </div>
      <div className="filters" role="toolbar" aria-label="Filter by family">
        {['all', 'lang', 'form', 'code'].map((id) => (
          <button
            type="button"
            key={id}
            className={`filter f-${id}`}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            disabled={id !== 'all' && !famCounts[id] && !items.some((i) => FAMILY_OF[i.category] === id)}
          >
            {id !== 'all' && <span className={`swatch f-${id}`} />}
            {id === 'all' ? 'All' : FAMILIES[id].label}
            <span className="filter-n">{id === 'all' ? counted : famCounts[id]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="none"><span className="swatch f-human" /> No generated-text patterns found{filter !== 'all' ? ' in this family' : ''}.</p>
      ) : (
        <ul className="sigs">
          {shown.map((item) => {
            const key = `${item.type}:${item.id}`;
            const fam = item.contribution < 0 ? 'human' : FAMILY_OF[item.category];
            return (
              <Row
                key={key}
                fam={fam}
                label={item.label}
                sub={CATEGORIES[item.category].label}
                count={item.count ? `×${item.count}` : 'whole text'}
                pts={item.contribution}
                open={open.has(key)}
                onToggle={() => toggle(key)}
                onHot={item.type === 'rule' ? (on) => setHot(on ? item.id : null) : undefined}
              >
                <p className="why">{item.why}</p>
                {item.type === 'rule' && (
                  <Hits findings={result.findings.filter((f) => f.rule === item.id && f.counted)} onReveal={onReveal} onHot={setHot} />
                )}
              </Row>
            );
          })}
        </ul>
      )}

      {checkedN > 0 && (
        <div className="checked">
          <h3 className="kicker"><span className="kicker-n">{letters[1]}</span> Checked, not counted <span className="dim">{checkedN}</span></h3>
          <p className="checked-sub">Flags that context explains: technical word senses, example code, quoted mentions, standard formats and one-offs.</p>
          <ul className="sigs">
            {checked.map((g) => {
              const key = `checked:${g.reason}`;
              return (
                <Row key={key} fam="off" label={g.reason} count={`×${g.count}`} pts={0} muted open={open.has(key)} onToggle={() => toggle(key)}>
                  <Hits
                    findings={g.findings.map((id) => result.findings[id])}
                    onReveal={onReveal}
                    onHot={setHot}
                    note={(f) => `${f.label} · ${f.discount.reason}`}
                  />
                </Row>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

const STEPS = [
  ['Patterns', 'About sixty rules for stock phrases, model vocabulary, sentence templates, narrating comments, placeholders and template web styling.'],
  ['Context', 'Technical word senses, code examples, quoted mentions, tests and reference formats are checked before a flag counts.'],
  ['Rhythm', 'Sentence and paragraph variation across the whole document.'],
  ['Corroboration', 'A likely-AI verdict needs two independent kinds of evidence.'],
];

// Composition is hidden when there is no evidence; section letters follow what is shown.
const hasComposition = (r) => r.categories.some((c) => c.contribution !== 0);

export default function Report({ result, theme, revealKey, filter, setFilter, setHot, onReveal }) {
  const letters = result && hasComposition(result) ? ['C', 'D'] : ['B', 'C'];
  return (
    <aside className="report" aria-label="Report">
      <Reveal revealKey={revealKey}><ScoreCard result={result} theme={theme} /></Reveal>
      {result ? (
        <>
          <Reveal revealKey={revealKey} delay={0.08}><Composition result={result} /></Reveal>
          <Reveal revealKey={revealKey} delay={0.16}>
            <Signals result={result} filter={filter} setFilter={setFilter} setHot={setHot} onReveal={onReveal} letters={letters} />
          </Reveal>
        </>
      ) : (
        <section className="panel">
          <h2 className="kicker"><span className="kicker-n">B</span> Method</h2>
          <ol className="method">
            {STEPS.map(([t, d], i) => (
              <li key={t}><span className="method-n">{String(i + 1).padStart(2, '0')}</span><b>{t}</b><span>{d}</span></li>
            ))}
          </ol>
          <div className="legend">
            {Object.entries(FAMILIES).map(([id, f]) => (
              <span key={id}><span className={`swatch f-${id}`} />{f.label}</span>
            ))}
            <span><span className="swatch f-off" />Not counted</span>
          </div>
          <p className="fineprint">A score is evidence, not proof. Use it to find passages worth a second look, not to accuse anyone.</p>
        </section>
      )}
    </aside>
  );
}
