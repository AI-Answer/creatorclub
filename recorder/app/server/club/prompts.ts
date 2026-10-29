import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ConceptRating, IdeaNotes, Outline, Package, ResearchTile, Video, Workspace } from '../../shared/club.js';
import type { CompanionActionType } from '../../shared/companion.js';
import type { Transcript } from './channel.js';
import { ClubError } from './errors.js';

/*
 * The prompts are the product's methodology. The text lives in `methodology/` (markdown templates with `{placeholders}`
 * and one JSON schema per step that returns data). This module loads those files and fills them from workspace data.
 * Nothing here calls an AI: each builder returns what `runAI` takes (`prompt`, `system`, `jsonSchema`).
 */

export const WORDS_PER_MINUTE = 140;
export const DEFAULT_CTA = 'point the viewer to another video on the channel. Do not mention any club, community or product.';
const TRANSCRIPT_WORDS = 12_000;
const COMMENTS_KEPT = 40;
const VOICE_SUMMARY_CHARS = 6000;

const SYSTEM_JSON = 'You are a YouTube planning assistant. Use only the facts you are given and never invent numbers, results or product behaviour. Answer with only the JSON that matches the schema.';
const SYSTEM_TEXT = 'You are a YouTube scriptwriter who writes in the creator\'s own voice. Use only the facts you are given and never invent numbers, results or product behaviour. Answer with only the requested text.';

export interface BuiltPrompt {
  prompt: string;
  system?: string;
  /** JSON Schema for the answer. Absent for steps that answer in plain text. */
  schema?: object;
}
export interface JsonPrompt extends BuiltPrompt {
  system: string;
  schema: object;
}

/** What every builder knows about the channel. `voice` is the whole voice guide; each step takes only the part it needs. */
export interface ChannelContext {
  workspace: Pick<Workspace, 'name' | 'about' | 'topics' | 'cta'>;
  voice: string;
  /** `criteria.md`: what makes an idea worth making for this channel. */
  criteria?: string;
  /** `structure.md`: how this creator's real videos are built. */
  structure?: string;
}

// ---------------------------------------------------------------- loading the files

/** The prompt files live in `methodology/` at the repo root, next to the bundled server in the packaged app, or where CREATORCLUB_METHODOLOGY_DIR points. */
export function methodologyDirs(): string[] {
  const here = import.meta.dirname;
  const override = process.env.CREATORCLUB_METHODOLOGY_DIR;
  return [...(override ? [path.resolve(override)] : []), path.resolve(here, '../../../../methodology'), path.resolve(here, 'methodology')];
}

export async function methodologyFile(name: string): Promise<string> {
  for (const dir of methodologyDirs()) {
    try {
      return await fs.readFile(path.join(dir, name), 'utf8');
    } catch {
      // try the next place
    }
  }
  throw new ClubError("Couldn't find the writing instructions.", 500);
}

async function methodologySchema(name: string): Promise<object> {
  return JSON.parse(await methodologyFile(`${name}.schema.json`)) as object;
}

/** Fills `{name}` style placeholders in one pass, so text that goes in is never searched again. Unknown placeholders stay as they are. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

// ---------------------------------------------------------------- small helpers

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// Pitches for the creator's own club, community, course or offers, and affiliate-style links. "Of course" is not one.
const PROMOTION = /\b(?:claude club|cloud club|skool|club|community|communities|membership|classroom|skills vault|(?<!of )courses?|coupons?|discount|promo code|referral|affiliate|sponsors?|sponsored)\b|in the description/i;

const headingLevel = (line: string) => /^(#{1,6})\s/.exec(line)?.[1].length ?? 0;

/** A sentence that forbids or warns against something is guidance, not a pitch, even when it names one. */
const PROHIBITION = /\b(?:do not|don't|never|avoid|avoids)\b/i;

/** `;` and " and " inside brackets must not split a clause. */
const MASK = { ';': '\u0001', ' and ': '\u0002' } as const;
const mask = (text: string) => text.replace(/\([^)]*\)/g, (group) => group.replace(/;/g, MASK[';']).replace(/ and /g, MASK[' and ']));
const unmask = (text: string) => text.replaceAll(MASK[';'], ';').replaceAll(MASK[' and '], ' and ');

