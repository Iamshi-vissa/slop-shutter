# SLOP SHUTTER

Flags AI slop and generated-text patterns in prose, web pages and source code, and shows you
exactly which passages triggered the score.

```
samples/ai-script.py  code · 267 words · high confidence
  ████████████████████  99  Likely AI-generated

   +2.4  Numbered step comment ×3  Narrating comments
   +2.4  Emoji in log message ×3  Narrating comments
   +2.2  Comment restates the code ×12  Narrating comments
   +1.5  Placeholder secret ×1  Placeholders
   +1.5  "In a real application…" ×1  Placeholders
```

## WHAT IT LOOKS FOR

| Category | Examples |
| --- | --- |
| Chatbot residue | "As an AI language model", "Certainly!", "I hope this helps", unfilled `[Your Name]` |
| Stock phrases | "In today's fast-paced world", "plays a crucial role", "a testament to", "let's dive in" |
| Model vocabulary | delve, tapestry, multifaceted, meticulous, seamless, leverage… (weighted per word) |
| Rhetorical templates | "It's not just X, it's Y", "The result?", "No X. No Y. Just Z." |
| Formatting tells | ✅ emoji bullets, `- **Label:**` lists, emoji headings, dense em dashes |
| Rhythm | uniform sentence and paragraph lengths (and, toward human: varied rhythm, casual register) |
| Narrating comments | `// Initialize the counter`, `# Step 1:`, `# Example usage`, comment on every line |
| Placeholders | `your-api-key-here`, "in a real application", `// ... rest of code`, John Doe, Acme Corp |
| Template web copy | `#667eea → #764ba2`, indigo-to-purple Tailwind gradients, `<!-- Hero Section -->`, "Elevate your…" |

Each document is read on the right surface: the whole file for prose, the visible text for
HTML, and comments and docstrings for code. Code strings and markup never trigger prose rules,
while styling and copy rules read the raw source of web files (HTML, JSX/TSX, Vue, Svelte, CSS).

## HOW SCORING WORKS

1. About sixty pattern rules find spans. Repeats of the same rule or word add evidence with
   diminishing returns (`weight × log2(1 + hits)`), divided by a length correction.
2. Whole-document signals add evidence: sentence-length variation, paragraph uniformity, em
   dash density and comment density. Casual or idiosyncratic writing subtracts evidence.
3. A logistic model turns the features into a score from 1 to 99:
   under 30 *reads as human*, 30–59 *mixed signals*, 60 and over *likely AI-generated*.

4. Corroboration: a *likely AI-generated* verdict needs at least two independent kinds of
   evidence. Vocabulary alone, or formatting alone, is held at 59 (*mixed signals*), and the
   report says so. Chatbot residue is the exception, since nothing else produces it.

