import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { BoardCanvas, BoardFrame, BoardLink, ResearchTile, StartedVideo, Video } from '../../shared/club.js';
import type { CompanionApplied, CompanionAsked, CompanionReplyMessage, CompanionThread } from '../../shared/companion.js';
import type { RunAIOptions, RunAIResult } from './ai.js';

/*
 * Research, the channel's own Board, through the HTTP routes: it is the same Board as a video's but never mixes tiles with one, its connections and
 * frames, "Add to Research", "Start a video from this selection", paths that cannot leave the channel's folder, and the companion's Research actions
 * with their Undo.
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-research-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');

const scripts: string[] = [];
const asked: RunAIOptions[] = [];
async function fakeAI(options: RunAIOptions): Promise<RunAIResult> {
  asked.push(options);
  const text = scripts.shift() ?? 'No script.';
  options.onEvent?.({ type: 'text', text });
  return { text };
}
const { clubRouter } = await import('./index.js');
const { validateActions } = await import('./companion-actions.js');
const { copyNoteImages } = await import('./research-board.js');
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

const call = async <T = any>(method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  // An address no route answers gets Express's own page, not JSON.
  return { status: res.status, body: (text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : undefined) as T };
};
await call('POST', '/workspaces', { name: 'Maya Lopez', handle: '@maya', topics: ['claude'], about: 'Practical AI for small shops.' });
const root = path.join(process.env.CREATORCLUB_DIR!, 'maya-lopez');
const research = path.join(root, 'research');
const newVideo = async (title: string) => (await call<Video>('POST', '/videos', { title })).body;
const channelTiles = async () => (await call<ResearchTile[]>('GET', '/channel/research')).body;
const videoTiles = async (id: string) => (await call<ResearchTile[]>('GET', `/videos/${id}/research`)).body;
const canvas = async (prefix = '/channel') => (await call<BoardCanvas>('GET', `${prefix}/board/canvas`)).body;
const addNote = async (text: string, prefix = '/channel') => (await call<ResearchTile>('POST', `${prefix}/research`, { kind: 'note', text })).body;
const place = (id: string, x: number, y: number) => call('PATCH', `/channel/research/${id}`, { pos: { x, y } });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8Dwn4GBgQEAEfkD/bYHL5UAAAAASUVORK5CYII=', 'base64');
const image = (prefix: string, source: string, tile: string) => fetch(`${base}${prefix}/board/images?${new URLSearchParams({ src: source, tile })}`);
async function events(jobId: string) {
  const raw = await (await fetch(`${base}/jobs/${jobId}/events`)).text();
  return raw
    .split('\n\n')
    .filter((block) => block.includes('event:'))
    .map((block) => ({ type: /event: (\w+)/.exec(block)![1], data: JSON.parse(/data: (.*)/.exec(block)![1]) }));
}

test('Research is one Board for the channel: its tiles and notes live in research/, and a video\'s Board and Research never mix', async () => {
  const video = await newVideo('Pricing video');
  const forVideo = await addNote('# Video note\n\nOnly on the video.', `/videos/${video.id}`);
  const forChannel = await addNote('# Channel note\n\n- one\n- two');
  assert.equal(forChannel.doc?.path, 'notes/channel-note.md');
  assert.equal(await readFile(path.join(research, 'notes', 'channel-note.md'), 'utf8'), '# Channel note\n\n- one\n- two');
  assert.ok((await readdir(path.join(research, 'tiles'))).includes(`${forChannel.id}.json`), 'the tile list is in research/tiles');
  const link = (await call<ResearchTile>('POST', '/channel/research', { kind: 'link', url: 'https://example.com/pricing' })).body;
  assert.deepEqual((await channelTiles()).map((tile) => tile.id).sort(), [forChannel.id, link.id].sort());
  assert.deepEqual((await videoTiles(video.id)).map((tile) => tile.id), [forVideo.id]);
  // A tile of one Board cannot be reached through the other.
  assert.equal((await call('PATCH', `/videos/${video.id}/research/${forChannel.id}`, { pos: { x: 1, y: 1 } })).status, 404);
  assert.equal((await call('PATCH', `/channel/research/${forVideo.id}`, { pos: { x: 1, y: 1 } })).status, 404);
  assert.equal((await call('DELETE', `/channel/research/${forVideo.id}`)).status, 404);
  // The channel's Board has no video behind it: its name is never a video's id.
  assert.equal((await call('GET', `/videos/${encodeURIComponent(':channel')}/research`)).status, 404);
  assert.equal((await call('GET', `/videos/${encodeURIComponent(':channel')}/companion`)).status, 404);
  const files = (await call('GET', '/channel/board/files')).body;
  assert.equal(files.folder.path, research);
  // A Markdown file an agent writes into research/ gets a card; the tile list and the canvas file are not cards.
  await writeFile(path.join(research, 'agent-notes.md'), '# From an agent\n');
  const after = await channelTiles();
  assert.ok(after.some((tile) => tile.doc?.path === 'agent-notes.md' && tile.title === 'From an agent'));
  assert.equal(after.filter((tile) => tile.kind === 'note').length, 2);
  // Clean up for the next tests.
  for (const tile of after) await call('DELETE', `/channel/research/${tile.id}`);
  assert.equal((await channelTiles()).length, 0);
});

test('connections join two cards of the same Board, with an optional label; removing a card takes its lines off', async () => {
  const a = await addNote('Alpha');
  const b = await addNote('Beta');
  const c = await addNote('Gamma');
  const video = await newVideo('Other board');
  const elsewhere = await addNote('Elsewhere', `/videos/${video.id}`);
  const made = await call<BoardLink>('POST', '/channel/board/links', { from: a.id, to: b.id, label: 'leads to' });
  assert.equal(made.status, 201);
  assert.equal(made.body.label, 'leads to');
  const again = await call<BoardLink>('POST', '/channel/board/links', { from: b.id, to: a.id });
  assert.equal(again.body.id, made.body.id, 'the same two cards make one line');
  assert.equal((await call('POST', '/channel/board/links', { from: a.id, to: a.id })).status, 400, 'not to itself');
  assert.equal((await call('POST', '/channel/board/links', { from: a.id, to: elsewhere.id })).status, 404, 'not to a card on another Board');
  assert.equal((await call('POST', '/channel/board/links', { from: a.id, to: 'x/../y' })).status, 400);
  assert.equal((await call('POST', '/channel/board/links', { from: a.id, to: b.id, label: 'x'.repeat(121) })).status, 400);
  await call('POST', '/channel/board/links', { from: b.id, to: c.id });
  assert.equal((await call('PATCH', `/channel/board/links/${made.body.id}`, { label: '' })).body.label, undefined, 'an empty label takes it off');
  assert.equal((await canvas()).links.length, 2);
  assert.equal((await canvas(`/videos/${video.id}`)).links.length, 0, "the video's Board has none of them");
  await call('DELETE', `/channel/research/${b.id}`);
  assert.deepEqual((await canvas()).links, [], "the removed card's lines go with it");
  const raw = JSON.parse(await readFile(path.join(research, 'board-canvas.json'), 'utf8'));
  assert.equal(raw.links.length, 0, 'and are taken out of the file');
  // An unreadable line in the file is left out, not the whole canvas.
  await writeFile(path.join(research, 'board-canvas.json'), JSON.stringify({ links: [{ id: 'l_1', from: a.id, to: c.id }, { id: '../x', from: 1 }], frames: [{ id: 'f_1', title: 'Kept', x: 0, y: 0, w: 200, h: 200 }, { title: 'no id' }] }));
  const read = await canvas();
  assert.deepEqual(read.links.map((link) => link.id), ['l_1']);
  assert.deepEqual(read.frames.map((frame) => frame.title), ['Kept']);
  for (const tile of await channelTiles()) await call('DELETE', `/channel/research/${tile.id}`);
  await call('DELETE', '/channel/board/frames/f_1');
});

test('frames are named rectangles: made, renamed, moved, resized and removed; their cards stay', async () => {
  const note = await addNote('Inside');
  const frame = (await call<BoardFrame>('POST', '/channel/board/frames', { title: 'Pricing', x: 20, y: 20, w: 400, h: 500 })).body;
  assert.match(frame.id, /^f_[a-f0-9]{12}$/);
  assert.equal((await call('POST', '/channel/board/frames', { title: 'Tiny', x: 0, y: 0, w: 10, h: 10 })).status, 400, 'too small');
  assert.equal((await call('POST', '/channel/board/frames', { title: 'Far', x: -5, y: 0, w: 200, h: 200 })).status, 400, 'off the canvas');
  const moved = (await call<BoardFrame>('PATCH', `/channel/board/frames/${frame.id}`, { title: 'Pricing ideas', x: 40, w: 420 })).body;
  assert.deepEqual(moved, { id: frame.id, title: 'Pricing ideas', x: 40, y: 20, w: 420, h: 500 });
  assert.equal((await call('PATCH', '/channel/board/frames/f_000000000000', { title: 'x' })).status, 404);
  await call('DELETE', `/channel/board/frames/${frame.id}`);
  assert.deepEqual((await canvas()).frames, []);
  assert.ok((await channelTiles()).some((tile) => tile.id === note.id), 'the card stays');
  await call('DELETE', `/channel/research/${note.id}`);
});

test('Add to Research takes your ideas and videos, once each; a Discover card it cannot find is refused', async () => {
  const idea = await newVideo('An idea of mine');
  const first = await call<{ tile: ResearchTile; created: boolean }>('POST', '/channel/research/add', { source: 'video', id: idea.id });
  assert.equal(first.status, 201);
  assert.equal(first.body.tile.kind, 'mine');
  assert.equal(first.body.tile.meta.videoId, idea.id);
  const second = await call<{ tile: ResearchTile; created: boolean }>('POST', '/channel/research/add', { source: 'video', id: idea.id });
  assert.equal(second.status, 200);
  assert.equal(second.body.created, false);
  assert.equal(second.body.tile.id, first.body.tile.id);
  assert.equal((await call('POST', '/channel/research/add', { source: 'trending', id: 'aaaaaaaaaaa' })).status, 404);
  assert.equal((await call('POST', '/channel/research/add', { source: 'signal', id: 'nope' })).status, 404);
  assert.equal((await call('POST', '/channel/research/add', { source: 'video', id: '../profile' })).status, 400);
  assert.equal((await call('POST', '/channel/research/add', { source: 'video', id: 'v_missing' })).status, 404);
  // A "your video" card through the general route needs a video that exists.
  assert.equal((await call('POST', '/channel/research', { kind: 'mine', meta: { videoId: 'v_missing' } })).status, 404);
  await call('DELETE', `/channel/research/${first.body.tile.id}`);
});

test('Start a video from this selection makes an idea whose Board holds copies of the cards and notes, places and lines kept; Research stays as it was', async () => {
  const note = await addNote('# Price anchoring\n\n- show the dearest plan first');
  const link = (await call<ResearchTile>('POST', '/channel/research', { kind: 'link', url: 'https://example.com/anchor', title: 'Anchoring study' })).body;
  const left = (await call<ResearchTile>('POST', '/channel/research', { kind: 'link', url: 'https://example.com/left-out' })).body;
  await place(note.id, 600, 400);
  await place(link.id, 1000, 450);
  await call('POST', '/channel/board/links', { from: note.id, to: link.id, label: 'proof' });
  await call('POST', '/channel/board/links', { from: note.id, to: left.id });
  const before = JSON.stringify((await channelTiles()).map((tile) => [tile.id, tile.pos, tile.text]));

  const res = await call<StartedVideo>('POST', '/channel/research/start-video', { tileIds: [link.id, note.id] });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.video.stage, 'ideas');
  assert.equal(res.body.video.title, 'Price anchoring', 'named after the first note');
  assert.equal(res.body.tiles, 2);
  const copies = await videoTiles(res.body.video.id);
  assert.equal(copies.length, 2, 'only the copies: nothing seeded besides');
  const copiedNote = copies.find((tile) => tile.kind === 'note')!;
  const copiedLink = copies.find((tile) => tile.kind === 'link')!;
  assert.notEqual(copiedNote.id, note.id);
  assert.equal(copiedNote.text, '# Price anchoring\n\n- show the dearest plan first');
  assert.equal(copiedNote.doc?.path, 'notes/price-anchoring.md');
  assert.equal(await readFile(path.join(root, 'videos', res.body.video.id, 'notes', 'price-anchoring.md'), 'utf8'), copiedNote.text, "the note is the new video's own file");
  assert.deepEqual([copiedNote.pos?.x, copiedNote.pos?.y, copiedLink.pos?.x, copiedLink.pos?.y], [60, 60, 460, 110], 'places kept, moved to the top left');
  assert.equal(copiedLink.title, 'Anchoring study');
  const lines = (await canvas(`/videos/${res.body.video.id}`)).links;
  assert.equal(lines.length, 1, 'the line between two copied cards comes along, the one to a card left out does not');
  assert.deepEqual([lines[0].from, lines[0].to, lines[0].label], [copiedNote.id, copiedLink.id, 'proof']);
  assert.equal(JSON.stringify((await channelTiles()).map((tile) => [tile.id, tile.pos, tile.text])), before, 'Research is not changed');
  // Writing in the copy does not touch Research's note.
  await call('PATCH', `/videos/${res.body.video.id}/research/${copiedNote.id}`, { text: '# Changed', base: copiedNote.doc?.hash });
  assert.equal((await channelTiles()).find((tile) => tile.id === note.id)?.text, '# Price anchoring\n\n- show the dearest plan first');

  // A frame names the video; an unknown card or frame is refused, and nothing is made.
  const frame = (await call<BoardFrame>('POST', '/channel/board/frames', { title: 'Anchoring', x: 0, y: 0, w: 2000, h: 1200 })).body;
  const framed = await call<StartedVideo>('POST', '/channel/research/start-video', { tileIds: [note.id], frameId: frame.id });
  assert.equal(framed.body.video.title, 'Anchoring');
  const count = (await call<Video[]>('GET', '/videos')).body.length;
  assert.equal((await call('POST', '/channel/research/start-video', { tileIds: ['t_000000000000'] })).status, 404);
  assert.equal((await call('POST', '/channel/research/start-video', { tileIds: [note.id], frameId: 'f_000000000000' })).status, 404);
  assert.equal((await call('POST', '/channel/research/start-video', { tileIds: [] })).status, 400);
  assert.equal((await call<Video[]>('GET', '/videos')).body.length, count);
  for (const tile of await channelTiles()) await call('DELETE', `/channel/research/${tile.id}`);
  await call('DELETE', `/channel/board/frames/${frame.id}`);
});

test('starting a video copies an uploaded inline image into its own Board and keeps the note text byte-identical', async () => {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'picture.png');
  const upload = await fetch(`${base}/channel/board/images`, { method: 'POST', body: form });
  assert.equal(upload.status, 201);
  const saved = await upload.json() as { path: string; markdown: string };
  const text = `# Picture\n\n![](${saved.markdown})\n\nAgain: ![same pixels]( ${saved.markdown}  "Keep this title" )\n`;
  const note = await addNote(text);
  assert.equal((await image('/channel', saved.markdown, note.id)).status, 200);
  const started = await call<StartedVideo>('POST', '/channel/research/start-video', { tileIds: [note.id] });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const [copy] = await videoTiles(started.body.video.id);
  assert.equal(copy.text, text);
  const destination = path.join(root, 'videos', started.body.video.id);
  assert.equal(await readFile(path.join(destination, copy.doc!.path), 'utf8'), text);
  assert.deepEqual(await readFile(path.join(destination, saved.path)), png);
  assert.equal((await readdir(path.join(destination, 'notes', 'assets'))).length, 1, 'repeated references share one copied image');
  assert.equal((await channelTiles()).find((tile) => tile.id === note.id)?.text, text);
  await rm(path.join(research, saved.path));
  const served = await image(`/videos/${started.body.video.id}`, saved.markdown, copy.id);
  assert.equal(served.status, 200, 'the destination serves its own copy after the original is gone');
  assert.match(served.headers.get('content-type')!, /image\/png/);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
  for (const tile of await channelTiles()) await call('DELETE', `/channel/research/${tile.id}`);
});

test('copying a top-level note rewrites image URLs for notes/assets, preserving titles, code and reference-image formatting', async () => {
  await mkdir(path.join(research, 'pictures'), { recursive: true });
  await writeFile(path.join(research, 'pictures', 'figure (one).png'), png);
  const text = '# Imported image\n\n![Figure](<pictures/figure (one).png>  "Exact title")\n![Again [nested alt]](pictures/figure%20(one).png)\n![Reference][PIC]\n![pic][]\n\n[pic]: <pictures/figure (one).png> "Reference title"\n\n`![example](pictures/figure%20(one).png)`\n\\![escaped](pictures/figure%20(one).png)\n~~~md\n![code](pictures/figure%20(one).png)\n~~~\n';
  await writeFile(path.join(research, 'imported-image.md'), text);
  const note = (await channelTiles()).find((tile) => tile.doc?.path === 'imported-image.md')!;
  const started = await call<StartedVideo>('POST', '/channel/research/start-video', { tileIds: [note.id] });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const [copy] = await videoTiles(started.body.video.id);
  const target = 'assets/figure%20%28one%29.png';
  const expected = text
    .replace('<pictures/figure (one).png>', `<${target}>`)
    .replace('![Again [nested alt]](pictures/figure%20(one).png)', `![Again [nested alt]](${target})`)
    .replace('[pic]: <pictures/figure (one).png>', `[pic]: <${target}>`);
  assert.equal(copy.text, expected);
  assert.equal(await readFile(path.join(root, 'videos', started.body.video.id, copy.doc!.path), 'utf8'), expected);
  const served = await image(`/videos/${started.body.video.id}`, target, copy.id);
  assert.equal(served.status, 200);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
  assert.equal(await readFile(path.join(research, 'imported-image.md'), 'utf8'), text);
  for (const tile of await channelTiles()) await call('DELETE', `/channel/research/${tile.id}`);
});

test('starting a video skips missing images, traversal, symlinks, absolute paths and remote URLs without changing their Markdown', async () => {
  await writeFile(path.join(root, 'outside.png'), png);
  await symlink(path.join(root, 'outside.png'), path.join(research, 'notes', 'linked.png'));
  const text = `# Unsafe and missing\n![](../../outside.png)\n![](%2e%2e/%2e%2e/outside.png)\n![](assets/missing.png)\n![](linked.png)\n![](${path.join(root, 'outside.png')})\n![](https://example.com/image.png)\n![](//example.com/image.png)\n`;
  const note = await addNote(text);
  const started = await call<StartedVideo>('POST', '/channel/research/start-video', { tileIds: [note.id] });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const [copy] = await videoTiles(started.body.video.id);
  assert.equal(copy.text, text);
  await assert.rejects(stat(path.join(root, 'videos', started.body.video.id, 'notes', 'assets')), { code: 'ENOENT' });
  assert.deepEqual(await readFile(path.join(root, 'outside.png')), png);
  for (const tile of await channelTiles()) await call('DELETE', `/channel/research/${tile.id}`);
});

test('copying images never overwrites a destination file or follows destination symlinks', async () => {
  const video = await newVideo('Existing destination');
  const destination = path.join(root, 'videos', video.id);
  const assets = path.join(destination, 'notes', 'assets');
  await mkdir(assets, { recursive: true });
  const existing = Buffer.concat([png, Buffer.from('different existing image')]);
  await writeFile(path.join(research, 'notes', 'collision.png'), png);
  await writeFile(path.join(assets, 'collision.png'), existing);
  const note = await addNote('# Collision\n![one](collision.png "Title")\n![two](collision.png)');
  const text = await copyNoteImages('maya-lopez', ':channel', video.id, note);
  const match = /assets\/collision-[a-f0-9]{12}\.png/.exec(text)!;
  assert.ok(match);
  assert.equal(text, note.text!.replaceAll('collision.png', match[0]));
  assert.deepEqual(await readFile(path.join(assets, 'collision.png')), existing);
  assert.deepEqual(await readFile(path.join(destination, 'notes', match[0])), png);
  assert.equal((await readdir(assets)).length, 2);
  await rm(assets, { recursive: true });
  await symlink(temp, assets);
  await assert.rejects(copyNoteImages('maya-lopez', ':channel', video.id, note), /assets folder is not a folder/);
  await assert.rejects(stat(path.join(temp, 'collision.png')), { code: 'ENOENT' });
  for (const tile of await channelTiles()) await call('DELETE', `/channel/research/${tile.id}`);
});

test('a pinned note copies only images inside the source Board, leaving external Notes-folder images alone', async () => {
  const vault = path.join(temp, 'image-vault');
  await mkdir(vault);
  await writeFile(path.join(vault, 'external.png'), png);
  const boardImage = path.join(research, 'notes', 'assets', 'pinned-board.png');
  await mkdir(path.dirname(boardImage), { recursive: true });
  await writeFile(boardImage, png);
  const boardRelative = path.relative(vault, boardImage).split(path.sep).join('/');
  const text = `# Pinned images\n![](external.png)\n![owned](${boardRelative})\n`;
  await writeFile(path.join(vault, 'pin.md'), text);
  assert.equal((await call('PUT', '/board/notes-folder', { path: vault })).status, 200);
  const pinned = await call<ResearchTile>('POST', '/channel/board/pin', { path: 'pin.md' });
  assert.equal(pinned.status, 201);
  const started = await call<StartedVideo>('POST', '/channel/research/start-video', { tileIds: [pinned.body.id] });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const [copy] = await videoTiles(started.body.video.id);
  assert.equal(copy.text, text.replace(boardRelative, 'assets/pinned-board.png'));
  const assets = path.join(root, 'videos', started.body.video.id, 'notes', 'assets');
  assert.deepEqual(await readdir(assets), ['pinned-board.png']);
  assert.equal((await image(`/videos/${started.body.video.id}`, 'assets/pinned-board.png', copy.id)).status, 200);
  assert.equal(await readFile(path.join(vault, 'pin.md'), 'utf8'), text);
  for (const tile of await channelTiles()) await call('DELETE', `/channel/research/${tile.id}`);
  await call('PUT', '/board/notes-folder', { path: null });
});

test('no path leaves the channel folder: tile ids, link and frame ids, pinned files and dropped file names', async () => {
  for (const bad of ['..', '..%2Fprofile', '%2E%2E%2F%2E%2E%2Fsettings', 'a%2Fb']) {
    assert.ok([400, 404].includes((await call('GET', `/channel/research/${bad}/file`)).status), bad);
    assert.ok([400, 404].includes((await call('PATCH', `/channel/research/${bad}`, { pos: { x: 1, y: 1 } })).status), bad);
    assert.ok([400, 404].includes((await call('DELETE', `/channel/board/frames/${bad}`)).status) || (await canvas()).frames.length === 0, bad);
  }
  // Pinning from the Notes folder: only files inside it, never through a link.
  const notes = path.join(temp, 'notes');
  await mkdir(notes, { recursive: true });
  await writeFile(path.join(notes, 'ok.md'), '# Fine\n');
  await writeFile(path.join(temp, 'secret.md'), 'secret');
  await symlink(path.join(temp, 'secret.md'), path.join(notes, 'link.md'));
  assert.equal((await call('PUT', '/board/notes-folder', { path: notes })).status, 200);
  assert.equal((await call('POST', '/channel/board/pin', { path: '../secret.md' })).status, 400);
  assert.equal((await call('POST', '/channel/board/pin', { path: 'link.md' })).status, 400);
  assert.equal((await call('POST', '/channel/board/pin', { path: '/etc/hosts' })).status, 400);
  const pinned = await call<ResearchTile>('POST', '/channel/board/pin', { path: 'ok.md' });
  assert.equal(pinned.status, 201);
  assert.equal(pinned.body.title, 'Fine');
  // A dropped file's name never leads out of research/notes.
  const form = new FormData();
  form.append('files', new Blob(['# Dropped\n']), '../../../escape.md');
  const dropped = await fetch(`${base}/channel/board/import`, { method: 'POST', body: form });
  assert.equal(dropped.status, 201);
  const { tiles } = (await dropped.json()) as { tiles: ResearchTile[] };
  assert.match(tiles[0].doc!.path, /^notes\/[^/]+\.md$/);
  await stat(path.join(research, tiles[0].doc!.path));
  await assert.rejects(stat(path.join(temp, 'escape.md')));
  for (const tile of await channelTiles()) await call('DELETE', `/channel/research/${tile.id}`);
  await call('PUT', '/board/notes-folder', { path: null });
});

test('the companion on Research: its own conversation, card ids in the prompt, and only Research actions naming cards that are there', async () => {
  const a = await addNote('# Hook ideas\n\n- open on the bill');
  const b = await addNote('# Proof\n\n- a real invoice');
  const video = await newVideo('Unrelated');
  assert.equal((await call('POST', '/channel/companion', { message: 'Hi', context: { tab: 'board' } })).status, 400, "a video's step is not asked on Research");
  assert.equal((await call('POST', `/videos/${video.id}/companion`, { message: 'Hi', context: { tab: 'research' } })).status, 400, 'nor Research on a video');

  scripts.push(`These two go together.\n<actions>[{"type":"group_tiles","title":"Invoice story","tileIds":["${a.id}","${b.id}"]},{"type":"group_tiles","title":"Ghost","tileIds":["${a.id}","t_000000000000"]},{"type":"use_hook","text":"Hi"},{"type":"start_video","title":"The invoice video","tileIds":["${a.id}","${b.id}"]}]</actions>`);
  const asked1 = await call<CompanionAsked>('POST', '/channel/companion', { message: 'Group these', context: { tab: 'research', selection: [a.id, b.id] } });
  assert.equal(asked1.status, 202, JSON.stringify(asked1.body));
  const reply = (await events(asked1.body.jobId)).at(-1)!.data as CompanionReplyMessage;
  const prompt = asked.at(-1)!.prompt;
  assert.match(prompt, new RegExp(`\\[${a.id}\\] Your note "Hook ideas"`), 'each card with its id');
  assert.match(prompt, new RegExp(`Selected cards: ${a.id}, ${b.id}`));
  assert.match(prompt, /- group_tiles:/);
  assert.match(prompt, /- start_video:/);
  assert.doesNotMatch(prompt, /- use_hook:/);
  assert.doesNotMatch(prompt, /\{[a-z_]+\}/, 'every placeholder is filled');
  assert.deepEqual(reply.cards.map((card) => card.action.type), ['group_tiles', 'start_video'], 'an unknown card and an action of another step are left out');
  assert.equal((await call<CompanionThread>('GET', `/videos/${video.id}/companion`)).body.messages.length, 0, "the video's conversation is its own");
  assert.equal((await call<CompanionThread>('GET', '/channel/companion')).body.messages.length, 2);

  // Group these: a frame around the cards; Undo takes it off while it is as it was made.
  const grouped = await call<CompanionApplied>('POST', `/channel/companion/${reply.id}/cards/0/apply`);
  assert.equal(grouped.status, 200, JSON.stringify(grouped.body));
  assert.deepEqual(grouped.body.changed, ['board']);
  const [frame] = (await canvas()).frames;
  assert.equal(frame.title, 'Invoice story');
  const boxes = (await channelTiles()).map((tile) => tile.pos!);
  assert.ok(boxes.every((pos) => pos.x >= frame.x && pos.y >= frame.y && pos.x < frame.x + frame.w && pos.y < frame.y + frame.h), 'the frame is drawn around the cards');
  assert.equal((await call('POST', `/channel/companion/${reply.id}/cards/0/undo`)).status, 200);
  assert.deepEqual((await canvas()).frames, []);
  // Applied again, then moved by hand: Undo refuses and the frame stays.
  await call('POST', `/channel/companion/${reply.id}/cards/0/apply`);
  const [again] = (await canvas()).frames;
  await call('PATCH', `/channel/board/frames/${again.id}`, { x: again.x + 30 });
  const refused = await call('POST', `/channel/companion/${reply.id}/cards/0/undo`);
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /changed after it was applied/);
  assert.equal((await canvas()).frames.length, 1);

  // Start a video from these: a new idea with copies; Undo removes it while nothing was done with it.
  const started = await call<CompanionApplied>('POST', `/channel/companion/${reply.id}/cards/1/apply`);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.deepEqual(started.body.changed, ['videos']);
  const card = started.body.message.cards[1];
  assert.equal(card.state, 'applied');
  const made = (await call<Video>('GET', `/videos/${card.videoId}`)).body;
  assert.equal(made.title, 'The invoice video');
  assert.equal(made.stage, 'ideas');
  assert.equal((await videoTiles(made.id)).length, 2);
  assert.equal((await call('POST', `/channel/companion/${reply.id}/cards/1/undo`)).status, 200);
  assert.equal((await call('GET', `/videos/${made.id}`)).status, 404, 'the idea is gone');
  assert.equal((await channelTiles()).length, 2, "Research's cards stay");
  // Applied again and renamed: Undo refuses and the idea stays.
  const second = await call<CompanionApplied>('POST', `/channel/companion/${reply.id}/cards/1/apply`);
  const kept = second.body.message.cards[1].videoId!;
  await call('PUT', `/videos/${kept}`, { title: 'My own title' });
  assert.equal((await call('POST', `/channel/companion/${reply.id}/cards/1/undo`)).status, 409);
  assert.equal((await call<Video>('GET', `/videos/${kept}`)).body.title, 'My own title');
  assert.equal((await call('POST', `/channel/companion/${reply.id}/cards/1/apply`)).status, 409, 'an applied card is applied once');
});

test('the action check: Research actions only on Research, with cards that exist, at least two to group', () => {
  const ids = ['t_a', 't_b'];
  const { actions, rejected } = validateActions(
    [
      { type: 'group_tiles', title: 'Two', tileIds: ['t_a', 't_b', 't_a'] },
      { type: 'group_tiles', title: 'One', tileIds: ['t_a', 't_a'] },
      { type: 'start_video', title: 'Go', tileIds: ['t_b'] },
      { type: 'start_video', title: 'Bad', tileIds: ['../x'] },
      { type: 'add_note', text: 'A fact' },
      { type: 'use_title', text: 'Nope here' },
      { type: 'start_video', title: 'Extra', tileIds: ['t_a'], more: 1 },
    ],
    { tab: 'research', sceneIds: [], tileIds: ids },
  );
  assert.deepEqual(actions, [{ type: 'group_tiles', title: 'Two', tileIds: ['t_a', 't_b'] }, { type: 'start_video', title: 'Go', tileIds: ['t_b'] }, { type: 'add_note', text: 'A fact' }]);
  assert.equal(rejected.length, 4, rejected.join('\n'));
  assert.equal(validateActions([{ type: 'group_tiles', title: 'Two', tileIds: ids }], { tab: 'board', sceneIds: [], tileIds: ids }).actions.length, 0, 'not on a video\'s Board');
});
