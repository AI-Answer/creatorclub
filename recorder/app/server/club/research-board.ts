import { randomBytes } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CHANNEL_BOARD, type ResearchTile, type StartedVideo, type Video } from '../../shared/club.js';
import { addNote, boardTiles, docTitle } from './board-docs.js';
import { changeCanvas, readCanvas } from './board-canvas.js';
import { imageFile } from './board-images.js';
import { ClubError, notFound } from './errors.js';
import { readSignal } from './signals.js';
import { readTrendingItem } from './trending.js';
import { signalTile, trendingTile } from './trend-ideas.js';
import { transcriptFile } from './research.js';
import * as store from './store.js';

/*
 * Research, the channel's own Board: cards come in from Discover (a video doing better than usual, a post) and from Videos (one of your ideas or
 * videos), and a selection of cards can start a new video, an idea whose first Board holds copies of them.
 */

/** What "Add to Research" sends: a Discover video (its YouTube id), a Discover post (its id), or one of the channel's ideas or videos. */
export const addToResearchBody = z.discriminatedUnion('source', [
  z.object({ source: z.literal('trending'), id: z.string().regex(/^[\w-]{6,20}$/) }).strict(),
  z.object({ source: z.literal('signal'), id: z.string().min(1).max(100) }).strict(),
  z.object({ source: z.literal('video'), id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict(),
]);

export interface AddedToResearch {
  tile: ResearchTile;
  /** False when the card was already on Research: nothing was added. */
  created: boolean;
}

/** Puts a Discover card, an idea or a video on Research. The same card twice gives the card that is there. */
export async function addToResearch(slug: string, input: z.infer<typeof addToResearchBody>): Promise<AddedToResearch> {
  let tile: store.NewTile & { url?: string };
  if (input.source === 'trending') {
    const item = await readTrendingItem(slug, input.id);
    if (!item) throw notFound('video');
    tile = trendingTile(item);
  } else if (input.source === 'signal') {
    const post = await readSignal(slug, input.id);
    if (!post) throw notFound('post');
    tile = signalTile(post);
  } else {
    const video = await store.readVideo(slug, input.id);
    tile = { kind: 'mine', title: video.title, meta: { videoId: video.id } };
  }
  const existing = (await store.listTiles(slug, CHANNEL_BOARD)).find((each) =>
    tile.kind === 'mine' ? each.kind === 'mine' && each.meta.videoId === tile.meta?.videoId : !!tile.url && each.url === tile.url,
  );
  if (existing) return { tile: existing, created: false };
  return { tile: await store.addTile(slug, CHANNEL_BOARD, tile), created: true };
}

// ---------------------------------------------------------------- starting a video from a selection

export const startVideoBody = z
  .object({
    tileIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).min(1).max(60),
    frameId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    title: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

/** Where copied cards start on the new Board: their places kept, moved to the top left. */
const ORIGIN = 60;

interface ImageReference {
  start: number;
  end: number;
}

/** URL spans only: replacing these leaves the note's labels, titles, whitespace and other Markdown alone. */
function imageReferences(text: string): ImageReference[] {
  // Code examples are not image references. Mask them without changing offsets in the original text.
  const markdown = text.replace(/(^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\2[ \t]*$)|(`+)[\s\S]*?\3/gm, (code) => code.replace(/[^\n]/g, ' '));
  const references: ImageReference[] = [];
  const labels = new Set<string>();
  const labelOf = (label: string) => label.replace(/\\([\[\]\\])/g, '$1').trim().replace(/\s+/g, ' ').toLowerCase();
  const bracketEnd = (open: number): number => {
    let depth = 0;
    for (let i = open; i < markdown.length; i++) {
      if (markdown[i] === '\\') i++;
      else if (markdown[i] === '[') depth++;
      else if (markdown[i] === ']' && --depth === 0) return i;
    }
    return -1;
  };
  const targetAt = (at: number): ImageReference | undefined => {
    while (/\s/.test(markdown[at] ?? '') && at < markdown.length) at++;
    const angle = markdown[at] === '<';
    const start = at + (angle ? 1 : 0);
    let depth = 0;
    for (let i = start; i < markdown.length; i++) {
      const char = markdown[i];
      if (char === '\\') { i++; continue; }
      if (angle ? char === '>' : /\s/.test(char) || (char === ')' && depth === 0)) return i > start ? { start, end: i } : undefined;
      if (!angle && char === '(') depth++;
      if (!angle && char === ')') depth--;
      if (angle && /[<>\r\n]/.test(char)) return undefined;
    }
    return !angle && start < markdown.length ? { start, end: markdown.length } : undefined;
  };
  for (const match of markdown.matchAll(/!\[/g)) {
    // An escaped exclamation mark is literal text.
    let escapes = 0;
    while (markdown[match.index - escapes - 1] === '\\') escapes++;
    if (escapes % 2) continue;
    const close = bracketEnd(match.index + 1);
    if (close < 0) continue;
    const after = close + 1;
    if (markdown[after] === '(') {
      const reference = targetAt(after + 1);
      if (reference) references.push(reference);
    } else {
      const end = markdown[after] === '[' ? bracketEnd(after) : -1;
      const label = end > 0 ? markdown.slice(after + 1, end) : '';
      labels.add(labelOf(label || markdown.slice(match.index + 2, close)));
    }
  }
  for (const match of markdown.matchAll(/^ {0,3}\[([^\]\n]+)\]:[ \t]*/gm)) {
    if (!labels.delete(labelOf(match[1]))) continue;
    const reference = targetAt(match.index + match[0].length);
    if (reference) references.push(reference);
  }
  return references.sort((a, b) => a.start - b.start);
}

/** Copies only images owned by the source Board; all new notes live in the destination's notes/ folder. */
export async function copyNoteImages(slug: string, source: string, destination: string, tile: ResearchTile): Promise<string> {
  const text = tile.text ?? '';
  const references = imageReferences(text);
  if (!references.length) return text;
  await store.requireBoard(slug, destination);
  const sourceRoot = await fs.realpath(store.boardDir(slug, source));
  const destinationRoot = await fs.realpath(store.boardDir(slug, destination));
  const copied = new Map<string, string>();
  let result = '', last = 0;
  for (const reference of references) {
    const original = text.slice(reference.start, reference.end);
    const url = original.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1');
    const file = await imageFile(slug, source, url, tile.doc ? tile.id : undefined).catch((error) => {
      if (error instanceof ClubError || (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    });
    if (!file || !file.startsWith(sourceRoot + path.sep)) continue;
    let relative = copied.get(file);
    if (!relative) {
      // Refuse symlinks in either destination component, just as image uploads do.
      let dir = destinationRoot;
      for (const part of ['notes', 'assets']) {
        dir = path.join(dir, part);
        await fs.mkdir(dir).catch((error) => { if (error.code !== 'EEXIST') throw error; });
        const stat = await fs.lstat(dir);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ClubError('The board assets folder is not a folder.');
      }
      let name = path.basename(file);
      for (;;) {
        try {
          await fs.copyFile(file, path.join(dir, name), constants.COPYFILE_EXCL);
          relative = `assets/${encodeURIComponent(name).replace(/\(/g, '%28').replace(/\)/g, '%29')}`;
          copied.set(file, relative);
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') break; // The source can disappear after it was resolved.
          if (code !== 'EEXIST') throw error;
          const ext = path.extname(file);
          name = `${path.basename(file, ext)}-${randomBytes(6).toString('hex')}${ext}`;
        }
      }
    }
    if (!relative) continue;
    // Keep the original spelling too when it already points at the copied file (e.g. assets/id.png).
    const decoded = decodeURIComponent(url);
    const replacement = path.resolve(destinationRoot, 'notes', decoded) === path.join(destinationRoot, 'notes', decodeURIComponent(relative)) ? original : relative;
    result += text.slice(last, reference.start) + replacement;
    last = reference.end;
  }
  return result + text.slice(last);
}

/** The new video's title: the one given, the frame's name, the first note's first line, the first card's title. */
export function startTitle(tiles: readonly ResearchTile[], frameTitle?: string, given?: string): string {
  const named = given?.trim() || frameTitle?.trim();
  if (named) return named.slice(0, 300);
  const note = tiles.find((tile) => tile.kind === 'note' && (tile.text ?? '').trim());
  if (note) return docTitle(note.text ?? '', note.doc?.path ?? 'note.md');
  const first = tiles.find((tile) => (tile.title ?? tile.text ?? '').trim());
  return (first?.title ?? first?.text ?? 'New video from Research').replace(/\s+/g, ' ').trim().slice(0, 120) || 'New video from Research';
}

/**
 * A new idea (a video at stage "ideas") whose first Board holds copies of the chosen cards of Research, in the same places relative to each other, with
 * the connections between them. A note is copied as a new Markdown file in the new video's folder (a note pinned from the Notes folder too: the copy
 * is the video's own); a picture and a transcript are copied with their card. Research itself is not changed.
 */
export async function startVideoFrom(slug: string, input: z.infer<typeof startVideoBody>): Promise<StartedVideo> {
  const all = await boardTiles(slug, CHANNEL_BOARD);
  const wanted = new Set(input.tileIds);
  const chosen = all.filter((tile) => wanted.has(tile.id)).sort((a, b) => (a.pos?.y ?? 0) - (b.pos?.y ?? 0) || (a.pos?.x ?? 0) - (b.pos?.x ?? 0));
  if (chosen.length !== wanted.size) throw notFound('tile');
  const canvas = await readCanvas(slug, CHANNEL_BOARD, all);
  const frame = input.frameId ? canvas.frames.find((each) => each.id === input.frameId) : undefined;
  if (input.frameId && !frame) throw notFound('frame');
  const title = startTitle(chosen, frame?.title, input.title);
  const video: Video = await store.createVideo(slug, { title, stage: 'ideas', source: { kind: 'manual' }, idea: { note: `Started from Research with ${chosen.length} ${chosen.length === 1 ? 'card' : 'cards'}.` } });

  const left = Math.min(...chosen.map((tile) => tile.pos?.x ?? 0)),
    top = Math.min(...chosen.map((tile) => tile.pos?.y ?? 0));
  const place = (tile: ResearchTile) => ({ x: ORIGIN + (tile.pos?.x ?? 0) - left, y: ORIGIN + (tile.pos?.y ?? 0) - top, ...(tile.pos?.w ? { w: tile.pos.w } : {}) });
  const ids = new Map<string, string>();
  for (const tile of chosen) {
    let copy: ResearchTile;
    if (tile.kind === 'note' && tile.doc) {
      copy = await addNote(slug, video.id, await copyNoteImages(slug, CHANNEL_BOARD, video.id, tile));
    } else {
      const file = store.tileFilePath(slug, CHANNEL_BOARD, tile);
      copy = await store.addTile(slug, video.id, {
        kind: tile.kind,
        ...(tile.url ? { url: tile.url } : {}),
        ...(tile.title ? { title: tile.title } : {}),
        ...(tile.text ? { text: tile.text } : {}),
        meta: tile.meta,
        ...(file && tile.file ? { file: { name: tile.file.replace(/^t_[a-f0-9]+-/, ''), data: await fs.readFile(file) } } : {}),
      });
      if (tile.meta.transcript) {
        await fs.mkdir(path.dirname(transcriptFile(slug, video.id, copy.id)), { recursive: true });
        await fs.copyFile(transcriptFile(slug, CHANNEL_BOARD, tile.id), transcriptFile(slug, video.id, copy.id)).catch(() => undefined);
      }
    }
    copy = await store.updateTile(slug, video.id, copy.id, { pos: place(tile) });
    ids.set(tile.id, copy.id);
  }
  const links = canvas.links.filter((link) => ids.has(link.from) && ids.has(link.to));
  if (links.length) {
    await changeCanvas(slug, video.id, (target) => {
      for (const link of links) target.links.push({ ...link, id: `${link.id}_c`, from: ids.get(link.from)!, to: ids.get(link.to)! });
    });
  }
  // The video's first read of its Board would look for the idea's sources to add: there are none, and this keeps it that way.
  await store.writeFileAtomic(path.join(store.researchDir(slug, video.id), '.seeded'), 'seeded\n');
  return { video: await store.readVideo(slug, video.id), tiles: chosen.length };
}

/** What a video made from Research looked like when it was made, so the companion's Undo can tell whether anything changed since. */
export async function videoSignature(slug: string, videoId: string): Promise<string> {
  const video = await store.readVideo(slug, videoId);
  const tiles = await boardTiles(slug, videoId);
  const outline = await fs.stat(path.join(store.videoDir(slug, videoId), 'outline.md')).then(() => true, () => false);
  return JSON.stringify({ title: video.title, stage: video.stage, hidden: video.hidden ?? null, outline, tiles: tiles.map((tile) => [tile.id, tile.kind, tile.text ?? '', tile.title ?? '']).sort() });
}
