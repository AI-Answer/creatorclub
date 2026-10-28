import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BreakdownResult, Outline, Package, ResearchTile } from '../../shared/club.js';

/* Prompt contents and schema validity only. Nothing here calls an AI. */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-prompts-'));
after(() => rm(temp, { recursive: true, force: true }));
delete process.env.CREATORCLUB_METHODOLOGY_DIR;

const p = await import('./prompts.js');
const methodology = path.resolve(import.meta.dirname, '../../../../methodology');

// ---------------------------------------------------------------- a small JSON Schema checker (type, enum, required, items, min/max items, no extra keys)

type Schema = { type?: string; enum?: unknown[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema; minItems?: number; maxItems?: number };

function check(schema: Schema, value: unknown, at = '$'): string[] {
  const bad = (why: string) => [`${at}: ${why}`];
  if (schema.enum && !schema.enum.includes(value)) return bad('not one of the allowed values');
  switch (schema.type) {
    case 'string':
      return typeof value === 'string' ? [] : bad('not a string');
    case 'integer':
      return Number.isInteger(value) ? [] : bad('not an integer');
    case 'array': {
      if (!Array.isArray(value)) return bad('not an array');
      if (schema.minItems !== undefined && value.length < schema.minItems) return bad(`fewer than ${schema.minItems} items`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) return bad(`more than ${schema.maxItems} items`);
      return value.flatMap((item, i) => check(schema.items ?? {}, item, `${at}[${i}]`));
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return bad('not an object');
      const record = value as Record<string, unknown>;
      const problems: string[] = [];
      for (const key of schema.required ?? []) if (!(key in record)) problems.push(`${at}.${key}: missing`);
      for (const [key, inner] of Object.entries(record)) {
        const rule = schema.properties?.[key];
        if (!rule) {
          if (schema.additionalProperties === false) problems.push(`${at}.${key}: not allowed`);
        } else problems.push(...check(rule, inner, `${at}.${key}`));
      }
      return problems;
    }
    default:
      return [];
  }
}

const rating = (level: 'high' | 'mid' | 'low', note: string) => ({ level, note });

const breakdown: BreakdownResult = {
  whyItWorked: {
    titlePackaging: 'A bold claim with a number.',
    hookSpeed: 'The promise lands in the first sentence.',
    structure: ['Claim and roadmap', 'Why it matters', 'Level 1', 'Level 2', 'Ending'],
    retention: 'A demo every few minutes.',
    payoff: 'A working setup on screen.',
    short: ['Clear promise', 'Proof early'],
  },
  reusableOutline: ['Claim and roadmap: the outcome and how many parts', 'Why it matters: the problem', 'Level 1: first test', 'Ending: a pointer to another video'],
  viewerQuestions: [{ question: 'Does it work on Windows?', likes: 12 }],
  concepts: [{ title: 'Stop paying for X', angle: 'Replace X with Y.', twist: 'Do it live.', hook: 'I cancelled X today.', demand: rating('high', 'Views beat usual.'), gap: rating('mid', 'not checked'), show: rating('high', 'Easy to demo.'), why: 'It fixes a pain.' }],
};
const pkg: Package = {
  demand: rating('high', 'Research video at 3x.'),
  gap: rating('mid', 'not checked'),
  show: rating('high', 'Easy to show.'),
  angle: 'Replace X with Y.',
  twist: 'Live, with the cost on screen.',
  titles: ['Stop Paying For X', 'Y Replaced My X', 'X Is Too Expensive, Do This'],
  thumbnailText: 'ONE COMMAND',
  hook: { visual: 'The bill, crossed out.', spoken: 'I cancelled X today. Here is what I use instead.', text: 'RIP X' },
};
const outline: Outline = {
  scenes: [
    { title: 'Opening', talkingPoints: ['Say the claim', 'Name the three parts'], show: 'The bill on screen', seconds: 60 },
    { title: 'Level 1: first test', talkingPoints: ['What Y is, with a comparison', 'Run it once'], show: 'Terminal; look for the cost', seconds: 180 },
    { title: 'Where this falls short', talkingPoints: ['What Y cannot do', 'What it costs'], show: 'The limits page', seconds: 90 },
    { title: 'Ending', talkingPoints: ['Point to the next video', 'Sign off'], show: 'End screen', seconds: 30 },
  ],
};

test('every schema parses and takes the shapes of the shared types, and nothing else', async () => {
  const load = async (name: string) => JSON.parse(await readFile(path.join(methodology, `${name}.schema.json`), 'utf8')) as Schema;
  const [breakdownSchema, packageSchema, outlineSchema] = await Promise.all(['breakdown', 'package', 'outline'].map(load));
  assert.deepEqual(check(breakdownSchema, breakdown), []);
  assert.deepEqual(check(packageSchema, pkg), []);
  assert.deepEqual(check(outlineSchema, { scenes: outline.scenes }), []);

  // Every property is required and no extra key is allowed, so a provider with strict structured output accepts them too.
  const everyObject = (schema: Schema, visit: (s: Schema) => void) => {
    visit(schema);
    Object.values(schema.properties ?? {}).forEach((inner) => everyObject(inner, visit));
    if (schema.items) everyObject(schema.items, visit);
  };
  for (const schema of [breakdownSchema, packageSchema, outlineSchema]) {
    everyObject(schema, (s) => {
      if (s.type !== 'object') return;
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...(s.required ?? [])].sort(), Object.keys(s.properties ?? {}).sort());
    });
  }

  // The checker itself catches the mistakes that matter.
  assert.notDeepEqual(check(packageSchema, { ...pkg, titles: ['one', 'two'] }), [], 'exactly three titles');
  assert.notDeepEqual(check(packageSchema, { ...pkg, demand: { level: 'huge', note: '' } }), [], 'level is high, mid or low');
  assert.notDeepEqual(check(outlineSchema, { scenes: outline.scenes.slice(0, 3) }), [], 'at least 4 scenes');
  assert.notDeepEqual(check(outlineSchema, { scenes: [...outline.scenes, ...outline.scenes] }), [], 'at most 7 scenes');
  assert.notDeepEqual(check(breakdownSchema, { ...breakdown, extra: 1 }), [], 'no extra keys');
  assert.notDeepEqual(check(breakdownSchema, { ...breakdown, concepts: [] }), [], 'at least one concept');
});

