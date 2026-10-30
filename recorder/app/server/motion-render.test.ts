import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createProject, defaultEffects, defaultTransform } from "../shared/types.ts";
import { newMotionBlock } from "../shared/motion/templates.ts";
import { motionCacheKey, motionFrameCount, motionRenderer, renderMotionBlock } from "./motion-render.ts";
import { chromePath, closeChrome } from "./motion-chrome.ts";
import { getJob, probeMedia, startExport } from "./media.ts";

/*
 * The export side of motion blocks: what the cache key covers, a block captured with real transparency and encoded with alpha, and an
 * export whose frames show the blocks where the preview shows them, including a block that a 10-second render chunk cuts in two.
 * The capture runs in Chrome here (the desktop app uses its own offscreen windows); without Chrome the rendering tests are skipped.
 */

const FFMPEG = process.env.SCENEFORGE_FFMPEG || "ffmpeg", FFPROBE = process.env.SCENEFORGE_FFPROBE || "ffprobe";
const noChrome = chromePath() ? false : "Chrome is not installed";
const run = (binary: string, args: string[]) => {
  const r = spawnSync(binary, args, { maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr?.toString());
  return r.stdout as Buffer;
};
/** One frame as raw RGBA. */
const frame = (file: string, at: number, w: number, h: number, extra: string[] = []) => run(FFMPEG, ["-v", "error", "-ss", String(at), "-i", file, ...extra, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-"]);
const psnr = (a: Buffer, b: Buffer) => {
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i++) if (i % 4 !== 3) { sum += (a[i] - b[i]) ** 2; n++; }
  return sum === 0 ? 99 : 10 * Math.log10((255 * 255) / (sum / n));
};

test("the cache key covers what changes the pixels, not where the block sits on the timeline", () => {
  const block = newMotionBlock("lower-third", 3, "a", { props: { name: "Samin" } }), key = motionCacheKey(block, 1920, 1080, 30);
  assert.equal(motionCacheKey({ ...block, id: "b", start: 40 }, 1920, 1080, 30), key);
  for (const other of [{ ...block, style: "glass" }, { ...block, duration: 6 }, { ...block, props: { name: "Dani" } }]) assert.notEqual(motionCacheKey(other, 1920, 1080, 30), key);
  assert.notEqual(motionCacheKey(block, 1280, 720, 30), key);
  assert.notEqual(motionCacheKey(block, 1920, 1080, 60), key);
  assert.equal(motionFrameCount(2, 30), 60);
  assert.equal(motionRenderer(), "chrome", "outside the desktop app the capture runs in Chrome");
});

test("a block is captured with real transparency and encoded with alpha", { skip: noChrome, timeout: 120000 }, async () => {
  try {
    const block = newMotionBlock("lower-third", 0, "alpha", { style: "glass", duration: 2, props: { name: "Samin Yasar", role: "Claude Club" } });
    const r = await renderMotionBlock(block, 640, 360, 30);
    assert.deepEqual([r.x, r.y, r.width, r.height, r.frames], [0, 180, 422, 172, 60]);
    const probe = JSON.parse(run(FFPROBE, ["-v", "error", "-show_streams", "-count_frames", "-of", "json", r.file]).toString()).streams[0];
    assert.deepEqual([probe.codec_name, probe.pix_fmt, Number(probe.nb_read_frames)], ["qtrle", "argb", 60]);
    // A second into the block: most pixels clear, the glass panel and its shadow in between, the letters opaque.
    const rgba = frame(r.file, 1, r.width, r.height);
    let clear = 0, opaque = 0, partial = 0;
    for (let i = 3; i < rgba.length; i += 4) rgba[i] === 0 ? clear++ : rgba[i] === 255 ? opaque++ : partial++;
    const total = rgba.length / 4;
    assert.ok(clear / total > 0.5 && opaque / total > 0.003 && partial / total > 0.1, JSON.stringify({ clear, opaque, partial, total }));
    // Before the way in, nothing is drawn.
    const first = frame(r.file, 0, r.width, r.height);
    assert.ok(first.every((v, i) => i % 4 !== 3 || v === 0), "the first frame is fully transparent");
    // Cached: the same block again is the same file, at once.
    const began = Date.now(), again = await renderMotionBlock({ ...block, id: "other", start: 9 }, 640, 360, 30);
    assert.equal(again.file, r.file);
    assert.ok(Date.now() - began < 200);
  } finally {
    closeChrome();
  }
});

async function wait(id: string) {
  for (const began = Date.now(); Date.now() - began < 240000; await new Promise((r) => setTimeout(r, 100))) {
    const j = getJob(id)!;
    if (["complete", "failed", "cancelled"].includes(j.status)) {
      assert.equal(j.status, "complete", j.error || j.message);
      return j;
    }
  }
  throw new Error("Job timeout");
}

test("an export shows each block where and when the preview does, across a render chunk", { skip: noChrome, timeout: 240000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "creatorclub-motion-export-"));
  try {
    const source = path.join(dir, "grey.mp4");
    run(FFMPEG, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x556677:s=320x180:r=30:d=14", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", source]);
    const media = await probeMedia(source, path.join(dir, "cache"));
    const p = createProject("Motion export");
    p.canvas = { width: 320, height: 180, fps: 30, background: "#000000", padding: 0, radius: 0 };
    p.media = [media];
    p.scenes[0].duration = 14;
    p.clips = [{ id: "c", name: "c", mediaId: media.id, track: "screen", start: 0, sourceIn: 0, sourceOut: 14, speed: 1, gain: 1, muted: false, transform: defaultTransform(), effects: defaultEffects() }];
    const lower = newMotionBlock("lower-third", 1, "lt", { duration: 4, props: { name: "Samin Yasar", role: "Founder" } });
    // 8 s to 12 s: the export renders in 10-second chunks, so this block is cut in two and its second half starts 2 s into the block.
    const title = newMotionBlock("title-card", 8, "tc", { style: "bold", duration: 4, props: { title: "Hidden features" } });
    p.motion = [lower, title];
    const job = await wait(startExport(p, { format: "mp4", quality: "high", burnCaptions: false }, path.join(dir, "out")).id);
    const out = job.outputPath!;
    const background = frame(out, 0.5, 320, 180);
    // Where a block shows, the export frame is the block's own frame composited over the video; elsewhere it is the video.
    // 11.8 s is in the title's way out (its last 0.4 s): only the right offset into the block gives that frame.
    for (const [block, at] of [[lower, 1.2], [lower, 3], [title, 8.3], [title, 11.8]] as const) {
      const r = await renderMotionBlock(block, 320, 180, 30);
      const exported = frame(out, at, 320, 180);
      const composed = run(FFMPEG, ["-v", "error", "-f", "lavfi", "-i", "color=c=0x556677:s=320x180:r=30:d=1", "-ss", String(at - block.start), "-i", r.file, "-filter_complex", `[0][1]overlay=${r.x}:${r.y}:format=auto`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
      assert.ok(psnr(exported, composed) > 30, `${block.template} at ${at} s matches its own frame (${psnr(exported, composed).toFixed(1)} dB)`);
      assert.ok(psnr(exported, background) < 30, `${block.template} at ${at} s is visible (${psnr(exported, background).toFixed(1)} dB against the plain video)`);
    }
    assert.ok(psnr(frame(out, 6.5, 320, 180), background) > 40, "between the blocks the video is untouched");
  } finally {
    closeChrome();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
