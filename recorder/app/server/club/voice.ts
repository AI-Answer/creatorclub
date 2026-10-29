import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AiProvider, VoiceAnswers, VoiceGuideSummary } from '../../shared/club.js';
import { runAI, type Lookup } from './ai.js';
import { transcriptsDir, type Transcript } from './channel.js';
import { ClubError } from './errors.js';
import { buildVoicePrompt } from './prompts.js';
import { defaultAi, workspaceDir, writeFileAtomic } from './store.js';

/** Fewer usable transcripts than this and the voice guide is built from the three questions instead (the board's rule). */
export const MIN_TRANSCRIPTS = 3;
const MIN_GUIDE_LENGTH = 800;
const VOICE_BUDGET_USD = 1.5;

export const voiceFile = (slug: string) => path.join(workspaceDir(slug), 'voice.md');

export interface VoiceContext extends Lookup {
  signal?: AbortSignal;
  say?: (message: string) => void;
}

/** Asks the AI for the voice guide and saves it as `voice.md`. Nothing is saved when the answer is empty or too short. */
export async function buildVoiceGuide(slug: string, name: string, transcripts: Transcript[], context: VoiceContext = {}): Promise<void> {
  const { prompt } = await buildVoicePrompt(name, transcripts);
  context.say?.('Writing your voice guide…');
  const provider: AiProvider = (await defaultAi()) ?? 'claude';
  const { text } = await runAI({ ...context, provider, prompt, model: provider === 'claude' ? 'sonnet' : undefined, budgetUsd: VOICE_BUDGET_USD, timeoutMs: 15 * 60_000 });
  const guide = text.trim();
  if (guide.length < MIN_GUIDE_LENGTH) throw new ClubError('The voice guide came back too short. Try again.', 502);
  await writeFileAtomic(voiceFile(slug), guide + '\n');
}

/** The guide for a channel without enough captions: the creator's own answers, set down as they gave them. Unanswered questions are left out. */
export async function writeVoiceFromAnswers(slug: string, name: string, answers: Partial<VoiceAnswers>): Promise<void> {
  const lines = [`# ${name}: Voice Guide`, '', '## Voice DNA'];
  const add = (label: string, value: string | undefined) => value?.trim() && lines.push(`- **${label}:** ${value.trim()}`);
  add('Voice', answers.voice);
  add('Audience', answers.audience);
  add('Signature moves', answers.moves);
  await writeFileAtomic(voiceFile(slug), lines.join('\n') + '\n');
}

export async function hasVoiceGuide(slug: string): Promise<boolean> {
  try {
    return (await fs.stat(voiceFile(slug))).size > 0;
  } catch {
    return false;
  }
}

const plain = (line: string) => line.replace(/^[\s>*-]+/, '').replace(/\*\*([^*]+)\*\*:?/g, '$1:').replace(/[*_`]/g, '').trim();

/** The voice guide's opening, for Settings: its first lines without headings or markdown, about 400 characters, and how many transcripts it was built from. Null when there is no guide. */
export async function voiceSummary(slug: string): Promise<VoiceGuideSummary | null> {
  let guide: string;
  try {
    guide = await fs.readFile(voiceFile(slug), 'utf8');
  } catch {
    return null;
  }
  const lines = guide.split('\n').filter((line) => line.trim() && !/^\s*#/.test(line)).map(plain).filter(Boolean);
  let summary = '';
  for (const line of lines) {
    if (summary.length >= 300) break;
    summary = summary ? `${summary} ${line}` : line;
  }
  if (!summary) return null;
  if (summary.length > 400) summary = `${summary.slice(0, 397).trimEnd()}…`;
  let transcripts = 0;
  try {
    transcripts = (await fs.readdir(transcriptsDir(slug))).filter((name) => name.endsWith('.md') && !name.startsWith('.')).length;
  } catch {
    // no transcripts folder: written from answers
  }
  return { summary, transcripts };
}

/** Saves transcripts as `own-channel/transcripts/<id>.md`. */
export async function saveTranscripts(slug: string, transcripts: Transcript[]): Promise<void> {
  await Promise.all(transcripts.map((transcript) => writeFileAtomic(path.join(transcriptsDir(slug), `${transcript.id}.md`), transcript.text + '\n')));
}
