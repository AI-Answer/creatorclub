import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BoardFiles, DocConflict, NotesFile, ResearchTile, TileDoc } from '../../shared/club.js';
import { ClubError, notFound } from './errors.js';
import { freeSpot } from './tile-layout.js';
import * as store from './store.js';

/*
 * The Board's notes are Markdown files, so any agent can read and write them. A note made in the app lives in the video's `notes` folder;
 * Markdown or text files that an agent (or you) put in the video's folder show up as cards too, and the channel's Notes folder holds files
 * you can pin. Every path that comes from outside is checked here: nothing outside the folder it belongs to is read or written, and a
 * symbolic link is never followed.
 */

export const NOTES_DIR = 'notes';
const REMOVED_DIR = '.removed';
export const MAX_DOC_BYTES = 1_000_000;
/** The most cards the video's folder adds to the Board by itself, and the most files the Notes folder lists. */
export const MAX_VIDEO_DOCS = 100;
export const MAX_FOLDER_DOCS = 500;
const FOLDER_DEPTH = 3;
const NOTES_DEPTH = 2;
const EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
/** Files the app itself keeps in the video's folder. */
const APP_FILES = new Set(['outline.md', 'script.md']);
const SKIPPED_DIRS = new Set(['node_modules']);
// Editor and download leftovers: swap files, backups, lock files, partial downloads.
const TEMPORARY = /^[.~#]|[~#]$|\.(?:tmp|temp|swp|swx|swo|part|crdownload|bak|orig)$/i;

export const isDocName = (name: string) => EXTENSIONS.has(path.extname(name).toLowerCase()) && !TEMPORARY.test(name);

export const hashOf = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

const normalize = (raw: string) => raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const OUTSIDE = 'That file is not in the folder.';

// ---------------------------------------------------------------- safe paths

/**
 * The full path of `rel` inside `root`, or an error. `rel` is `a/b.md` style: no empty, `.` or `..` parts, no hidden parts, no backslash,
 * a Markdown or text extension. Every part that exists must be a real folder or file, never a link, so a path cannot lead out of `root`.
 */
export async function resolveDoc(root: string, rel: unknown): Promise<string> {
  if (typeof rel !== 'string' || !rel || rel.length > 300 || rel.includes('\0') || rel.includes('\\') || path.isAbsolute(rel)) throw new ClubError(OUTSIDE);
  const parts = rel.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) throw new ClubError(OUTSIDE);
  if (!isDocName(parts[parts.length - 1])) throw new ClubError('Only Markdown and text files can be on the board.');
  let current: string;
  try {
    current = await fs.realpath(root);
  } catch {
    throw new ClubError(OUTSIDE);
  }
  const base = current;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch((error) => (isMissing(error) ? undefined : Promise.reject(error)));
    if (!stat) return path.join(base, ...parts);
    const last = index === parts.length - 1;
    if (stat.isSymbolicLink() || (last ? !stat.isFile() : !stat.isDirectory())) throw new ClubError(OUTSIDE);
  }
  return current;
}

// ---------------------------------------------------------------- listing

export interface DocInfo {
  path: string;
  bytes: number;
  mtimeMs: number;
}