/** Removes the clauses of one sentence that pitch (split on ";" and " and "), and an "if …" clause that hung on one. */
function stripClauses(sentence: string): string {
  const trimmed = sentence.trimEnd();
  const end = /[.!?]$/.exec(trimmed)?.[0] ?? '';
  const parts = mask(end ? trimmed.slice(0, -1) : trimmed).split(/(;\s*| and )/);
  let kept = '';
  let dropped: boolean = false;
  for (let i = 0; i < parts.length; i += 2) {
    const clause = parts[i];
    const drop: boolean = PROMOTION.test(unmask(clause)) || (dropped && /^if\b/i.test(clause.trim()));
    dropped = drop;
    if (drop) continue;
    kept += (kept && i > 0 ? parts[i - 1] : '') + clause;
  }
  const rest = unmask(kept).replace(/[,:\s]+$/, '');
  // A scrap of a few words is not guidance: drop the sentence.
  return rest.split(/\s+/).filter(Boolean).length >= 3 ? rest + end : '';
}

/**
 * Takes the pitches out of a guide, a criteria file or a structure file: a section whose heading is about a club, community
 * or sponsors goes whole; in any other line a sentence that only pitches goes, and in a sentence that also says something
 * useful (three words or more) only the pitching clause goes. Sentences that forbid or warn ("do not", "never", "avoid") are kept as they are.
 * List numbers ("10.") are not sentence ends. A line left empty goes too.
 */
export function stripPromotions(text: string): string {
  const kept: string[] = [];
  let skipping = 0;
  for (const line of text.split('\n')) {
    const level = headingLevel(line);
    if (skipping && level && level <= skipping) skipping = 0;
    if (skipping) continue;
    if (level && PROMOTION.test(line)) {
      skipping = level;
      continue;
    }
    if (!PROMOTION.test(line)) {
      kept.push(line);
      continue;
    }
    const prefix = /^\s*(?:[-*]\s+|\d+\.\s+)?/.exec(line)?.[0] ?? '';
    const sentences = line
      .slice(prefix.length)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => (PROMOTION.test(sentence) && !PROHIBITION.test(sentence) ? stripClauses(sentence) : sentence))
      .filter(Boolean);
    if (sentences.length) kept.push(prefix + sentences.join(' '));
  }
  return kept.join('\n');
}

/** The summary and structure sections of the voice guide (everything before section 3), without any pitch. */
export function voiceSummary(voice: string): string {
  const cut = voice.search(/\n## 3\./);
  const head = cut >= 0 ? voice.slice(0, cut) : voice.slice(0, VOICE_SUMMARY_CHARS);
  return stripPromotions(head).slice(0, VOICE_SUMMARY_CHARS).trim() || '(none yet)';
}

const fullVoice = (voice: string) => stripPromotions(voice).trim() || '(none yet)';

const criteriaText = ({ workspace, criteria }: ChannelContext) => {
  const lines = [];
  const about = stripPromotions(workspace.about).trim();
  if (about) lines.push(`About the channel: ${about}`);
  if (workspace.topics.length) lines.push(`Topics: ${workspace.topics.join(', ')}`);
  const rules = stripPromotions(criteria ?? '').trim();
  if (rules) lines.push(rules);
  return lines.join('\n\n') || '(none: use your judgment)';
};

const structureText = (structure: string | undefined) => stripPromotions(structure ?? '').trim() || '(none: use a plain hook, body and ending)';

const ctaRule = (workspace: ChannelContext['workspace']) => workspace.cta.trim() || DEFAULT_CTA;

const bullets = (items: string[] | undefined) => (items?.length ? items.map((item) => `- ${item}`).join('\n') : '(none)');

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Words the creator will say aloud: everything except [bracketed] cues. */
export const spokenWords = (text: string) => squash(text.replace(/\[[^\]]*\]/g, ' ')).split(' ').filter(Boolean).length;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- ideas, research, packages as prompt text

/** What the board kept about an idea, as the prompts read it. */
export interface PromptIdea extends Pick<Video, 'title'>, Omit<IdeaNotes, 'lane' | 'dropReason'> {}

const rated = (label: string, rating?: ConceptRating) => (rating?.note || rating?.level ? `${label} (${rating.level}): ${rating.note}` : undefined);

