// Pattern rules. Each rule names the surface it reads for each kind of document:
//   "text" is the human-readable part (the whole file for prose, visible text for HTML,
//          comments and docstrings for code), "raw" is the file as written.
// A rule's weight is its evidence per hit; repeated hits of the same key give diminishing
// returns (see engine.js), so one strong tell outweighs a dozen weak ones.

export const CATEGORIES = {
  artifact: {
    label: 'Chatbot residue',
    blurb: 'Phrases left behind when assistant output is pasted without editing.',
  },
  phrase: {
    label: 'Stock phrases',
    blurb: 'Set phrases language models reach for far more often than people do.',
  },
  vocab: {
    label: 'Model vocabulary',
    blurb: 'Words that became markers of generated text after 2023.',
  },
  structure: {
    label: 'Rhetorical templates',
    blurb: 'Sentence shapes such as "not just X, it\'s Y" and staged reveals.',
  },
  format: {
    label: 'Formatting tells',
    blurb: 'Emoji bullets, bolded-label lists and dense em dashes.',
  },
  rhythm: {
    label: 'Rhythm',
    blurb: 'Uniform sentence and paragraph lengths, measured over the whole document.',
  },
  comments: {
    label: 'Narrating comments',
    blurb: 'Comments that restate the next line, number steps or explain the obvious.',
  },
  scaffold: {
    label: 'Placeholders',
    blurb: 'Stand-in names, keys, "in a real app" caveats and elided code.',
  },
  template: {
    label: 'Template web copy',
    blurb: 'Stock landing-page copy and the default purple-gradient look.',
  },
};

// Scope presets: which surface a rule reads for each document kind.
const PROSE = { prose: 'text', html: 'text', code: 'text' };
const PROSE_ONLY = { prose: 'text', html: 'text' };
const COMMENTS = { code: 'text' };
const CODE_RAW = { code: 'raw' };
const ANY_RAW = { prose: 'raw', html: 'raw', code: 'raw' };
const WEB_RAW = { html: 'raw', web: 'raw' }; // "web" = code files that hold markup or styles
const COPY = { prose: 'text', html: 'text', web: 'raw' };

const A = "['’]"; // straight or curly apostrophe
const EMOJI = '(?:\\p{Extended_Pictographic}\\uFE0F?)';
const CMT = '(?:\\/\\/+|#+|\\/\\*+|^\\s*\\*|<!--|\\{\\/\\*)'; // a comment opener

const rx = (src, flags = 'giu') => new RegExp(src, flags);