The default weights are hand-tuned. You can fit them to your own labelled examples
(see [Training](#training)).

**A score is evidence, not proof.** Careful writers use em dashes, and edited model output can
read clean. Use it to find passages worth a second look, not to accuse anyone.

## CONTEXT

Many flagged words and formats are correct in technical writing. Before a flag counts,
Slop Shutter checks how the word or format is being used:

| Situation | Example | Treatment |
| --- | --- | --- |
| Technical sense of a word | Kerberos realm, test harness, landscape mode, elevated privileges, robust estimator, BLE beacon, user journey, dynamic programming | not counted |
| Code inside a document | fenced blocks, `inline code`, URLs, HTML `<pre>` and `<code>` | not read as prose |
| Reference formats in technical docs | bold labels naming config keys, placeholder API keys in setup steps, emoji section headings | not counted or reduced |
| Tests and fixtures | John Doe, Acme Corp and dummy keys in `*.test.js`, `tests/`, `fixtures/` | not counted |
| Mentions | a phrase in quotation marks, a comma-separated list of the words, a table of examples | not counted |
| One-offs | a single em dash, one narrating comment, one generic error message | shown, counted only when repeated |

The document type (technical document, source code, test code or general prose) is detected
from code blocks, inline code, reference headings such as *Installation* and *Usage*, command
lines and test file names. You can override it with the Context menu in the web app or
`--context technical|general` on the command line.

Nothing is silently dropped: the report lists every flag that was set aside under
**Checked, not counted**, with the reason, such as *Technical sense: "Kerberos realm"*.

To teach it a new technical sense, add a pattern to `SENSES` in `src/context.js` and link it from
the word's entry in `src/rules.js`.

## GETTING STARTED

You need Node.js 20.11 or newer. There are no dependencies to install.

```bash
cd slop-shutter
```

### Web interface

```bash
npm start
```

Then open <http://localhost:4173/>.

- **Start:** paste, drop files, fetch a web page by address, or pick one of eight samples.
- **Live highlighting:** flags are highlighted as you type. Analysis runs in a Web Worker so long
  documents stay smooth, and highlights stay pinned to the text while it works.
- **Explanations:** every signal opens to show why it counts and each passage it matched. Flags that
  context set aside are drawn with a dotted outline and listed under *Checked, not counted*.
- **Navigation:** a minimap beside the scrollbar shows where flags are. Step through them with
  <kbd>F8</kbd> and <kbd>Shift</kbd>+<kbd>F8</kbd>, or the arrows at the bottom right. Press <kbd>?</kbd>
  for all shortcuts.
- **Export:** Markdown report, JSON, or a ready-made `curl` call to the API.
- **Everywhere:** light and dark themes, a Text/Report switch on phones, keyboard access
  throughout, and no animation for viewers who ask for reduced motion.

Text is analysed in your browser. It only goes to the server when you fetch a web page by
address or call the API.

### Command line

```bash
node bin/slop-shutter.js README.md src/ https://example.com
```

| Option | Meaning |
| --- | --- |
| `-v`, `--verbose` | list every flagged passage with line and column |
| `--json` / `--md` | machine-readable or Markdown output |
| `--kind prose\|html\|code` | override detection |
| `--context technical\|general` | override the document context |
| `--fail-above <n>` | exit 1 if any file scores `n` or more, for CI |
| `--min-score <n>` | only report files scoring `n` or more |
| `--model <file>` | use a trained model |
| `-` | read standard input |

Folders are scanned recursively, skipping `node_modules`, `.git`, build output and files over 2 MB.

Example CI step:

```bash
node slop-shutter/bin/slop-shutter.js docs/ site/ --fail-above 70
```

### Library

```js
import { analyze } from './slop-shutter/src/index.js';

const result = analyze(text, { filename: 'post.md' });
result.score;     // 0–99
result.verdict;   // { id: 'slop' | 'mixed' | 'human', label }
result.findings;  // [{ rule, label, start, end, line, col, text, weight }]
result.rules;     // per-rule counts and contributions
result.signals;   // whole-document signals
```

The engine has no Node-specific imports, so the same module runs in the browser.

## HTTP API

The server and the serverless deployment expose a JSON API that other apps can call in real time.

`POST /api/analyze`

```bash
curl -s -X POST http://localhost:4173/api/analyze \
  -H 'content-type: application/json' \
  -d '{"text": "It is not just a tool, it is a testament to innovation.", "filename": "post.md"}'
```

| Field | Type | Notes |
| --- | --- | --- |
| `text` | string, required | up to 1,000,000 characters; a `text/plain` body also works |
| `filename` | string | used to detect the kind of file; pass it for code (`app.py`, `page.html`) |
| `kind` | `prose`, `html` or `code` | overrides detection |
| `context` | `auto`, `technical` or `general` | overrides the document context |
| `findings` | boolean, default `true` | `false` returns the score and summary without every flagged passage |

The response is the same result as the library's `analyze()`: `score`, `verdict`, `confidence`,
`context`, `capped`, `categories`, `rules`, `signals`, `findings` and `discounted`, plus
`elapsedMs`. Typical documents take 5–20 ms.

Errors return a JSON `{ "error": "…" }` with status 400 (bad input), 405, 413 (too large) or
429 (rate limited, with `Retry-After`). CORS is open by default so browsers on other sites can
call it; set `CORS_ORIGIN` to restrict it.

`GET /api/fetch?url=…` returns `{ url, status, contentType, text }` for a public page. The web
app uses it, and it does not send CORS headers. `GET /api/health` returns
`{ ok, version, fetch }`.

### Safety

The page fetcher refuses anything that is not a public web page:

- loopback, private, link-local and cloud metadata addresses (`169.254.169.254`), IPv4 and IPv6
- encoded forms of those addresses, such as `0x7f000001` and `::ffff:127.0.0.1`
- `.local` and `.internal` names
- ports other than 80 and 443
- addresses with embedded credentials

Each address a host name resolves to is checked when the connection opens, so a changing DNS
answer cannot slip past. Each redirect is checked the same way, at most five are followed, and
pages are limited to 3 MB, text types only, and 12 seconds.

The server sends a strict Content Security Policy and serves only `web/`, `src/` and `samples/`.

## DEPLOY

The web app is static and does all its analysis in the browser. The API needs Node.js 20.11 or
newer and has no dependencies.

### Vercel

Import the repository at <https://vercel.com/new> with no build command and no framework preset.
`vercel.json` sets the security headers and redirects `/` to the app, and the files in `api/`
become serverless functions for `/api/analyze`, `/api/fetch` and `/api/health`.

### Docker (Render, Fly.io, Railway, Cloud Run, a VPS…)

```bash
docker build -t slop-shutter .
```

```bash
docker run -p 8080:8080 slop-shutter
```

### Any Node host

```bash
npm run start:prod
```

This listens on `0.0.0.0` and the `PORT` the host provides (8080 if none).

### Static only (GitHub Pages, Netlify, S3)

Publish the repository as static files and open `/web/`. Everything works except fetching pages
by address and the API. The app detects that and hides the address box.

### Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4173` locally, `8080` in Docker | port to listen on |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | address to bind |
| `RATE_LIMIT_ANALYZE` | `120` | analysis requests per client per minute |
| `RATE_LIMIT_FETCH` | `20` | page fetches per client per minute |
| `TRUST_PROXY` | off (on for Vercel) | set to `1` behind a proxy so limits use `X-Forwarded-For` |
| `CORS_ORIGIN` | `*` | allowed origin for `/api/analyze` |
| `DISABLE_FETCH` | off | set to `1` to turn off page fetching |

Rate limits are kept in memory for each server instance. For a large public deployment, put the
service behind your platform's own rate limiting as well.

## TRAINING

Put hand-written files in one folder and generated files in another, then:

```bash
node bin/slop-shutter.js train --human data/human --ai data/ai -o model.json
```

```bash
node bin/slop-shutter.js scan drafts/ --model model.json
```

Training fits an L2-regularised logistic regression over the same features. It starts from the
default weights and is pulled back toward them, so a small corpus adjusts the model rather than
replacing it. The accuracy it prints is measured on the training files, so hold some files back
to check how well the model generalises.

## LAYOUT

```
src/rules.js      pattern rules and categories
src/surfaces.js   file kind detection and the text/comment surfaces
src/context.js    document context, technical word senses and discounts
src/stats.js      whole-document signals
src/engine.js     features, model, scoring, explanations
src/model.js      training and evaluation
src/report.js     terminal, Markdown and JSON output
bin/              command line
web/              browser interface (app.js, worker.js, styles.css)
server.js         web server: static files, API routes, security headers
server/           API handlers, guarded page fetcher, rate limits
api/              serverless entry points (Vercel)
Dockerfile        container image
samples/          labelled examples used by the demo and tests
test/             node:test suites
```

```bash
npm test
```

## LIMITS

- Rules are English-only.
- Very short inputs (under about 60 words) give low-confidence scores.
- Pattern detectors can be evaded by editing, and a sufficiently careful prompt avoids most tells.
  Slop Shutter is aimed at the unedited output that makes up most slop, not at adversaries.
