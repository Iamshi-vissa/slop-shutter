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

The default weights are hand-tuned. You can fit them to your own labelled examples
(see [Training](#training)).

**A score is evidence, not proof.** Careful writers use em dashes, and edited model output can
read clean. Use it to find passages worth a second look, not to accuse anyone.

## GETTING STARTED

You need Node.js 20.11 or newer. There are no dependencies to install.

```bash
cd slop-shutter
```

### Web interface

```bash
npm start
```

Then open <http://localhost:4173/>. Paste text, drop files or pick a sample. Flags are
highlighted in place as you type. Click any signal to see every occurrence, then click an
occurrence to jump to it. You can also fetch a live web page by URL. Reports export as Markdown
or JSON. Analysis runs in the browser; the local server is only used to fetch pages.

### Command line

```bash
node bin/slop-shutter.js README.md src/ https://example.com
```

| Option | Meaning |
| --- | --- |
| `-v`, `--verbose` | list every flagged passage with line and column |
| `--json` / `--md` | machine-readable or Markdown output |
| `--kind prose\|html\|code` | override detection |
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
src/stats.js      whole-document signals
src/engine.js     features, model, scoring, explanations
src/model.js      training and evaluation
src/report.js     terminal, Markdown and JSON output
bin/              command line
web/              browser interface
server.js         local static server and page fetcher (binds to 127.0.0.1)
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