export const RULES = [
  // ── Chatbot residue ──────────────────────────────────────────────────────────
  {
    id: 'as-an-ai', category: 'artifact', weight: 5, scope: PROSE,
    label: '"As an AI language model"',
    why: 'The model describing itself. Nobody writes this by hand.',
    pattern: rx(`\\bas an ai(?: language)? model\\b|\\bas of my (?:last )?(?:knowledge )?(?:update|cutoff|training(?: data)?)\\b|\\bregenerate response\\b`),
  },
  {
    id: 'assistant-opener', category: 'artifact', weight: 3.5, scope: PROSE_ONLY,
    label: 'Assistant opener',
    why: 'Replies that open with "Certainly!" or "Great question" are answering a prompt.',
    pattern: rx(`(?:^|[.!?]\\s+)(?:certainly|absolutely|of course|sure thing|sure)!|\\b(?:great|excellent|good|fantastic) question\\b|\\bi${A}?d be (?:happy|glad|delighted) to\\b|\\bi would be (?:happy|glad|delighted) to\\b`),
  },
  {
    id: 'assistant-closer', category: 'artifact', weight: 3, scope: PROSE,
    label: 'Assistant sign-off',
    why: 'Offers of further help addressed to whoever wrote the prompt.',
    pattern: rx(`\\bi hope (?:this|that) helps\\b|\\blet me know if you(?:${A}d| would)? (?:like|need|want|have)\\b|\\bfeel free to (?:ask|reach out|let me know|modify|adjust|customi[sz]e)\\b|\\bhappy (?:coding|writing)!`),
  },
  {
    id: 'heres-a', category: 'artifact', weight: 3, scope: PROSE,
    label: '"Here\'s a revised version"',
    why: 'Framing that introduces generated output rather than being the output.',
    pattern: rx(`\\bhere${A}?s (?:a|an|the|your) (?:revised|updated|improved|polished|rewritten|refined|cleaned[- ]up|more concise|step-by-step|comprehensive|detailed|quick|brief) (?:version|breakdown|summary|overview|guide|draft|list|example)\\b|\\bhere is (?:a|an|the) (?:revised|updated|improved|rewritten|refined) version\\b`),
  },
  {
    id: 'bracket-placeholder', category: 'artifact', weight: 4, scope: PROSE_ONLY,
    label: 'Unfilled [placeholder]',
    why: 'Template slots like [Your Name] that were never filled in.',
    pattern: rx(`\\[(?:your|insert|company|recipient|client|product|date|name|first name|job title|link|topic)\\b[^\\]\\n]{0,40}\\]`),
  },

  // ── Stock phrases ───────────────────────────────────────────────────────────
  {
    id: 'important-to-note', category: 'phrase', weight: 2, scope: PROSE,
    label: '"It\'s important to note"',
    why: 'A hedge that announces a point instead of making it.',
    pattern: rx(`\\bit${A}?s (?:important|worth|crucial|essential|vital) (?:to (?:note|remember|consider|understand|recognize|mention)|noting|mentioning)\\b|\\bit is (?:important|worth|crucial|essential) (?:to (?:note|remember|consider|understand|recognize)|noting|mentioning)\\b`),
  },
  {
    id: 'todays-world', category: 'phrase', weight: 2.5, scope: PROSE,
    label: '"In today\'s fast-paced world"',
    why: 'The generic opener of generated essays and blog posts.',
    pattern: rx(`\\bin today${A}?s (?:fast[- ]paced|digital|modern|ever[- ]changing|rapidly (?:evolving|changing)|competitive|interconnected|dynamic|tech[- ]driven|data[- ]driven)(?: \\w+)? (?:world|landscape|age|era|environment|market|society|business)\\b|\\bever[- ](?:evolving|changing) (?:world|landscape|field|realm|industry)\\b`),
  },
  {
    id: 'dive-in', category: 'phrase', weight: 1.5, scope: PROSE,
    label: '"Let\'s dive in"',
    why: 'Stock transition into the body of a generated piece.',
    pattern: rx(`\\blet${A}?s (?:dive|delve|jump) (?:in|into|deeper|right in)\\b|\\bdive deep(?:er)? into\\b|\\bwithout further ado\\b`),
  },
  {
    id: 'whether-youre', category: 'phrase', weight: 2, scope: PROSE,
    label: '"Whether you\'re a beginner or…"',
    why: 'Audience-widening construction typical of generated copy.',
    pattern: rx(`\\bwhether you${A}?re (?:a|an|just)\\b[^.!?\\n]{1,60}?\\bor (?:a|an|just|someone|looking|an? seasoned)\\b`),
  },
  {
    id: 'plays-a-role', category: 'phrase', weight: 2, scope: PROSE,
    label: '"Plays a crucial role"',
    why: 'Vague importance claim that stands in for a specific one.',
    pattern: rx(`\\bplay(?:s|ed|ing)? (?:a|an) (?:crucial|vital|pivotal|key|significant|critical|central|essential|instrumental|integral) role\\b`),
  },
  {
    id: 'testament', category: 'phrase', weight: 2.5, scope: PROSE,
    label: '"A testament to"',
    why: 'One of the most over-represented phrases in model output.',
    pattern: rx(`\\b(?:a|is a|stands as a|serves as a) (?:true |living |powerful )?testament to\\b`),
  },
  {
    id: 'navigate-complexities', category: 'phrase', weight: 2, scope: PROSE,
    label: '"Navigate the complexities"',
    why: 'Abstract travel metaphor for dealing with something.',
    pattern: rx(`\\bnavigat(?:e|es|ed|ing) (?:the )?(?:complexities|intricacies|challenges|nuances|landscape|world|waters|maze)\\b`),
  },
  {
    id: 'realm-of', category: 'phrase', weight: 1.5, scope: PROSE,
    label: '"In the realm of"',
    why: 'Inflated way of saying "in".',
    pattern: rx(`\\bin the (?:realm|world|landscape|sphere|domain) of\\b`),
  },
  {
    id: 'unlock-potential', category: 'phrase', weight: 2, scope: PROSE,
    label: '"Unlock the full potential"',
    why: 'Promotional cliché found in generated copy.',
    pattern: rx(`\\b(?:unlock|unleash|harness|maximi[sz]e|realize) (?:the |your |its |their )?(?:full |true |hidden )?potential\\b|\\b(?:take|elevate) (?:it|this|things|your [\\w-]+(?: [\\w-]+)?) to the next level\\b`),
  },
  {
    id: 'embark-journey', category: 'phrase', weight: 2.5, scope: PROSE,
    label: '"Embark on a journey"',
    why: 'Grandiose framing for starting something.',
    pattern: rx(`\\bembark(?:s|ed|ing)? on (?:a|an|your|this|our|the)\\b[^.!?\\n]{0,25}?\\b(?:journey|adventure|quest|path)\\b`),
  },
  {
    id: 'foster-sense', category: 'phrase', weight: 2, scope: PROSE,
    label: '"Foster a sense of"',
    why: 'Soft abstract phrasing common in generated text.',
    pattern: rx(`\\bfoster(?:s|ed|ing)? (?:a )?(?:sense of|culture of|deeper)\\b|\\brich tapestry\\b|\\bintricate dance\\b`),
  },
  {
    id: 'look-no-further', category: 'phrase', weight: 2, scope: PROSE,
    label: '"Look no further"',
    why: 'Sales-page cliché.',
    pattern: rx(`\\blook no further\\b|\\brest assured\\b|\\bstay ahead of the curve\\b|\\bin this (?:article|post|guide|blog post|blog),? (?:we|i)(?:${A}ll| will)\\b`),
  },
  {
    id: 'wide-range', category: 'phrase', minHits: 2, weight: 1, scope: PROSE,
    label: '"A wide range of"',
    why: 'Filler quantifier common in generated text.',
    pattern: rx(`\\ba (?:wide|diverse|broad|vast) (?:range|array|variety|spectrum) of\\b|\\bthe power of\\b|\\bgame[- ]chang(?:er|ing)\\b`),
  },
  {
    id: 'in-conclusion', category: 'phrase', weight: 1.2, scope: PROSE_ONLY,
    label: '"In conclusion"',
    why: 'School-essay summary marker models add by default.',
    pattern: rx(`(?:^|[.!?]\\s+|\\n)(?:in conclusion|in summary|to sum up|to summari[sz]e|overall|ultimately|in essence),`),
  },
  {
    id: 'transition-opener', category: 'phrase', minHits: 3, weight: 0.6, scope: PROSE_ONLY,
    label: 'Formal transition opener',
    why: 'Sentences opening with Moreover, Furthermore or Additionally. One is normal; many is a pattern.',
    pattern: rx(`(?:^|[.!?]\\s+|\\n\\s*)(?:moreover|furthermore|additionally|in addition|consequently|notably|importantly|crucially|interestingly),`),
  },

  // ── Model vocabulary ────────────────────────────────────────────────────────
  {
    id: 'model-vocab', category: 'vocab', weight: 1, scope: PROSE,
    label: 'Model-favoured word',
    why: 'These words became far more frequent after language models went mainstream.',
    // [term pattern, weight]; each distinct word is scored on its own
    terms: [
      ['delv(?:e|es|ed|ing)', 2], ['tapestr(?:y|ies)', 2, 'tapestry'], ['multifaceted', 1.6],
      ['intricac(?:y|ies)', 1.4], ['intricate(?:ly)?', 1.2], ['realms?', 1.2, 'realm'],
      ['embark(?:s|ed|ing)?', 1.2, 'embark'], ['beacons?', 1.2, 'beacon'], ['meticulous(?:ly)?', 1.4],
      ['bustling', 1.4], ['unwavering', 1.4], ['labyrinth(?:ine)?', 1.2],
      ['commendable', 1.4], ['paramount', 1.2], ['plethora', 1.4], ['pivotal', 1.2],
      ['showcas(?:e|es|ed|ing)', 1, 'showcase'], ['underscor(?:e|es|ed|ing)', 1, 'underscore'], ['boast(?:s|ing)', 0.8],
      ['seamless(?:ly)?', 1, 'seamless'], ['elevat(?:e|es|ed|ing)', 0.8, 'elevate'], ['vibrant', 0.8, 'vibrant'],
      ['harness(?:es|ed|ing)?', 0.8, 'harness'], ['foster(?:s|ed|ing)?', 0.8, 'foster'], ['leverag(?:e|es|ed|ing)', 0.8, 'leverage'],
      ['robust', 0.6, 'robust'], ['holistic(?:ally)?', 0.8], ['synerg(?:y|ies|istic)', 0.8],
      ['myriad', 1], ['nuanced', 0.6], ['resonat(?:e|es|ed|ing)', 0.8, 'resonate'], ['interplay', 0.8, 'interplay'],
      ['transformative', 0.8], ['groundbreaking', 0.8], ['cutting[- ]edge', 0.8],
      ['unparalleled', 1], ['invaluable', 0.8], ['empower(?:s|ed|ing|ment)?', 0.8],
      ['streamlin(?:e|es|ed|ing)', 0.6, 'streamline'], ['revolutioni[sz](?:e|es|ed|ing)', 0.8],
      ['effortless(?:ly)?', 0.8], ['unleash(?:es|ed|ing)?', 1], ['supercharg(?:e|es|ed|ing)', 1],
      ['captivat(?:e|es|ed|ing)', 0.8], ['enigmatic', 1], ['symphony', 1], ['kaleidoscope', 1.2],
      ['landscape', 0.5, 'landscape'], ['navigat(?:e|es|ed|ing)', 0.4, 'navigate'], ['crucial', 0.3], ['comprehensive', 0.3, 'comprehensive'],
      ['enhanc(?:e|es|ed|ing)', 0.3, 'enhance'], ['journey', 0.3, 'journey'], ['ever[- ]evolving', 1.4],
      ['dynamic', 0.3, 'dynamic'], ['innovative', 0.4, 'innovative'], ['insightful', 0.6], ['noteworthy', 0.8],
    ],
  },

  // ── Rhetorical templates ────────────────────────────────────────────────────
  {
    id: 'not-just', category: 'structure', weight: 2.5, scope: PROSE,
    label: '"It\'s not just X, it\'s Y"',
    why: 'The contrast frame is the single most recognisable construction of model prose.',
    pattern: rx(`\\b(?:it${A}?s|this is|that${A}?s|is|are|was|were)\\s+not\\s+(?:just|only|merely|simply|about)\\b[^.!?\\n]{1,80}?(?:[,;:—–]|\\s-)\\s*(?:it${A}?s|they${A}?re|this is|it is|but)\\b|\\b(?:isn${A}t|aren${A}t|wasn${A}t)\\s+(?:just|only|merely|simply|about)\\b[^.!?\\n]{1,80}?(?:[,;:—–.]|\\s-)\\s*(?:it${A}?s|they${A}?re|this is|it is|but|it${A}?s about)\\b`),
  },
  {
    id: 'not-only-but-also', category: 'structure', weight: 1.2, scope: PROSE,
    label: '"Not only… but also"',
    why: 'Balanced correlative construction overused in generated prose.',
    pattern: rx(`\\bnot only\\b[^.!?\\n]{1,80}?\\bbut also\\b`),
  },
  {
    id: 'staged-reveal', category: 'structure', weight: 2, scope: PROSE,
    label: 'Staged reveal: "The result?"',
    why: 'A one-word question answered in the next sentence, used for false suspense.',
    pattern: rx(`\\b(?:the|and the|but the|so the) (?:result|best part|catch|answer|kicker|truth|reality|secret|twist|bottom line|outcome|problem|solution)\\?|\\b(?:and )?honestly\\?(?=\\s)|\\bhere${A}?s the (?:thing|kicker|catch|deal)\\b|\\bhere${A}?s (?:why|how|what)(?: it matters| this matters)?:`),
  },
  {
    id: 'sink-in', category: 'structure', weight: 2, scope: PROSE,
    label: '"Let that sink in"',
    why: 'Social-media cadence that generated LinkedIn-style posts imitate.',
    pattern: rx(`\\blet that sink in\\b|\\bread that again\\b|\\bthis changes everything\\b`),
  },
  {
    id: 'no-x-no-y', category: 'structure', weight: 2.5, scope: PROSE,
    label: '"No X. No Y. Just Z."',
    why: 'Staccato negation triplet common in generated marketing copy.',
    pattern: rx(`\\bno [^.!?\\n]{1,30}\\. no [^.!?\\n]{1,30}\\.\\s+(?:just|only)\\b`),
  },

  // ── Formatting tells ────────────────────────────────────────────────────────
  {
    id: 'em-dash', category: 'format', minHits: 4, weight: 0.35, scope: PROSE,
    label: 'Em dash',
    why: 'Fine on its own; only a pattern when dense. See the density signal.',
    pattern: rx(`—|(?<=\\w) -- (?=\\w)|&mdash;|&#8212;`),
  },
  {
    id: 'emoji-bullet', category: 'format', weight: 1.8, scope: { prose: 'raw', html: 'text' },
    label: 'Emoji bullet',
    why: 'Lists that lead each item with ✅ 🚀 💡 are a hallmark of generated posts.',
    pattern: rx(`^[ \\t]*(?:[-*•]\\s*|\\d+[.)]\\s*)?${EMOJI}+[ \\t]+\\S`, 'gmu'),
  },
  {
    id: 'bold-label-bullet', category: 'format', weight: 1.2, scope: { prose: 'raw', code: 'text' },
    label: 'Bold-label bullet',
    why: '"- **Label:** explanation" is the default list format of chat assistants.',
    pattern: rx(`^[ \\t]*(?:[-*•]|\\d+\\.)\\s+\\*\\*[^*\\n]{2,48}?(?::\\*\\*|\\*\\*\\s*[:—–-])`, 'gmu'),
  },
  {
    id: 'emoji-heading', category: 'format', weight: 1.5, scope: { prose: 'raw' },
    label: 'Emoji in heading',
    why: 'Headings decorated with emoji are typical of generated READMEs and posts.',
    pattern: rx(`^#{1,6}[ \\t]+[^\\n]*${EMOJI}`, 'gmu'),
  },
  {
    id: 'key-takeaways', category: 'format', weight: 1.2, scope: PROSE_ONLY,
    label: '"Key takeaways" section',
    why: 'Recap section that generated articles append by default.',
    pattern: rx(`^[ \\t#*]*(?:key takeaways|final thoughts|the bottom line|wrapping up|conclusion)[ \\t*:]*$`, 'gimu'),
  },

  // ── Narrating comments ──────────────────────────────────────────────────────
  {
    id: 'narrating-comment', category: 'comments', minHits: 3, line: true, weight: 1,
    scope: COMMENTS,
    label: 'Comment restates the code',
    why: '"// Initialize the counter" above the line that initialises the counter adds nothing.',
    pattern: rx(`${CMT}\\s*(?:initiali[sz]e|define|declare|create|import|loop|iterate|return|check|set ?up|set|get|call|add|handle|update|calculate|compute|print|log|increment|instantiate|store|fetch|parse|render|display|validate|convert|append|load|save|send|close|open|start|stop|apply|attach|extract)s?\\s+(?:the|a|an|all|necessary|required|each|every|over|through|if|whether|new|our|some|any|this|it)\\b`, 'gimu'),
  },
  {
    id: 'step-comment', category: 'comments', line: true, weight: 2,
    scope: { code: 'text', html: 'raw' },
    label: 'Numbered step comment',
    why: '"// Step 1:" scaffolding mirrors how a model plans an answer.',
    pattern: rx(`${CMT}\\s*step\\s*\\d+\\s*[:.)\\-—]`, 'gimu'),
  },
  {
    id: 'example-usage', category: 'comments', line: true, weight: 2, scope: COMMENTS,
    label: '"Example usage" block',
    why: 'Demo code appended to a module so the answer is self-contained.',
    pattern: rx(`${CMT}\\s*(?:example usage|usage example|example:|test the (?:function|code|class)|driver code|main execution|sample usage|run the (?:app|application|server|function|script|example))`, 'gimu'),
  },
  {
    id: 'this-function', category: 'comments', line: true, weight: 1.2, scope: COMMENTS,
    label: '"This function is used to…"',
    why: 'Docstring boilerplate that narrates rather than documents behaviour.',
    pattern: rx(`(?:${CMT}|"""|''')\\s*(?:this|the following|the below) (?:function|method|class|component|code|script|module|hook|helper|endpoint|block|snippet|route)\\s+(?:is used to|will|handles?|takes|returns|creates|is responsible for|ensures?|allows?|demonstrates?)\\b|(?:helper|utility) function (?:to|for|that)\\b`, 'gimu'),
  },
  {
    id: 'ensure-comment', category: 'comments', minHits: 2, line: true, weight: 0.8, scope: COMMENTS,
    label: '"Make sure to…" comment',
    why: 'Instruction-style comments addressed to the reader of an answer.',
    pattern: rx(`${CMT}\\s*(?:make sure (?:to|that|you)|ensure (?:that|the|you)|don${A}?t forget to|remember to)`, 'gimu'),
  },
  {
    id: 'emoji-comment', category: 'comments', line: true, weight: 1.5, scope: COMMENTS,
    label: 'Emoji in comment',
    why: 'Emoji in source comments are rare in hand-written code.',
    pattern: rx(`${CMT}[^\\n]*?${EMOJI}`, 'gmu'),
  },
  {
    id: 'emoji-log', category: 'comments', weight: 2, scope: CODE_RAW,
    label: 'Emoji in log message',
    why: 'console.log("✅ Done!") is a recognisable generated-code habit.',
    pattern: rx(`\\b(?:console\\.(?:log|info|warn|error|debug)|print|println!?|logger\\.\\w+|logging\\.\\w+|log\\.\\w+|echo)\\s*\\(?\\s*f?["'\`]\\s*${EMOJI}`, 'gu'),
  },

  // ── Placeholders and scaffolding ────────────────────────────────────────────
  {
    id: 'api-key-placeholder', category: 'scaffold', weight: 2.5, scope: ANY_RAW,
    label: 'Placeholder secret',
    why: '"your-api-key-here" means the code was written to be pasted, not run.',
    pattern: rx(`\\byour[-_ ]?(?:api|secret|access|openai|stripe)[-_ ]?(?:key|token)(?:[-_ ]?here)?\\b|\\bYOUR_[A-Z0-9_]+(?:_HERE)?\\b|\\b(?:sk|pk)[-_](?:test|live)?[-_]?(?:x{4,}|your[-_]\\w+)`, 'gu'),
  },
  {
    id: 'real-app-caveat', category: 'scaffold', weight: 2.5, scope: ANY_RAW,
    label: '"In a real application…"',
    why: 'A caveat that the code is a demo, written to whoever asked for it.',
    pattern: rx(`\\bin a (?:real|production|real[- ]world)(?:[- ]world)? (?:app|application|scenario|implementation|project|system|setting|environment|use case)\\b|\\bfor (?:demonstration|simplicity|illustration|brevity|example)(?: purposes)?,|\\bthis is a (?:simple|simplified|basic|minimal|naive) (?:example|implementation|version|demo|approach)\\b|\\bfor the sake of (?:simplicity|brevity|this example)\\b`),
  },
  {
    id: 'elided-code', category: 'scaffold', weight: 2.5, scope: { code: 'raw', html: 'raw', web: 'raw' },
    label: 'Elided code: "// ... rest of code"',
    why: 'Missing pieces marked with "..." the way a chat answer abbreviates.',
    pattern: rx(`(?:\\/\\/|#|\\/\\*|<!--|\\{\\/\\*)\\s*(?:\\.\\.\\.|…)\\s*(?:\\(?\\s*)?(?:rest|other|more|existing|your|additional|remaining|previous|same)\\b|\\b(?:add|implement|insert|put) (?:more|your|additional|other|the rest of)\\b[^\\n]{0,40}?\\b(?:here|as needed)\\b`, 'giu'),
  },
  {
    id: 'todo-implement', category: 'scaffold', weight: 1.2, scope: { code: 'text', html: 'raw' },
    label: '"TODO: implement"',
    why: 'Unimplemented stubs left in place of logic.',
    pattern: rx(`\\bTODO:?\\s*(?:implement|add|replace|handle|integrate|connect|fill)\\b`),
  },
  {
    id: 'stock-names', category: 'scaffold', weight: 2, scope: { prose: 'text', html: 'raw', web: 'raw' },
    label: 'Stock placeholder content',
    why: 'John Doe, Acme Corp, Lorem ipsum and 555 numbers mean the content was never filled in.',
    pattern: rx(`\\b(?:john|jane) (?:doe|smith)\\b|\\bacme(?: corp(?:oration)?| inc\\.?)?\\b|\\blorem ipsum\\b|\\b(?:your|my) (?:company|brand|business|startup|product)(?: name)?\\b|\\bcompany name\\b|\\b123 main st(?:reet)?\\b|\\(555\\)\\s?\\d{3}-\\d{4}|\\b(?:john|jane|hello|contact|info)(?:\\.doe)?@(?:example|yourcompany|company|domain)\\.com\\b`),
  },
  {
    id: 'generic-error', category: 'scaffold', minHits: 2, weight: 1, scope: CODE_RAW,
    label: 'Generic error message',
    why: '"An error occurred" tells the user nothing; it is the default a model writes.',
    pattern: rx(`["'\`](?:an (?:unexpected )?error (?:occurred|has occurred)|something went wrong|oops!?)[^"'\`\\n]{0,40}["'\`]`),
  },
  {
    id: 'dead-link', category: 'scaffold', minHits: 3, weight: 0.5, scope: WEB_RAW,
    label: 'Dead link href="#"',
    why: 'Navigation and buttons that go nowhere are the sign of a mock-up.',
    pattern: rx(`\\bhref=["']#["']`),
  },

  // ── Template web copy and styling ───────────────────────────────────────────
  {
    id: 'default-gradient', category: 'template', weight: 3, scope: WEB_RAW,
    label: 'The default purple gradient',
    why: '#667eea → #764ba2 is the gradient generated landing pages reach for first.',
    pattern: rx(`#667eea|#764ba2|#6366f1\\s*(?:0%\\s*)?,\\s*#8b5cf6|#8b5cf6\\s*(?:0%\\s*)?,\\s*#ec4899`, 'giu'),
  },
  {
    id: 'tailwind-gradient', category: 'template', weight: 1.5, scope: WEB_RAW,
    label: 'Indigo-to-purple Tailwind gradient',
    why: 'from-indigo/purple gradients and gradient-clipped text define the stock generated look.',
    pattern: rx(`\\bbg-gradient-to-(?:r|br|tr|b|l)\\b[^"'\`\\n]{0,80}?\\bfrom-(?:purple|indigo|violet|blue|pink|fuchsia)-\\d{2,3}\\b|\\bbg-clip-text\\b[^"'\`\\n]{0,60}?\\btext-transparent\\b|\\btext-transparent\\b[^"'\`\\n]{0,60}?\\bbg-clip-text\\b|background-clip:\\s*text`, 'gu'),
  },
  {
    id: 'glass', category: 'template', minHits: 2, weight: 0.6, scope: WEB_RAW,
    label: 'Glassmorphism blur',
    why: 'Frosted-glass cards are a default flourish in generated UI.',
    pattern: rx(`\\bbackdrop-blur(?:-\\w+)?\\b|backdrop-filter:\\s*blur`, 'gu'),
  },
  {
    id: 'section-comment', category: 'template', weight: 1.5, scope: WEB_RAW,
    label: '<!-- Hero Section --> comment',
    why: 'Generated pages label every block with a section comment.',
    pattern: rx(`(?:<!--|\\{\\/\\*|\\/\\*)\\s*(?:hero|features?|testimonials?|pricing|cta|call[- ]to[- ]action|footer|header|navigation|navbar|nav|about(?: us)?|contact|faq|stats|how it works|benefits|newsletter|logos?|social proof)(?: section| area| block)?\\s*(?:-->|\\*\\/\\}|\\*\\/)`, 'giu'),
  },
  {
    id: 'marketing-verb', category: 'template', weight: 2, scope: COPY,
    label: '"Elevate your…" headline',
    why: 'Imperative verb + "your" is the default generated headline.',
    pattern: rx(`\\b(?:unlock|elevate|supercharge|revolutioni[sz]e|transform|empower|unleash|skyrocket|turbocharge|amplify|reimagine|redefine|boost) your\\b`),
  },
  {
    id: 'marketing-adjective', category: 'template', weight: 1, scope: COPY,
    label: 'Stock product adjective',
    why: '"Blazing-fast", "all-in-one", "enterprise-grade" carry no information.',
    pattern: rx(`\\b(?:lightning[- ]fast|blazing(?:ly)?[- ]fast|next[- ]gen(?:eration)?|all[- ]in[- ]one|world[- ]class|best[- ]in[- ]class|enterprise[- ]grade|state[- ]of[- ]the[- ]art|future[- ]proof|built for (?:the future|modern teams|scale|developers))\\b`),
  },
  {
    id: 'social-proof', category: 'template', weight: 1.2, scope: COPY,
    label: 'Stock social proof',
    why: 'Round-number user counts and uptime claims filled in by a template.',
    pattern: rx(`\\b(?:join|trusted by) (?:over )?(?:thousands|millions|\\d[\\d,.]*[km]?\\+?) (?:of )?(?:happy |satisfied )?\\w+|\\b\\d[\\d,.]*[km]?\\+ (?:happy |satisfied |active )?(?:customers|users|teams|companies|developers|businesses|clients)\\b|\\b99\\.9+% uptime\\b|\\bno credit card required\\b|\\bget started (?:for free|free|today|now)\\b`),
  },
  {
    id: 'emoji-icon', category: 'template', weight: 1.5, scope: WEB_RAW,
    label: 'Emoji used as an icon',
    why: 'Feature cards with an emoji in place of an icon are a generated-page staple.',
    pattern: rx(`<(?:div|span|i|h[1-6]|p)\\b[^>]*>\\s*${EMOJI}+\\s*(?:<\\/(?:div|span|i|p)>|[^<\\s])`, 'giu'),
  },
];

// Words and habits that point the other way: casual, idiosyncratic, or hand-made.
export const HUMAN_MARKERS = rx(
  `\\b(?:lol|lmao|tbh|imo|imho|idk|ngl|gonna|wanna|kinda|sorta|dunno|y${A}?all|ugh|meh|welp|nope|yep|heck|damn|crap)\\b|\\b(?:fixme|hack|xxx|wtf)\\b|:\\)|;\\)|:P\\b|\\?\\?|!!+`,
);
