import { promises as fs, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { isDocName, listFolderDocs, listVideoDocs, notesFolder, NOTES_DIR } from './board-docs.js';
import * as store from './store.js';

/*
 * Tells a screen when the files behind a video's Board change: the video's folder (and its `notes` folder) and the channel's Notes folder.
 * `fs.watch` gives the news at once; a slow scan of the same folders is the safety net, and takes over fast when `fs.watch` cannot be used
 * (some network and synced folders). News is held back a moment so a burst of writes gives one message, but never for longer than `maxWaitMs`.
 */

export interface WatchOptions {
  debounceMs?: number;
  maxWaitMs?: number;
  /** How often the folders are scanned while `fs.watch` is working, and when it is not. */
  pollMs?: number;
  pollFastMs?: number;
  /** Use `fs.watch`. Off, only the scan runs (as where `fs.watch` cannot be used); tests turn it off to try that path. */
  native?: boolean;
  /** `fs.watch`; tests pass a stand-in to count the watchers that are opened and closed. */
  watchFn?: typeof watch;
}

const DEFAULTS: Required<WatchOptions> = { debounceMs: 250, maxWaitMs: 1000, pollMs: 4000, pollFastMs: 1000, native: true, watchFn: watch };

/** Whether a change reported by `fs.watch` could matter: a Markdown or text file, or a folder (no extension). A temporary file or a data file does not. */
export function worthKnowing(filename: string | null, onlyFolder?: string): boolean {
  if (!filename) return true;
  const name = path.basename(filename);
  if (name.startsWith('.')) return false;
  if (isDocName(name)) return true;
  // A folder (no extension): any, inside a folder watched all the way down; in the video's folder only `notes`.
  return path.extname(name) === '' && (!onlyFolder || name === onlyFolder);
}

/** Calls `onChange` when a Markdown or text file in the video's folders appears, changes or goes. Returns the function that stops watching. */
export function watchBoard(slug: string, videoId: string, onChange: () => void, options: WatchOptions = {}): () => void {
  const { debounceMs, maxWaitMs, pollMs, pollFastMs, native, watchFn } = { ...DEFAULTS, ...options };
  const videoDir = store.videoDir(slug, videoId);
  const watchers = new Map<string, FSWatcher>();
  let stopped = false;
  let signature: string | undefined;
  let working = native;
  let quiet: NodeJS.Timeout | undefined;
  let first = 0;
  let poll: NodeJS.Timeout | undefined;

  const fire = () => {
    clearTimeout(quiet);
    quiet = undefined;
    first = 0;
    if (!stopped) onChange();
  };
  const soon = () => {
    if (stopped) return;
    first ||= Date.now();
    clearTimeout(quiet);
    quiet = setTimeout(fire, Math.max(0, Math.min(debounceMs, first + maxWaitMs - Date.now())));
  };

  const open = (dir: string, recursive: boolean) => {
    if (!native || watchers.has(dir)) return;
    try {
      const watcher = watchFn(dir, { recursive, persistent: false }, (_event, filename) => {
        // Some systems report a change to the watched folder itself, with its own name; that is not news about a file.
        const name = filename ? String(filename) : null;
        if (name !== path.basename(dir) && worthKnowing(name, dir === videoDir ? NOTES_DIR : undefined)) soon();
        // A new `notes` folder is watched from its first file on.
        if (dir === videoDir && (!filename || String(filename) === NOTES_DIR)) void arm();
      });
      watcher.on('error', () => {
        watcher.close();
        watchers.delete(dir);
        working = false;
      });
      watchers.set(dir, watcher);
    } catch {
      working = false;
    }
  };

  const exists = (dir: string) => fs.stat(dir).then((stat) => stat.isDirectory(), () => false);

  const arm = async () => {
    if (stopped) return;
    open(videoDir, false);
    const notes = path.join(videoDir, NOTES_DIR);
    const folder = await notesFolder(slug).catch(() => undefined);
    if (stopped) return;
    // A `notes` folder that is not made yet is watched once it is. A link in its place is not followed.
    const notesReal = await fs.lstat(notes).then((stat) => stat.isDirectory(), () => false);
    const folderThere = folder ? await exists(folder) : false;
    // The checks above take time; a watcher stopped meanwhile must not open anything new.
    if (stopped) return;
    if (notesReal) open(notes, true);
    if (folder && folderThere) open(folder, true);
    // Folders that are no longer wanted (the Notes folder was changed) stop being watched.
    for (const [dir, watcher] of watchers) {
      if (dir !== videoDir && dir !== notes && dir !== folder) {
        watcher.close();
        watchers.delete(dir);
      }
    }
  };

  const scan = async () => {
    if (stopped) return;
    try {
      const folder = await notesFolder(slug).catch(() => undefined);
      const lists = await Promise.all([listVideoDocs(videoDir), folder ? listFolderDocs(folder) : []]);
      const next = lists.map((list) => list.map((file) => `${file.path}:${file.bytes}:${file.mtimeMs}`).join('|')).join('||');
      if (signature !== undefined && next !== signature) soon();
      signature = next;
      await arm();
    } catch {
      /* the next scan tries again */
    }
    if (!stopped) poll = setTimeout(() => void scan(), working ? pollMs : pollFastMs);
  };

  void arm().then(() => scan());
  return () => {
    stopped = true;
    clearTimeout(quiet);
    clearTimeout(poll);
    for (const watcher of watchers.values()) watcher.close();
    watchers.clear();
  };
}

// One watcher per video however many screens are open on it.
const hubs = new Map<string, { listeners: Set<() => void>; stop: () => void }>();

/** Subscribes to a video's file changes. The first subscriber starts the watching, the last one to leave stops it. */
export function subscribeBoard(slug: string, videoId: string, listener: () => void, options?: WatchOptions): () => void {
  const key = `${slug}/${videoId}`;
  let hub = hubs.get(key);
  if (!hub) {
    const listeners = new Set<() => void>();
    hub = { listeners, stop: watchBoard(slug, videoId, () => listeners.forEach((fn) => fn()), options) };
    hubs.set(key, hub);
  }
  hub.listeners.add(listener);
  const mine = hub;
  return () => {
    mine.listeners.delete(listener);
    if (!mine.listeners.size && hubs.get(key) === mine) {
      mine.stop();
      hubs.delete(key);
    }
  };
}