export function ideaText(idea: PromptIdea): string {
  const lines = [`Title: ${idea.title}`];
  if (idea.why) lines.push(`Why: ${idea.why}`);
  if (idea.angle) lines.push(`The video it comes from: ${idea.angle}`);
  if (idea.twist) lines.push(`The creator's twist: ${idea.twist}`);
  if (idea.hook) lines.push(`Suggested opening line: ${idea.hook}`);
  for (const line of [rated('Demand', idea.demand), rated('Gap', idea.gap), rated('Can show', idea.show)]) if (line) lines.push(line);
  for (const source of idea.sources ?? []) lines.push(`Source: ${source.label}${source.url ? ` (${source.url})` : ''}`);
  if (idea.note) lines.push(`Creator's note: ${idea.note}`);
  return lines.join('\n');
}

/** The research board as lines of text: video tiles with their numbers, links, notes. */
export function researchText(tiles: ResearchTile[]): string {
  const lines = tiles.map((tile) => {
    const { meta } = tile;
    switch (tile.kind) {
      case 'video': {
        const stats = [meta.channel, meta.views !== undefined ? `${meta.views.toLocaleString('en-US')} views` : undefined, meta.multiplier !== undefined ? `${meta.multiplier}x the channel's usual views` : undefined].filter(Boolean);
        return `- Video: ${tile.title ?? tile.url ?? 'untitled'}${stats.length ? ` (${stats.join(', ')})` : ''}${tile.url && tile.title ? ` ${tile.url}` : ''}`;
      }
      case 'link':
        return `- Link: ${[tile.title, tile.url].filter(Boolean).join(' ')}`;
      case 'image':
        return `- Image: ${tile.title ?? tile.file ?? 'untitled'}`;
      case 'signal':
        return `- Post${meta.author ? ` by ${meta.author}` : ''}${meta.likes !== undefined ? ` (${meta.likes.toLocaleString('en-US')} likes)` : ''}: ${squash(tile.text ?? '').slice(0, 1500)}`;
      case 'breakdown':
        return `- Breakdown of a video: ${[tile.title, tile.url].filter(Boolean).join(' ') || 'untitled'}`;
      default:
        return `- Note: ${squash(tile.text ?? tile.title ?? '').slice(0, 1500)}`;
    }
  });
  return lines.length ? lines.join('\n') : '(none)';
}

const ratingLine = (label: string, rating: ConceptRating | undefined) => (rating ? `${label} (${rating.level}): ${rating.note}` : undefined);

