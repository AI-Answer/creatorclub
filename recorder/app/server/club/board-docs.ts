import { createHash, randomBytes } from 'node:crypto';
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

/**
 * The video's `notes` folder, made when `make` is set. A link in its place is refused (a link could lead out of the video's folder), so nothing
 * is listed from it, written into it or set aside in it. Returns undefined when there is no folder to use.
 */
async function notesDirOf(videoDir: string, make = false): Promise<string | undefined> {
  const dir = path.join(videoDir, NOTES_DIR);
  let stat = await fs.lstat(dir).catch((error) => (isMissing(error) ? undefined : Promise.reject(error)));
  if (!stat && make) {
    await fs.mkdir(dir, { recursive: true });
    stat = await fs.lstat(dir);
  }
  if (!stat) return undefined;
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    if (make) throw new ClubError("The notes folder in this video's folder is a link, so nothing can be saved in it.");
    return undefined;
  }
  return dir;
}

/** The Markdown and text files of a video's folder: the ones next to its data, and everything in its `notes` folder. */
export async function listVideoDocs(videoDir: string): Promise<DocInfo[]> {
  const out: DocInfo[] = [];
  await walk(videoDir, '', 0, out, MAX_VIDEO_DOCS, (rel) => APP_FILES.has(rel));
  if (await notesDirOf(videoDir)) await walk(videoDir, NOTES_DIR, NOTES_DEPTH, out, MAX_VIDEO_DOCS);
  return out;
}

export async function listFolderDocs(folder: string): Promise<DocInfo[]> {
  const out: DocInfo[] = [];
  await walk(folder, '', FOLDER_DEPTH, out, MAX_FOLDER_DOCS);
  return out;
}

// ---------------------------------------------------------------- which files the app made, and which cards were dismissed

/**
 * `board-files.json` in the video's folder: the files in `notes` that the app made (only those are ever moved aside when their card is removed),
 * and the files of other writers whose card was removed (they are left where they are and get no card again until "Show hidden files").
 */
interface Manifest {
  created: string[];
  dismissed: string[];
}
const manifestFile = (videoDir: string) => path.join(videoDir, 'board-files.json');

async function readManifest(videoDir: string): Promise<Manifest> {
  const saved = await store.readJSON<Partial<Manifest>>(manifestFile(videoDir)).catch(() => undefined);
  return { created: [...new Set(saved?.created ?? [])], dismissed: [...new Set(saved?.dismissed ?? [])] };
}

