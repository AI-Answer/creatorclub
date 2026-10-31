import path from 'node:path';
import { z } from 'zod';
import type { Breakdown, ResearchTile } from '../../shared/club.js';
import { readBreakdown } from './breakdown.js';
import { noteText } from './prompts.js';
import { readTranscript } from './research.js';
import * as store from './store.js';

/*
 * The board as text, for the companion's prompt, and the old Board chat (`board-chat.json`), read once when a video's companion
 * conversation is first opened so it carries over.
 */

/** The most the board shows the model, so the prompt stays the same size however many tiles there are. */
const BOARD_CHARS = 24_000;
const TILE_CHARS_MAX = 3000;
const TILE_CHARS_MIN = 400;
const TILES_KEPT = 60;

const chatFile = (slug: string, id: string) => path.join(store.boardDir(slug, id), 'board-chat.json');

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);
const count = (value: number) => value.toLocaleString('en-US');

// ---------------------------------------------------------------- the board as text

async function tileText(slug: string, videoId: string, tile: ResearchTile): Promise<string> {
  const { meta } = tile;
  switch (tile.kind) {
    case 'note':
    case 'text':
    {
      const body = noteText(tile.text ?? '') || '(empty)';
      return `Your note${tile.doc && tile.title ? ` "${tile.title}"` : ''}:${body.startsWith('\n') ? '' : ' '}${body}`;
    }
    case 'signal': {
      const stats = [meta.likes !== undefined ? `${count(meta.likes)} likes` : '', meta.replies !== undefined ? `${count(meta.replies)} replies` : ''].filter(Boolean).join(', ');
      return `Post${meta.source ? ` on ${meta.source === 'x' ? 'X' : 'Reddit'}` : ''}${meta.author ? ` by ${meta.author}` : ''}${stats ? ` (${stats})` : ''}: ${squash(tile.text ?? '')}`;
    }
    case 'idea':
      return `The idea: ${squash(tile.text ?? '') || '(no reason given)'}`;
    case 'mine': {
      const video = meta.videoId ? await store.readVideo(slug, meta.videoId).catch(() => undefined) : undefined;
      if (!video) return `One of your videos: ${tile.title ?? 'untitled'} (no longer in the channel)`;
      const why = video.idea?.why ? `: ${squash(video.idea.why)}` : '';
      return video.stage === 'ideas' ? `Your idea "${video.title}"${why}` : `Your video "${video.title}" (${video.stage})${why}`;
    }
    case 'link':
      return `Link: ${[tile.title, tile.url].filter(Boolean).join(' ')}`;
    case 'image':
      return `Image: ${tile.title ?? tile.file ?? 'untitled'}`;
    case 'video': {
      const stats = [
        meta.channel,
        meta.views !== undefined ? `${count(meta.views)} views` : '',
        meta.multiplier !== undefined ? `${meta.multiplier}x the channel's usual views` : '',
      ].filter(Boolean);
      const head = `Video: ${tile.title ?? tile.url ?? 'untitled'}${stats.length ? ` (${stats.join(', ')})` : ''}`;
      if (!meta.transcript) return head;
      const transcript = (await readTranscript(slug, videoId, tile.id).catch(() => [])).map((chapter) => (chapter.title ? `${chapter.title}: ${chapter.text}` : chapter.text)).join(' ');
      return `${head}\nTranscript: ${squash(transcript)}`;
    }
    case 'breakdown': {
      const breakdown: Breakdown | undefined = meta.breakdownId ? await readBreakdown(slug, meta.breakdownId).catch(() => undefined) : undefined;
      if (!breakdown) return `Breakdown: ${tile.title ?? 'a video'} (no longer saved)`;
      const why = breakdown.whyItWorked;
      return [
        `Breakdown of "${breakdown.video.title}" by ${breakdown.video.channel}`,
        `Why it worked: ${[why.titlePackaging, why.hookSpeed, why.retention, why.payoff].map(squash).filter(Boolean).join(' ')}`,
        breakdown.reusableOutline.length ? `Reusable outline: ${breakdown.reusableOutline.map((beat, index) => `${index + 1}. ${squash(beat)}`).join(' ')}` : '',
        breakdown.concepts.length ? `Concepts: ${breakdown.concepts.map((concept) => `${concept.title} (${squash(concept.angle)})`).join('; ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
}

/** The board's tiles as numbered text. Each tile is cut to its share of the room, so a long transcript or many tiles never grow the prompt. */
export async function boardText(slug: string, videoId: string, tiles: readonly ResearchTile[], chars = BOARD_CHARS, { ids = false }: { /** Name each tile by its id (Research, where the companion groups cards and starts videos from them). */ ids?: boolean } = {}): Promise<string> {
  const kept = tiles.slice(-TILES_KEPT);
  if (!kept.length) return '';
  const each = Math.max(TILE_CHARS_MIN, Math.min(TILE_CHARS_MAX, Math.floor(chars / kept.length)));
  const lines = await Promise.all(kept.map(async (tile, index) => `${ids ? `[${tile.id}]` : `${index + 1}.`} ${cut(await tileText(slug, videoId, tile), each)}`));
  const left = tiles.length - kept.length;
  return [...(left ? [`(${left} older ${left === 1 ? 'tile is' : 'tiles are'} left out)`] : []), ...lines].join('\n\n');
}

// ---------------------------------------------------------------- the old Board chat, read once to carry it into the companion

/** What the old "Ask Claude about this board" could hand back: a spoken hook, a title, a note or a scene idea. */
const OLD_ITEM_KINDS = ['hook', 'title', 'note', 'scene'] as const;

/** One message of the old Board chat (`board-chat.json`). `used` marks the items already taken, by their place in `items`. */
export interface OldBoardMessage {
  role: 'user' | 'assistant';
  text: string;
  items?: { kind: (typeof OLD_ITEM_KINDS)[number]; text: string }[];
  used?: number[];
}

const messageShape = z
  .object({
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    items: z.array(z.object({ kind: z.enum(OLD_ITEM_KINDS), text: z.string() }).strict()).optional(),
    used: z.array(z.number().int().nonnegative()).optional(),
  })
  .strict();

/** The old Board chat, oldest first. Empty when there is none, or when the file cannot be read. The file is never written. */
export async function readBoardChat(slug: string, id: string): Promise<OldBoardMessage[]> {
  await store.requireBoard(slug, id);
  const saved = await store.readJSON<unknown>(chatFile(slug, id)).catch(() => undefined);
  const parsed = z.array(messageShape).safeParse(saved);
  return parsed.success ? parsed.data : [];
}