/** A package as prompt text, for the steps that come after it. Fields not filled in, and ratings not judged, are left out. */
export function packageText(pkg: Package | undefined): string {
  if (!pkg) return '(none: choose these yourself)';
  const titles = pkg.titles.map((title) => title.trim()).filter(Boolean);
  const hook = [
    pkg.hook.visual.trim() ? `- On screen first: ${pkg.hook.visual.trim()}` : '',
    pkg.hook.spoken.trim() ? `- Spoken: ${pkg.hook.spoken.trim()}` : '',
    pkg.hook.text.trim() ? `- Text: ${pkg.hook.text.trim()}` : '',
  ].filter(Boolean);
  const lines = [
    titles.length ? `Title options: ${titles.join(' | ')}` : '',
    pkg.thumbnailText.trim() ? `Thumbnail text: ${pkg.thumbnailText.trim()}` : '',
    pkg.angle.trim() ? `Angle: ${pkg.angle.trim()}` : '',
    pkg.twist.trim() ? `Twist: ${pkg.twist.trim()}` : '',
    ratingLine('Demand', pkg.demand) ?? '',
    ratingLine('Gap', pkg.gap) ?? '',
    ratingLine('Can show', pkg.show) ?? '',
    ...(hook.length ? ['Hook:', ...hook] : []),
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : '(none: choose these yourself)';
}

// ---------------------------------------------------------------- outline as prompt text and word budgets

export const sceneWords = (seconds: number) => Math.round((seconds / 60) * WORDS_PER_MINUTE);

export function outlineSeconds(outline: Outline): number {
  return outline.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
}

/** The scenes as markdown with a running clock, the way the script and expand prompts read them. */
export function outlineText(outline: Outline): string {
  let at = 0;
  return outline.scenes
    .map((scene, index) => {
      const start = at;
      at += scene.seconds;
      return [`### ${index + 1}. ${scene.title} (${clock(start)}–${clock(at)})`, 'Say:', ...scene.talkingPoints.map((point) => `- ${point}`), `Show: ${scene.show}`].join('\n');
    })
    .join('\n\n');
}

// ---------------------------------------------------------------- checks the model can get wrong

/** Titles: 7 words or fewer, 60 characters or fewer, never a question. Models miscount, so this runs in code. */
export function titleProblems(title: string): string[] {
  const text = title.trim();
  const problems: string[] = [];
  if (!text) return ['is empty'];
  const words = text.split(/\s+/).length;
  if (words > 7) problems.push(`has ${words} words, and 7 is the most`);
  if ([...text].length > 60) problems.push(`has ${[...text].length} characters, and 60 is the most`);
  if (/[?？]/.test(text)) problems.push('is a question');
  return problems;
}

/** Everything wrong with a package, as short sentences. An empty list means it passes. */
export function packageProblems(pkg: Package): string[] {
  const problems: string[] = [];
  pkg.titles.forEach((title, index) => titleProblems(title).forEach((problem) => problems.push(`Title ${index + 1} ${problem}.`)));
  const thumbnailWords = pkg.thumbnailText.trim().split(/\s+/).filter(Boolean).length;
  if (thumbnailWords < 2 || thumbnailWords > 5) problems.push(`The thumbnail text has ${thumbnailWords} words, and it needs 2 to 5.`);
  for (const key of ['visual', 'spoken', 'text'] as const) if (!pkg.hook[key].trim()) problems.push(`The hook has no ${key} part.`);
  return problems;
}

export const OPENING_MAX_SECONDS = 90;
export const ENDING_MAX_SECONDS = 60;
const LENGTH_TOLERANCE = 0.1;

/**
 * Everything wrong with an outline, as short sentences. An empty list means it passes.
 * With `minutes` (the length asked for), the scenes' seconds must add up to it within 10%.
 */
export function outlineProblems(outline: Outline, minutes?: number): string[] {
  const problems: string[] = [];
  const { scenes } = outline;
  if (scenes.length < 4 || scenes.length > 7) problems.push(`The outline has ${scenes.length} scenes, and it needs 4 to 7.`);
  scenes.forEach((scene, index) => {
    if (!scene.title.trim()) problems.push(`Scene ${index + 1} has no title.`);
    if (!scene.talkingPoints.some((point) => point.trim())) problems.push(`Scene ${index + 1} has no talking points.`);
    if (!Number.isInteger(scene.seconds) || scene.seconds <= 0) problems.push(`Scene ${index + 1} has no time budget.`);
  });
  const opening = scenes[0];
  const ending = scenes[scenes.length - 1];
  if (opening && opening.seconds > OPENING_MAX_SECONDS) problems.push(`The opening runs ${opening.seconds} seconds, and ${OPENING_MAX_SECONDS} is the most.`);
  if (ending && scenes.length > 1 && ending.seconds > ENDING_MAX_SECONDS) problems.push(`The ending runs ${ending.seconds} seconds, and ${ENDING_MAX_SECONDS} is the most.`);
  if (minutes) {
    const wanted = minutes * 60;
    const total = outlineSeconds(outline);
    if (Math.abs(total - wanted) > wanted * LENGTH_TOLERANCE) problems.push(`The scenes add up to ${total} seconds, and the ${minutes} minutes asked for is ${wanted} seconds, give or take 10%.`);
  }
  return problems;
}

// ---------------------------------------------------------------- 1. Break down

export interface BreakdownSource {
  title: string;
  channel: string;
  views?: number;
  likes?: number;
  commentCount?: number;
  ageDays?: number;
  /** Views against the source channel's median (the outlier chip). */
  multiplier?: number;
  /** The usual views of the creator's own videos, the base for judging demand. */
  usualViews?: number;
  transcript?: string;
  comments: { likes: number; text: string }[];
  /** Titles already on the board, so concepts are new. */
  existingTitles: string[];
  /** How many still frames are attached to the call. */
  frames?: number;
  /** One image is attached: the video's thumbnail (for a dropped file, a still from the video). */
  thumbnail?: boolean;
}

const count = (value: number) => value.toLocaleString('en-US');

export async function buildBreakdownPrompt(ctx: ChannelContext, source: BreakdownSource): Promise<JsonPrompt> {
  const first = firstName(ctx.workspace.name);
  const words = squash(source.transcript ?? '').split(' ').filter(Boolean);
  const transcript = words.slice(0, TRANSCRIPT_WORDS).join(' ');
  const comments = [...source.comments]
    .map((comment) => ({ likes: comment.likes, text: squash(comment.text).slice(0, 300) }))
    .filter((comment) => comment.text)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, COMMENTS_KEPT);
  if (!transcript && !comments.length && !source.frames && !source.thumbnail) throw new ClubError('There was no transcript and no comments to work from for this video.', 422);

  const facts = [`Title: ${source.title}`, `Channel: ${source.channel}`];
  if (source.views) facts.push(`Views: ${count(source.views)}${source.ageDays !== undefined ? ` in ${source.ageDays} days` : ''}`);
  if (source.multiplier !== undefined) facts.push(`Against the channel's usual views: ${source.multiplier}x`);
  if (source.likes) facts.push(`Likes: ${count(source.likes)}`);
  if (source.commentCount) facts.push(`Comments: ${count(source.commentCount)}`);
  if (source.usualViews) facts.push(`${first}'s usual views per video: ${count(source.usualViews)}`);

  const image = source.thumbnail
    ? `\n<frames>\nOne image is attached: the video's thumbnail (for a video file, a still from it). Use it for what the thumbnail promises, its on-screen text and visuals. Describe only what you can see in it.\n</frames>\n`
    : '';
  const frames = source.frames
    ? `\n<frames>\n${source.frames} still frames sampled across the video are attached, in order. Use them for how the thumbnail and the opening look, on-screen text and visuals. Describe only what you can see in them.\n</frames>\n`
    : '';
  const template = await methodologyFile('breakdown.md');
  return {
    prompt: fill(template, {
      name: ctx.workspace.name,
      first,
      voice_summary: voiceSummary(ctx.voice),
      criteria: criteriaText(ctx),
      facts: facts.join('\n'),
      transcript_note: transcript ? '' : ' (not available)',
      transcript,
      comments: comments.map((comment) => `- (${comment.likes}) ${comment.text}`).join('\n') || '(none)',
      frames: frames || image,
      existing: bullets(source.existingTitles),
    }),
    system: SYSTEM_JSON,
    schema: await methodologySchema('breakdown'),
  };
}