async function walk(base: string, relDir: string, depth: number, out: DocInfo[], max: number, skip?: (rel: string) => boolean) {
  let entries;
  try {
    entries = await fs.readdir(path.join(base, relDir), { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (out.length >= max) return;
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (depth > 0 && !SKIPPED_DIRS.has(entry.name)) await walk(base, rel, depth - 1, out, max, skip);
    } else if (entry.isFile() && isDocName(entry.name) && !skip?.(rel)) {
      const stat = await fs.stat(path.join(base, rel)).catch(() => undefined);
      if (stat) out.push({ path: rel, bytes: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
}

/** The Markdown and text files of a video's folder: the ones next to its data, and everything in its `notes` folder. */
export async function listVideoDocs(videoDir: string): Promise<DocInfo[]> {
  const out: DocInfo[] = [];
  await walk(videoDir, '', 0, out, MAX_VIDEO_DOCS, (rel) => APP_FILES.has(rel));
  await walk(videoDir, NOTES_DIR, NOTES_DEPTH, out, MAX_VIDEO_DOCS);
  return out;
}

export async function listFolderDocs(folder: string): Promise<DocInfo[]> {
  const out: DocInfo[] = [];
  await walk(folder, '', FOLDER_DEPTH, out, MAX_FOLDER_DOCS);
  return out;
}

// ---------------------------------------------------------------- reading and writing

export type Read = { text: string; hash: string } | { tooLarge: true } | { missing: true };

export async function readDoc(root: string, rel: string): Promise<Read> {
  let full: string;
  try {
    full = await resolveDoc(root, rel);
    const stat = await fs.stat(full);
    if (stat.size > MAX_DOC_BYTES) return { tooLarge: true };
    const text = normalize(await fs.readFile(full, 'utf8'));
    return { text, hash: hashOf(text) };
  } catch (error) {
    if (error instanceof ClubError || isMissing(error)) return { missing: true };
    throw error;
  }
}

/** A name for a file in `dir` that is not taken: `stem.md`, then `stem-2.md`, … */
async function freeName(dir: string, stem: string, ext: string): Promise<string> {
  for (let n = 1; ; n++) {
    const name = `${stem}${n > 1 ? `-${n}` : ''}${ext}`;
    if (!(await fs.lstat(path.join(dir, name)).then(() => true, () => false))) return name;
  }
}

/** A file name stem from the first line of a note: lower case words, 40 characters at most. */
export function stemOf(text: string, fallback = 'note'): string {
  const line = text.split('\n').find((candidate) => candidate.trim()) ?? '';
  const words = line.replace(/[#>*_`~[\]()-]|^\s*\d+\./g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return words || fallback;
}

/** The title a card shows: the first heading, else the first line, else the file's name. */
export function docTitle(text: string, rel: string): string {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const heading = lines.find((line) => /^#{1,6}\s+\S/.test(line));
  const line = (heading ?? lines[0] ?? '').replace(/^#{1,6}\s+/, '').replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '').replace(/[*_`~]/g, '').trim();
  return (line || path.basename(rel).replace(/\.[^.]+$/, '')).slice(0, 80);
}

export interface Saved {
  hash: string;
  conflict?: DocConflict;
}

/**
 * Saves a note's text. `base` is the hash of what the writer was looking at; when the file holds something else now (an agent or you wrote it in the
 * meantime) the newer text from the writer still wins, and the other version is kept as a new file in the video's `notes` folder so nothing is lost.
 */
export async function saveDoc(videoDir: string, root: string, rel: string, text: string, base?: string): Promise<Saved> {
  if (Buffer.byteLength(text) > MAX_DOC_BYTES) throw new ClubError('That note is too long to save. The limit is 1 MB.');
  const full = await resolveDoc(root, rel);
  return store.withLock(`doc:${full}`, async () => {
      const next = normalize(text);
      const current = await fs.readFile(full, 'utf8').then(normalize, (error) => (isMissing(error) ? undefined : Promise.reject(error)));
      let conflict: DocConflict | undefined;
      if (current !== undefined && current !== next && base !== undefined && hashOf(current) !== base && current.trim()) {
        const dir = path.join(videoDir, NOTES_DIR);
        const ext = path.extname(full);
        const name = await freeName(dir, `${path.basename(full, ext)} (other version)`, ext);
        await store.writeFileAtomic(path.join(dir, name), current);
        conflict = { copy: `${NOTES_DIR}/${name}` };
      }
      if (current !== next) await store.writeFileAtomic(full, next);
      return { hash: hashOf(next), ...(conflict ? { conflict } : {}) };
  });
}

/** A new Markdown file in the video's `notes` folder, named after the first line of `text`. Returns its path in the video's folder. */
export async function createDoc(videoDir: string, text: string, stem = stemOf(text), ext = '.md'): Promise<string> {
  const dir = path.join(videoDir, NOTES_DIR);
  await fs.mkdir(dir, { recursive: true });
  // The name is taken by writing it new, so two notes made at once never share a file.
  for (let attempt = 0; attempt < 20; attempt++) {
    const name = await freeName(dir, stem, ext);
    try {
      await fs.writeFile(path.join(dir, name), normalize(text), { flag: 'wx' });
      return `${NOTES_DIR}/${name}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new ClubError("Couldn't make a file for that note.");
}

/** Moves a file out of the video's folder into `notes/.removed`, where nothing lists it but it can be found again. */
async function setAside(videoDir: string, rel: string) {
  const full = await resolveDoc(videoDir, rel);
  const dir = path.join(videoDir, NOTES_DIR, REMOVED_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.rename(full, path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${path.basename(full)}`)).catch((error) => (isMissing(error) ? undefined : Promise.reject(error)));
}

// ---------------------------------------------------------------- the channel's Notes folder

const configFile = (slug: string) => path.join(store.workspaceDir(slug), 'notes-folder.json');

export async function notesFolder(slug: string): Promise<string | undefined> {
  const saved = await store.readJSON<{ path?: string }>(configFile(slug)).catch(() => undefined);
  return saved?.path;
}

/** Picks the folder to take notes from, or `null` to stop. The folder has to exist; it is kept by its real path. */
export async function setNotesFolder(slug: string, folder: string | null): Promise<string | null> {
  if (folder === null) {
    await store.writeJSON(configFile(slug), {});
    return null;
  }
  const given = folder.trim().replace(/^~(?=$|\/)/, os.homedir());
  if (!path.isAbsolute(given)) throw new ClubError('Type the whole path of the folder, like /Users/you/Notes.');
  let real: string;
  try {
    real = await fs.realpath(given);
    if (!(await fs.stat(real)).isDirectory()) throw new Error('not a folder');
  } catch {
    throw new ClubError("That folder doesn't exist on this computer.");
  }
  if (real === path.parse(real).root || real === os.homedir()) throw new ClubError('Pick a folder with your notes in it, not your whole computer.');
  await store.writeJSON(configFile(slug), { path: real });
  return real;
}

// ---------------------------------------------------------------- tiles

const shorten = (full: string) => (full === os.homedir() || full.startsWith(os.homedir() + path.sep) ? `~${full.slice(os.homedir().length)}` : full);

async function rootOf(slug: string, videoId: string, doc: TileDoc): Promise<string | undefined> {
  return doc.root === 'video' ? store.videoDir(slug, videoId) : notesFolder(slug);
}

/** Fills each note's `text` from its file (so everything that reads the Board reads the Markdown), adds the file's hash, and names the card after the file's first heading. */
export async function hydrate(slug: string, videoId: string, tiles: readonly ResearchTile[]): Promise<ResearchTile[]> {
  const folder = await notesFolder(slug);
  return Promise.all(
    tiles.map(async (tile) => {
      if (!tile.doc) return tile;
      const root = tile.doc.root === 'video' ? store.videoDir(slug, videoId) : folder;
      const read: Read = root ? await readDoc(root, tile.doc.path) : { missing: true };
      const { hash: _old, missing: _m, tooLarge: _t, ...kept } = tile.doc;
      if ('text' in read) return { ...tile, text: read.text, title: docTitle(read.text, tile.doc.path), doc: { ...kept, hash: read.hash } };
      return { ...tile, text: '', title: path.basename(tile.doc.path), doc: { ...kept, ...read } };
    }),
  );
}

const newDocTile = (tiles: readonly ResearchTile[], doc: TileDoc): ResearchTile => ({ id: store.newTileId(), kind: 'note', meta: {}, pos: freeSpot(tiles, 'note'), doc, createdAt: store.nowIso() });

/**
 * Brings the Board and the video's folder together: a note kept as text in its tile gets a Markdown file (the text is kept in the tile as well, as a copy),
 * and a Markdown or text file in the video's folder that has no card gets one. Safe to run again and again.
 */
export function syncBoard(slug: string, videoId: string): Promise<void> {
  return store.boardLock(slug, videoId, async () => {
    const dir = store.videoDir(slug, videoId);
    const tiles = await store.listTiles(slug, videoId);
    for (const tile of tiles) {
      if (tile.kind !== 'note' || tile.doc) continue;
      tile.doc = { root: 'video', path: await createDoc(dir, tile.text ?? '') };
      await store.writeTile(slug, videoId, tile);
    }
    const known = new Set(tiles.flatMap((tile) => (tile.doc?.root === 'video' ? [tile.doc.path] : [])));
    for (const file of await listVideoDocs(dir)) {
      if (known.has(file.path)) continue;
      const tile = newDocTile(tiles, { root: 'video', path: file.path });
      tiles.push(tile);
      await store.writeTile(slug, videoId, tile);
    }
  });
}

/** The Board's tiles as the screen and the prompts read them: synced with the folder, notes filled from their files. */
export async function boardTiles(slug: string, videoId: string): Promise<ResearchTile[]> {
  await store.seedIdeaTiles(slug, videoId);
  await syncBoard(slug, videoId);
  return hydrate(slug, videoId, await store.listPlacedTiles(slug, videoId));
}

/** A new note on the Board, as a file. */
export function addNote(slug: string, videoId: string, text = ''): Promise<ResearchTile> {
  return store.boardLock(slug, videoId, async () => {
    const dir = store.videoDir(slug, videoId);
    const rel = await createDoc(dir, text);
    const tile = newDocTile(await store.listTiles(slug, videoId), { root: 'video', path: rel });
    await store.writeTile(slug, videoId, tile);
    return (await hydrate(slug, videoId, [tile]))[0];
  });
}

/** Saves a note's text to its file. Returns the tile as the screen shows it, and says when the file had been changed elsewhere. */
export async function saveNote(slug: string, videoId: string, tile: ResearchTile, text: string, base?: string): Promise<{ tile: ResearchTile; conflict?: DocConflict }> {
  if (!tile.doc) throw new ClubError('That note has no file yet.');
  const root = await rootOf(slug, videoId, tile.doc);
  if (!root) throw new ClubError('The Notes folder is not set.');
  const saved = await saveDoc(store.videoDir(slug, videoId), root, tile.doc.path, text, base);
  const [shown] = await hydrate(slug, videoId, [tile]);
  return { tile: shown, ...(saved.conflict ? { conflict: saved.conflict } : {}) };
}

/** Takes a note off the Board. A file in the video's folder is set aside (not deleted) so it does not come back; a pinned file in your Notes folder is left alone. */
export function removeNote(slug: string, videoId: string, tileId: string): Promise<void> {
  return store.boardLock(slug, videoId, async () => {
    const tile = await store.readTile(slug, videoId, tileId);
    if (tile.doc?.root === 'video') await setAside(store.videoDir(slug, videoId), tile.doc.path);
    await store.deleteTile(slug, videoId, tileId);
  });
}

export interface ImportResult {
  tiles: ResearchTile[];
  skipped: { name: string; reason: string }[];
}

const importStem = (name: string, ext: string) => path.basename(name, ext).replace(/[^\p{L}\p{N} _-]+/gu, '-').replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|-+$/g, '').slice(0, 60).toLowerCase() || 'note';

/** Dropped files become notes in the video's `notes` folder, each with its own card. Anything but Markdown and text, or too large, is skipped with the reason. */
export function importFiles(slug: string, videoId: string, files: readonly { name: string; data: Buffer }[]): Promise<ImportResult> {
  return store.boardLock(slug, videoId, async () => {
    const dir = store.videoDir(slug, videoId);
    const tiles = await store.listTiles(slug, videoId);
    const result: ImportResult = { tiles: [], skipped: [] };
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (!EXTENSIONS.has(ext)) result.skipped.push({ name: file.name, reason: 'Only Markdown and text files can be dropped here.' });
      else if (file.data.length > MAX_DOC_BYTES) result.skipped.push({ name: file.name, reason: 'That file is over 1 MB.' });
      else if (file.data.includes(0)) result.skipped.push({ name: file.name, reason: "That doesn't look like a text file." });
      else {
        const rel = await createDoc(dir, file.data.toString('utf8'), importStem(file.name, ext), ext);
        const tile = newDocTile(tiles, { root: 'video', path: rel });
        tiles.push(tile);
        await store.writeTile(slug, videoId, tile);
        result.tiles.push(tile);
      }
    }
    result.tiles = await hydrate(slug, videoId, result.tiles);
    return result;
  });
}

/** Puts a file from the Notes folder on this video's Board. Pinning it twice gives the same card. */
export function pinNote(slug: string, videoId: string, rel: string): Promise<ResearchTile> {
  return store.boardLock(slug, videoId, async () => {
    const folder = await notesFolder(slug);
    if (!folder) throw new ClubError('Pick a Notes folder first.');
    await resolveDoc(folder, rel);
    if ('missing' in (await readDoc(folder, rel))) throw notFound('file');
    const tiles = await store.listTiles(slug, videoId);
    const existing = tiles.find((tile) => tile.doc?.root === 'folder' && tile.doc.path === rel);
    const tile = existing ?? newDocTile(tiles, { root: 'folder', path: rel });
    if (!existing) await store.writeTile(slug, videoId, tile);
    return (await hydrate(slug, videoId, [tile]))[0];
  });
}

/** Where the video's folder is, and what the Notes folder holds. */
export async function boardFiles(slug: string, videoId: string): Promise<BoardFiles> {
  const dir = store.videoDir(slug, videoId);
  const result: BoardFiles = { folder: { path: dir, display: shorten(dir) }, notes: null };
  const folder = await notesFolder(slug);
  if (!folder) return result;
  const [files, tiles] = await Promise.all([listFolderDocs(folder), store.listTiles(slug, videoId)]);
  const pinned = new Set(tiles.flatMap((tile) => (tile.doc?.root === 'folder' ? [tile.doc.path] : [])));
  const listed: NotesFile[] = await Promise.all(
    files.map(async (file) => {
      const head = await fs.open(path.join(folder, file.path), 'r').then(async (handle) => {
        try {
          const buffer = Buffer.alloc(2048);
          const { bytesRead } = await handle.read(buffer, 0, 2048, 0);
          return buffer.subarray(0, bytesRead).toString('utf8');
        } finally {
          await handle.close();
        }
      }, () => '');
      return { path: file.path, title: docTitle(normalize(head), file.path), bytes: file.bytes, modified: new Date(file.mtimeMs).toISOString(), pinned: pinned.has(file.path) };
    }),
  );
  result.notes = { path: folder, display: shorten(folder), files: listed.sort((a, b) => b.modified.localeCompare(a.modified)), ...(files.length >= MAX_FOLDER_DOCS ? { truncated: true } : {}) };
  return result;
}
