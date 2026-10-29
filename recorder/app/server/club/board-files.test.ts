import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { BoardFiles, ResearchTile, Video } from '../../shared/club.js';
import type { RunAIOptions, RunAIResult } from './ai.js';

/*
 * The Board's Markdown files through the HTTP routes: notes as files, a note changed elsewhere while it is written, dropped files, the Notes folder,
 * the news stream, and "Use as package", "Use as hook" and "Draft scenes from the board" reading the Markdown.
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-board-files-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');

const prompts: { title: string; prompt: string }[] = [];
const answers: Record<string, unknown[]> = {};
async function fakeAI(options: RunAIOptions): Promise<RunAIResult> {
  const title = (options.jsonSchema as { title?: string } | undefined)?.title ?? 'text';
  prompts.push({ title, prompt: options.prompt });
  const queued = answers[title]?.shift();
  return { text: JSON.stringify(queued), json: queued };
}
const { clubRouter } = await import('./index.js');
const app = express();
app.use('/api/club', clubRouter({ runAI: fakeAI }));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async () => {
  server.closeAllConnections();
  server.close();
  await rm(temp, { recursive: true, force: true });
});

const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
};
await call('POST', '/workspaces', { name: 'Maya Lopez', handle: '@maya', topics: ['claude'], about: 'Practical AI for small shops.' });
const root = path.join(process.env.CREATORCLUB_DIR!, 'maya-lopez');
const newVideo = async (title: string) => (await call('POST', '/videos', { title })).body as Video;
const tiles = async (id: string) => (await call('GET', `/videos/${id}/research`)).body as ResearchTile[];
const finish = async (jobId: string) => {
  for (let i = 0; i < 300; i++) {
    const job = (await call('GET', `/jobs/${jobId}`)).body;
    if (job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('job did not finish');
};

test('a note made on the Board is a Markdown file in the video\'s folder, and writing in it saves to the file', async () => {
  const video = await newVideo('Writing');
  const made = await call('POST', `/videos/${video.id}/research`, { kind: 'note', text: '# Hooks\n\n- one' });
  assert.equal(made.status, 201);
  assert.equal(made.body.doc.path, 'notes/hooks.md');
  const file = path.join(root, 'videos', video.id, 'notes', 'hooks.md');
  assert.equal(await readFile(file, 'utf8'), '# Hooks\n\n- one');
  const saved = await call('PATCH', `/videos/${video.id}/research/${made.body.id}`, { text: '# Hooks\n\n- one\n- two', base: made.body.doc.hash });
  assert.equal(saved.status, 200);
  assert.deepEqual([saved.body.text, saved.body.conflict], ['# Hooks\n\n- one\n- two', undefined]);
  assert.equal(await readFile(file, 'utf8'), '# Hooks\n\n- one\n- two');
  assert.notEqual(saved.body.doc.hash, made.body.doc.hash);
  // Moving the card does not touch the file.
  const moved = await call('PATCH', `/videos/${video.id}/research/${made.body.id}`, { pos: { x: 500, y: 100 } });
  assert.deepEqual([moved.body.pos.x, moved.body.text], [500, '# Hooks\n\n- one\n- two']);
  assert.equal((await call('PATCH', `/videos/${video.id}/research/${made.body.id}`, { text: 'x'.repeat(1_000_001) })).status, 400);
});

test('a note changed in its file while it is written: the writer\'s version is saved, the other is kept, and the answer says so', async () => {
  const video = await newVideo('Clash');
  const made = (await call('POST', `/videos/${video.id}/research`, { kind: 'note', text: 'start' })).body as ResearchTile;
  const file = path.join(root, 'videos', video.id, made.doc!.path);
  await writeFile(file, 'an agent wrote this');
  const saved = await call('PATCH', `/videos/${video.id}/research/${made.id}`, { text: 'start and my words', base: made.doc!.hash });
  assert.match(saved.body.conflict.copy, /^notes\/.* \(other version\)\.md$/);
  assert.equal(await readFile(file, 'utf8'), 'start and my words');
  assert.equal(await readFile(path.join(root, 'videos', video.id, saved.body.conflict.copy), 'utf8'), 'an agent wrote this');
  assert.ok((await tiles(video.id)).some((tile) => tile.doc?.path === saved.body.conflict.copy), 'the kept copy is a card');
});

test('old notes are moved into files when the Board is read, with their text; a note edited before that is written to its file', async () => {
  const video = await newVideo('Old');
  const folder = path.join(root, 'videos', video.id, 'research');
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 't_a.json'), JSON.stringify({ id: 't_a', kind: 'note', text: 'A first note', meta: {}, createdAt: '2026-10-01T00:00:00.000Z' }));
  await writeFile(path.join(folder, 't_b.json'), JSON.stringify({ id: 't_b', kind: 'note', text: 'Another', meta: {}, createdAt: '2026-10-02T00:00:00.000Z' }));
  const edited = await call('PATCH', `/videos/${video.id}/research/t_b`, { text: 'Another, edited' });
  assert.equal(edited.body.text, 'Another, edited');
  const listed = await tiles(video.id);
  assert.deepEqual(listed.map((tile) => [tile.text, tile.doc?.root]), [['A first note', 'video'], ['Another, edited', 'video']]);
  assert.deepEqual((await readdir(path.join(root, 'videos', video.id, 'notes'))).sort(), ['a-first-note.md', 'another.md']);
});

test('a file written in the video\'s folder shows up as a card; removing the card sets the file aside', async () => {
  const video = await newVideo('Agent');
  await writeFile(path.join(root, 'videos', video.id, 'research-notes.md'), '# From Claude Code\n\n- found a thing');
  const listed = await tiles(video.id);
  const card = listed.find((tile) => tile.doc?.path === 'research-notes.md')!;
  assert.deepEqual([card.title, card.kind], ['From Claude Code', 'note']);
  const info = (await call('GET', `/videos/${video.id}/board/files`)).body as BoardFiles;
  assert.equal(info.folder.path, path.join(root, 'videos', video.id));
  assert.equal((await call('DELETE', `/videos/${video.id}/research/${card.id}`)).status, 204);
  assert.equal((await tiles(video.id)).some((tile) => tile.doc), false);
  assert.ok((await readdir(path.join(root, 'videos', video.id, 'notes', '.removed'))).some((name) => name.endsWith('research-notes.md')));
});

const form = (files: { name: string; text: string; type?: string }[]) => {
  const data = new FormData();
  for (const file of files) data.append('files', new Blob([file.text], { type: file.type ?? 'text/markdown' }), file.name);
  return data;
};

test('dropped files come in through /board/import: notes for Markdown and text, reasons for the rest', async () => {
  const video = await newVideo('Drop');
  const res = await fetch(`${base}/videos/${video.id}/board/import`, { method: 'POST', body: form([{ name: 'Plan.md', text: '# Plan' }, { name: 'a.pdf', text: '%PDF', type: 'application/pdf' }, { name: 'b.txt', text: 'text' }]) });
  assert.equal(res.status, 201);
  const result = (await res.json()) as { tiles: ResearchTile[]; skipped: { name: string; reason: string }[] };
  assert.deepEqual(result.tiles.map((tile) => [tile.doc?.path, tile.text]), [['notes/plan.md', '# Plan'], ['notes/b.txt', 'text']]);
  assert.deepEqual(result.skipped.map((item) => item.name), ['a.pdf']);
  assert.equal((await fetch(`${base}/videos/${video.id}/board/import`, { method: 'POST', body: new FormData() })).status, 400, 'nothing to import');
  assert.equal((await fetch(`${base}/videos/nope/board/import`, { method: 'POST', body: form([{ name: 'x.md', text: 'x' }]) })).status, 404);
});

test('the Notes folder through the routes: choose, list, pin, and refuse paths that leave it', async () => {
  const video = await newVideo('Vault');
  const vault = path.join(temp, 'vault');
  await mkdir(vault);
  await writeFile(path.join(vault, 'idea.md'), '# Idea in the vault');
  assert.equal((await call('PUT', '/board/notes-folder', { path: path.join(temp, 'missing') })).status, 400);
  assert.deepEqual((await call('PUT', '/board/notes-folder', { path: vault })).status, 200);
  const info = (await call('GET', `/videos/${video.id}/board/files`)).body as BoardFiles;
  assert.deepEqual(info.notes!.files.map((file) => [file.path, file.pinned]), [['idea.md', false]]);
  const pinned = await call('POST', `/videos/${video.id}/board/pin`, { path: 'idea.md' });
  assert.equal(pinned.status, 201);
  assert.equal(pinned.body.text, '# Idea in the vault');
  for (const bad of ['../x.md', '/etc/passwd', '.hidden.md']) assert.equal((await call('POST', `/videos/${video.id}/board/pin`, { path: bad })).status, 400, bad);
  assert.equal((await call('POST', `/videos/${video.id}/board/pin`, {})).status, 400);
  assert.deepEqual((await call('PUT', '/board/notes-folder', { path: null })).body, { path: null });
  assert.equal(((await call('GET', `/videos/${video.id}/board/files`)).body as BoardFiles).notes, null);
});

test('the news stream says "files" when a Markdown file in the video\'s folder changes, and not for other files', async () => {
  const video = await newVideo('News');
  const controller = new AbortController();
  const res = await fetch(`${base}/videos/${video.id}/board/events`, { signal: controller.signal });
  assert.match(res.headers.get('content-type')!, /^text\/event-stream/);
  const reader = res.body!.getReader();
  let seen = '';
  const read = (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      seen += new TextDecoder().decode(value);
    }
  })();
  await new Promise((r) => setTimeout(r, 600));
  await writeFile(path.join(root, 'videos', video.id, 'package.json'), '{}');
  await new Promise((r) => setTimeout(r, 700));
  assert.doesNotMatch(seen, /event: files/);
  await writeFile(path.join(root, 'videos', video.id, 'idea.md'), '# hi');
  for (let i = 0; i < 100 && !/event: files/.test(seen); i++) await new Promise((r) => setTimeout(r, 30));
  assert.match(seen, /event: files\ndata: \{\}/);
  controller.abort();
  await read;
  assert.equal((await fetch(`${base}/videos/nope/board/events`)).status, 404);
});

test('Use as package, Use as hook and Draft scenes from the board read the Markdown of every note', async () => {
  const video = await newVideo('Reading');
  await call('POST', `/videos/${video.id}/research`, { kind: 'note', text: '# Angle\n\n- show the **bill** first\n- [ ] check the price\n\n> a quote' });
  await writeFile(path.join(root, 'videos', video.id, 'agent.md'), '# From an agent\n\nCompare three plans.');
  const goodPackage = { demand: { level: 'high', note: 'x' }, gap: { level: 'mid', note: 'x' }, show: { level: 'high', note: 'x' }, angle: 'A', twist: 'T', titles: ['Build it in ten minutes', 'The fast way to build', 'Stop building it slowly'], thumbnailText: 'TEN MIN', hook: { visual: 'v', spoken: 'This took ten minutes.', text: '10 MIN' } };
  answers.Package = [goodPackage];
  assert.equal((await finish((await call('POST', `/videos/${video.id}/package`)).body.id)).status, 'done');
  const asked = prompts.filter((p) => p.title === 'Package').at(-1)!.prompt;
  assert.match(asked, /- show the \*\*bill\*\* first/, 'the note\'s bullets are in the package prompt, as Markdown');
  assert.match(asked, /- \[ \] check the price/);
  assert.match(asked, /Compare three plans\./, 'and the file an agent wrote');

  const scene = (title: string, seconds: number) => ({ title, talkingPoints: ['one', 'two'], show: 'screen', seconds });
  answers.Outline = [{ scenes: [scene('Opening', 60), scene('Level 1', 120), scene('Level 2', 90), scene('Ending', 45)] }];
  assert.equal((await finish((await call('POST', `/videos/${video.id}/outline`)).body.id)).status, 'done');
  const outlinePrompt = prompts.filter((p) => p.title === 'Outline').at(-1)!.prompt;
  assert.match(outlinePrompt, /<research>[\s\S]*- show the \*\*bill\*\* first[\s\S]*Compare three plans\.[\s\S]*<\/research>/, 'the scenes are drafted from the board\'s Markdown');
  assert.doesNotMatch(outlinePrompt, /\{research\}/);

  const { boardText } = await import('./board-chat.js');
  const { boardTiles } = await import('./board-docs.js');
  const text = await boardText('maya-lopez', video.id, await boardTiles('maya-lopez', video.id));
  assert.match(text, /1\. Your note "Angle":\n {4}# Angle\n\n {4}- show the \*\*bill\*\* first\n {4}- \[ \] check the price/, 'the lines of the note are kept, under its name');
  assert.match(text, /Your note "From an agent"/);
});
