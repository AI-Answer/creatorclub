import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm, writeFile, chmod, readFile, mkdir, readdir, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

/*
 * End to end through the HTTP routes with stand-ins for yt-dlp and claude on PATH.
 * Nothing here reaches YouTube or a paid AI.
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-onboard-'));
const bin = path.join(temp, 'bin');
const ytLog = path.join(temp, 'yt-dlp.log');
const claudeLog = path.join(temp, 'claude.json');
await mkdir(bin);
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
const originalPath = process.env.PATH;
process.env.PATH = `${bin}${path.delimiter}${originalPath}`;

const fakeYtDlp = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const mode = (() => { try { return JSON.parse(fs.readFileSync(__dirname + '/yt-mode.json', 'utf8')); } catch { return {}; } })();
fs.appendFileSync(${JSON.stringify(ytLog)}, JSON.stringify(args) + '\\n');
if (args[0] === '--version') { console.log('2026.03.17'); process.exit(0); }
const videos = mode.videos ?? 12;
const idOf = (n) => 'vid_' + String(n).padStart(7, '0');
if (args.includes('--flat-playlist')) {
  const handle = (args[args.length - 1].match(/@([^/]+)/) || [])[1] || 'fakechannel';
  if (mode.listing === 'empty') { console.log(JSON.stringify({ entries: [] })); process.exit(0); }
  if (mode.listing === 'fail') { console.error('ERROR: unable to download'); process.exit(1); }
  console.log(JSON.stringify({ channel: 'Fake ' + handle, uploader_id: '@' + handle, channel_id: 'UC' + 'a'.repeat(22),
    entries: Array.from({ length: videos }, (_, i) => ({ id: idOf(i), title: 'Claude agents tutorial number ' + i })) }));
  process.exit(0);
}
const id = args.find((a) => a.includes('watch?v=')).split('v=')[1];
const mweb = args.some((a) => a.includes('player_client=mweb'));
const out = path.dirname(args[args.indexOf('-o') + 1]);
const n = Number(id.slice(4));
if (args.includes('--write-info-json') && !(mode.info === 'mweb-only' && !mweb)) {
  fs.writeFileSync(path.join(out, id + '.info.json'), JSON.stringify({ title: 'Claude agents tutorial number ' + n, view_count: 1000 + n, upload_date: '202610' + String(10 + n).padStart(2, '0'), tags: ['claude', 'agents'],
    language: 'en-US', automatic_captions: { 'bn-orig': [], 'en-orig': [], en: [], de: [] }, subtitles: {} }));
}
const captions = mode.captions ?? 'ok';
if (args.includes('--write-auto-subs') && (captions === 'ok' || captions === 'short' || (captions === 'mweb-only' && mweb))) {
  const words = captions === 'short' ? 50 : 400;
  const text = Array.from({ length: words }, (_, i) => 'word' + i).join(' ');
  const lang = args[args.indexOf('--sub-langs') + 1];
  fs.writeFileSync(path.join(out, id + '.' + lang + '.json3'), JSON.stringify({ events: [{ segs: [{ utf8: text.slice(0, 40) }] }, { tStartMs: 1, segs: [{ utf8: text.slice(40) + '\\n' }] }, { tStartMs: 2 }] }));
}
`;

const fakeClaude = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const mode = (() => { try { return fs.readFileSync(__dirname + '/claude-mode', 'utf8'); } catch { return 'ok'; } })();
let stdin = '';
process.stdin.on('data', (c) => (stdin += c));
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(claudeLog)}, JSON.stringify({ args, stdin }));
  const line = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  line({ type: 'system', subtype: 'init' });
  if (mode === 'not-signed-in') { line({ type: 'result', subtype: 'success', is_error: true, result: 'Please run /login' }); process.exit(1); }
  const text = mode === 'short' ? '# Short' : '# Fake Voice Guide\\n' + 'A sentence about the voice. '.repeat(60);
  line({ type: 'result', subtype: 'success', is_error: false, result: text, total_cost_usd: 0.05 });
});
`;
await writeFile(path.join(bin, 'yt-dlp'), fakeYtDlp);
await writeFile(path.join(bin, 'claude'), fakeClaude);
await chmod(path.join(bin, 'yt-dlp'), 0o755);
await chmod(path.join(bin, 'claude'), 0o755);
const setYt = (mode: object) => writeFile(path.join(bin, 'yt-mode.json'), JSON.stringify(mode));
const setClaude = (mode: string) => writeFile(path.join(bin, 'claude-mode'), mode);
const ytCalls = async () => (await readFile(ytLog, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]);

const { clubRouter } = await import('./index.js');
const { getJob } = await import('./jobs.js');
const { rootDir, listWorkspaces } = await import('./store.js');

const app = express();
app.use('/api/club', clubRouter({ ai: { extraDirs: [], pollMs: 10 }, avatarFetch: async (input) => String(input).includes('youtube.com') ? new Response('<meta property="og:image" content="https://yt3.ggpht.com/fixture">') : new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a82sAAAAASUVORK5CYII=', 'base64')) }));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async () => {
  server.close();
  process.env.PATH = originalPath;
  await rm(temp, { recursive: true, force: true });
});

const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
};
const finish = async (id: string) => {
  for (let i = 0; i < 600; i++) {
    const { body } = await call('GET', `/jobs/${id}`);
    if (body.status !== 'running') return body;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('job did not finish');
};
const progress = (id: string) => getJob(id)!.events.filter((e) => e.type === 'progress').map((e) => (e.data as { message: string }).message);
const exists = (file: string) => stat(file).then(() => true, () => false);
const dir = (slug: string) => path.join(rootDir(), slug);

test('Add channel reads the channel, saves 30-upload data and transcripts, then writes the voice guide', async () => {
  await setYt({});
  await setClaude('ok');
  const started = await call('POST', '/workspaces', { channelUrl: 'youtube.com/@first/videos' });
  assert.equal(started.status, 202);
  const job = await finish(started.body.id);
  assert.equal(job.status, 'done');
  assert.equal(job.result.voice, 'built');
  const { workspace } = job.result;
  assert.equal(workspace.name, 'Fake first');
  assert.equal(workspace.handle, '@first');
  assert.equal(workspace.avatarUrl, '/api/club/workspaces/fake-first/avatar');
  assert.equal(workspace.channelUrl, 'https://www.youtube.com/@first');
  assert.ok(workspace.topics.includes('claude') && workspace.topics.includes('agents'), `topics: ${workspace.topics}`);

  const channel = JSON.parse(await readFile(path.join(dir('fake-first'), 'channel.json'), 'utf8'));
  assert.equal(channel.uploads.length, 12);
  assert.deepEqual(channel.uploads[3], { id: 'vid_0000003', title: 'Claude agents tutorial number 3', views: 1003, date: '2026-10-13' });
  assert.equal(channel.channelId, 'UC' + 'a'.repeat(22));

  const transcripts = (await readdir(path.join(dir('fake-first'), 'own-channel', 'transcripts'))).sort();
  assert.equal(transcripts.length, 10, 'captions are read for the last 10 videos only');
  const one = await readFile(path.join(dir('fake-first'), 'own-channel', 'transcripts', 'vid_0000000.md'), 'utf8');
  assert.equal(one.trim().split(' ').length, 400, 'caption fragments are joined into plain text');

  assert.match(await readFile(path.join(dir('fake-first'), 'voice.md'), 'utf8'), /^# Fake Voice Guide/);
  assert.equal((await call('GET', '/workspaces')).body.current, null, 'background import does not switch channels');

  const calls = await ytCalls();
  const listing = calls.find((a) => a.includes('--flat-playlist'))!;
  assert.deepEqual(listing.slice(listing.indexOf('--playlist-end'), listing.indexOf('--playlist-end') + 2), ['--playlist-end', '30']);
  assert.equal(listing.at(-1), 'https://www.youtube.com/@first/videos');
  const subs = calls.filter((a) => a.includes('--write-auto-subs'));
  assert.equal(subs.length, 10);
  assert.ok(subs.every((a) => a[a.indexOf('--sub-langs') + 1] === 'en-orig'), 'the track of the spoken language, not one of the dubbed ones');
  assert.ok(calls.every((a) => a.includes('--flat-playlist') || a.includes('--skip-download')), 'no video file is downloaded');

  const prompt = JSON.parse(await readFile(claudeLog, 'utf8'));
  assert.ok(prompt.args.includes('sonnet') && prompt.args[prompt.args.indexOf('--max-budget-usd') + 1] === '1.5');
  assert.match(prompt.stdin, /voice guide for a YouTube creator, Fake first/);
  assert.match(prompt.stdin, /### \[vid_0000009\]\nword0 /);
  assert.ok(!prompt.stdin.includes('{transcripts}') && !prompt.stdin.includes('{name}'));

  assert.deepEqual(progress(started.body.id), ['Reading your channel…', 'Reading your last 10 videos…', 'Writing your voice guide…']);
});

test('Rebuild voice guide re-reads the latest videos, and retries with the mweb client when the default one gets no captions', async () => {
  await setYt({ captions: 'mweb-only' });
  await setClaude('ok');
  const before = (await ytCalls()).length;
  const started = await call('POST', '/workspaces/fake-first/voice', {});
  assert.equal(started.status, 202);
  const job = await finish(started.body.id);
  assert.deepEqual(job.result, { voice: 'built' });
  const calls = (await ytCalls()).slice(before);
  const subs = calls.filter((a) => a.includes('--write-auto-subs'));
  assert.equal(subs.length, 20, 'every caption call is tried twice');
  assert.equal(subs.filter((a) => a.includes('youtube:player_client=mweb')).length, 10);
  assert.ok(calls.filter((a) => !a.includes('--write-auto-subs') && !a.includes('--flat-playlist')).every((a) => !a.some((x) => x.includes('mweb'))), 'videos beyond the first 10 need no retry');
});

test('when YouTube refuses the default player client for a video, its data is read with mweb', async () => {
  await setYt({ info: 'mweb-only', videos: 3 });
  const before = (await ytCalls()).length;
  const job = await finish((await call('POST', '/workspaces', { channelUrl: '@refused' })).body.id);
  assert.equal(job.status, 'done');
  const channel = JSON.parse(await readFile(path.join(dir('fake-refused'), 'channel.json'), 'utf8'));
  assert.equal(channel.uploads[2].views, 1002);
  const infoCalls = (await ytCalls()).slice(before).filter((a) => a.includes('--write-info-json'));
  assert.equal(infoCalls.length, 6, 'each of the 3 videos is tried twice');
  assert.equal(job.result.voice, 'built', 'three transcripts are enough for a voice guide');
});

test('a channel without usable captions asks the Voice DNA questions, and the answers become the guide', async () => {
  await setYt({ captions: 'short' });
  const started = await call('POST', '/workspaces', { channelUrl: '@quiet' });
  const job = await finish(started.body.id);
  assert.equal(job.status, 'done');
  assert.equal(job.result.voice, 'needs-answers');
  const slug = job.result.workspace.slug;
  assert.equal(await exists(path.join(dir(slug), 'voice.md')), false, 'no guide is invented');
  assert.equal((await call('GET', '/workspaces')).body.current, null, 'background import does not select its result');

  assert.equal((await call('POST', `/workspaces/${slug}/voice`, { answers: { voice: '', audience: 'x' } })).status, 400);
  const answered = await call('POST', `/workspaces/${slug}/voice`, { answers: { voice: 'Warm and direct.', audience: 'Beginners learning Claude.', moves: '' } });
  assert.deepEqual((await finish(answered.body.id)).result, { voice: 'built' });
  const guide = await readFile(path.join(dir(slug), 'voice.md'), 'utf8');
  assert.match(guide, /- \*\*Voice:\*\* Warm and direct\./);
  assert.match(guide, /- \*\*Audience:\*\* Beginners learning Claude\./);
  assert.ok(!guide.includes('Signature moves'), 'an unanswered question is left out');
  assert.equal((await call('GET', `/workspaces/${slug}`)).body.about, 'Beginners learning Claude.');
});

test('rebuilding with too few captions leaves an existing guide alone and asks for answers', async () => {
  await setYt({ captions: 'none' });
  const before = await readFile(path.join(dir('fake-first'), 'voice.md'), 'utf8');
  const job = await finish((await call('POST', '/workspaces/fake-first/voice', {})).body.id);
  assert.deepEqual(job.result, { voice: 'needs-answers' });
  assert.equal(await readFile(path.join(dir('fake-first'), 'voice.md'), 'utf8'), before);
});

test('a channel link that is not a channel is refused at once with one sentence, and no job starts', async () => {
  for (const channelUrl of ['https://example.com/@x', 'hello there', 'https://youtube.com/watch?v=abc']) {
    const res = await call('POST', '/workspaces', { channelUrl });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Paste a YouTube channel link, like youtube.com/@yourchannel.');
  }
});

test('a failed AI step leaves the channel added; adding it again reuses it instead of making a copy', async () => {
  await setYt({});
  await setClaude('not-signed-in');
  const first = await finish((await call('POST', '/workspaces', { channelUrl: 'https://www.youtube.com/@retry' })).body.id);
  assert.equal(first.status, 'failed');
  assert.equal(first.error, 'Claude is not signed in.');
  const slugs = (await listWorkspaces()).filter((w) => w.handle === '@retry');
  assert.equal(slugs.length, 1);
  assert.equal(await exists(path.join(dir(slugs[0].slug), 'voice.md')), false);

  await setClaude('short');
  const tooShort = await finish((await call('POST', '/workspaces', { channelUrl: '@retry' })).body.id);
  assert.equal(tooShort.status, 'failed');
  assert.equal(tooShort.error, 'The voice guide came back too short. Try again.');
  assert.equal(await exists(path.join(dir(slugs[0].slug), 'voice.md')), false, 'a short answer is not saved');

  await setClaude('ok');
  const done = await finish((await call('POST', '/workspaces', { channelUrl: '@retry' })).body.id);
  assert.equal(done.result.voice, 'built');
  assert.equal(done.result.workspace.slug, slugs[0].slug);
  assert.equal((await listWorkspaces()).filter((w) => w.handle === '@retry').length, 1);
});

test('adding a channel that already has a voice guide returns it without calling YouTube', async () => {
  const before = (await ytCalls()).length;
  const job = await finish((await call('POST', '/workspaces', { channelUrl: 'https://www.youtube.com/@FIRST/videos' })).body.id);
  assert.equal(job.result.workspace.slug, 'fake-first');
  assert.equal((await ytCalls()).length, before);
  assert.equal((await call('GET', '/workspaces')).body.current, null, 'background import does not switch channels');
});

test('a channel with no videos, or one YouTube will not list, fails with one sentence', async () => {
  await setYt({ listing: 'empty' });
  const empty = await finish((await call('POST', '/workspaces', { channelUrl: '@nothing' })).body.id);
  assert.equal(empty.error, "Couldn't find any videos on that channel.");
  await setYt({ listing: 'fail' });
  const failed = await finish((await call('POST', '/workspaces', { channelUrl: '@broken' })).body.id);
  assert.equal(failed.error, "Couldn't read that channel from YouTube. Check the link and try again.");
  assert.ok(!(await listWorkspaces()).some((w) => w.handle === '@nothing' || w.handle === '@broken'), 'nothing is created');
});

test('rebuilding the voice guide of an unknown channel is a 404', async () => {
  assert.equal((await call('POST', '/workspaces/nope/voice', {})).status, 404);
});
