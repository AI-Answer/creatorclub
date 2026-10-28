import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AiProvider, VoiceAnswers } from '../../shared/club.js';
import { runAI, type Lookup } from './ai.js';
import { transcriptsDir, type Transcript } from './channel.js';
import { ClubError } from './errors.js';
import { defaultAi, workspaceDir, writeFileAtomic } from './store.js';

/** Fewer usable transcripts than this and the voice guide is built from the three questions instead (the board's rule). */
export const MIN_TRANSCRIPTS = 3;
const MIN_GUIDE_LENGTH = 800;
const VOICE_BUDGET_USD = 1.5;

export const voiceFile = (slug: string) => path.join(workspaceDir(slug), 'voice.md');

/** The prompt files live in `methodology/` at the repo root, or next to the bundled server in the packaged app. */
export async function methodologyFile(name: string): Promise<string> {
  const here = import.meta.dirname;
  const candidates = [path.resolve(here, '../../../../methodology', name), path.resolve(here, 'methodology', name)];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf8');
    } catch {
      // try the next place
    }
  }
  throw new ClubError("Couldn't find the voice guide instructions.", 500);
}

/** Fills the board's voice prompt: `{name}` everywhere, then `{transcripts}` as `### [id]` blocks. */
export function assembleVoicePrompt(template: string, name: string, transcripts: Transcript[]): string {
  const joined = transcripts.map((transcript) => `### [${transcript.id}]\n${transcript.text}`).join('\n\n');
  return template.split('{name}').join(name).split('{transcripts}').join(joined);
}

export interface VoiceContext extends Lookup {
  signal?: AbortSignal;
  say?: (message: string) => void;
}

/** Asks the AI for the voice guide and saves it as `voice.md`. Nothing is saved when the answer is empty or too short. */
export async function buildVoiceGuide(slug: string, name: string, transcripts: Transcript[], context: VoiceContext = {}): Promise<void> {
  const prompt = assembleVoicePrompt(await methodologyFile('voice.md'), name, transcripts);
  context.say?.('Writing your voice guide…');
  const provider: AiProvider = (await defaultAi()) ?? 'claude';
  const { text } = await runAI({ ...context, provider, prompt, model: provider === 'claude' ? 'sonnet' : undefined, budgetUsd: VOICE_BUDGET_USD, timeoutMs: 15 * 60_000 });
  const guide = text.trim();
  if (guide.length < MIN_GUIDE_LENGTH) throw new ClubError('The voice guide came back too short. Try again.', 502);
  await writeFileAtomic(voiceFile(slug), guide + '\n');
}

/** The guide for a channel without enough captions: the creator's own answers, set down as they gave them. */
export async function writeVoiceFromAnswers(slug: string, name: string, answers: VoiceAnswers): Promise<void> {
  const lines = [`# ${name}: Voice Guide`, '', '## Voice DNA', `- **Voice:** ${answers.voice.trim()}`, `- **Audience:** ${answers.audience.trim()}`];
  if (answers.moves.trim()) lines.push(`- **Signature moves:** ${answers.moves.trim()}`);
  await writeFileAtomic(voiceFile(slug), lines.join('\n') + '\n');
}

export async function hasVoiceGuide(slug: string): Promise<boolean> {
  try {
    return (await fs.stat(voiceFile(slug))).size > 0;
  } catch {
    return false;
  }
}

/** Saves transcripts as `own-channel/transcripts/<id>.md`. */
export async function saveTranscripts(slug: string, transcripts: Transcript[]): Promise<void> {
  await Promise.all(transcripts.map((transcript) => writeFileAtomic(path.join(transcriptsDir(slug), `${transcript.id}.md`), transcript.text + '\n')));
}