// ---------------------------------------------------------------- 2. Package

export interface PackageInput {
  idea: PromptIdea;
  research: ResearchTile[];
  /** Titles of the channel's recent videos, best first, for the pattern the titles follow. */
  recentTitles?: string[];
}

export async function buildPackagePrompt(ctx: ChannelContext, input: PackageInput): Promise<JsonPrompt> {
  const [template, hookLibrary, schema] = await Promise.all([methodologyFile('package.md'), methodologyFile('ref/hook-library.md'), methodologySchema('package')]);
  return {
    prompt: fill(template, {
      name: ctx.workspace.name,
      first: firstName(ctx.workspace.name),
      idea: ideaText(input.idea),
      research: researchText(input.research),
      criteria: criteriaText(ctx),
      voice_summary: voiceSummary(ctx.voice),
      structure: structureText(ctx.structure),
      recent_titles: bullets(input.recentTitles),
      hook_library: hookLibrary,
    }),
    system: SYSTEM_JSON,
    schema,
  };
}

// ---------------------------------------------------------------- 3. Create outline

export interface OutlineInput {
  idea: PromptIdea;
  pkg?: Package;
  /** From a break down. The outline follows this shape, never its words. */
  reusableOutline?: string[];
  /** Target length. When absent the model chooses from how much there is to show. */
  minutes?: number;
  /** What the creator has asked for, in their own words. */
  direction?: string;
}

const lengthText = (minutes: number | undefined) =>
  minutes
    ? `${minutes} minutes spoken, about ${minutes * WORDS_PER_MINUTE} words at ${WORDS_PER_MINUTE} words a minute. The seconds of your scenes add up to ${minutes * 60}, give or take 10%.`
    : `Choose it yourself: a whole number of minutes from 3 to 60, at ${WORDS_PER_MINUTE} words a minute, and let the seconds of your scenes add up to it, give or take 10%. Set it from how much there really is to show: count the separate things to build or demonstrate, and how much explaining each needs for this viewer. One simple thing is short (5 to 12 minutes). A few steps with some explaining is medium (12 to 25). Several connected builds, each needing a concept explained first, is long (25 to 45). Never go past 45 unless the idea clearly has that many parts, and never pick a length just to be long or to match an average.`;

