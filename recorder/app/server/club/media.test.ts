import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runTool } from './tools.js';
import { findExecutable } from './ai.js';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-media-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
const { extractAudio, posterFrame } = await import('./breakdown.js');

// Uses the real FFmpeg when this Mac has one; otherwise there is nothing to check.
const dirs = ['/opt/homebrew/bin', '/usr/local/bin'];
const ffmpeg = await findExecutable('ffmpeg', { extraDirs: dirs });
const skip = !ffmpeg && 'FFmpeg is not installed';
const env = { ...process.env };
const make = async (name: string, size: string, sound: boolean) => {
  const file = path.join(temp, name);
  const audio = sound ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4'] : [];
  const made = await runTool(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=10:duration=4`, ...audio, '-pix_fmt', 'yuv420p', '-shortest', file], { env });
  assert.equal(made.code, 0, made.stderr);
  return file;
};
const size = async (image: string) => {
  const probe = await runTool(ffmpeg!, ['-hide_banner', '-i', image], { env });
  const [, w, h] = /, (\d+)x(\d+)/.exec(probe.stderr)!.map(Number);
  return { w, h };
};

test('a dropped video gives 16 kHz mono audio and one still scaled to 640 on the long side, for landscape and vertical alike', { skip }, async () => {
  for (const [name, dims, wide] of [['landscape', '1280x720', true], ['vertical', '480x854', false]] as const) {
    const video = await make(`${name}.mp4`, dims, true);
    const wav = await extractAudio(ffmpeg!, video, path.join(temp, `${name}.wav`), { extraDirs: dirs });
    assert.equal(wav, path.join(temp, `${name}.wav`));
    const probe = await runTool(ffmpeg!, ['-hide_banner', '-i', wav!], { env });
    assert.match(probe.stderr, /pcm_s16le.*16000 Hz, mono/);
    const poster = await posterFrame(ffmpeg!, video, 4, path.join(temp, `${name}.jpg`), { extraDirs: dirs });
    assert.ok(poster && (await stat(poster)).size > 0);
    const { w, h } = await size(poster!);
    assert.equal(Math.max(w, h), 640, `${name}: ${w}x${h}`);
    assert.equal(w > h, wide, `${name}: the shape is kept`);
  }
});

test('a video without sound has no audio, and a still is still made when the length is unknown', { skip }, async () => {
  const video = await make('silent.mp4', '320x240', false);
  assert.equal(await extractAudio(ffmpeg!, video, path.join(temp, 'silent.wav'), { extraDirs: dirs }), undefined);
  assert.ok(await posterFrame(ffmpeg!, video, undefined, path.join(temp, 'silent.jpg'), { extraDirs: dirs }));
  assert.equal(await posterFrame(ffmpeg!, path.join(temp, 'missing.mp4'), 4, path.join(temp, 'none.jpg'), { extraDirs: dirs }), undefined);
});