function updateManifest(videoDir: string, change: (manifest: Manifest) => void): Promise<Manifest> {
  return store.withLock(`manifest:${videoDir}`, async () => {
    const manifest = await readManifest(videoDir);
    change(manifest);
    await store.writeJSON(manifestFile(videoDir), manifest);
    return manifest;
  });
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

/** The file's own line ending and byte order mark, so saving a note does not change how its file is written. */
function inFileStyle(next: string, current: string | undefined, raw: string | undefined): string {
  let out = next;
  if (raw?.includes('\r\n') && !out.includes('\r')) out = out.replace(/\n/g, '\r\n');
  if (raw?.startsWith('\uFEFF') && !out.startsWith('\uFEFF')) out = `\uFEFF${out}`;
  return current === undefined ? next : out;
}

export interface SaveOptions {
  /** Called after the file was read and the new text written to a temporary file, just before it replaces the file. Tests use it to change the file at that moment. */
  beforeCommit?: () => Promise<void>;
}

/**
 * Saves a note's text. `base` is the hash of what the writer was looking at; when the file holds something else now (an agent or you wrote it in the
 * meantime) the newer text from the writer still wins, and the other version is kept as a new file in the video's `notes` folder so nothing is lost.
 * The file is checked again just before it is replaced: if it changed since it was read, it is read again and the same rule applies.
 */
export async function saveDoc(videoDir: string, root: string, rel: string, text: string, base?: string, options: SaveOptions = {}): Promise<Saved> {
  if (Buffer.byteLength(text) > MAX_DOC_BYTES) throw new ClubError('That note is too long to save. The limit is 1 MB.');
  const full = await resolveDoc(root, rel);
  return store.withLock(`doc:${full}`, async () => {
    const next = normalize(text);
    let conflict: DocConflict | undefined;
    let copied: string | undefined;
    for (let attempt = 0; ; attempt++) {
      const before = await fs.stat(full).catch((error) => (isMissing(error) ? undefined : Promise.reject(error)));
      const raw = before ? await fs.readFile(full, 'utf8') : undefined;
      const current = raw === undefined ? undefined : normalize(raw);
      if (current !== undefined && current !== next && base !== undefined && hashOf(current) !== base && current.trim() && current !== copied) {
        const dir = await notesDirOf(videoDir, true);
        const ext = path.extname(full);
        const name = await freeName(dir!, `${path.basename(full, ext)} (other version)`, ext);
        await store.writeFileAtomic(path.join(dir!, name), current);
        await updateManifest(videoDir, (manifest) => void manifest.created.push(`${NOTES_DIR}/${name}`));
        conflict = { copy: `${NOTES_DIR}/${name}` };
        copied = current;
      }
      if (current === next) return { hash: hashOf(next), ...(conflict ? { conflict } : {}) };
      const temp = path.join(path.dirname(full), `.${path.basename(full)}.${randomBytes(4).toString('hex')}.tmp`);
      await fs.writeFile(temp, inFileStyle(next, current, raw));
      try {
        await options.beforeCommit?.();
        const now = await fs.stat(full).catch((error) => (isMissing(error) ? undefined : Promise.reject(error)));
        const changed = !!before && (!now || now.mtimeMs !== before.mtimeMs || now.size !== before.size);
        // Someone wrote the file while this save was on its way: read it again, keep what they wrote, then write.
        if (changed && attempt < 3) {
          await fs.rm(temp, { force: true });
          continue;
        }
        await fs.rename(temp, full);
      } catch (error) {
        await fs.rm(temp, { force: true });
        throw error;
      }
      return { hash: hashOf(next), ...(conflict ? { conflict } : {}) };
    }
  });
}

/** A new Markdown file in the video's `notes` folder, named after the first line of `text`. Returns its path in the video's folder. */
export async function createDoc(videoDir: string, text: string, stem = stemOf(text), ext = '.md'): Promise<string> {
  const dir = (await notesDirOf(videoDir, true))!;
  // The name is taken by writing it new, so two notes made at once never share a file.
  for (let attempt = 0; attempt < 20; attempt++) {
    const name = await freeName(dir, stem, ext);
    try {
      await fs.writeFile(path.join(dir, name), normalize(text), { flag: 'wx' });
      await updateManifest(videoDir, (manifest) => void manifest.created.push(`${NOTES_DIR}/${name}`));
      return `${NOTES_DIR}/${name}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new ClubError("Couldn't make a file for that note.");
}

/** A name for a new note's file, taken from its first line, without making the file. */
async function planDoc(videoDir: string, text: string, stem = stemOf(text), ext = '.md'): Promise<string> {
  const dir = (await notesDirOf(videoDir, true))!;
  return `${NOTES_DIR}/${await freeName(dir, stem, ext)}`;
}

/** Moves a file out of the video's folder into `notes/.removed`, where nothing lists it but it can be found again. */
async function setAside(videoDir: string, rel: string) {
  const full = await resolveDoc(videoDir, rel);
  const dir = path.join((await notesDirOf(videoDir, true))!, REMOVED_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.rename(full, path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${path.basename(full)}`)).catch((error) => (isMissing(error) ? undefined : Promise.reject(error)));
}

// ---------------------------------------------------------------- the channel's Notes folder

const configFile = (slug: string) => path.join(store.workspaceDir(slug), 'notes-folder.json');

export async function notesFolder(slug: string): Promise<string | undefined> {
  const saved = await store.readJSON<{ path?: string }>(configFile(slug)).catch(() => undefined);
  return saved?.path;
}

const inside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);
const real = (target: string) => fs.realpath(target).catch(() => path.resolve(target));
/** Folders that are a whole system or the root of something: only these exact folders are refused. */
const BROAD = ['/Users', '/private', '/Library', '/System', '/usr', '/etc', '/var', '/bin', '/sbin', '/opt', '/Applications', '/dev', '/tmp', '/home', '/root'];
/** Folders nothing inside may be used from either. */
const SYSTEM = ['/System', '/usr', '/etc', '/bin', '/sbin', '/Library', '/private/etc', '/dev'];

/** Why a folder cannot be the Notes folder, or nothing when it can: the computer's own folders, your home folder and the ones above it, and the folders Creator Compiler keeps its own files in. */
export async function refusedFolder(folder: string): Promise<string | undefined> {
  const home = await real(os.homedir());
  if (folder === path.parse(folder).root || BROAD.includes(folder) || inside(home, folder) || SYSTEM.some((system) => inside(folder, system))) return 'Pick a folder with your notes in it, not your whole computer.';
  for (const own of [store.rootDir(), store.secretsDir()]) {
    const ours = await real(own);
    if (inside(folder, ours) || inside(ours, folder)) return 'That folder is where Creator Compiler keeps its own files. Pick another one.';
  }
  return undefined;
}

