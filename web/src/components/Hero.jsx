import TrueFocus from '../reactbits/TrueFocus.jsx';
import SpotlightCard from '../reactbits/SpotlightCard.jsx';
import { SAMPLES } from '../samples.js';

// The demo sentence is made of the phrases a model reaches for first; the focus frame
// moves between them the way the detector does.
const DEMO = "In today's fast-paced world,|it's not just a tool —|it's a testament|to seamless|innovation.";

export default function Hero({ theme, onPaste, onOpen, onSample, onStartTyping }) {
  return (
    <div className="hero" onClick={(e) => { if (!e.target.closest('button, a')) onStartTyping(); }}>
      <div className="hero-inner">
        <p className="kicker"><span className="kicker-n">00</span> Live scan of a sample sentence</p>
        <div className="hero-demo">
          <TrueFocus
            sentence={DEMO}
            separator="|"
            borderColor="var(--slop)"
            glowColor="color-mix(in srgb, var(--slop) 55%, transparent)"
            blurAmount={2.2}
            unfocusedOpacity={0.42}
            animationDuration={0.45}
            pauseBetweenAnimations={1.15}
            cornerSize={14}
            borderWidth={2}
          />
        </div>
        <div className="hero-copy">
          <h1>Find the parts that read as machine-made.</h1>
          <p>
            Paste prose, a web page or code. Every flag is marked in place and explained, and words used in
            their technical sense are checked before they count.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn primary" onClick={onPaste}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="10" height="13" rx="1.5" /><path d="M8 4V3h4v1" /></svg>
            Paste text
          </button>
          <button type="button" className="btn" onClick={onOpen}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 13.5v2.5h12v-2.5M10 3.5v9M6.5 7 10 3.5 13.5 7" /></svg>
            Open files
          </button>
          <span className="hint">or start typing · drop files anywhere</span>
        </div>

        <p className="kicker"><span className="kicker-n">01</span> Samples</p>
        <div className="samples">
          {SAMPLES.map((s, i) => (
            <button type="button" key={s.file} className="sample-btn" onClick={() => onSample(s)}>
              <SpotlightCard
                className={`sample ${s.human ? 'is-human' : 'is-slop'}`}
                theme={theme}
                spotlightColor={s.human ? 'var(--human)' : 'var(--slop)'}
                intensity={0.18}
                spotlightSize={220}
                borderGlow={0.8}
                style={{ '--spotlight-card-surface': 'var(--panel)', '--spotlight-card-border': 'var(--line)', '--spotlight-card-shadow': 'none' }}
              >
                <span className="sample-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="sample-name">{s.label}</span>
                <span className="sample-meta">
                  <span>{s.type}</span>
                  <span className="sample-tag">{s.human ? 'Hand-written' : 'Generated'}</span>
                </span>
              </SpotlightCard>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