test('no methodology file mentions the excluded sources or a club, and there is no knowledge folder', async () => {
  const files: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(full);
    }
  };
  await walk(methodology);
  const names = files.map((file) => path.relative(methodology, file)).sort();
  for (const wanted of ['breakdown.md', 'package.md', 'outline.md', 'script.md', 'expand.md', 'revise.md', 'voice.md', 'ref/hook-library.md', 'breakdown.schema.json', 'package.schema.json', 'outline.schema.json'])
    assert.ok(names.includes(wanted), `${wanted} exists`);
  assert.ok(!names.some((name) => /knowledge/i.test(name)));
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, /jake|trinder|ed lawrence|ed-lawrence|claude club|skool/i, path.relative(methodology, file));
  }
});

const ctx = {
  workspace: { name: 'Ana Perez', about: 'Practical AI for small shops.', topics: ['claude', 'automation'], cta: '' },
  voice: [
    '# Ana Perez: Voice Guide',
    '## 1. Summary',
    'Talks to shop owners. Warm and plain.',
    '## 2. Structure',
    '- **Ending:** a pointer to another video. 6 of 9 also close with a Claude Club mention. Short sign-off: "Have fun."',
    '- Join the community on Skool at the end.',
    '## 3. Sentence and word habits',
    'SENTENCE-HABITS-MARKER long run-ons and "right?" check-ins.',
  ].join('\n'),
  criteria: 'An idea needs a title of 7 words or fewer.',
  structure: 'Shape 1: bold claim, then three levels.',
};

const excluded = /\bjake\b|ed lawrence|claude club|skool/i;
const noLeftovers = (prompt: string) => assert.doesNotMatch(prompt, /\{[a-z_]+\}/, 'every placeholder is filled');