export async function buildOutlinePrompt(ctx: ChannelContext, input: OutlineInput): Promise<JsonPrompt> {
  const [template, hookLibrary, schema] = await Promise.all([methodologyFile('outline.md'), methodologyFile('ref/hook-library.md'), methodologySchema('outline')]);
  const shape = input.reusableOutline?.length ? `\n<reusable_outline>\n${input.reusableOutline.map((beat, index) => `${index + 1}. ${beat}`).join('\n')}\n</reusable_outline>\n` : '';
  return {
    prompt: fill(template, {
      name: ctx.workspace.name,
      first: firstName(ctx.workspace.name),
      idea: ideaText(input.idea),
      package: packageText(input.pkg),
      direction: input.direction?.trim() || '(none: use your judgment)',
      criteria: criteriaText(ctx),
      voice_summary: voiceSummary(ctx.voice),
      structure: structureText(ctx.structure),
      hook_library: hookLibrary,
      reusable_outline: shape,
      length: lengthText(input.minutes),
      cta: ctaRule(ctx.workspace),
    }),
    system: SYSTEM_JSON,
    schema,
  };
}

// ---------------------------------------------------------------- 4. Script (optional): script, expand, revise

export type ScriptMode = 'full' | 'points';

export interface ScriptInput {
  title: string;
  idea: PromptIdea;
  pkg?: Package;
  outline: Outline;
  mode?: ScriptMode;
  direction?: string;
  /** Measured rhythm of the creator's real videos, as one paragraph. */
  rhythm?: string;
}

const NO_RHYTHM = '(no measurements available)';

export async function buildScriptPrompt(ctx: ChannelContext, input: ScriptInput): Promise<BuiltPrompt> {
  const first = firstName(ctx.workspace.name);
  const mode = input.mode ?? 'full';
  const [template, hookLibrary, ctaPatterns] = await Promise.all([methodologyFile('script.md'), methodologyFile('ref/hook-library.md'), methodologyFile('ref/cta-permutations.md')]);
  const seconds = outlineSeconds(input.outline);
  const modeInstructions =
    mode === 'full'
      ? `Full script. Write every spoken line as ${first} would say it.`
      : `Talking points. Write the hook, the setup and the ending word for word. For every scene in between, give short bullet talking points in ${first}'s own phrasing, plus any line ${first} should say exactly. Do not write the whole body as sentences.`;
  return {
    prompt: fill(template, {
      name: ctx.workspace.name,
      first,
      title: input.title,
      idea: ideaText(input.idea),
      package: packageText(input.pkg),
      outline: outlineText(input.outline),
      direction: input.direction?.trim() || '(none: use your judgment)',
      voice: fullVoice(ctx.voice),
      rhythm: input.rhythm?.trim() || NO_RHYTHM,
      budgets: input.outline.scenes.map((scene) => `- ${scene.title}: about ${sceneWords(scene.seconds)} spoken words`).join('\n'),
      structure: structureText(ctx.structure),
      hook_library: hookLibrary,
      cta_patterns: ctaPatterns,
      mode_instructions: modeInstructions,
      cta: ctaRule(ctx.workspace),
      minutes: Math.round((seconds / 60) * 10) / 10,
      words: input.outline.scenes.reduce((sum, scene) => sum + sceneWords(scene.seconds), 0),
    }),
    system: SYSTEM_TEXT,
  };
}

export interface SceneScriptInput {
  title: string;
  idea: PromptIdea;
  pkg?: Package;
  outline: Outline;
  /** The scene to write, as a place in the outline (0-based). */
  index: number;
  /** What the scene says now, when it has a script already: the creator's own words, kept. */
  draft?: string;
  rhythm?: string;
}

const OPENING_RULE = "- This is the opening: use the package's hook (its spoken line, what is on screen, the text) and write the rest of the opening around it.\n";
const ENDING_RULE = "- This is the ending: end on the outline's ending and its call to action. No recap.\n";

