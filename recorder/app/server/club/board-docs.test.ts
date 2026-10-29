import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ResearchTile } from '../../shared/club.js';

/*
 * The Board's Markdown files: safe paths, notes as files, the migration of notes kept as text, files that appear in the video's folder,
 * the Notes folder, dropped files, a note changed elsewhere while it is written, and the watcher.
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-docs-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');
const store = await import('./store.js');
const docs = await import('./board-docs.js');
const { watchBoard, worthKnowing } = await import('./board-watch.js');
after(() => rm(temp, { recursive: true, force: true }));

const slug = (await store.createWorkspace({ name: 'Maya Lopez', handle: '@maya', channelUrl: undefined, topics: ['claude'], about: 'Practical AI.', cta: '' } as unknown as Parameters<typeof store.createWorkspace>[0])).slug;
const makeVideo = async (title: string) => (await store.createVideo(slug, { title })).id;
const dirOf = (id: string) => store.videoDir(slug, id);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- paths

test('a path is only taken inside its folder: no traversal, no hidden parts, no links out, only Markdown and text', async () => {
  const root = path.join(temp, 'safe');
  await mkdir(path.join(root, 'sub'), { recursive: true });
  const outside = path.join(temp, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'secret.md'), 'secret');
  await writeFile(path.join(root, 'sub', 'a.md'), 'a');
  await symlink(outside, path.join(root, 'link'));
  await symlink(path.join(outside, 'secret.md'), path.join(root, 'file-link.md'));

  assert.equal(await docs.resolveDoc(root, 'sub/a.md'), path.join(await (await import('node:fs/promises')).realpath(root), 'sub', 'a.md'));
  for (const bad of ['../outside/secret.md', 'sub/../../outside/secret.md', '/etc/passwd', 'sub//a.md', './a.md', '.hidden.md', 'sub/.x/a.md', 'a\\b.md', 'a\0.md', '', 'sub/a.exe', 'sub/a.md/../../x.md', 'link/secret.md', 'file-link.md']) {
    await assert.rejects(docs.resolveDoc(root, bad), /not in the folder|Only Markdown/, JSON.stringify(bad));
  }
  await assert.rejects(docs.resolveDoc(root, 5 as unknown as string));
  // A file that does not exist yet can be named, so it can be made.
  assert.ok((await docs.resolveDoc(root, 'sub/new.md')).endsWith(path.join('sub', 'new.md')));
  // A link is never listed or read either.
  assert.deepEqual((await docs.listFolderDocs(root)).map((file) => file.path), ['sub/a.md']);
  assert.deepEqual(await docs.readDoc(root, 'file-link.md'), { missing: true });
});

test('temporary, hidden and app files are not notes', async () => {
  for (const name of ['a.md', 'B.MD', 'c.txt', 'd.markdown']) assert.ok(docs.isDocName(name), name);
  for (const name of ['.a.md', '~a.md', 'a.md~', '.#a.md', '#a.md#', 'a.md.swp', 'a.md.tmp', 'a.txt.part', 'a.json', 'a.png', 'a.md.crdownload']) assert.ok(!docs.isDocName(name), name);
  assert.ok(worthKnowing(null) && worthKnowing('a.md') && worthKnowing('notes') && !worthKnowing('other', 'notes') && worthKnowing('other') && !worthKnowing('package.json') && !worthKnowing('.a.md.1234.tmp') && !worthKnowing('notes/x.md.swp'));
});

// ---------------------------------------------------------------- notes as files

test('a new note is a file in the video\'s notes folder, named after its first line; two with one name get two files', async () => {
  const id = await makeVideo('Notes as files');
  const first = await docs.addNote(slug, id, '# Hook ideas\n\n- one');
  assert.equal(first.doc?.path, 'notes/hook-ideas.md');
  assert.equal(first.text, '# Hook ideas\n\n- one');
  assert.equal(first.title, 'Hook ideas');
  assert.equal(await readFile(path.join(dirOf(id), 'notes', 'hook-ideas.md'), 'utf8'), '# Hook ideas\n\n- one');
  const second = await docs.addNote(slug, id, '# Hook ideas');
  assert.equal(second.doc?.path, 'notes/hook-ideas-2.md');
  const blank = await docs.addNote(slug, id);
  assert.equal(blank.doc?.path, 'notes/note.md');
  assert.equal(blank.text, '');
  const [both] = await Promise.all([Promise.all([docs.addNote(slug, id, 'same'), docs.addNote(slug, id, 'same')])]);
  assert.notEqual(both[0].doc?.path, both[1].doc?.path, 'two made at once do not share a file');
  assert.equal(new Set((await store.listTiles(slug, id)).map((tile) => tile.pos && `${tile.pos.x},${tile.pos.y}`)).size, 5, 'and each has its own place');
});

test('a note kept as text in its tile is given a file, once, and the text stays in the tile as a copy', async () => {
  const id = await makeVideo('Migration');
  const researchDir = store.researchDir(slug, id);
  await mkdir(researchDir, { recursive: true });
  await writeFile(path.join(researchDir, 't_old.json'), JSON.stringify({ id: 't_old', kind: 'note', text: 'My old note\nwith two lines', meta: {}, createdAt: '2026-10-01T00:00:00.000Z' }));
  await writeFile(path.join(researchDir, 't_empty.json'), JSON.stringify({ id: 't_empty', kind: 'note', meta: {}, createdAt: '2026-10-02T00:00:00.000Z' }));
  await writeFile(path.join(researchDir, 't_link.json'), JSON.stringify({ id: 't_link', kind: 'link', url: 'https://example.com', meta: {}, createdAt: '2026-10-03T00:00:00.000Z' }));
  const tiles = await docs.boardTiles(slug, id);
  const old = tiles.find((tile) => tile.id === 't_old')!;
  assert.deepEqual([old.text, old.doc?.root, old.title], ['My old note\nwith two lines', 'video', 'My old note']);
  assert.equal(await readFile(path.join(dirOf(id), old.doc!.path), 'utf8'), 'My old note\nwith two lines');
  assert.equal(JSON.parse(await readFile(path.join(researchDir, 't_old.json'), 'utf8')).text, 'My old note\nwith two lines', 'the text is kept in the tile too');
  assert.equal(tiles.find((tile) => tile.id === 't_link')?.doc, undefined);
  const again = await docs.boardTiles(slug, id);
  assert.deepEqual(again.map((tile) => tile.doc?.path), tiles.map((tile) => tile.doc?.path), 'running it again changes nothing');
  assert.equal((await readdir(path.join(dirOf(id), 'notes'))).length, 2);
});

test('files that appear in the video\'s folder get a card; the app\'s own Markdown, hidden and temporary files do not', async () => {
  const id = await makeVideo('Agent files');
  const dir = dirOf(id);
  await writeFile(path.join(dir, 'outline.md'), '# the outline');
  await writeFile(path.join(dir, 'script.md'), 'the script');
  await writeFile(path.join(dir, 'ideas.md'), '# Ideas\n\n- from an agent');
  await writeFile(path.join(dir, 'log.txt'), 'plain text');
  await writeFile(path.join(dir, '.hidden.md'), 'x');
  await writeFile(path.join(dir, 'ideas.md.swp'), 'x');
  await writeFile(path.join(dir, 'data.json'), '{}');
  await mkdir(path.join(dir, 'notes'));
  await writeFile(path.join(dir, 'notes', 'deep.md'), 'deep');
  await mkdir(path.join(dir, 'other'));
  await writeFile(path.join(dir, 'other', 'ignored.md'), 'not watched');
  const tiles = await docs.boardTiles(slug, id);
  assert.deepEqual(tiles.filter((tile) => tile.doc).map((tile) => tile.doc!.path).sort(), ['ideas.md', 'log.txt', 'notes/deep.md']);
  assert.equal(tiles.find((tile) => tile.doc?.path === 'ideas.md')?.title, 'Ideas');
  // A file made later gets its card the next time; an edited file keeps its card and shows its new text.
  await writeFile(path.join(dir, 'later.md'), 'later');
  await writeFile(path.join(dir, 'ideas.md'), '# Ideas v2');
  const next = await docs.boardTiles(slug, id);
  assert.equal(next.filter((tile) => tile.doc).length, 4);
  assert.equal(next.find((tile) => tile.doc?.path === 'ideas.md')?.text, '# Ideas v2');
  assert.equal(next.find((tile) => tile.doc?.path === 'ideas.md')?.id, tiles.find((tile) => tile.doc?.path === 'ideas.md')?.id);
});

test('a file that is gone leaves its card, marked missing; one over the limit is not read', async () => {
  const id = await makeVideo('Missing');
  await writeFile(path.join(dirOf(id), 'gone.md'), 'soon gone');
  await writeFile(path.join(dirOf(id), 'huge.md'), 'x'.repeat(docs.MAX_DOC_BYTES + 1));
  await docs.boardTiles(slug, id);
  await rm(path.join(dirOf(id), 'gone.md'));
  const tiles = await docs.boardTiles(slug, id);
  const gone = tiles.find((tile) => tile.doc?.path === 'gone.md')!;
  assert.deepEqual([gone.doc?.missing, gone.text], [true, '']);
  const huge = tiles.find((tile) => tile.doc?.path === 'huge.md')!;
  assert.deepEqual([huge.doc?.tooLarge, huge.text], [true, '']);
  await writeFile(path.join(dirOf(id), 'gone.md'), 'back');
  assert.equal((await docs.boardTiles(slug, id)).find((tile) => tile.doc?.path === 'gone.md')?.text, 'back', 'it shows again when the file is put back');
});

test('removing a note sets its file aside so it does not come back; the card of a pinned file leaves the file alone', async () => {
  const id = await makeVideo('Removing');
  const note = await docs.addNote(slug, id, '# Remove me');
  await docs.removeNote(slug, id, note.id);
  assert.equal(await stat(path.join(dirOf(id), note.doc!.path)).then(() => true, () => false), false);
  assert.equal((await readdir(path.join(dirOf(id), 'notes', '.removed'))).length, 1);
  assert.equal((await docs.boardTiles(slug, id)).filter((tile) => tile.doc).length, 0, 'and no card comes back');
  assert.equal((await readFile(path.join(dirOf(id), 'notes', '.removed', (await readdir(path.join(dirOf(id), 'notes', '.removed')))[0]), 'utf8')), '# Remove me');
});

// ---------------------------------------------------------------- saving and conflicts

test('saving writes the file; a change made elsewhere since the editor read it keeps the other version as a copy and the writer wins', async () => {
  const id = await makeVideo('Conflicts');
  const note = await docs.addNote(slug, id, '# Plan\n\n- a');
  const file = path.join(dirOf(id), note.doc!.path);
  const quiet = await docs.saveNote(slug, id, note, '# Plan\n\n- a\n- b', note.doc!.hash);
  assert.equal(quiet.conflict, undefined);
  assert.equal(await readFile(file, 'utf8'), '# Plan\n\n- a\n- b');
  // The same base again: nothing changed elsewhere, so nothing is kept.
  const next = await docs.saveNote(slug, id, quiet.tile, '# Plan\n\n- a\n- b\n- c', quiet.tile.doc!.hash);
  assert.equal(next.conflict, undefined);
  // An agent writes; the editor, still on its older text, saves.
  await writeFile(file, '# Plan\n\nAn agent rewrote this');
  const clash = await docs.saveNote(slug, id, next.tile, '# Plan\n\n- a\n- b\n- c\n- d', next.tile.doc!.hash);
  assert.equal(await readFile(file, 'utf8'), '# Plan\n\n- a\n- b\n- c\n- d', 'the writer\'s text is saved');
  assert.match(clash.conflict!.copy, /^notes\/plan \(other version\)\.md$|^notes\/[\w-]+ \(other version\)\.md$/);
  assert.equal(await readFile(path.join(dirOf(id), clash.conflict!.copy), 'utf8'), '# Plan\n\nAn agent rewrote this', 'the other version is kept whole');
  // A second clash keeps a second copy; the first is never overwritten.
  await writeFile(file, 'again from outside');
  const again = await docs.saveNote(slug, id, clash.tile, 'mine again', clash.tile.doc!.hash);
  assert.notEqual(again.conflict!.copy, clash.conflict!.copy);
  assert.equal((await readdir(path.join(dirOf(id), 'notes'))).filter((name) => name.includes('other version')).length, 2);
  // Saving the same text the file already holds is not a clash.
  await writeFile(file, 'same text');
  assert.equal((await docs.saveNote(slug, id, again.tile, 'same text', 'stale-hash')).conflict, undefined);
  // A save without a base (no hash known) never claims a clash.
  await writeFile(file, 'whatever');
  assert.equal((await docs.saveNote(slug, id, again.tile, 'no base')).conflict, undefined);
  // The copy shows up as a card of its own.
  assert.ok((await docs.boardTiles(slug, id)).some((tile) => tile.doc?.path === clash.conflict!.copy));
});

test('a note too long to save is refused, and a save is one write at a time', async () => {
  const id = await makeVideo('Limits');
  const note = await docs.addNote(slug, id, 'x');
  await assert.rejects(docs.saveNote(slug, id, note, 'y'.repeat(docs.MAX_DOC_BYTES + 1)), /too long/);
  const results = await Promise.all(['one', 'two', 'three'].map((text) => docs.saveNote(slug, id, note, text)));
  assert.equal(results.length, 3);
  assert.ok(['one', 'two', 'three'].includes(await readFile(path.join(dirOf(id), note.doc!.path), 'utf8')));
  assert.equal((await readdir(path.join(dirOf(id), 'notes'))).filter((name) => name.endsWith('.tmp')).length, 0, 'no temporary file is left');
});

// ---------------------------------------------------------------- dropped files

test('dropped files: Markdown and text come in as notes, anything else is skipped with a reason; names are made safe and unique', async () => {
  const id = await makeVideo('Dropping');
  const result = await docs.importFiles(slug, id, [
    { name: 'My Plan (v2).md', data: Buffer.from('# My plan\n\nbody') },
    { name: 'My Plan (v2).md', data: Buffer.from('second with the same name') },
    { name: '../../escape.md', data: Buffer.from('tries to leave') },
    { name: 'raw.txt', data: Buffer.from('plain') },
    { name: 'doc.pdf', data: Buffer.from('%PDF') },
    { name: 'binary.md', data: Buffer.from([1, 2, 0, 3]) },
    { name: 'huge.md', data: Buffer.alloc(docs.MAX_DOC_BYTES + 1, 97) },
  ]);
  assert.deepEqual(result.tiles.map((tile) => tile.doc?.path), ['notes/my-plan-v2.md', 'notes/my-plan-v2-2.md', 'notes/escape.md', 'notes/raw.txt']);
  assert.deepEqual(result.skipped.map((item) => item.name), ['doc.pdf', 'binary.md', 'huge.md']);
  assert.match(result.skipped[0].reason, /Only Markdown and text/);
  assert.equal(result.tiles[0].text, '# My plan\n\nbody');
  assert.deepEqual((await readdir(path.join(dirOf(id), 'notes'))).sort(), ['escape.md', 'my-plan-v2-2.md', 'my-plan-v2.md', 'raw.txt']);
  assert.equal(await stat(path.join(dirOf(id), '..', '..', 'escape.md')).then(() => true, () => false), false, 'nothing is written outside the video\'s folder');
  assert.equal((await docs.boardTiles(slug, id)).filter((tile) => tile.doc).length, 4, 'and the board lists them once');
});

// ---------------------------------------------------------------- the Notes folder

test('the Notes folder: it has to exist, its files can be pinned, pinning twice gives one card, and nothing outside it is reachable', async () => {
  const id = await makeVideo('Notes folder');
  const vault = path.join(temp, 'vault');
  await mkdir(path.join(vault, 'daily'), { recursive: true });
  await writeFile(path.join(vault, 'idea.md'), '# Vault idea\n\nbody');
  await writeFile(path.join(vault, 'daily', 'today.md'), 'today');
  await writeFile(path.join(vault, '.obsidian.md'), 'hidden');
  await mkdir(path.join(vault, 'node_modules'));
  await writeFile(path.join(vault, 'node_modules', 'x.md'), 'x');

  assert.equal((await docs.boardFiles(slug, id)).notes, null);
  await assert.rejects(docs.setNotesFolder(slug, 'relative/path'), /whole path/);
  await assert.rejects(docs.setNotesFolder(slug, path.join(temp, 'nope')), /doesn't exist/);
  await assert.rejects(docs.setNotesFolder(slug, path.join(vault, 'idea.md')), /doesn't exist/, 'a file is not a folder');
  await assert.rejects(docs.setNotesFolder(slug, '/'), /not your whole computer/);
  await assert.rejects(docs.setNotesFolder(slug, os.homedir()), /not your whole computer/);
  await docs.setNotesFolder(slug, vault);

  const files = await docs.boardFiles(slug, id);
  assert.equal(files.folder.path, dirOf(id));
  assert.deepEqual(files.notes!.files.map((file) => [file.path, file.title, file.pinned]).sort(), [['daily/today.md', 'today', false], ['idea.md', 'Vault idea', false]]);

  const pinned = await docs.pinNote(slug, id, 'idea.md');
  assert.deepEqual([pinned.doc?.root, pinned.doc?.path, pinned.text, pinned.title], ['folder', 'idea.md', '# Vault idea\n\nbody', 'Vault idea']);
  assert.equal((await docs.pinNote(slug, id, 'idea.md')).id, pinned.id);
  assert.equal((await docs.boardFiles(slug, id)).notes!.files.find((file) => file.path === 'idea.md')?.pinned, true);
  for (const bad of ['../secret.md', '/etc/hosts', 'daily/../../x.md', '.obsidian.md']) await assert.rejects(docs.pinNote(slug, id, bad), /not in the folder/, bad);
  await assert.rejects(docs.pinNote(slug, id, 'missing.md'), /not found/);

  // Writing in the card writes the file in the vault; removing the card leaves the vault alone.
  const saved = await docs.saveNote(slug, id, pinned, '# Vault idea\n\nedited', pinned.doc!.hash);
  assert.equal(await readFile(path.join(vault, 'idea.md'), 'utf8'), '# Vault idea\n\nedited');
  assert.equal(saved.tile.text, '# Vault idea\n\nedited');
  await docs.removeNote(slug, id, pinned.id);
  assert.equal(await readFile(path.join(vault, 'idea.md'), 'utf8'), '# Vault idea\n\nedited');
  assert.equal((await docs.boardTiles(slug, id)).some((tile) => tile.doc?.root === 'folder'), false);
  // With the folder cleared, a card pinned earlier says its file is missing.
  const again = await docs.pinNote(slug, id, 'idea.md');
  await docs.setNotesFolder(slug, null);
  assert.equal((await docs.boardTiles(slug, id)).find((tile) => tile.id === again.id)?.doc?.missing, true);
  await assert.rejects(docs.pinNote(slug, id, 'idea.md'), /Pick a Notes folder/);
});

// ---------------------------------------------------------------- the watcher

/** Waits for `check` to be true, up to `ms`. */
const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await sleep(25);
  return check();
};

