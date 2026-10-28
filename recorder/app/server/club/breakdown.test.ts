import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, writeFile, chmod, readFile, mkdir, readdir, stat, realpath } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

/*
 * End to end through the HTTP routes with stand-ins for yt-dlp, ffmpeg, claude and gemini on PATH.
 * Nothing here reaches YouTube or a paid AI. (Temp folders are left for the system to clear.)
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-breakdown-'));
const bin = path.join(temp, 'bin');
const logs = path.join(temp, 'logs');
const geminiDir = path.join(temp, 'gemini-home');
await mkdir(bin);
await mkdir(logs);
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;

const ytLog = path.join(logs, 'yt-dlp.log');
const claudeLog = path.join(logs, 'claude.json');
const geminiLog = path.join(logs, 'gemini.json');

// Info file for video n: 5000 views, a few comments, English auto captions.
const fakeYtDlp = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const mode = (() => { try { return JSON.parse(fs.readFileSync(__dirname + '/yt-mode.json', 'utf8')); } catch { return {}; } })();
fs.appendFileSync(${JSON.stringify(ytLog)}, JSON.stringify(args) + '\\n');
if (args[0] === '--version') { console.log('2026.03.17'); process.exit(0); }
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
const out = path.dirname(args[args.indexOf('-o') + 1]);
const instagram = args.some((a) => a.includes('instagram.com'));
if (instagram) {
  if (mode.instagram === 'blocked') { console.error('ERROR: [Instagram] login required'); process.exit(1); }
  fs.writeFileSync(path.join(out, 'media.info.json'), JSON.stringify({ title: 'Video by maker', uploader: 'maker', like_count: 321, comment_count: 4, view_count: 9000, description: 'caption here' }));
  fs.writeFileSync(path.join(out, 'media.mp4'), 'video');
  process.exit(0);
}
if (args.includes('--write-info-json')) {
  if (mode.info === 'mweb-only' && !mweb) { console.error('ERROR: 403'); process.exit(1); }
  if (mode.info === 'fail') { console.error('ERROR: Video unavailable'); process.exit(1); }
  fs.writeFileSync(path.join(out, 'media.info.json'), JSON.stringify({ title: 'How I built it', channel: 'Source Channel', channel_url: 'https://www.youtube.com/channel/UC' + 'b'.repeat(22),
    view_count: 5000, like_count: 400, comment_count: 214, upload_date: '20260101', duration: 60, language: 'en',
    automatic_captions: mode.captions === 'none' ? {} : { 'en-orig': [], en: [] }, subtitles: {},
    comments: [{ text: 'Can you do this with a free plan?', like_count: 90, parent: 'root' }, { text: 'Great video', like_count: 5, parent: 'root' }, { text: 'reply', like_count: 500, parent: 'abc' }] }));
  process.exit(0);
}
if (args.includes('--write-auto-subs')) {
  const lang = args[args.indexOf('--sub-langs') + 1];
  fs.writeFileSync(path.join(out, 'media.' + lang + '.json3'), JSON.stringify({ events: [{ segs: [{ utf8: 'Today we build the thing ' }] }, { segs: [{ utf8: 'in three steps\\n' }] }] }));
  process.exit(0);
}
if (args.includes('-f')) {
  if (mode.video === 'fail') { console.error('ERROR: 403 Forbidden'); process.exit(1); }
  fs.writeFileSync(path.join(out, 'media.mp4'), 'video');
}
`;

// ffmpeg: "-i file" alone prints the duration; with an output pattern it writes the frames.
const fakeFfmpeg = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(path.join(logs, 'ffmpeg.log'))}, JSON.stringify(args) + '\\n');
const pattern = args[args.length - 1];
if (!pattern.endsWith('frame-%02d.jpg')) { console.error('Input #0, mov,mp4\\n  Duration: 00:01:00.50, start: 0.000000, bitrate: 500 kb/s'); process.exit(1); }
const count = Number(args[args.indexOf('-frames:v') + 1]);
for (let i = 1; i <= count; i++) fs.writeFileSync(pattern.replace('%02d', String(i).padStart(2, '0')), 'jpg');
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
  fs.writeFileSync(${JSON.stringify(claudeLog)}, JSON.stringify({ args, stdin }));
  const line = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  line({ type: 'system', subtype: 'init' });
  const out = mode === 'bad' ? { nothing: true } : ${JSON.stringify(answer)};
  line({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(out), structured_output: out, total_cost_usd: 0.1 });
});
`;
const fakeGemini = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('0.9.0'); process.exit(0); }
const mode = (() => { try { return fs.readFileSync(__dirname + '/gemini-mode', 'utf8'); } catch { return 'ok'; } })();
fs.writeFileSync(${JSON.stringify(geminiLog)}, JSON.stringify({ args, cwd: process.cwd() }));
if (mode === 'junk') { console.log('I watched it and it was good.'); process.exit(0); }
console.log('Loaded cached credentials.');
console.log('\`\`\`json\\n' + JSON.stringify({ ...${JSON.stringify(answer)}, reusableOutline: ['Gemini beat 1', 'Gemini beat 2', 'Gemini beat 3'] }) + '\\n\`\`\`');
`;
for (const [name, body] of [['yt-dlp', fakeYtDlp], ['ffmpeg', fakeFfmpeg], ['claude', fakeClaude], ['gemini', fakeGemini]] as const) {
  await writeFile(path.join(bin, name), body);
  await chmod(path.join(bin, name), 0o755);
}
const setYt = (mode: object) => writeFile(path.join(bin, 'yt-mode.json'), JSON.stringify(mode));
const setClaude = (mode: string) => writeFile(path.join(bin, 'claude-mode'), mode);
const setGemini = (mode: string) => writeFile(path.join(bin, 'gemini-mode'), mode);
const ytCalls = async () => (await readFile(ytLog, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]);
const claudeCall = async () => JSON.parse(await readFile(claudeLog, 'utf8')) as { args: string[]; stdin: string };

const { clubRouter } = await import('./index.js');
const { getJob } = await import('./jobs.js');
const store = await import('./store.js');

// Tests pass what the transcription would have said, so no speech model is needed.
let transcribed: string | Error = 'spoken words from the audio';
const transcribeCalls: string[] = [];
const app = express();
app.use('/api/club', clubRouter({
  ai: { extraDirs: [], geminiDir, pollMs: 10 },
  transcribe: async (video) => {
    transcribeCalls.push(video);
    if (transcribed instanceof Error) throw transcribed;
    return transcribed;
  },
}));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
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
const breakdown = async (url: string) => {
  const started = await call('POST', '/breakdowns', { url });
  assert.equal(started.status, 202, JSON.stringify(started.body));
  return { id: started.body.id as string, job: await finish(started.body.id) };
};

await call('POST', '/workspaces', { name: 'Dani', topics: ['claude'] });
await writeFile(path.join(store.workspaceDir('dani'), 'voice.md'), '# Voice\n\n## Voice DNA\n- Plain and direct.\n');
await store.writeJSON(path.join(store.workspaceDir('dani'), 'channel.json'), { uploads: Array.from({ length: 10 }, (_, i) => ({ id: `own${i}`, title: `Own ${i}`, views: 100 * (i + 1), date: null })) });
await store.createVideo('dani', { title: 'Already on the board' });

test('a YouTube link is read, framed and broken down; nothing reaches the board until Add to board', async () => {
  await setYt({});
  await setClaude('ok');
  const { id, job } = await breakdown('https://youtu.be/dQw4w9WgXcQ?si=tracking');
  assert.equal(job.status, 'done', JSON.stringify(job));
  const result = job.result;

  // The progress lines the screen shows, in order, ending with the three from the plan.
  const lines = progress(id);
  assert.deepEqual(lines.slice(-3), ['Reading the transcript…', 'Reading 2 comments…', 'Finding what made it work…']);
  assert.deepEqual(lines.slice(0, 3), ['Getting the video…', 'Looking at 20 frames…', 'Checking how it did against the channel…']);

  // The stat row: views over the median of the channel's last 30 uploads (1000..1029 -> 1014.5).
  assert.equal(result.platform, 'youtube');
  assert.equal(result.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.deepEqual(result.video, { title: 'How I built it', channel: 'Source Channel', views: 5000, likes: 400, comments: 214, ageDays: result.video.ageDays, thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', multiplier: 4.93 });
  assert.ok(result.video.ageDays > 100);
  assert.equal(result.watchedWith, undefined, 'Claude with frames is the default');
  assert.equal(result.viewerQuestions[0].likes, 90, 'likes are whole numbers');
  assert.equal(result.concepts.length, 3);

  // Saved in breakdowns/<id>/breakdown.json with the frames, transcript and comments beside it.
  const dir = path.join(store.breakdownsDir('dani'), result.id);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'breakdown.json'), 'utf8')), result);
  assert.equal((await readdir(path.join(dir, 'frames'))).length, 20);
  assert.equal((await readFile(path.join(dir, 'transcript.txt'), 'utf8')).trim(), 'Today we build the thing in three steps');
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'comments.json'), 'utf8')), [{ likes: 90, text: 'Can you do this with a free plan?' }, { likes: 5, text: 'Great video' }]);
  assert.ok(await exists(path.join(dir, 'video.mp4')), 'the 480p video stays');
  assert.ok(!(await exists(path.join(dir, '.work'))), 'working files are gone');
  assert.equal(transcribeCalls.length, 0, 'captions existed, so no transcription');

  // yt-dlp: the info call, the caption track the info pointed to, then the 480p download.
  const calls = await ytCalls();
  const info = calls.find((a) => a.includes('--write-info-json') && a.includes('--write-comments'))!;
  assert.ok(info.includes('youtube:max_comments=40,all,0,0;comment_sort=top') && info.includes('--skip-download'));
  assert.equal(info.at(-1), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const subs = calls.find((a) => a.includes('--write-auto-subs'))!;
  assert.equal(subs[subs.indexOf('--sub-langs') + 1], 'en-orig');
  assert.equal(subs[subs.indexOf('--sub-format') + 1], 'json3');
  const video = calls.find((a) => a.includes('-S'))!;
  assert.deepEqual(video.slice(video.indexOf('-f'), video.indexOf('-f') + 4), ['-f', 'bv*+ba/b', '-S', 'res:480']);
  assert.ok(calls.some((a) => a.includes('--flat-playlist') && a.at(-1) === 'https://www.youtube.com/channel/UC' + 'b'.repeat(22) + '/videos'));
  assert.ok(calls.some((a) => a.includes('--print')), 'the view counts the flat playlist left out are read');

  // Claude read the 20 frames from the breakdown folder, and was given the transcript, comments and numbers.
  const { args, stdin } = await claudeCall();
  assert.ok(args.includes('--add-dir') && args.includes(path.join(dir, 'frames')));
  assert.equal(stdin.match(/frame-\d\d\.jpg/g)!.length, 20);
  assert.ok(stdin.includes('Today we build the thing in three steps') && stdin.includes('Can you do this with a free plan?'));
  assert.ok(stdin.includes('Views: 5,000') && stdin.includes('4.93') && stdin.includes('Likes: 400'));
  assert.ok(stdin.includes('Already on the board'), 'existing titles are sent so concepts are new');
  assert.ok(stdin.includes("Dani's usual views per video: 550"), "the channel's own usual views are the base for judging demand");
  assert.ok(args.includes('sonnet'));

  // Nothing is on the board but the video that was already there.
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

  // It can be opened again, and its frames served.
  assert.deepEqual((await call('GET', `/breakdowns/${result.id}`)).body, result);
  const frame = await fetch(`${base}/breakdowns/${result.id}/frames/frame-01.jpg`);
  assert.equal(frame.status, 200);
  assert.equal((await fetch(`${base}/breakdowns/${result.id}/frames/..%2Fbreakdown.json`)).status, 404);
});

test('the channel views come from the flat playlist when it has them, with no extra reads', async () => {
  await setYt({ flatViews: true });
  const before = (await ytCalls()).length;
  const { job } = await breakdown('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  assert.equal(job.status, 'done');
  assert.equal(job.result.video.multiplier, 4.93);
  assert.ok(!(await ytCalls()).slice(before).some((a) => a.includes('--print')));
});

test('a Short is compared with the channel\'s other Shorts', async () => {
  await setYt({ flatViews: true });
  const before = (await ytCalls()).length;
  await breakdown('https://www.youtube.com/shorts/bbbbbbbbbbb');
  assert.ok((await ytCalls()).slice(before).some((a) => a.at(-1)?.endsWith('/shorts')));
});

test('a refused download is retried with the mweb client', async () => {
  await setYt({ info: 'mweb-only' });
  const before = (await ytCalls()).length;
  const { job } = await breakdown('https://www.youtube.com/watch?v=ccccccccccc');
  assert.equal(job.status, 'done');
  const calls = (await ytCalls()).slice(before).filter((a) => a.includes('--write-info-json'));
  assert.equal(calls.length, 2);
  assert.ok(!calls[0].some((a) => a.includes('player_client=mweb')) && calls[1].some((a) => a.includes('player_client=mweb')));
});

test('no captions: the audio is transcribed; a video that will not download still gets a breakdown from captions and comments', async () => {
  await setYt({ captions: 'none' });
  transcribed = 'spoken words from the audio';
  transcribeCalls.length = 0;
  const first = await breakdown('https://www.youtube.com/watch?v=ddddddddddd');
  assert.equal(first.job.status, 'done');
  assert.equal(transcribeCalls.length, 1);
  assert.ok(progress(first.id).includes('Transcribing the audio…'));
  assert.ok((await claudeCall()).stdin.includes('spoken words from the audio'));

  transcribed = new Error('no model');
  const second = await breakdown('https://www.youtube.com/watch?v=eeeeeeeeeee');
  assert.equal(second.job.status, 'done', 'comments are enough to work from');
  assert.ok(!progress(second.id).includes('Reading the transcript…'));

  await setYt({ video: 'fail' });
  const third = await breakdown('https://www.youtube.com/watch?v=fffffffffff');
  assert.equal(third.job.status, 'done');
  assert.ok(!progress(third.id).some((l) => l.startsWith('Looking at')), 'no video, no frames');
  assert.ok(!(await claudeCall()).args.includes('--add-dir'));
  transcribed = 'spoken words from the audio';
});

test('an unreadable YouTube video fails with one sentence', async () => {
  await setYt({ info: 'fail' });
  const { job } = await breakdown('https://www.youtube.com/watch?v=ggggggggggg');
  assert.equal(job.status, 'failed');
  assert.equal(job.error, "Couldn't read that video from YouTube. Check the link and try again.");
});

test('Instagram: a blocked download says to drop the file; a working one has no comments or multiplier', async () => {
  await setYt({ instagram: 'blocked' });
  const blocked = await breakdown('https://www.instagram.com/reel/C8aBcD_eFgH/?igsh=x');
  assert.equal(blocked.job.status, 'failed');
  assert.equal(blocked.job.error, 'Instagram blocked the download. Drop the video file here instead.');
  const attempts = (await ytCalls()).filter((a) => a.at(-1) === 'https://www.instagram.com/reel/C8aBcD_eFgH/');
  assert.equal(attempts.length, 1, 'no second try with another client');

  await setYt({});
  transcribed = 'the reel says this';
  const { id, job } = await breakdown('https://www.instagram.com/reel/C8aBcD_eFgH/');
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.equal(job.result.platform, 'instagram');
  assert.equal(job.result.video.channel, 'maker');
  assert.equal(job.result.video.views, 9000);
  assert.equal(job.result.video.multiplier, undefined);
  assert.equal(job.result.video.thumbnail, `/api/club/breakdowns/${job.result.id}/frames/frame-01.jpg`);
  assert.ok(!progress(id).some((l) => l.startsWith('Reading') && l.endsWith('comments…')));
  assert.ok(!(await ytCalls()).some((a) => a.includes('--write-comments') && a.some((x) => x.includes('instagram'))));
  transcribed = 'spoken words from the audio';
});

test('a dropped video file is read without yt-dlp; other files are refused', async () => {
  await setYt({});
  const before = (await ytCalls()).length;
  const form = new FormData();
  form.append('file', new Blob(['not really a video']), 'My Cool_clip.mp4');
  const started = await call('POST', '/breakdowns', form);
  assert.equal(started.status, 202);
  const job = await finish(started.body.id);
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.equal(job.result.platform, 'file');
  assert.equal(job.result.url, '');
  assert.equal(job.result.video.title, 'My Cool clip');
  assert.equal(job.result.video.views, 0);
  assert.equal(job.result.video.multiplier, undefined);
  assert.equal((await ytCalls()).length, before, 'yt-dlp is not used for a file');
  assert.ok(transcribeCalls.at(-1)!.endsWith(path.join(job.result.id, 'video.mp4')));
  const lines = progress(started.body.id);
  assert.ok(lines.includes('Looking at 20 frames…') && lines.includes('Transcribing the audio…') && !lines.includes('Checking how it did against the channel…'));
  const { stdin } = await claudeCall();
  assert.ok(!stdin.includes('Against the channel') && stdin.includes('the audio') && stdin.includes('Title: My Cool clip'));

  const bad = new FormData();
  bad.append('file', new Blob(['text']), 'notes.txt');
  const refused = await call('POST', '/breakdowns', bad);
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error, 'Drop a video file, like an mp4 or a mov.');
});

test('bad requests are refused before any job starts', async () => {
  const jobs = (await call('POST', '/breakdowns', { url: 'https://example.com/video' }));
  assert.equal(jobs.status, 400);
  assert.equal(jobs.body.error, 'Paste a YouTube or Instagram link, or drop a video file.');
  assert.equal((await call('POST', '/breakdowns', {})).status, 400);
  assert.equal((await call('POST', '/breakdowns', { url: 'https://youtu.be/dQw4w9WgXcQ', extra: 1 })).status, 400);
});

test('an answer in the wrong shape fails with one sentence and saves nothing', async () => {
  await setYt({});
  await setClaude('bad');
  const { job } = await breakdown('https://www.youtube.com/watch?v=hhhhhhhhhhh');
  assert.equal(job.status, 'failed');
  assert.equal(job.error, 'Claude answered in a shape we could not read.');
  await setClaude('ok');
});

test('Gemini watches the whole video when Google is connected, and Claude with frames is the fallback', async () => {
  await setYt({});
  // Not signed in yet: Claude.
  const plain = await breakdown('https://www.youtube.com/watch?v=iiiiiiiiiii');
  assert.equal(plain.job.result.watchedWith, undefined);

  await mkdir(geminiDir, { recursive: true });
  await writeFile(path.join(geminiDir, 'oauth_creds.json'), '{}');
  await setGemini('ok');
  const watched = await breakdown('https://www.youtube.com/watch?v=jjjjjjjjjjj');
  assert.equal(watched.job.status, 'done', JSON.stringify(watched.job));
  assert.equal(watched.job.result.watchedWith, 'gemini');
  assert.deepEqual(watched.job.result.reusableOutline, ['Gemini beat 1', 'Gemini beat 2', 'Gemini beat 3']);
  const gemini = JSON.parse(await readFile(geminiLog, 'utf8')) as { args: string[]; cwd: string };
  assert.equal(gemini.args[0], '-p');
  assert.ok(gemini.args[1].includes('@video.mp4') && gemini.args[1].includes('Today we build the thing'));
  assert.equal(await realpath(gemini.cwd), await realpath(path.join(store.breakdownsDir('dani'), watched.job.result.id)));
  assert.equal((await call('GET', `/breakdowns/${watched.job.result.id}`)).body.watchedWith, 'gemini');

  // Gemini answers badly: no tag, Claude's answer.
  await setGemini('junk');
  const fallback = await breakdown('https://www.youtube.com/watch?v=kkkkkkkkkkk');
  assert.equal(fallback.job.status, 'done');
  assert.equal(fallback.job.result.watchedWith, undefined);
  assert.deepEqual(fallback.job.result.reusableOutline, answer.reusableOutline);
});

test('stopping a breakdown stops it quietly', async () => {
  await setYt({});
  const started = await call('POST', '/breakdowns', { url: 'https://www.youtube.com/watch?v=lllllllllll' });
  const cancelled = await call('DELETE', `/jobs/${started.body.id}`);
  assert.equal(cancelled.body.status, 'cancelled');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await call('GET', `/jobs/${started.body.id}`)).body.status, 'cancelled');
});
