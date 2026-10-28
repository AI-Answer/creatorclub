import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runTool } from './tools.js';
import { findExecutable } from './ai.js';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-frames-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
const { sampleFrames } = await import('./breakdown.js');

// Uses the real FFmpeg when this Mac has one; otherwise there is nothing to check.
const ffmpeg = await findExecutable('ffmpeg', { extraDirs: ['/opt/homebrew/bin', '/usr/local/bin'] });

test('20 frames are sampled across a real video, scaled to 640 on the long side, for landscape and vertical alike', { skip: !ffmpeg && 'FFmpeg is not installed' }, async () => {
  const env = { ...process.env };
  for (const [name, size, wide] of [['landscape', '1280x720', true], ['vertical', '480x854', false]] as const) {
    const video = path.join(temp, `${name}.mp4`);
    const made = await runTool(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=10:duration=8`, '-pix_fmt', 'yuv420p', video], { env });
    assert.equal(made.code, 0, made.stderr);
    const frames = await sampleFrames(ffmpeg!, video, 8, path.join(temp, `${name}-frames`), { extraDirs: ['/opt/homebrew/bin', '/usr/local/bin'] });
    assert.equal(frames.length, 20, name);
    assert.deepEqual(frames.map((f) => path.basename(f)).slice(0, 2), ['frame-01.jpg', 'frame-02.jpg']);
    assert.ok((await stat(frames[19])).size > 0);
    const probe = await runTool(ffmpeg!, ['-hide_banner', '-i', frames[0]], { env });
    const [, w, h] = /, (\d+)x(\d+)/.exec(probe.stderr)!.map(Number);
    assert.equal(Math.max(w, h), 640, `${name}: ${w}x${h}`);
    assert.equal(w > h, wide, `${name}: the shape is kept`);
  }
  assert.equal((await readdir(path.join(temp, 'landscape-frames'))).length, 20);
});

test('a video of unknown length still gets frames, one every five seconds', { skip: !ffmpeg && 'FFmpeg is not installed' }, async () => {
  const env = { ...process.env };
  const video = path.join(temp, 'unknown.mp4');
  await runTool(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=22', '-pix_fmt', 'yuv420p', video], { env });
  const frames = await sampleFrames(ffmpeg!, video, undefined, path.join(temp, 'unknown-frames'), {});
  assert.ok(frames.length >= 4 && frames.length <= 5, `about one every five seconds, got ${frames.length}`);
});