for (const native of [true, false]) {
  test(`the watcher (${native ? 'fs.watch' : 'scan only'}) tells about files that appear, change and go, and not about temporary or data files`, async () => {
    const id = await makeVideo(`Watching ${native}`);
    const dir = dirOf(id);
    let calls = 0;
    const stop = watchBoard(slug, id, () => calls++, { native, debounceMs: 60, maxWaitMs: 300, pollMs: 150, pollFastMs: 150 });
    await sleep(400);
    const base = calls;
    // A data file, a hidden file and a temporary file make no news.
    await writeFile(path.join(dir, 'package.json'), '{"changed":true}');
    await writeFile(path.join(dir, '.agent.md.1234.tmp'), 'half');
    await writeFile(path.join(dir, 'x.md.swp'), 'half');
    await sleep(500);
    assert.equal(calls, base, 'no news');
    const started = Date.now();
    await writeFile(path.join(dir, 'idea.md'), '# written by an agent');
    assert.ok(await until(() => calls > base), 'a new file is noticed');
    assert.ok(Date.now() - started < 2000, `within two seconds (took ${Date.now() - started} ms)`);
    // Many writes in a burst give one or two messages, not one each.
    const before = calls;
    for (let i = 0; i < 10; i++) await writeFile(path.join(dir, 'idea.md'), `# edit ${i}`);
    assert.ok(await until(() => calls > before), 'a change is noticed');
    await sleep(600);
    assert.ok(calls - before <= 3, `a burst of ten writes gave ${calls - before} messages`);
    // The notes folder appears later and is watched from then on.
    const afterBurst = calls;
    await mkdir(path.join(dir, 'notes'));
    await writeFile(path.join(dir, 'notes', 'deep.md'), 'deep');
    assert.ok(await until(() => calls > afterBurst), 'a file in a new notes folder is noticed');
    const afterDeep = calls;
    await writeFile(path.join(dir, 'notes', 'deep.md'), 'deeper');
    assert.ok(await until(() => calls > afterDeep), 'and its changes');
    const beforeGone = calls;
    await rm(path.join(dir, 'idea.md'));
    assert.ok(await until(() => calls > beforeGone), 'a file that goes is noticed');
    stop();
    const stopped = calls;
    await writeFile(path.join(dir, 'after-stop.md'), 'x');
    await sleep(500);
    assert.equal(calls, stopped, 'nothing after it is stopped');
  });
}

test('the watcher also watches the Notes folder, and follows a changed Notes folder', async () => {
  const id = await makeVideo('Watching the vault');
  const vault = path.join(temp, 'vault-watch');
  const other = path.join(temp, 'vault-other');
  await mkdir(vault, { recursive: true });
  await mkdir(other, { recursive: true });
  await docs.setNotesFolder(slug, vault);
  let calls = 0;
  const stop = watchBoard(slug, id, () => calls++, { debounceMs: 60, maxWaitMs: 300, pollMs: 150 });
  await sleep(400);
  const base = calls;
  await writeFile(path.join(vault, 'from-obsidian.md'), '# new');
  assert.ok(await until(() => calls > base), 'a file in the Notes folder is noticed');
  await docs.setNotesFolder(slug, other);
  await sleep(500);
  const moved = calls;
  await writeFile(path.join(other, 'new.md'), 'x');
  assert.ok(await until(() => calls > moved), 'and in the new one');
  stop();
  await docs.setNotesFolder(slug, null);
});