/** Writes one scene of the script, with the whole outline for context. */
export async function buildSceneScriptPrompt(ctx: ChannelContext, input: SceneScriptInput): Promise<BuiltPrompt> {
  const scene = input.outline.scenes[input.index];
  if (!scene) throw new ClubError('That scene was not found.', 404);
  const template = await methodologyFile('scene-script.md');
  const last = input.outline.scenes.length - 1;
  return {
    prompt: fill(template, {
      name: ctx.workspace.name,
      first: firstName(ctx.workspace.name),
      title: input.title,
      idea: ideaText(input.idea),
      package: packageText(input.pkg),
      outline: outlineText(input.outline),
      voice: fullVoice(ctx.voice),
      rhythm: input.rhythm?.trim() || NO_RHYTHM,
      structure: structureText(ctx.structure),
      number: input.index + 1,
      count: input.outline.scenes.length,
      heading: scene.title,
      words: sceneWords(scene.seconds),
      scene: outlineText({ scenes: [scene] }).replace(/^### 1\./, `### ${input.index + 1}.`),
      draft: input.draft?.trim() || '(none: write it fresh)',
      cta: ctaRule(ctx.workspace),
      first_rule: input.index === 0 ? OPENING_RULE : '',
      last_rule: input.index === last && last > 0 ? ENDING_RULE : '',
    }),
    system: SYSTEM_TEXT,
  };
}

export interface ExpandInput {
  outline: Outline;
  /** The whole script as it stands. */
  script: string;
  /** The scene's heading, without the `##`. */
  heading: string;
  /** The scene's current body. */
  section: string;
  /** Spoken words the scene should reach. */
  want: number;
  rhythm?: string;
}

/** Lengthens one scene that is under its budget (the board lengthens a scene below 80% of it). */
export async function buildExpandPrompt(ctx: ChannelContext, input: ExpandInput): Promise<BuiltPrompt> {
  const template = await methodologyFile('expand.md');
  return {
    prompt: fill(template, {
      name: ctx.workspace.name,
      first: firstName(ctx.workspace.name),
      voice: fullVoice(ctx.voice),
      rhythm: input.rhythm?.trim() || NO_RHYTHM,
      structure: structureText(ctx.structure),
      outline: outlineText(input.outline),
      script: input.script,
      heading: input.heading,
      have: spokenWords(input.section),
      want: input.want,
      section: input.section.trim(),
      cta: ctaRule(ctx.workspace),
    }),
    system: SYSTEM_TEXT,
  };
}

export interface ReviseInput {
  script: string;
  /** One line per measure: the script's number, the target and whether it is close. */
  table: string;
  /** The habit phrases and their target rates, as one sentence fragment. */
  habits: string;
}

/** Moves a finished script's rhythm toward the creator's measured rhythm without touching facts or cues. */
export async function buildRevisePrompt(ctx: ChannelContext, input: ReviseInput): Promise<BuiltPrompt> {
  const template = await methodologyFile('revise.md');
  return {
    prompt: fill(template, { name: ctx.workspace.name, first: firstName(ctx.workspace.name), script: input.script, table: input.table || '(none)', habits: input.habits || '(none)' }),
    system: SYSTEM_TEXT,
  };
}

// ---------------------------------------------------------------- Ask Claude about this board

export const CHAT_TURNS_KEPT = 12;
const CHAT_TURN_CHARS = 1500;
const OUTLINE_CHARS = 6000;

export interface BoardChatInput {
  idea: PromptIdea;
  pkg?: Package;
  outline?: Outline;
  /** The board's tiles as text, already trimmed. */
  board: string;
  /** The conversation so far; only the last turns are sent, each trimmed. */
  history: { role: 'user' | 'assistant'; text: string }[];
  message: string;
}

export async function buildBoardChatPrompt(ctx: ChannelContext, input: BoardChatInput): Promise<JsonPrompt> {
  const [template, schema] = await Promise.all([methodologyFile('board-chat.md'), methodologySchema('board-chat')]);
  const turns = input.history.slice(-CHAT_TURNS_KEPT).map((turn) => `${turn.role === 'user' ? 'Creator' : 'You'}: ${squash(turn.text).slice(0, CHAT_TURN_CHARS)}`);
  return {
    prompt: fill(template, {
      name: ctx.workspace.name,
      criteria: criteriaText(ctx),
      voice_summary: voiceSummary(ctx.voice),
      idea: ideaText(input.idea),
      package: packageText(input.pkg),
      outline: input.outline ? outlineText(input.outline).slice(0, OUTLINE_CHARS) : '(none yet)',
      board: input.board || '(the board is empty)',
      conversation: turns.length ? turns.join('\n') : '(none yet)',
      question: input.message.trim(),
    }),
    system: SYSTEM_JSON,
    schema,
  };
}

// ---------------------------------------------------------------- The companion

/** How each action is described to the model: its JSON and when to use it. */
export const COMPANION_ACTION_HELP: Record<CompanionActionType, string> = {
  use_hook: '- use_hook: {"type": "use_hook", "text": "..."}: one spoken opening line, the first thing the creator says. One action per option.',
  use_title: '- use_title: {"type": "use_title", "text": "..."}: a video title of 7 words or fewer and 60 characters or fewer, a claim and not a question. One action per title.',
  set_thumbnail_text: '- set_thumbnail_text: {"type": "set_thumbnail_text", "text": "..."}: the words on the thumbnail, 2 to 5 words.',
  add_note: '- add_note: {"type": "add_note", "text": "..."}: a note pinned to the board: a fact or an idea worth keeping, with where it came from.',
  set_scene: '- set_scene: {"type": "set_scene", "sceneId": "...", "title": "...", "talkingPoints": ["..."]}: rewrites one scene that exists. Use its id exactly as given in <scenes>; leave out the title or the talking points when they do not change.',
  draft_scenes:
    '- draft_scenes: {"type": "draft_scenes", "scenes": [{"title": "...", "talkingPoints": ["..."], "show": "what is on screen", "seconds": 60}]}: 4 to 7 scenes for the whole video, replacing the scenes it has. The opening is 90 seconds or less, the ending 60 or less, and the scenes add up to about the target length.',
  set_description: '- set_description: {"type": "set_description", "text": "..."}: the YouTube description: what the viewer gets in two or three lines, then chapters with start times from the scenes. No links you were not given.',
};

const COMPANION_SCENES_CHARS = 8000;

/** The scenes with their ids and running clock, so the model can name the one to change. */
export function companionScenesText(outline: Outline | undefined): string {
  if (!outline?.scenes.length) return '(no scenes yet)';
  let at = 0;
  const text = outline.scenes
    .map((scene, index) => {
      const start = at;
      at += scene.seconds;
      return [`### ${index + 1}. ${scene.title} (id: ${scene.id ?? 'none'}, ${clock(start)}–${clock(at)})`, ...scene.talkingPoints.map((point) => `- ${point}`), `Show: ${scene.show}`].join('\n');
    })
    .join('\n\n');
  return text.length > COMPANION_SCENES_CHARS ? `${text.slice(0, COMPANION_SCENES_CHARS)}…` : text;
}

export interface CompanionPromptInput {
  idea: PromptIdea;
  pkg?: Package;
  outline?: Outline;
  /** The board's tiles as text, already trimmed. */
  board: string;
  /** What the screen shows: the step, the scene in focus and a short summary. */
  screen: string;
  /** The conversation so far; only the last turns are sent, each trimmed. */
  history: { role: 'user' | 'assistant'; text: string }[];
  message: string;
  actions: readonly CompanionActionType[];
}

export async function buildCompanionPrompt(ctx: ChannelContext, input: CompanionPromptInput): Promise<BuiltPrompt> {
  const template = await methodologyFile('companion.md');
  const turns = input.history.slice(-CHAT_TURNS_KEPT).map((turn) => `${turn.role === 'user' ? 'Creator' : 'You'}: ${squash(turn.text).slice(0, CHAT_TURN_CHARS)}`);
  const pkg = input.pkg ? [packageText(input.pkg), input.pkg.description?.trim() ? `Description:\n${input.pkg.description.trim().slice(0, 3000)}` : ''].filter(Boolean).join('\n') : packageText(undefined);
  return {
    prompt: fill(template, {
      name: ctx.workspace.name,
      criteria: criteriaText(ctx),
      voice_summary: voiceSummary(ctx.voice),
      idea: ideaText(input.idea),
      package: pkg,
      scenes: companionScenesText(input.outline),
      board: input.board || '(the board is empty)',
      screen: input.screen,
      conversation: turns.length ? turns.join('\n') : '(none yet)',
      message: input.message.trim(),
      actions: input.actions.length ? input.actions.map((type) => COMPANION_ACTION_HELP[type]).join('\n') : '(none on this step: answer in words only)',
    }),
    system: 'You are a YouTube creator\'s planning companion. Use only the facts you are given and never invent numbers, results or product behaviour. Answer in Markdown, then the actions in the format asked for.',
  };
}

// ---------------------------------------------------------------- 5. Voice guide

/** Fills the voice prompt: `{name}` everywhere, then `{transcripts}` as `### [id]` blocks. */
export function assembleVoicePrompt(template: string, name: string, transcripts: Transcript[]): string {
  const joined = transcripts.map((transcript) => `### [${transcript.id}]\n${transcript.text}`).join('\n\n');
  return template.split('{name}').join(name).split('{transcripts}').join(joined);
}

export async function buildVoicePrompt(name: string, transcripts: Transcript[]): Promise<BuiltPrompt> {
  return { prompt: assembleVoicePrompt(await methodologyFile('voice.md'), name, transcripts) };
}