/** Picks the folder to take notes from, or `null` to stop. The folder has to exist and be fit for notes (see `refusedFolder`); it is kept by its real path. */
export async function setNotesFolder(slug: string, folder: string | null): Promise<string | null> {
  if (folder === null) {
    await store.writeJSON(configFile(slug), {});
    return null;
  }
  const given = folder.trim().replace(/^~(?=$|\/)/, os.homedir());
  if (!path.isAbsolute(given)) throw new ClubError('Type the whole path of the folder, like /Users/you/Notes.');
  let found: string;
  try {
    found = await fs.realpath(given);
    if (!(await fs.stat(found)).isDirectory()) throw new Error('not a folder');
  } catch {
    throw new ClubError("That folder doesn't exist on this computer.");
  }
  const refused = await refusedFolder(found);
  if (refused) throw new ClubError(refused);
  await store.writeJSON(configFile(slug), { path: found });
  return found;
}

// ---------------------------------------------------------------- tiles

const shorten = (full: string) => (full === os.homedir() || full.startsWith(os.homedir() + path.sep) ? `~${full.slice(os.homedir().length)}` : full);

/** The folder a note's file is in, when the card may use it: a pinned file only while its Notes folder is still the Notes folder. */
async function rootOf(slug: string, videoId: string, doc: TileDoc): Promise<string | undefined> {
  if (doc.root === 'video') return store.boardDir(slug, videoId);
  const folder = await notesFolder(slug);
  return folder && doc.folder === folder ? folder : undefined;
}

const OTHER_VERSION = / \(other version\)(?:-\d+)?\.\w+$/;

/** Fills each note's `text` from its file (so everything that reads the Board reads the Markdown), adds the file's hash, and names the card after the file's first heading. */
export async function hydrate(slug: string, videoId: string, tiles: readonly ResearchTile[]): Promise<ResearchTile[]> {
  return Promise.all(
    tiles.map(async (tile) => {
      if (!tile.doc) return tile;
      const root = await rootOf(slug, videoId, tile.doc);
      const read: Read = root ? await readDoc(root, tile.doc.path) : { missing: true };
      const { hash: _old, missing: _m, tooLarge: _t, pending: _p, ...kept } = tile.doc;
      // A copy kept after a clash says so on its card, so it is not taken for the note it was copied from.
      const suffix = OTHER_VERSION.test(tile.doc.path) ? ' (other version)' : '';
      if ('text' in read) return { ...tile, text: read.text, title: `${docTitle(read.text, tile.doc.path)}${suffix}`.slice(0, 100), doc: { ...kept, hash: read.hash } };
      return { ...tile, text: '', title: path.basename(tile.doc.path), doc: { ...kept, ...read } };
    }),
  );
}

const newDocTile = (tiles: readonly ResearchTile[], doc: TileDoc): ResearchTile => ({ id: store.newTileId(), kind: 'note', meta: {}, pos: freeSpot(tiles, 'note'), doc, createdAt: store.nowIso() });

/** Makes the file of a note at the path planned for it. A file already there is left alone. */
async function writeNew(videoDir: string, rel: string, text: string) {
  const dir = (await notesDirOf(videoDir, true))!;
  await fs.writeFile(path.join(dir, path.basename(rel)), normalize(text), { flag: 'wx' }).catch((error) => (error.code === 'EEXIST' ? undefined : Promise.reject(error)));
  await updateManifest(videoDir, (manifest) => void manifest.created.push(rel));
}

/**
 * Brings the Board and the video's folder together: a note kept as text in its tile gets a Markdown file (the text is kept in the tile as well, as a copy),
 * and a Markdown or text file in the video's folder that has no card gets one, unless its card was removed before. Safe to run again and again: the
 * path of a note's file is written in its tile before the file is made, so a stop in between leaves no second file behind.
 */
export function syncBoard(slug: string, videoId: string): Promise<void> {
  return store.boardLock(slug, videoId, async () => {
    const dir = store.boardDir(slug, videoId);
    const tiles = await store.listTiles(slug, videoId);
    for (const tile of tiles) {
      if (tile.kind === 'note' && !tile.doc) {
        tile.doc = { root: 'video', path: await planDoc(dir, tile.text ?? ''), pending: true };
        await store.writeTile(slug, videoId, tile);
      }
      if (tile.doc?.pending) {
        await writeNew(dir, tile.doc.path, tile.text ?? '');
        delete tile.doc.pending;
        await store.writeTile(slug, videoId, tile);
      }
    }
    const { dismissed } = await readManifest(dir);
    const known = new Set([...dismissed, ...tiles.flatMap((tile) => (tile.doc?.root === 'video' ? [tile.doc.path] : []))]);
    for (const file of await listVideoDocs(dir)) {
      if (known.has(file.path)) continue;
      const tile = newDocTile(tiles, { root: 'video', path: file.path });
      tiles.push(tile);
      await store.writeTile(slug, videoId, tile);
    }
  });
}

