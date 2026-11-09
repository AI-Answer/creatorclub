import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, writeFile, chmod, readFile, mkdir, readdir, stat } from 'node:fs/promises';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

/*
 * End to end through the HTTP routes with stand-ins for yt-dlp, ffmpeg and claude on PATH and for Gemini's web address.
 * Nothing here reaches YouTube or a paid AI. (Temp folders are left for the system to clear.)
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-breakdown-'));
const bin = path.join(temp, 'bin');
const logs = path.join(temp, 'logs');
await mkdir(bin);
await mkdir(logs);
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;

const ytLog = path.join(logs, 'yt-dlp.log');
const claudeLog = path.join(logs, 'claude.json');

// Info file for a video: 5000 views, three comments, English auto captions, a thumbnail.
const fakeYtDlp = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const mode = (() => { try { return JSON.parse(fs.readFileSync(__dirname + '/yt-mode.json', 'utf8')); } catch { return {}; } })();
fs.appendFileSync(${JSON.stringify(ytLog)}, JSON.stringify(args) + '\\n');
if (args[0] === '--version') { console.log('2026.03.17'); process.exit(0); }
if (mode.slow) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, mode.slow);
const mweb = args.some((a) => a.includes('player_client=mweb'));
if (args.includes('--flat-playlist')) {
  console.log(JSON.stringify({ channel: 'Source Channel', channel_id: 'UC' + 'b'.repeat(22),
    entries: Array.from({ length: 30 }, (_, i) => ({ id: 'up_' + String(i).padStart(8, '0'), title: 'Upload ' + i, ...(mode.flatViews ? { view_count: 1000 + i } : {}) })) }));
  process.exit(0);
}
if (args.includes('--print')) {
  for (const arg of args.filter((a) => a.includes('watch?v='))) { const id = arg.split('v=')[1]; console.log(id + '\\t' + (1000 + Number(id.slice(3)))); }
  process.exit(0);
}
if (args.includes('-f') || args.includes('-x') || !args.includes('--skip-download')) { console.error('A STREAM WAS REQUESTED'); process.exit(3); }
const out = path.dirname(args[args.indexOf('-o') + 1]);
const instagram = args.some((a) => a.includes('instagram.com'));
if (instagram) {
  if (mode.instagram === 'blocked') { console.error('ERROR: [Instagram] login required'); process.exit(1); }
  fs.writeFileSync(path.join(out, 'media.info.json'), JSON.stringify({ title: 'Video by maker', uploader: 'maker', like_count: 321, comment_count: 4, view_count: 9000, ...(mode.instagram === 'no-caption' ? {} : { description: 'caption here: three tips for editing' }) }));
  fs.writeFileSync(path.join(out, 'media.jpg'), 'jpg');
  process.exit(0);
}
if (args.includes('--write-info-json')) {
  if (mode.info === 'mweb-only' && !mweb) { console.error('ERROR: 403'); process.exit(1); }
  if (mode.info === 'fail') { console.error('ERROR: Video unavailable'); process.exit(1); }
  fs.writeFileSync(path.join(out, 'media.info.json'), JSON.stringify({ title: 'How I built it', channel: 'Source Channel', channel_url: 'https://www.youtube.com/channel/UC' + 'b'.repeat(22),
    view_count: 5000, like_count: 400, comment_count: 214, upload_date: '20260101', duration: 60, language: 'en',
    automatic_captions: mode.captions === 'none' ? {} : { 'en-orig': [], en: [] }, subtitles: {},
    comments: [{ text: 'Can you do this with a free plan?', like_count: 90, parent: 'root' }, { text: 'Great video', like_count: 5, parent: 'root' }, { text: 'reply', like_count: 500, parent: 'abc' }] }));
  if (args.includes('--write-thumbnail') && mode.thumbnail !== 'none') fs.writeFileSync(path.join(out, 'media.webp'), 'webp');
  process.exit(0);
}
if (args.includes('--write-auto-subs')) {
  const lang = args[args.indexOf('--sub-langs') + 1];
  fs.writeFileSync(path.join(out, 'media.' + lang + '.json3'), JSON.stringify({ events: [{ segs: [{ utf8: 'Today we build the thing ' }] }, { segs: [{ utf8: 'in three steps\\n' }] }] }));
  process.exit(0);
}
`;

// ffmpeg is only used on a dropped file: "-i file" alone prints the duration, then the audio and one still are written.
const fakeFfmpeg = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const mode = (() => { try { return JSON.parse(fs.readFileSync(__dirname + '/ff-mode.json', 'utf8')); } catch { return {}; } })();
fs.appendFileSync(${JSON.stringify(path.join(logs, 'ffmpeg.log'))}, JSON.stringify(args) + '\\n');
const out = args[args.length - 1];
if (!args.includes('-loglevel')) { console.error('Input #0, mov,mp4\\n  Duration: ' + (mode.duration ?? '00:01:00.50') + ', start: 0.000000, bitrate: 500 kb/s'); process.exit(1); }
if (args.includes('-vn')) { if (mode.noAudio) { console.error('Output file does not contain any stream'); process.exit(1); } fs.writeFileSync(out, 'wav'); process.exit(0); }
if (args.includes('-frames:v')) { fs.writeFileSync(out, 'jpg'); process.exit(0); }
process.exit(1);
`;

const answer = {
  whyItWorked: { titlePackaging: 'A claim.', hookSpeed: 'Fast.', structure: ['Claim', 'Demo', 'Payoff'], retention: 'Open loops.', payoff: 'A working thing.', short: ['Clear claim', 'Fast demo'] },
  reusableOutline: ['Claim: the outcome', 'Demo: the how', 'Payoff: the result'],
  viewerQuestions: [{ question: 'Does it work on a free plan?', likes: 90.4 }],
  concepts: [1, 2, 3].map((n) => ({
    title: `Concept ${n}`, angle: `Angle ${n}`, twist: `Twist ${n}`, hook: `Hook ${n}`,
    demand: { level: 'high', note: 'Asked in comments.' }, gap: { level: 'mid', note: 'not checked' }, show: { level: 'high', note: 'Easy.' }, why: `Why ${n}`,
  })),
};
const fakeClaude = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const mode = (() => { try { return fs.readFileSync(__dirname + '/claude-mode', 'utf8'); } catch { return 'ok'; } })();
let stdin = '';
process.stdin.on('data', (c) => (stdin += c));
process.stdin.on('end', () => {
  fs.appendFileSync(${JSON.stringify(claudeLog)}, JSON.stringify({ args, stdin }) + '\\n');
  const line = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  line({ type: 'system', subtype: 'init' });
  const out = mode === 'bad' ? { nothing: true } : ${JSON.stringify(answer)};
  line({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(out), structured_output: out, total_cost_usd: 0.1 });
});
`;
for (const [name, body] of [['yt-dlp', fakeYtDlp], ['ffmpeg', fakeFfmpeg], ['claude', fakeClaude]] as const) {
  await writeFile(path.join(bin, name), body);
  await chmod(path.join(bin, name), 0o755);
}
const setYt = (mode: object) => writeFile(path.join(bin, 'yt-mode.json'), JSON.stringify(mode));
const setClaude = (mode: string) => writeFile(path.join(bin, 'claude-mode'), mode);
const setFf = (mode: object) => writeFile(path.join(bin, 'ff-mode.json'), JSON.stringify(mode));
const ytCalls = async () => (await readFile(ytLog, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]);
const claudeCalls = async () => (await readFile(claudeLog, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as { args: string[]; stdin: string });
const claudeCall = async () => (await claudeCalls()).at(-1)!;


const { clubRouter } = await import('./index.js');
const { getJob } = await import('./jobs.js');
const { GEMINI_ENDPOINT, GEMINI_MODEL } = await import('./ai.js');
const store = await import('./store.js');

// Tests pass what the transcription would have said, so no speech model is needed.
let transcribed: string | Error = 'spoken words from the audio';
const transcribeCalls: string[] = [];
// The only network the server may use here is Gemini's endpoint, and it is a stand-in.
interface GeminiCall { url: string; headers: Record<string, string>; body: any }
const geminiCalls: GeminiCall[] = [];
let gemini: 'ok' | 'private' | 'quota' | 'junk' | 'offline' = 'ok';
const geminiOutline = ['Gemini beat 1', 'Gemini beat 2', 'Gemini beat 3'];
const fakeFetch = (async (url: string, init: RequestInit) => {
  assert.equal(url, GEMINI_ENDPOINT, 'nothing but Gemini is ever fetched');
  geminiCalls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
  if (gemini === 'offline') throw new TypeError('offline');
  if (gemini === 'private') return new Response(JSON.stringify({ error: { message: 'Video is private' } }), { status: 400 });
  if (gemini === 'quota') return new Response('{}', { status: 429 });
  const text = gemini === 'junk' ? 'I watched it and it was good.' : JSON.stringify({ ...answer, reusableOutline: geminiOutline });
  return new Response(JSON.stringify({ id: 'i1', status: 'completed', steps: [{ type: 'user_input', content: [{ type: 'text', text: 'hi' }] }, { type: 'model_output', content: [{ type: 'text', text }] }] }), { status: 200 });
}) as unknown as typeof fetch;

const app = express();
app.use('/api/club', clubRouter({
  ai: { extraDirs: [], pollMs: 10, fetch: fakeFetch },
  transcribe: async (audio) => {
    transcribeCalls.push(audio);
    if (transcribed instanceof Error) throw transcribed;
    return transcribed;
  },
}));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}/api/club`;
after(() => server.close());

const call = async (method: string, url: string, body?: unknown | FormData) => {
  const form = body instanceof FormData;
  const res = await fetch(base + url, { method, headers: body && !form ? { 'content-type': 'application/json' } : {}, body: body ? (form ? body : JSON.stringify(body)) : undefined });
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
const folders = async () => (await readdir(store.breakdownsDir('dani'))).sort();
const breakdown = async (url: string) => {
  const started = await call('POST', '/breakdowns', { url });
  assert.equal(started.status, 202, JSON.stringify(started.body));
  return { id: started.body.id as string, job: await finish(started.body.id) };
};
const drop = async (name: string, bytes = `not really a video: ${name}:${Date.now()}`) => {
  const form = new FormData();
  form.append('file', new Blob([bytes]), name);
  const started = await call('POST', '/breakdowns', form);
  return { started, job: started.status === 202 ? await finish(started.body.id) : undefined };
};
const KEY = 'AIzaSyExampleKeyForTestingOnly1234';

await call('POST', '/workspaces', { name: 'Dani', topics: ['claude'] });
await writeFile(path.join(store.workspaceDir('dani'), 'voice.md'), '# Voice\n\n## Voice DNA\n- Plain and direct.\n');
await store.writeJSON(path.join(store.workspaceDir('dani'), 'channel.json'), { uploads: Array.from({ length: 10 }, (_, i) => ({ id: `own${i}`, title: `Own ${i}`, views: 100 * (i + 1), date: null })) });
await store.createVideo('dani', { title: 'Already on the board' });

test('a YouTube link is read from its details, captions, comments and thumbnail only; nothing reaches the board until Add to board', async () => {
  await setYt({});
  await setClaude('ok');
  const { id, job } = await breakdown('https://youtu.be/dQw4w9WgXcQ?si=tracking');
  assert.equal(job.status, 'done', JSON.stringify(job));
  const result = job.result;

  assert.deepEqual(progress(id), ['Reading the video details…', 'Checking how it did against the channel…', 'Reading the transcript…', 'Reading 2 comments…', 'Finding what made it work…']);

  // The stat row: views over the median of the channel's last 30 uploads (1000..1029 -> 1014.5).
  assert.equal(result.platform, 'youtube');
  assert.equal(result.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.deepEqual(result.video, { title: 'How I built it', channel: 'Source Channel', views: 5000, likes: 400, comments: 214, ageDays: result.video.ageDays, thumbnail: `/api/club/breakdowns/${result.id}/thumbnail`, multiplier: 4.93 });
  assert.ok(result.video.ageDays > 100);
  assert.equal(result.watchedWith, undefined, 'no Gemini key: Claude');
  assert.equal(result.viewerQuestions[0].likes, 90, 'likes are whole numbers');
  assert.equal(result.concepts.length, 3);

  // Saved: breakdown.json, the thumbnail and the transcript. Nothing else is left.
  const dir = path.join(store.breakdownsDir('dani'), result.id);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'breakdown.json'), 'utf8')), result);
  assert.deepEqual((await readdir(dir)).sort(), ['breakdown.json', 'thumbnail', 'transcript.txt']);
  assert.deepEqual(await readdir(path.join(dir, 'thumbnail')), ['thumbnail.webp']);
  assert.equal((await readFile(path.join(dir, 'transcript.txt'), 'utf8')).trim(), 'Today we build the thing in three steps');
  assert.equal(transcribeCalls.length, 0, 'YouTube is never transcribed from audio');

  // yt-dlp: details + comments + thumbnail, the caption track the details pointed to, and the channel. No stream is ever asked for.
  const calls = await ytCalls();
  assert.ok(calls.every((a) => !a.includes('-f') && !a.includes('-x') && (a.includes('--skip-download') || a.includes('--flat-playlist') || a.includes('--version'))));
  const info = calls.find((a) => a.includes('--write-info-json'))!;
  assert.ok(info.includes('--write-comments') && info.includes('--write-thumbnail') && info.includes('youtube:max_comments=40,all,0,0;comment_sort=top'));
  assert.equal(info.at(-1), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const subs = calls.find((a) => a.includes('--write-auto-subs'))!;
  assert.equal(subs[subs.indexOf('--sub-langs') + 1], 'en-orig');
  assert.ok(calls.some((a) => a.includes('--flat-playlist') && a.at(-1) === 'https://www.youtube.com/channel/UC' + 'b'.repeat(22) + '/videos'));
  assert.ok(calls.some((a) => a.includes('--print')), 'the view counts the flat playlist left out are read');
  assert.equal(await exists(path.join(logs, 'ffmpeg.log')), false, 'ffmpeg is not used for a link');

  // Claude read the thumbnail only, and was given the transcript, comments and numbers.
  const { args, stdin } = await claudeCall();
  assert.deepEqual(args.filter((_, i) => args[i - 1] === '--add-dir'), [path.join(dir, 'thumbnail')]);
  assert.equal(stdin.match(/thumbnail\.webp/g)!.length, 1, 'one image');
  assert.ok(stdin.includes('thumbnail') && !stdin.includes('frame-'));
  assert.ok(stdin.includes('Today we build the thing in three steps') && stdin.includes('Can you do this with a free plan?'));
  assert.ok(stdin.includes('Views: 5,000') && stdin.includes('4.93') && stdin.includes('Likes: 400'));
  assert.ok(stdin.includes('Already on the board'), 'existing titles are sent so concepts are new');
  assert.ok(stdin.includes("Dani's usual views per video: 550"));
  assert.ok(args.includes('sonnet'));

  assert.deepEqual((await store.listVideos('dani')).map((v) => v.title), ['Already on the board']);

  // Add to board puts one concept in Ideas, with where it came from.
  const added = await call('POST', `/breakdowns/${result.id}/concepts/1/add`);
  assert.equal(added.status, 201);
  assert.equal(added.body.title, 'Concept 2');
  assert.equal(added.body.stage, 'ideas');
  assert.deepEqual(added.body.source, { kind: 'breakdown', breakdownId: result.id });
  assert.deepEqual(added.body.idea, {
    angle: 'Angle 2', twist: 'Twist 2', hook: 'Hook 2', why: 'Why 2',
    demand: { level: 'high', note: 'Asked in comments.' }, gap: { level: 'mid', note: 'not checked' }, show: { level: 'high', note: 'Easy.' },
    sources: [{ label: 'How I built it', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
  });
  assert.deepEqual((await store.listVideos('dani')).map((v) => v.title), ['Already on the board', 'Concept 2']);
  const again = await call('POST', `/breakdowns/${result.id}/concepts/1/add`);
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'That concept is already on the board.');
  assert.equal((await call('POST', `/breakdowns/${result.id}/concepts/7/add`)).status, 404);
  assert.equal((await call('POST', '/breakdowns/bd_000000000000/concepts/0/add')).status, 404);

  // The list tells which videos already have a breakdown, so the UI can open one instead of running it again.
  const listed = await call('GET', '/breakdowns');
  assert.deepEqual(listed.body, [{ id: result.id, url: result.url, platform: result.platform, createdAt: result.createdAt, title: 'How I built it', channel: 'Source Channel' }]);
  assert.deepEqual((await call('GET', `/breakdowns/${result.id}`)).body, result);
  const thumb = await fetch(`${base}/breakdowns/${result.id}/thumbnail`);
  assert.equal(thumb.status, 200);
  assert.equal(await thumb.text(), 'webp');
  assert.equal((await fetch(`${base}/breakdowns/bd_000000000000/thumbnail`)).status, 404);
});

test('the channel views come from the flat playlist when it has them, with no extra reads', async () => {
  await setYt({ flatViews: true });
  const before = (await ytCalls()).length;
  const { job } = await breakdown('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  assert.equal(job.status, 'done');
  assert.equal(job.result.video.multiplier, 4.93);
  assert.ok(!(await ytCalls()).slice(before).some((a) => a.includes('--print')));
});

test("a Short is compared with the channel's other Shorts", async () => {
  await setYt({ flatViews: true });
  const before = (await ytCalls()).length;
  await breakdown('https://www.youtube.com/shorts/bbbbbbbbbbb');
  assert.ok((await ytCalls()).slice(before).some((a) => a.at(-1)?.endsWith('/shorts')));
});

test('a refused request is retried with the mweb client', async () => {
  await setYt({ info: 'mweb-only' });
  const before = (await ytCalls()).length;
  const { job } = await breakdown('https://www.youtube.com/watch?v=ccccccccccc');
  assert.equal(job.status, 'done');
  const calls = (await ytCalls()).slice(before).filter((a) => a.includes('--write-info-json'));
  assert.equal(calls.length, 2);
  assert.ok(!calls[0].some((a) => a.includes('player_client=mweb')) && calls[1].some((a) => a.includes('player_client=mweb')));
});

test('no captions or no thumbnail: the breakdown still works from the comments, with nothing transcribed', async () => {
  await setYt({ captions: 'none', thumbnail: 'none' });
  transcribeCalls.length = 0;
  const first = await breakdown('https://www.youtube.com/watch?v=ddddddddddd');
  assert.equal(first.job.status, 'done');
  assert.equal(transcribeCalls.length, 0);
  assert.ok(!progress(first.id).includes('Reading the transcript…'));
  const { args, stdin } = await claudeCall();
  assert.ok(!args.includes('--add-dir'), 'no image to read');
  assert.ok(!stdin.includes('One image is attached'));
  assert.equal(first.job.result.video.thumbnail, 'https://i.ytimg.com/vi/ddddddddddd/hqdefault.jpg', 'the screen falls back to YouTube\'s own thumbnail link');
  const dir = path.join(store.breakdownsDir('dani'), first.job.result.id);
  assert.deepEqual((await readdir(dir)).sort(), ['breakdown.json']);
});

test('an unreadable YouTube video fails with one sentence and leaves no folder', async () => {
  await setYt({ info: 'fail' });
  const before = await folders();
  const { job } = await breakdown('https://www.youtube.com/watch?v=ggggggggggg');
  assert.equal(job.status, 'failed');
  assert.equal(job.error, "Couldn't read that video from YouTube.");
  assert.deepEqual(await folders(), before);
});

test('Instagram: only the caption, numbers and thumbnail are read; blocked or no caption says one sentence', async () => {
  const before = await folders();
  await setYt({ instagram: 'blocked' });
  const blocked = await breakdown('https://www.instagram.com/reel/C8aBcD_eFgH/?igsh=x');
  assert.equal(blocked.job.status, 'failed');
  assert.equal(blocked.job.error, 'Instagram blocked the download. Drop the video file here instead.');
  assert.equal((await ytCalls()).filter((a) => a.at(-1) === 'https://www.instagram.com/reel/C8aBcD_eFgH/').length, 1, 'no second try with another client');

  await setYt({ instagram: 'no-caption' });
  const bare = await breakdown('https://www.instagram.com/reel/C8aBcD_eFgH/');
  assert.equal(bare.job.status, 'failed');
  assert.equal(bare.job.error, 'That reel has no caption to read. Drop the video file here instead.');
  assert.deepEqual(await folders(), before, 'failed runs leave nothing');

  await setYt({});
  transcribeCalls.length = 0;
  const { id, job } = await breakdown('https://www.instagram.com/reel/C8aBcD_eFgH/');
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.equal(job.result.platform, 'instagram');
  assert.equal(job.result.video.channel, 'maker');
  assert.equal(job.result.video.views, 9000);
  assert.equal(job.result.video.multiplier, undefined);
  assert.equal(job.result.video.thumbnail, `/api/club/breakdowns/${job.result.id}/thumbnail`);
  assert.deepEqual(progress(id), ['Reading the video details…', 'Reading the caption…', 'Finding what made it work…']);
  assert.equal(transcribeCalls.length, 0, 'no audio is fetched or transcribed');
  assert.ok((await claudeCall()).stdin.includes('caption here: three tips for editing'));
  const calls = (await ytCalls()).filter((a) => a.some((x) => x.includes('instagram.com')));
  assert.ok(calls.every((a) => a.includes('--skip-download') && !a.includes('-f') && !a.includes('-x')));
  assert.deepEqual((await readdir(path.join(store.breakdownsDir('dani'), job.result.id))).sort(), ['breakdown.json', 'thumbnail', 'transcript.txt']);
});

test('a dropped video file: its sound is transcribed, one still becomes the thumbnail, and the file is removed', async () => {
  await setYt({});
  await setFf({});
  const before = (await ytCalls()).length;
  transcribed = 'the file says this';
  transcribeCalls.length = 0;
  const { started, job } = await drop('My Cool_clip.mp4');
  assert.equal(started.status, 202);
  assert.equal(job.status, 'done', JSON.stringify(job));
  const result = job.result;
  assert.equal(result.platform, 'file');
  assert.equal(result.url, '');
  assert.equal(result.video.title, 'My Cool clip');
  assert.equal(result.video.views, 0);
  assert.equal(result.video.multiplier, undefined);
  assert.equal(result.video.thumbnail, `/api/club/breakdowns/${result.id}/thumbnail`);
  assert.equal((await ytCalls()).length, before, 'yt-dlp is not used for a file');
  assert.equal(transcribeCalls.length, 1);
  assert.ok(transcribeCalls[0].endsWith('audio.wav'), 'the speech model gets the extracted audio');
  assert.deepEqual(progress(started.body.id), ['Transcribing the audio…', 'Reading the transcript…', 'Finding what made it work…']);
  const { stdin } = await claudeCall();
  assert.ok(stdin.includes('the file says this') && stdin.includes('Title: My Cool clip') && stdin.includes('One image is attached'));

  // The uploaded copy is gone: only the result, the thumbnail and the transcript remain.
  const dir = path.join(store.breakdownsDir('dani'), result.id);
  assert.deepEqual((await readdir(dir)).sort(), ['breakdown.json', 'thumbnail', 'transcript.txt']);
  assert.equal(await (await fetch(`${base}/breakdowns/${result.id}/thumbnail`)).text(), 'jpg');
  transcribed = 'spoken words from the audio';
});

test('a dropped file with no sound still gets a breakdown from its still; too long, other files and failures leave no folder', async () => {
  await setFf({ noAudio: true });
  transcribeCalls.length = 0;
  const silent = await drop('silent.mov');
  assert.equal(silent.job!.status, 'done');
  assert.equal(transcribeCalls.length, 0);
  assert.ok(!progress(silent.started.body.id).includes('Reading the transcript…'));

  const before = await folders();
  await setFf({ duration: '00:31:00.00' });
  const long = await drop('long.mp4');
  assert.equal(long.job!.status, 'failed');
  assert.equal(long.job!.error, 'That video is longer than 30 minutes, which is the most Break down reads.');
  await setFf({ duration: '00:30:00.00' });
  assert.equal((await drop('exactly-thirty.mp4')).job!.status, 'done', '30 minutes is allowed');

  const refused = await drop('notes.txt');
  assert.equal(refused.started.status, 400);
  assert.equal(refused.started.body.error, 'Drop a video file, like an mp4 or a mov.');
  assert.equal((await folders()).length, before.length + 1, 'only the finished run keeps a folder');
  await setFf({});
});

test('a file over 500 MB is refused as it arrives, with one sentence and no folder', async () => {
  const before = await folders();
  // A sparse body of 501 MB is streamed so nothing large is held in memory.
  const size = 501 * 1024 * 1024;
  const boundary = 'xBOUNDARYx';
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="huge.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const chunk = Buffer.alloc(1024 * 1024);
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent === 0) controller.enqueue(head);
      if (sent < size) { controller.enqueue(chunk); sent += chunk.length; return; }
      controller.enqueue(tail);
      controller.close();
    },
  });
  const res = await fetch(`${base}/breakdowns`, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body, duplex: 'half' } as RequestInit).catch(() => undefined);
  if (res) {
    assert.equal(res.status, 413);
    assert.equal((await res.json()).error, 'That file is larger than 500 MB, which is the most Break down reads.');
  }
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(await folders(), before);
});

test('an upload that is dropped halfway starts no job and leaves no folder', async () => {
  const before = await folders();
  const boundary = 'xBOUNDARYx';
  const socket = net.connect(port, '127.0.0.1');
  await new Promise((r) => socket.once('connect', r));
  const part = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.mp4"\r\nContent-Type: video/mp4\r\n\r\nabcdef`;
  socket.write(`POST /api/club/breakdowns HTTP/1.1\r\nHost: x\r\nContent-Type: multipart/form-data; boundary=${boundary}\r\nContent-Length: 100000\r\n\r\n${part}`);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal((await folders()).length, before.length + 1, 'the upload folder exists while it runs');
  socket.destroy();
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(await folders(), before);
});

test('bad requests are refused before any job starts', async () => {
  const before = await folders();
  const jobs = await call('POST', '/breakdowns', { url: 'https://example.com/video' });
  assert.equal(jobs.status, 400);
  assert.equal(jobs.body.error, 'Paste a YouTube or Instagram link, or drop a video file.');
  assert.equal((await call('POST', '/breakdowns', {})).status, 400);
  assert.equal((await call('POST', '/breakdowns', { url: 'https://youtu.be/dQw4w9WgXcQ', extra: 1 })).status, 400);
  assert.deepEqual(await folders(), before);
});

test('an answer in the wrong shape fails with one sentence and leaves no folder', async () => {
  await setYt({});
  await setClaude('bad');
  const before = await folders();
  const { job } = await breakdown('https://www.youtube.com/watch?v=hhhhhhhhhhh');
  assert.equal(job.status, 'failed');
  assert.equal(job.error, 'Claude answered in a shape we could not read.');
  assert.deepEqual(await folders(), before);
  await setClaude('ok');
});

test('with a Gemini key a YouTube link is watched from its link, and the result says so', async () => {
  await setYt({});
  await call('PUT', '/settings/gemini-key', { key: KEY });
  geminiCalls.length = 0;
  gemini = 'ok';
  const claudeBefore = (await claudeCalls()).length;
  const before = (await ytCalls()).length;
  const { id, job } = await breakdown('https://www.youtube.com/watch?v=iiiiiiiiiii&list=PL1');
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.equal(job.result.watchedWith, 'gemini');
  assert.deepEqual(job.result.reusableOutline, geminiOutline);
  assert.equal((await claudeCalls()).length, claudeBefore, 'Claude was not needed');

  assert.equal(geminiCalls.length, 1);
  const [sent] = geminiCalls;
  assert.equal(sent.headers['x-goog-api-key'], KEY);
  assert.equal(sent.body.model, GEMINI_MODEL);
  assert.deepEqual(sent.body.input[1], { type: 'video', uri: 'https://www.youtube.com/watch?v=iiiiiiiiiii' }, 'the link, never a download');
  assert.equal(sent.body.input[0].type, 'text');
  assert.ok(sent.body.input[0].text.includes('Today we build the thing') && sent.body.input[0].text.includes('Can you do this with a free plan?'));
  assert.equal(sent.body.response_format.type, 'text');
  assert.equal(sent.body.response_format.mime_type, 'application/json');
  assert.deepEqual(Object.keys(sent.body.response_format.schema.properties), ['whyItWorked', 'reusableOutline', 'viewerQuestions', 'concepts']);
  assert.ok(!('title' in sent.body.response_format.schema), 'only the schema itself is sent');
  assert.ok((await ytCalls()).slice(before).every((a) => !a.includes('-f')), 'still no download');

  // The key stays out of everything that is saved or shown.
  const dir = path.join(store.breakdownsDir('dani'), job.result.id);
  for (const name of await readdir(dir)) if (name !== 'thumbnail') assert.ok(!(await readFile(path.join(dir, name), 'utf8')).includes(KEY), name);
  assert.ok(!JSON.stringify(getJob(id)!.events).includes(KEY));
  assert.ok(!JSON.stringify((await call('GET', '/settings')).body).includes('AIzaSy'));
});

test('when Gemini cannot watch (private video, quota, bad answer, no network) Claude takes over with no Gemini tag and no sign of the failure', async () => {
  await setYt({});
  for (const [n, failure] of (['private', 'quota', 'junk', 'offline'] as const).entries()) {
    gemini = failure;
    geminiCalls.length = 0;
    const claudeBefore = (await claudeCalls()).length;
    const { id, job } = await breakdown(`https://www.youtube.com/watch?v=jjjjjjjjjj${n}`);
    assert.equal(job.status, 'done', `${failure}: ${JSON.stringify(job)}`);
    assert.equal(geminiCalls.length, 1, failure);
    assert.equal(job.result.watchedWith, undefined, failure);
    assert.deepEqual(job.result.reusableOutline, answer.reusableOutline, failure);
    assert.equal((await claudeCalls()).length, claudeBefore + 1, failure);
    assert.ok(!JSON.stringify(progress(id)).includes('Gemini'), failure);
  }
  gemini = 'ok';
});

test('Gemini is only for YouTube links: Instagram and dropped files never reach it, and removing the key goes back to Claude', async () => {
  await setYt({});
  geminiCalls.length = 0;
  assert.equal((await breakdown('https://www.instagram.com/reel/C8aBcD_eFgI/')).job.status, 'done');
  assert.equal((await drop('clip.mp4')).job!.status, 'done');
  assert.equal(geminiCalls.length, 0);
  await call('DELETE', '/settings/gemini-key');
  const { job } = await breakdown('https://www.youtube.com/watch?v=kkkkkkkkkkk');
  assert.equal(geminiCalls.length, 0);
  assert.equal(job.result.watchedWith, undefined);
});

test('a video is broken down once: a finished breakdown of it is returned as it is, a running one is joined', async () => {
  await setYt({ slow: 400 });
  await setClaude('ok');
  const url = 'https://www.youtube.com/watch?v=mmmmmmmmmmm';
  const beforeFolders = await folders();
  const first = await call('POST', '/breakdowns', { url });
  for (let attempt = 0; attempt < 50 && (await folders()).length === beforeFolders.length; attempt++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(first.status, 202);
  // The same video again, in another form of the link, while it runs: the same job, no second folder.
  const foldersWhileRunning = await folders();
  const joined = await call('POST', '/breakdowns', { url: 'https://youtu.be/mmmmmmmmmmm?si=x' });
  assert.equal(joined.status, 202);
  assert.equal(joined.body.id, first.body.id);
  assert.deepEqual(await folders(), foldersWhileRunning);
  const done = await finish(first.body.id);
  assert.equal(done.status, 'done');

  const claudeBefore = (await claudeCalls()).length;
  const again = await call('POST', '/breakdowns', { url: 'https://www.youtube.com/watch?v=mmmmmmmmmmm&t=30s' });
  assert.equal(again.status, 200, 'a finished breakdown is returned, not a job');
  assert.deepEqual(again.body, done.result);
  assert.equal((await claudeCalls()).length, claudeBefore, 'and nothing is asked of the AI again');
  assert.equal((await folders()).filter((name) => name === done.result.id).length, 1);

  // Another video is its own breakdown, and a failed run leaves nothing behind to return.
  const other = await call('POST', '/breakdowns', { url: 'https://www.youtube.com/watch?v=nnnnnnnnnnn' });
  assert.equal(other.status, 202);
  assert.notEqual(other.body.id, first.body.id);
  await finish(other.body.id);
});

test('stopping a breakdown stops it quietly and removes its folder', async () => {
  await setYt({ slow: 1500 });
  const before = await folders();
  const started = await call('POST', '/breakdowns', { url: 'https://www.youtube.com/watch?v=lllllllllll' });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await folders()).length, before.length + 1, 'the run has a folder while it works');
  const cancelled = await call('DELETE', `/jobs/${started.body.id}`);
  assert.equal(cancelled.body.status, 'running');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal((await call('GET', `/jobs/${started.body.id}`)).body.status, 'cancelled');
  assert.deepEqual(await folders(), before);
  await setYt({});
});
