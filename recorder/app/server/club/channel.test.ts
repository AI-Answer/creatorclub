import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-channel-'));
process.env.CREATORCLUB_DIR = temp;
const originalPath = process.env.PATH;
after(async () => {
  process.env.PATH = originalPath;
  await rm(temp, { recursive: true, force: true });
});
const { parseChannelInput, pickCaptionLanguage, deriveTopics, json3ToText, usableTranscript, sameChannelUrl } = await import('./channel.js');
const { ensureYtDlp, localBinDir } = await import('./tools.js');
const { assembleVoicePrompt } = await import('./prompts.js');

test('handles are normalised from what people paste', () => {
  const want = { handle: '@SaminYasar_', url: 'https://www.youtube.com/@SaminYasar_' };
  for (const input of [
    '@SaminYasar_',
    'youtube.com/@SaminYasar_',
    'www.youtube.com/@SaminYasar_',
    'https://www.youtube.com/@SaminYasar_',
    'http://youtube.com/@SaminYasar_/',
    'https://m.youtube.com/@SaminYasar_/videos',
    '  https://www.youtube.com/@SaminYasar_/featured?si=abc#x  ',
    'https://www.youtube.com/%40SaminYasar_/streams',
  ]) assert.deepEqual(parseChannelInput(input), want, input);
});

test('channel ids, /c/ and /user/ links keep their form; anything else is refused with one sentence', () => {
  const id = 'UCzGcYErpBX4ldvv0l7MWLfw';
  assert.deepEqual(parseChannelInput(`youtube.com/channel/${id}/videos`), { url: `https://www.youtube.com/channel/${id}` });
  assert.deepEqual(parseChannelInput('youtube.com/c/SomeName'), { url: 'https://www.youtube.com/c/SomeName' });
  assert.deepEqual(parseChannelInput('https://www.youtube.com/user/old_name'), { url: 'https://www.youtube.com/user/old_name' });
  for (const bad of ['', '   ', 'samin', '@', '@ab', 'two words', 'https://youtube.com/watch?v=abc', 'https://youtu.be/abc', 'https://evil.com/@samin', 'https://youtube.com.evil.com/@samin', 'ftp://youtube.com/@samin', 'youtube.com/channel/short', 'youtube.com/@bad handle']) {
    assert.throws(() => parseChannelInput(bad), { message: 'Paste a YouTube channel link, like youtube.com/@yourchannel.' }, JSON.stringify(bad));
  }
});

test('the same channel is recognised whatever the case or trailing slash', () => {
  assert.ok(sameChannelUrl('https://www.youtube.com/@Samin/', 'https://www.youtube.com/@samin'));
  assert.ok(!sameChannelUrl('https://www.youtube.com/@a', 'https://www.youtube.com/@b'));
});

test('topics come from tags shared by two or more videos, else from words the titles repeat', () => {
  const tagged = [
    { title: 'a', tags: ['Claude', 'agents', 'MCP'] },
    { title: 'b', tags: ['claude', 'agents', 'mcp', 'one-off'] },
    { title: 'c', tags: ['claude', 'agents', 'mcp'] },
  ];
  assert.deepEqual(deriveTopics(tagged), ['agents', 'claude', 'mcp']);
  const untagged = [
    { title: 'Claude Code for Trading', tags: [] },
    { title: 'Trading Agents With Claude', tags: [] },
    { title: 'How to Use Claude Skills', tags: [] },
    { title: 'Why 2026 Changes Everything', tags: [] },
  ];
  assert.deepEqual(deriveTopics(untagged), ['claude', 'trading']);
  assert.deepEqual(deriveTopics([]), []);
  assert.equal(deriveTopics(Array.from({ length: 8 }, () => ({ title: 'Claude Agents Workflow Skills Hooks Memory Plugins' }))).length, 5, 'at most five');
});