/*
 * What other parts of the app (the companion, the prompts) call:
 *   boardTiles(slug, videoId)            the Board's tiles; notes carry their Markdown in `text`, so read `text`, never an old copy
 *   addNote(slug, videoId, text)         a new note (a file in the video's notes folder) and its tile
 *   removeNote(slug, videoId, tileId)    takes a note off the Board; the file the app made is set aside, any other file is left where it is
 *   saveNote(slug, videoId, tile, text, base?)   writes a note's text to its file, with the conflict rule
 */

/** The Board's tiles as the screen and the prompts read them: synced with the folder, notes filled from their files. */
export async function boardTiles(slug: string, videoId: string): Promise<ResearchTile[]> {
  await store.seedIdeaTiles(slug, videoId);
  await syncBoard(slug, videoId);
  return hydrate(slug, videoId, await store.listPlacedTiles(slug, videoId));
}

/** A new note on the Board, as a file. */
export function addNote(slug: string, videoId: string, text = ''): Promise<ResearchTile> {
  return store.boardLock(slug, videoId, async () => {
    const dir = store.boardDir(slug, videoId);
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
  if (!root) throw new ClubError("That file is in a Notes folder that is not the current one, so it can't be saved here.");
  const saved = await saveDoc(store.boardDir(slug, videoId), root, tile.doc.path, text, base);
  const [shown] = await hydrate(slug, videoId, [tile]);
  return { tile: shown, ...(saved.conflict ? { conflict: saved.conflict } : {}) };
}

/**
 * Takes a note off the Board. A file the app made in the video's `notes` folder is set aside (not deleted) so it does not come back. Any other file in the
 * video's folder (a `CLAUDE.md` an agent keeps there, say) is left exactly where it is and gets no card again until "Show hidden files". A pinned file in
 * your Notes folder is left alone.
 */
export function removeNote(slug: string, videoId: string, tileId: string): Promise<void> {
  return store.boardLock(slug, videoId, async () => {
    const dir = store.boardDir(slug, videoId);
    const tile = await store.readTile(slug, videoId, tileId);
    if (tile.doc?.root === 'video') {
      const rel = tile.doc.path;
      const { created } = await readManifest(dir);
      if (rel.startsWith(`${NOTES_DIR}/`) && created.includes(rel)) {
        await setAside(dir, rel);
        await updateManifest(dir, (manifest) => void (manifest.created = manifest.created.filter((path_) => path_ !== rel)));
      } else await updateManifest(dir, (manifest) => void manifest.dismissed.push(rel));
    }
    await store.deleteTile(slug, videoId, tileId);
  });
}

/** Brings back the cards of files that were removed from the Board but are still in the video's folder. Returns how many files that is. */
export function showHidden(slug: string, videoId: string): Promise<number> {
  return store.boardLock(slug, videoId, async () => {
    const dir = store.boardDir(slug, videoId);
    const { dismissed } = await readManifest(dir);
    await updateManifest(dir, (manifest) => void (manifest.dismissed = []));
    return dismissed.length;
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
    const dir = store.boardDir(slug, videoId);
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
    const existing = tiles.find((tile) => tile.doc?.root === 'folder' && tile.doc.path === rel && tile.doc.folder === folder);
    const tile = existing ?? newDocTile(tiles, { root: 'folder', path: rel, folder });
    if (!existing) await store.writeTile(slug, videoId, tile);
    return (await hydrate(slug, videoId, [tile]))[0];
  });
}

/** Where the video's folder is, and what the Notes folder holds. */
export async function boardFiles(slug: string, videoId: string): Promise<BoardFiles> {
  const dir = store.boardDir(slug, videoId);
  const { dismissed } = await readManifest(dir);
  const hidden = (await Promise.all(dismissed.map((rel) => readDoc(dir, rel)))).filter((read) => !('missing' in read)).length;
  const result: BoardFiles = { folder: { path: dir, display: shorten(dir), hidden }, notes: null };
  const folder = await notesFolder(slug);
  if (!folder) return result;
  const [files, tiles] = await Promise.all([listFolderDocs(folder), store.listTiles(slug, videoId)]);
  const pinned = new Set(tiles.flatMap((tile) => (tile.doc?.root === 'folder' && tile.doc.folder === folder ? [tile.doc.path] : [])));
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
