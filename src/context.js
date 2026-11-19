// Context: decide what kind of document this is, and when a flag is a false alarm.
//
// The same word or format can be a model habit in one place and the correct, standard choice
// in another. "Realm" in an essay is purple prose; in "the Kerberos realm" it is the only right
// word. A bolded-label list in a blog post is a chat-assistant habit; in a configuration
// reference it is the convention. This module finds those cases and discounts the flag,
// recording why, so the report can show what was checked and not counted.

// Technical senses of model-favoured words. Each pattern is tested against the words around
// a match, on the same line; a hit means the word is being used in its technical meaning.
export const SENSES = {
  realm: /\b(?:kerberos|keycloak|security|auth\w*|ldap|sso|kdc|identity|mongodb|wildfly|tomcat|jaas|radius)\b[^.\n]{0,30}\brealms?\b|\brealms?\b[^.\n]{0,30}\b(?:kerberos|keycloak|ldap|sso|kdc|database|db|sdk|config\w*|name|setting|admin|login|users?)\b|\brealm\s*[=:]/i,
  navigate: /\bnavigat\w*\s+(?:to|back|away|forward|between|up|down|into)\b|\bnavigat\w*\s+(?:the |this |that )?(?:page|screen|route|url|menu|tree|director(?:y|ies)|folders?|dom|history|tabs?|app|ui|site|settings|file|link|sidebar|list)\b|\bnavigation\b|\b(?:router|navigator|keyboard)\b/i,
  landscape: /\blandscape\s+(?:mode|orientation|format|view|layout|photos?|images?|pages?|screens?|display)\b|\b(?:portrait|orientation|rotate)\b[^.\n]{0,40}\blandscape\b|\blandscape\b[^.\n]{0,40}\b(?:portrait|orientation)\b|\blandscap(?:ing|er|ers)\b/i,
  elevate: /\belevat\w*\s+(?:privileges?|permissions?|rights|access|shell|prompt|token|mode|command|process|account|user)\b|\belevation\b|\b(?:run|running|runs) (?:as )?elevated\b|\belevated (?:surface|card|button|shadow)\b|\b(?:elevated|elevation) (?:above|by|to) (?:sea|\d)|\belevated (?:blood|levels?|risk|temperature|heart rate)\b/i,
  robust: /\brobust(?:ly|ness)?\s+(?:estimat\w*|regression|statistic\w*|standard errors?|control|optimi[sz]ation|covariance|scaler|fit|loss|means?|median|methods?|against|to)\b|\brobustness\b/i,
  leverage: /\bleverag\w*\s+(?:ratio|points?|effect|statistic|buyout)\b|\b(?:financial|operating|debt|high|low|net)[- ]leverage\b|\bleverage\b[^.\n]{0,25}\b(?:debt|equity|margin|ratio|regression)\b/i,
  underscore: /\bunderscores?\b[^.\n]{0,30}\b(?:character|prefix|suffix|separat\w*|case|delimit\w*|instead of|and (?:dash|hyphen)|or (?:dash|hyphen))|\b(?:an?|with|use|using|single|double|leading|trailing|by|no|or)\s+underscores?\b|\b(?:hyphens?|dashes|spaces)\b[^.\n]{0,20}\bunderscores?\b|underscore\.js|\bunderscore\s*\(|\(_\)/i,
  harness: /\b(?:test|testing|benchmark|fuzz(?:ing)?|eval(?:uation)?|wiring|safety|cable|load)\s+harness\w*|\bharness\w*\s+(?:tests?|code|script|runs?|file)\b|\bharness\.io\b/i,
  beacon: /\b(?:ble|bluetooth|ibeacon|eddystone|wi-?fi|radio|gps|lora)\b[^.\n]{0,30}\bbeacons?\b|\bbeacons?\b[^.\n]{0,30}\b(?:packets?|signals?|rssi|transmit\w*|sensors?|devices?|hardware|frames?|interval|api|chain|nodes?|reader|scanner)\b|sendbeacon/i,
  journey: /\b(?:user|customer|buyer|patient|client)\s+journeys?\b|\bjourney\s+(?:maps?|mapping)\b/i,
  dynamic: /\bdynamic(?:ally)?\s+(?:programming|typing|typed|imports?|dispatch|linking|librar(?:y|ies)|allocation|memory|range|routes?|routing|segments?|content|ip|dns|pricing|arrays?|analysis|loading|linked|loaded|allocated|generated|sql|queries|query|forms?|fields?|properties|proxy|scope|resolution|load)\b/i,
  enhance: /\benhanc\w*\s+(?:for loop|security|images?|resolution|contrast|mode|interrupts?|syntax)\b|\bprogressive(?:ly)? enhance\w*|\benhancements?\s+(?:request|proposal)\b|\b(?:enhancement|feature) (?:label|issue)\b/i,
  tapestry: /\bapache tapestry\b|\btapestry\s+(?:framework|5|components?)\b/i,
  showcase: /\bshowcase\s*(?:page|component|app|repo|folder|directory|site|\/|\.)|\bshowcase\b[^.\n]{0,15}\b(?:storybook|demo app)\b/i,
  seamless: /\bseamless(?:ly)?\s+(?:textures?|tiles?|tiling|loops?|looping|patterns?|images?|backgrounds?|wallpaper|steel|pipe|tubing|handover|roaming|failover|upgrade)\b/i,
  streamline: /\bstreamlines?\b[^.\n]{0,20}\b(?:flow|fluid|field|plots?|velocity|vectors?)\b|\bstreamline\s+(?:plots?|tracing)\b/i,
  foster: /\bfoster\s+(?:care|parents?|home|family|families|child(?:ren)?)\b/i,
  vibrant: /\bvibrant\s+(?:colou?rs?|palette|hues?|reds?|blues?|greens?|oranges?|yellows?|tones?|shades?)\b/i,
  resonate: /\bresonan\w*|\bresonat\w*\s+(?:frequency|circuit|at\s+\d)/i,
  embark: /\bembark\w*\s+(?:on|onto)\s+(?:the\s+|a\s+)?(?:ship|vessel|ferry|flight|plane|boat|aircraft)\b|\bdisembark/i,
  interplay: /\binterplay\s+(?:entertainment|productions)\b/i,
  comprehensive: /\bcomprehensive\s+(?:insurance|exam|examination|school|coverage|test suite)\b/i,
  innovative: /\binnovative\s+(?:medicine|medicines)\b/i,
};

const TECH_HEADING = /\b(?:installation|install|usage|api|configuration|config|getting started|quick ?start|requirements|prerequisites|license|contributing|changelog|release notes|options|parameters|arguments|returns|examples?|setup|build(?:ing)?|development|testing|faq|troubleshooting|known issues|design notes|architecture|reference|deployment|environment variables|cli|commands|endpoints|schema|migration|upgrading)\b/i;

/** Ranges of example code inside prose (Markdown) or HTML. */
export function codeRegions(raw, kind) {
  const ranges = [];
  const collect = (re) => { re.lastIndex = 0; let m; while ((m = re.exec(raw))) ranges.push([m.index, m.index + m[0].length]); };
  if (kind === 'prose') {
    collect(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm);
    const fenced = ranges.slice();
    const inFence = (i) => fenced.some(([a, b]) => i >= a && i < b);
    const inline = /`[^`\n]+`/g;
    let m;
    while ((m = inline.exec(raw))) if (!inFence(m.index)) ranges.push([m.index, m.index + m[0].length]);
  } else if (kind === 'html') {
    collect(/<(pre|code|kbd|samp|var)\b[^>]*>[\s\S]*?<\/\1\s*>/gi);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

const inRanges = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b);

const TEST_NAME = /(?:^|[\\/])(?:tests?|__tests__|spec|specs|fixtures?|mocks?|__mocks__|stories|examples?|e2e|cypress|playwright)[\\/]|(?:\.|_|-)(?:test|spec|stories|story|fixture|mock)s?\.\w+$|(?:^|[\\/])test_[^\\/]+\.py$|\.(?:example|sample|template|dist)$/i;
const TEST_CONTENT = /\b(?:describe|it|test)\s*\(\s*['"`]|^\s*def test_\w+|^\s*import (?:pytest|unittest)|^\s*from unittest\b|\bassert(?:Equal|True|Throws|_eq)?\s*[!(]|#\[test\]|@Test\b|func Test\w+\(/gm;

/**
 * Work out the document's context.
 * @param {object} doc     prepared document (see surfaces.js)
 * @param {'auto'|'technical'|'general'} [override]
 */
export function detectContext(doc, override = 'auto') {
  const raw = doc.raw;
  const markers = [];
  const testHits = (raw.match(TEST_CONTENT) || []).length;
  const testFile = TEST_NAME.test(doc.filename || '') || (doc.kind === 'code' && testHits >= 2);
  if (testFile) markers.push(TEST_NAME.test(doc.filename || '') ? 'test or fixture file name' : `${testHits} test cases`);

  let genre = 'general';
  if (doc.kind === 'code') {
    genre = 'code';
  } else {
    const fences = (raw.match(/^[ \t]*(?:`{3,}|~{3,})/gm) || []).length / 2;
    const inline = doc.codeRegions.length - Math.floor(fences);
    const headings = doc.kind === 'html'
      ? (raw.match(/<h[1-6][^>]*>([^<]*)</gi) || []).filter((h) => TECH_HEADING.test(h)).length
      : (raw.match(/^#{1,6}[ \t]+[^\n]+$/gm) || []).filter((h) => TECH_HEADING.test(h)).length;
    const shell = (raw.match(/^\s*(?:\$ |> )?(?:npm|npx|pnpm|yarn|pip3?|poetry|git|cargo|docker|kubectl|brew|apt(?:-get)?|go|make|curl|wget|node|python3?|export|cd)\s+\S/gm) || []).length;
    const tables = (raw.match(/^\|.*\|\s*$/gm) || []).length;
    const score = Math.min(fences, 4) * 2 + Math.min(inline, 12) * 0.5 + headings * 2 + Math.min(shell, 4) + (tables >= 3 ? 1 : 0);
    if (fences >= 1) markers.push(`${Math.round(fences)} code block${fences >= 2 ? 's' : ''}`);
    if (inline >= 2) markers.push(`${inline} inline code spans`);
    if (headings) markers.push(`${headings} reference-style heading${headings > 1 ? 's' : ''}`);
    if (shell) markers.push(`${shell} command line${shell > 1 ? 's' : ''}`);
    if (score >= 6) genre = 'technical';
  }
  if (override === 'technical' && genre !== 'code') { genre = 'technical'; markers.unshift('set by you'); }
  if (override === 'general' && genre !== 'code') { genre = 'general'; markers.length = 0; markers.push('set by you'); }

  const label = genre === 'technical' ? 'Technical document'
    : genre === 'code' ? (testFile ? 'Test code' : 'Source code')
      : doc.kind === 'html' ? 'Web page' : 'General prose';
  return { genre, label, testFile, markers, override };
}

/**
 * Mark findings that context explains. Sets f.discount = { factor, reason } where factor 0
 * means "checked, not counted" and anything below 1 means counted at reduced weight.
 */
export function applyContext(findings, doc, ctx, rulesById) {
  const technical = ctx.genre === 'technical' || ctx.genre === 'code';
  const set = (f, factor, reason) => {
    if (!f.discount || factor < f.discount.factor) f.discount = { factor, reason };
  };

  for (const f of findings) {
    const rule = rulesById[f.rule];

    // Anything matched on the raw source inside example code is part of the example.
    if (doc.kind !== 'code' && inRanges(doc.codeRegions, f.start) && rule.category !== 'template') {
      set(f, 0, 'Inside a code example');
      continue;
    }
    // Placeholder people, keys and companies are what tests and fixtures are supposed to use.
    if (ctx.testFile && (rule.category === 'scaffold' || f.rule === 'example-usage')) {
      set(f, 0, 'Placeholder data is expected in tests and fixtures');
      continue;
    }
    if (f.rule === 'bold-label-bullet' && /`/.test(f.text)) {
      set(f, 0, 'Labels a code identifier (reference-list format)');
      continue;
    }
    if (technical) {
      if (f.rule === 'model-vocab' && f.weight < 1) set(f, 0.4, 'Common in technical writing; counted at reduced weight');
      if (f.rule === 'bold-label-bullet') set(f, 0.3, 'Standard format in reference documentation; counted at reduced weight');
      if (f.rule === 'api-key-placeholder' && ctx.genre === 'technical') set(f, 0, 'Setup instructions use placeholder keys by convention');
      if (f.rule === 'emoji-heading' || f.rule === 'key-takeaways') set(f, 0.5, 'Common in project documentation; counted at reduced weight');
    }
  }

  // Mentions, not uses: a phrase in quotation marks, a comma-separated list of the words
  // themselves, or a table row cataloguing examples. Documentation about writing (style
  // guides, this project's own README) quotes these phrases without using them.
  const raw = doc.raw;
  const lineOf = (i) => {
    const a = raw.lastIndexOf('\n', i - 1) + 1;
    const b = raw.indexOf('\n', i);
    return raw.slice(a, b === -1 ? raw.length : b);
  };
  for (const f of findings) {
    const before = raw[f.start - 1] || '';
    const after = raw.slice(f.end, f.end + 4).match(/^[\w\s.,!?…:;)-]{0,3}?(["”'’])/);
    if (/["“'‘]/.test(before) && after) { set(f, 0, 'Quoted as an example, not used'); continue; }
    if (doc.kind === 'prose') {
      const line = lineOf(f.start);
      const examples = (line.match(/"[^"\n]{2,60}"|“[^”\n]{2,60}”|`[^`\n]+`/g) || []).length;
      if (/^\s*\|.*\|\s*$/.test(line) && examples >= 2) set(f, 0, 'Listed as an example in a table');
    }
  }
  const vocab = findings.filter((f) => f.rule === 'model-vocab').sort((a, b) => a.start - b.start);
  let run = [vocab[0]];
  const flush = () => {
    if (run.length >= 3) for (const f of run) set(f, 0, 'Listed as an example, not used');
  };
  for (let i = 1; i < vocab.length; i++) {
    const gap = raw.slice(vocab[i - 1].end, vocab[i].start);
    if (/^\s*[,;/]\s*(?:and\s+|or\s+)?$/.test(gap)) run.push(vocab[i]);
    else { flush(); run = [vocab[i]]; }
  }
  if (vocab.length) flush();

  // Some habits mean something only when they repeat. Below the threshold, show but don't count.
  const active = {};
  for (const f of findings) if (!f.discount || f.discount.factor > 0) active[f.rule] = (active[f.rule] || 0) + 1;
  for (const f of findings) {
    const min = rulesById[f.rule].minHits;
    if (min && active[f.rule] < min && (!f.discount || f.discount.factor > 0)) {
      set(f, 0, `Appears ${active[f.rule]}×; only counted as a repeated pattern (${min}+)`);
    }
  }
  return findings;
}