test('captions: json3 becomes plain text, and short captions are not used', () => {
  const raw = JSON.stringify({ events: [{ segs: [{ utf8: 'Hello ' }, { utf8: 'there' }] }, { tStartMs: 5 }, { segs: [{ utf8: '\n' }] }, { segs: [{ utf8: 'second   line\nhere' }] }] });
  assert.equal(json3ToText(raw), 'Hello there second line here');
  assert.equal(json3ToText('not json'), '');
  assert.equal(usableTranscript('too short'), '');
  assert.equal(usableTranscript(Array(300).fill('w').join(' ')).split(' ').length, 300);
  assert.equal(usableTranscript(Array(9000).fill('w').join(' ')).split(' ').length, 6000, 'long transcripts are cut at 6000 words');
});

test('the voice prompt fills the name everywhere and the transcripts once, and is not confused by $ in captions', () => {
  const prompt = assembleVoicePrompt('For {name}. <t>{transcripts}</t> Title: {name}', 'Ana', [
    { id: 'a1', text: 'costs $& and $1 {name}' },
    { id: 'b2', text: 'second' },
  ]);
  assert.equal(prompt, 'For Ana. <t>### [a1]\ncosts $& and $1 {name}\n\n### [b2]\nsecond</t> Title: Ana');
});

test('a missing yt-dlp is downloaded from the official release into <root>/.bin and checked by running it', async () => {
  const empty = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-nopath-'));
  process.env.PATH = empty;
  const requested: string[] = [];
  const fake = (async (url: string) => {
    requested.push(url);
    return new Response('#!/bin/sh\necho 2026.03.17\n', { status: 200 });
  }) as unknown as typeof fetch;
  const file = await ensureYtDlp({ extraDirs: [], fetch: fake });
  assert.equal(file, path.join(localBinDir(), 'yt-dlp'));
  assert.deepEqual(requested, ['https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos']);
  assert.ok(((await stat(file)).mode & 0o111) !== 0, 'the file is executable');
  // The second time it is found, not downloaded again.
  assert.equal(await ensureYtDlp({ extraDirs: [], fetch: fake }), file);
  assert.equal(requested.length, 1);
  await rm(empty, { recursive: true, force: true });
});

test('a failed or broken yt-dlp download leaves nothing behind and says one sentence', async () => {
  process.env.PATH = temp;
  await rm(localBinDir(), { recursive: true, force: true });
  const offline = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
  await assert.rejects(ensureYtDlp({ extraDirs: [], fetch: offline }), { message: "Couldn't set up the YouTube reader. Check your connection and try again." });
  const broken = (async () => new Response('not a program', { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(ensureYtDlp({ extraDirs: [], fetch: broken }), { message: "Couldn't set up the YouTube reader. Check your connection and try again." });
  await assert.rejects(readFile(path.join(localBinDir(), 'yt-dlp')), { code: 'ENOENT' });
  const missing = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(ensureYtDlp({ extraDirs: [], fetch: missing }), /YouTube reader/);
});

test('the caption track is the one in the video\'s own language, even when dubbed tracks are listed', () => {
  const automatic_captions = Object.fromEntries(['bn-orig', 'en-orig', 'fr-orig', 'en', 'de'].map((k) => [k, []]));
  assert.equal(pickCaptionLanguage({ language: 'en-US', automatic_captions }), 'en-orig');
  assert.equal(pickCaptionLanguage({ language: 'fr', automatic_captions }), 'fr-orig');
  assert.equal(pickCaptionLanguage({ language: 'en', automatic_captions, subtitles: { en: [] } }), 'en', 'a manual track wins');
  assert.equal(pickCaptionLanguage({ language: 'ja', automatic_captions }), undefined, 'no track in that language');
  assert.equal(pickCaptionLanguage({ automatic_captions: { 'es-orig': [], es: [], en: [] } }), 'es-orig', 'one -orig track and no language: use it');
  assert.equal(pickCaptionLanguage({ automatic_captions }), 'en-orig', 'several -orig tracks and no language: English');
  assert.equal(pickCaptionLanguage({ automatic_captions: {} }), undefined);
});