test('voice summary stops before section 3 and drops club and community sentences, the full guide drops them too', () => {
  const summary = p.voiceSummary(ctx.voice);
  assert.match(summary, /Talks to shop owners/);
  assert.match(summary, /pointer to another video/);
  assert.match(summary, /Short sign-off/);
  assert.doesNotMatch(summary, /Claude Club|Skool|SENTENCE-HABITS-MARKER/);
  assert.doesNotMatch(p.stripPromotions(ctx.voice), /Claude Club|Skool|community/i);
  assert.match(p.stripPromotions(ctx.voice), /SENTENCE-HABITS-MARKER/);
  assert.equal(p.voiceSummary(''), '(none yet)');
});

test('break down: sections, facts, top 40 comments by likes, transcript cut at 12,000 words, board titles, schema', async () => {
  const comments = Array.from({ length: 50 }, (_, i) => ({ likes: i, text: `comment number ${i}` }));
  const built = await p.buildBreakdownPrompt(ctx, {
    title: 'Claude Just Changed Trading Forever',
    channel: 'Other Channel',
    views: 1_234_567,
    likes: 40_000,
    commentCount: 900,
    ageDays: 12.5,
    multiplier: 2.84,
    usualViews: 30_000,
    transcript: Array.from({ length: 13_000 }, (_, i) => `w${i}`).join(' '),
    comments,
    existingTitles: ['Already planned video'],
    frames: 20,
  });
  noLeftovers(built.prompt);
  for (const section of ['titlePackaging', 'hookSpeed', 'structure', 'retention', 'payoff', 'short', 'reusableOutline', 'viewerQuestions', 'concepts', 'demand', 'gap', 'show', 'twist']) assert.match(built.prompt, new RegExp(section), section);
  assert.match(built.prompt, /Follow its shape, never its words/);
  assert.match(built.prompt, /Views: 1,234,567 in 12.5 days/);
  assert.match(built.prompt, /2.84x/);
  assert.match(built.prompt, /usual views per video: 30,000/);
  assert.match(built.prompt, /20 still frames/);
  assert.match(built.prompt, /Already planned video/);
  assert.match(built.prompt, /An idea needs a title of 7 words/);
  assert.match(built.prompt, /Practical AI for small shops/);
  assert.match(built.prompt, /w11999\b/);
  assert.doesNotMatch(built.prompt, /w12000\b/);
  assert.match(built.prompt, /\(49\) comment number 49/);
  assert.match(built.prompt, /\(10\) comment number 10/);
  assert.doesNotMatch(built.prompt, /\(9\) comment number 9\n/);
  assert.doesNotMatch(built.prompt, excluded);
  assert.doesNotMatch(built.prompt, /SENTENCE-HABITS-MARKER/, 'only the voice summary goes in');
  assert.ok(built.system);
  assert.deepEqual(Object.keys((built.schema as Schema).properties ?? {}), ['whyItWorked', 'reusableOutline', 'viewerQuestions', 'concepts']);

  await assert.rejects(p.buildBreakdownPrompt(ctx, { title: 't', channel: 'c', comments: [], existingTitles: [] }), { message: 'There was no transcript and no comments to work from for this video.' });
  const thumbnailOnly = await p.buildBreakdownPrompt(ctx, { title: 't', channel: 'c', comments: [], existingTitles: [], thumbnail: true });
  assert.match(thumbnailOnly.prompt, /One image is attached: the video's thumbnail/);
  assert.doesNotMatch(thumbnailOnly.prompt, /still frames sampled/);
  assert.doesNotMatch((await p.buildBreakdownPrompt(ctx, { title: 't', channel: 'c', comments: [{ likes: 1, text: 'hi' }], existingTitles: [] })).prompt, /One image is attached/);
  const noTranscript = await p.buildBreakdownPrompt(ctx, { title: 't', channel: 'c', comments: [{ likes: 1, text: 'hi' }], existingTitles: [] });
  assert.match(noTranscript.prompt, /TRANSCRIPT \(not available\)/);
});

const tile = (over: Partial<ResearchTile>): ResearchTile => ({ id: 't', kind: 'note', meta: {}, createdAt: '2026-10-28T00:00:00Z', ...over });

test('package: the idea, the research board, the title and hook rules, the hook library, the schema', async () => {
  const built = await p.buildPackagePrompt(ctx, {
    idea: { title: 'Cancel X, do this instead', angle: 'Replace X with Y', twist: 'Show the bill', demand: rating('high', 'Viewers ask'), sources: [{ label: 'Source video', url: 'https://youtu.be/abc' }], note: 'Mention the free tier' },
    research: [
      tile({ kind: 'video', title: 'Big video', url: 'https://youtu.be/xyz', meta: { channel: 'Other', views: 2_500_000, multiplier: 3.2 } }),
      tile({ kind: 'note', text: 'Remember the pricing page.' }),
      tile({ kind: 'link', url: 'https://example.com/a', title: 'Pricing' }),
    ],
    recentTitles: ['Claude Just Changed X Forever'],
  });
  noLeftovers(built.prompt);
  assert.match(built.prompt, /Title: Cancel X, do this instead/);
  assert.match(built.prompt, /Demand \(high\): Viewers ask/);
  assert.match(built.prompt, /Source: Source video \(https:\/\/youtu.be\/abc\)/);
  assert.match(built.prompt, /Video: Big video \(Other, 2,500,000 views, 3.2x the channel's usual views\)/);
  assert.match(built.prompt, /Note: Remember the pricing page/);
  assert.match(built.prompt, /Claude Just Changed X Forever/);
  assert.match(built.prompt, /7 words or fewer and 60 characters or fewer/);
  assert.match(built.prompt, /Never a question/);
  assert.match(built.prompt, /Tier 1[\s\S]*Tier 2[\s\S]*Tier 3/);
  assert.match(built.prompt, /2 to 5 words/);
  for (const part of ['visual', 'spoken', 'text']) assert.match(built.prompt, new RegExp(`- ${part}:`));
  assert.match(built.prompt, /four commandments/i);
  assert.match(built.prompt, /Alignment[\s\S]*Speed to value[\s\S]*Clarity[\s\S]*Curiosity/);
  assert.match(built.prompt, /Hook Pattern Library/, 'the hook library is included');
  assert.match(built.prompt, /not checked/);
  assert.doesNotMatch(built.prompt, excluded);
  assert.deepEqual(Object.keys((built.schema as Schema).properties ?? {}), ['demand', 'gap', 'show', 'angle', 'twist', 'titles', 'thumbnailText', 'hook']);
});

test('outline: 4 to 7 scenes, 140 words a minute, the honest-limitations scene, the package hook, the CTA rule', async () => {
  const built = await p.buildOutlinePrompt(ctx, { idea: { title: 'Cancel X' }, pkg, minutes: 6 });
  noLeftovers(built.prompt);
  assert.match(built.prompt, /4 to 7 scenes/);
  assert.match(built.prompt, /140 words a minute/);
  assert.match(built.prompt, /6 minutes spoken, about 840 words/);
  assert.match(built.prompt, /honest-limitations/);
  assert.match(built.prompt, /talkingPoints/);
  assert.match(built.prompt, /seconds/);
  assert.match(built.prompt, /I cancelled X today\. Here is what I use instead\./, 'the package hook reaches the opening');
  assert.match(built.prompt, /Stop Paying For X/);
  assert.match(built.prompt, /Do not mention any club, community or product/, 'the default CTA rule applies when the workspace has none');
  assert.match(built.prompt, /Shape 1: bold claim, then three levels/);
  assert.doesNotMatch(built.prompt, /<reusable_outline>\n1\./, 'no shape block without a break down');
  assert.doesNotMatch(built.prompt, excluded);
  assert.deepEqual(Object.keys((built.schema as Schema).properties ?? {}), ['scenes']);

  const free = await p.buildOutlinePrompt({ ...ctx, workspace: { ...ctx.workspace, cta: 'ask the viewer to comment their question' } }, { idea: { title: 'Cancel X' } });
  assert.match(free.prompt, /Choose it yourself: a whole number of minutes from 3 to 60/);
  assert.match(free.prompt, /ask the viewer to comment their question/);
});

test('outline from a break down follows the reusable outline beat by beat and says never its words', async () => {
  const built = await p.buildOutlinePrompt(ctx, { idea: { title: 'Cancel X' }, reusableOutline: breakdown.reusableOutline, direction: 'Keep it under ten minutes' });
  noLeftovers(built.prompt);
  assert.match(built.prompt, /<reusable_outline>\n1\. Claim and roadmap: the outcome and how many parts\n2\. Why it matters: the problem\n3\. Level 1: first test\n4\. Ending: a pointer to another video\n<\/reusable_outline>/);
  assert.match(built.prompt, /Take its structure, never its words/);
  assert.match(built.prompt, /Keep it under ten minutes/);
});

test('script: scene budgets at 140 words a minute, the full voice guide without club lines, the mode and the CTA', async () => {
  const full = await p.buildScriptPrompt(ctx, { title: 'Stop Paying For X', idea: { title: 'Cancel X' }, pkg, outline, rhythm: 'Median sentence: 14 words.' });
  noLeftovers(full.prompt);
  // 60 s, 180 s, 90 s and 30 s are 140, 420, 210 and 70 words: 840 in all, 6 minutes.
  assert.match(full.prompt, /- Opening: about 140 spoken words/);
  assert.match(full.prompt, /- Level 1: first test: about 420 spoken words/);
  assert.match(full.prompt, /- Where this falls short: about 210 spoken words/);
  assert.match(full.prompt, /- Ending: about 70 spoken words/);
  assert.match(full.prompt, /about 840 words \(6 minutes spoken/);
  assert.match(full.prompt, /### 2\. Level 1: first test \(1:00–4:00\)/);
  assert.match(full.prompt, /Full script\. Write every spoken line as Ana would say it\./);
  assert.match(full.prompt, /SENTENCE-HABITS-MARKER/, 'the script gets the full voice guide');
  assert.doesNotMatch(full.prompt, /Claude Club|Skool/);
  assert.match(full.prompt, /Median sentence: 14 words\./);
  assert.match(full.prompt, /\[SCREEN:/);
  assert.match(full.prompt, /\[REACT:/);
  assert.match(full.prompt, /call to action: point the viewer to another video/);
  assert.match(full.prompt, /CTA Permutations/);
  assert.doesNotMatch(full.prompt, excluded);
  assert.equal(full.schema, undefined);

  const points = await p.buildScriptPrompt(ctx, { title: 't', idea: { title: 'x' }, outline, mode: 'points' });
  assert.match(points.prompt, /Talking points\. Write the hook, the setup and the ending word for word/);
  assert.match(points.prompt, /\(no measurements available\)/);
});

test('expand and revise fill their files', async () => {
  const section = 'Say it. [SCREEN: open the page] Then read the cost out loud.';
  const expand = await p.buildExpandPrompt(ctx, { outline, script: '# T\n\n## Opening\n\nHi.', heading: 'Opening', section, want: 140 });
  noLeftovers(expand.prompt);
  assert.match(expand.prompt, /spoken_words_now="8" spoken_words_wanted="140"/);
  assert.match(expand.prompt, /Reach about 140 spoken words/);
  const revise = await p.buildRevisePrompt(ctx, { script: '# T\n\n## Opening\n\nHi.', table: '- median sentence: script 9, target 14, OFF', habits: '"right?" about 4 per 1,000 words' });
  noLeftovers(revise.prompt);
  assert.match(revise.prompt, /median sentence: script 9, target 14, OFF/);
  assert.match(revise.prompt, /Do not change any fact/);
  assert.doesNotMatch(expand.prompt + revise.prompt, excluded);
});

test('voice prompt is the voice file filled in, and the folder can be overridden for packaging', async () => {
  const { prompt } = await p.buildVoicePrompt('Ana', [{ id: 'a1', text: 'costs $& and $1 {name}' }]);
  assert.match(prompt, /voice guide for a YouTube creator, Ana/);
  assert.match(prompt, /### \[a1\]\ncosts \$& and \$1 \{name\}/);
  assert.match(prompt, /club, community, course or product/);

  const custom = path.join(temp, 'custom');
  await mkdir(custom);
  await writeFile(path.join(custom, 'voice.md'), 'Custom for {name}: {transcripts}');
  process.env.CREATORCLUB_METHODOLOGY_DIR = custom;
  try {
    assert.equal((await p.buildVoicePrompt('Ana', [{ id: 'a', text: 'x' }])).prompt, 'Custom for Ana: ### [a]\nx');
    // A file the override folder does not have falls back to the repo's copy.
    assert.match(await p.methodologyFile('package.md'), /You package one YouTube video/);
    process.env.CREATORCLUB_METHODOLOGY_DIR = path.join(temp, 'nowhere');
    assert.match((await p.buildVoicePrompt('Ana', [])).prompt, /voice guide for a YouTube creator, Ana/);
    await assert.rejects(p.methodologyFile('nope.md'), { message: "Couldn't find the writing instructions." });
  } finally {
    delete process.env.CREATORCLUB_METHODOLOGY_DIR;
  }
  assert.ok((await stat(path.join(methodology, 'voice.md'))).size > 0);
});

test('title, package and outline checks catch what models get wrong', () => {
  assert.deepEqual(p.titleProblems('Stop Paying For X'), []);
  assert.deepEqual(p.titleProblems('One two three four five six seven eight'), ['has 8 words, and 7 is the most']);
  const long = 'Supercalifragilistic Extraordinarily Comprehensive Automation Walkthrough';
  assert.deepEqual(p.titleProblems(long), [`has ${long.length} characters, and 60 is the most`]);
  assert.deepEqual(p.titleProblems('x'.repeat(60)), []);
  assert.deepEqual(p.titleProblems('Is this the end of X?'), ['is a question']);
  assert.deepEqual(p.titleProblems(' '), ['is empty']);

  assert.deepEqual(p.packageProblems(pkg), []);
  const bad: Package = { ...pkg, titles: ['Fine title', 'Is it worth it?', 'Fine again'], thumbnailText: 'WAY TOO MANY WORDS FOR A THUMBNAIL', hook: { ...pkg.hook, visual: ' ' } };
  assert.deepEqual(p.packageProblems(bad), ['Title 2 is a question.', 'The thumbnail text has 7 words, and it needs 2 to 5.', 'The hook has no visual part.']);

  assert.deepEqual(p.outlineProblems(outline), []);
  assert.deepEqual(p.outlineProblems({ scenes: outline.scenes.slice(0, 3).slice(1) }).slice(0, 1), ['The outline has 2 scenes, and it needs 4 to 7.']);
  assert.deepEqual(p.outlineProblems({ scenes: outline.scenes.map((scene, i) => (i === 0 ? { ...scene, talkingPoints: [' '], seconds: 0 } : scene)) }), ['Scene 1 has no talking points.', 'Scene 1 has no time budget.']);
});

test('spoken words ignore cues, and scene budgets use 140 words a minute', () => {
  assert.equal(p.spokenWords('One two [SCREEN: do a thing here] three.'), 3);
  assert.equal(p.sceneWords(60), 140);
  assert.equal(p.sceneWords(90), 210);
  assert.equal(p.outlineSeconds(outline), 360);
});

// Section 9 and two other lines are copied word for word from the real Samin voice guide (board workspaces/samin/voice.md).
const SAMIN_SECTION_9 = `## 9. Community, links and sponsors
- **Claude Club:** named in 6 of 9 in the last ~5% of the words; mid-video in 0Vgh (6% in), _Zeh (5%), caj4 (16%) and XqnY (60%). Never in 4TbW, BTVp, cTFg. Typical: "join my Claude Club where we can do this and we'll have some fun." (lH5w); "I'm there helping people set these up" (_Zeh); "if you're already part of Cloud Club, I'll help you set it up" (XqnY).
- **Gifts to members:** "I even gave it to my community" (1LWP), plus "classroom" and "skills vault" mentions (0Vgh, lH5w, caj4).
- **Course teases:** "I'm actually putting together a full course" (lH5w); "It's going to be a pretty long course." (XqnY).
- **Links and codes:** "in the description" 17 hits in 8 of 9. Affiliate-style offers appear in _Zeh (Hostinger link and a coupon: "here's a little hack"), cTFg (a referral code for a creator-payout campaign: "a little bit of secret") and BTVp (a free-account link). The captions never say "sponsored" (0 hits for "sponsor"), so do not call them sponsor reads.
- **Like and subscribe:** almost absent. The only ask is "stay subscribed for that" (lH5w); 0 hits for "like and subscribe".
`;
const SAMIN_VOICE = [
  '# Samin Yasar: Voice Guide',
  '## 1. Summary',
  'A hands-on, upbeat tutor for beginners.',
  '## 2. Structure',
  `- **Ending:** a pointer to another video in 8 of 9 ("watch this video right here", 4TbW and cTFg; 1LWP is the only one without). 6 of 9 also close with a Claude Club mention in the last ~5% of the words (0Vgh, 1LWP, XqnY, _Zeh, caj4, lH5w). Short sign-off: "Have fun." (1LWP). Two captions cut off mid-sentence (0Vgh, _Zeh), so their final words are lost.`,
  '## 3. Sentence and word habits',
  'HABITS-MARKER "right?" check-ins.',
  SAMIN_SECTION_9,
  '## 10. What he avoids',
  '- Begging for likes or subscribes.',
  '## 12. Write like this (10 items)',
  '9. Say what a run cost.',
  `10. End with a pointer to a related video and one plain line about Claude Club, if it fits. Keep it low-key.`,
  `**Do NOT:** invent his results, follower or revenue numbers, or anecdotes; call his link offers sponsors; add emojis; use stacked jargon; promise income without a caveat; or claim ideas he credits to others (an OpenAI engineer's tweet, Karpathy's LLM council).`,
].join('\n');
const PITCH = /claude club|cloud club|community|classroom|skills vault|course|hostinger|coupon|referral|affiliate|in the description|skool/i;

test('pitches in the real Samin voice guide (club, community, course teases, coupons, referral codes) never reach the script, outline or package prompts', async () => {
  const samin = { ...ctx, voice: SAMIN_VOICE };
  const guide = p.stripPromotions(SAMIN_VOICE);
  assert.doesNotMatch(guide, PITCH);
  assert.match(guide, /pointer to another video in 8 of 9/, 'the habit is kept, only the pitch goes');
  assert.match(guide, /Short sign-off: "Have fun\."/);
  assert.match(guide, /HABITS-MARKER/);
  assert.match(guide, /Say what a run cost\./);
  // Prohibitions are guidance, not pitches: the real "Do NOT" rule names "sponsors" and keeps every other rule.
  for (const rule of ['invent his results, follower or revenue numbers, or anecdotes', 'call his link offers sponsors', 'add emojis', 'use stacked jargon', 'promise income without a caveat', 'claim ideas he credits to others'])
    assert.ok(guide.includes(rule), rule);
  assert.ok(guide.includes('**Do NOT:**'));
  assert.equal(guide.match(/sponsor/gi)?.length, 1, 'the only sponsor mention left is the prohibition');
  // Item 10 keeps its pointer instruction without the list number being taken for a sentence end, and loses only the club line.
  assert.match(guide, /^10\. End with a pointer to a related video\. Keep it low-key\.$/m);
  assert.doesNotMatch(guide, /^10\. Keep it low-key/m);
  assert.doesNotMatch(guide, /Prompts\.$/m, 'no scrap is left of a dropped clause');
  assert.doesNotMatch(guide, /,\./, 'no stray comma is left before a full stop');
  assert.doesNotMatch(guide, /^## 9\./m, 'the section about the community, links and sponsors goes whole');
  assert.match(guide, /## 10\. What he avoids/, 'the next section stays');
  assert.match(p.stripPromotions('Of course it works.\nA full course is coming.'), /^Of course it works\.$/, 'of course is not a course');

  const block = (prompt: string, tag: string) => prompt.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? assert.fail(`${tag} missing`);
  const script = await p.buildScriptPrompt(samin, { title: 't', idea: { title: 'x' }, outline });
  const expand = await p.buildExpandPrompt(samin, { outline, script: '# T', heading: 'Opening', section: 'Hi.', want: 100 });
  const outlinePrompt = await p.buildOutlinePrompt(samin, { idea: { title: 'x' } });
  const packagePrompt = await p.buildPackagePrompt(samin, { idea: { title: 'x' }, research: [] });
  const breakdownPrompt = await p.buildBreakdownPrompt(samin, { title: 't', channel: 'c', transcript: 'some words', comments: [], existingTitles: [] });
  assert.doesNotMatch(block(script.prompt, 'voice_guide'), PITCH);
  assert.match(block(script.prompt, 'voice_guide'), /HABITS-MARKER/);
  assert.doesNotMatch(block(expand.prompt, 'voice_guide'), PITCH);
  for (const built of [outlinePrompt, packagePrompt, breakdownPrompt]) assert.doesNotMatch(block(built.prompt, 'voice_summary'), PITCH);
});

test('criteria, structure and about are stripped of pitches too', async () => {
  const dirty = {
    ...ctx,
    workspace: { ...ctx.workspace, about: 'Practical AI. Join the Skool community for more.' },
    criteria: 'An idea needs a title of 7 words or fewer.\nPromote the paid course when it fits.',
    structure: 'Shape 1: bold claim, then three levels.\n## Community plugs\nAlways mention the club.\n## Other\nKeep it short.',
  };
  const built = await p.buildPackagePrompt(dirty, { idea: { title: 'x' }, research: [] });
  assert.match(built.prompt, /Practical AI\./);
  assert.match(built.prompt, /7 words or fewer/);
  assert.match(built.prompt, /Shape 1: bold claim/);
  assert.match(built.prompt, /Keep it short\./);
  assert.doesNotMatch(built.prompt, /Skool|paid course|Community plugs|mention the club/);
});

test('outline time budgets: no fixed per-scene minutes, a share of the length, opening 90 s or less, ending 60 s or less, total within 10%', async () => {
  const built = await p.buildOutlinePrompt(ctx, { idea: { title: 'x' }, minutes: 20 });
  assert.doesNotMatch(built.prompt, /2 to 4 minutes|3 to 7|30 to 90|30 to 60/);
  assert.match(built.prompt, /in proportion to how much each one has to show or explain/);
  assert.match(built.prompt, /opening runs 90 seconds or less and the ending 60 seconds or less/);
  assert.match(built.prompt, /20 minutes spoken[\s\S]*1200, give or take 10%/);
  assert.match((await p.buildOutlinePrompt(ctx, { idea: { title: 'x' } })).prompt, /give or take 10%/);

  // 360 seconds in all.
  assert.deepEqual(p.outlineProblems(outline, 6), []);
  assert.deepEqual(p.outlineProblems(outline, 6.3), [], '378 s asked for, 360 s is within 10%');
  assert.deepEqual(p.outlineProblems(outline, 8), ['The scenes add up to 360 seconds, and the 8 minutes asked for is 480 seconds, give or take 10%.']);
  assert.deepEqual(p.outlineProblems(outline, 4), ['The scenes add up to 360 seconds, and the 4 minutes asked for is 240 seconds, give or take 10%.']);
  assert.deepEqual(p.outlineProblems(outline), [], 'no length asked for, no total to check');
  const long = outline.scenes.map((scene, i) => (i === 0 ? { ...scene, seconds: 120 } : i === 3 ? { ...scene, seconds: 75 } : scene));
  assert.deepEqual(p.outlineProblems({ scenes: long }), ['The opening runs 120 seconds, and 90 is the most.', 'The ending runs 75 seconds, and 60 is the most.']);
  // A 25-minute video in 7 scenes passes: the middle scenes are long, as they have to be.
  const big = (seconds: number, title: string) => ({ title, talkingPoints: ['a', 'b'], show: 's', seconds });
  const twentyFive = { scenes: [big(90, 'Open'), big(300, 'A'), big(300, 'B'), big(300, 'C'), big(300, 'D'), big(150, 'Where this falls short'), big(60, 'End')] };
  assert.deepEqual(p.outlineProblems(twentyFive, 25), []);
});

test('stripPromotions keeps prohibitions and list numbers, and cuts only the pitching clause', () => {
  const strip = p.stripPromotions;
  assert.equal(strip('- Do not mention the club or the course.'), '- Do not mention the club or the course.');
  assert.equal(strip('Never promote a community. Join my club today.'), 'Never promote a community.');
  assert.equal(strip("- Avoid sponsors and coupons; don't tease a course."), "- Avoid sponsors and coupons; don't tease a course.");
  assert.equal(strip('3. Close with a recap and a plug for the Skool community, if it fits.'), '3. Close with a recap.');
  assert.equal(strip('Show the result (first try and second try) and ask people to join the community.'), 'Show the result (first try and second try).');
  assert.equal(strip('Join the club.'), '');
  assert.equal(strip('- Prompts and the community link.'), '', 'a scrap of fewer than three words is dropped');
});
