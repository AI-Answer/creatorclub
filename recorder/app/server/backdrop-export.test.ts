import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createProject, defaultEffects, defaultTransform, type Clip, type Media } from "../shared/types.ts";
import { probeMedia, startExport, getJob, visionMasks } from "./media.ts";
import { validateProject } from "./storage.ts";

const ffmpeg = process.env.SCENEFORGE_FFMPEG || "ffmpeg";
function run(args: string[]) {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-v", "error", "-y", ...args], { maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr?.toString());
  return r.stdout;
}
async function wait(id: string) {
  for (let i = 0; i < 1800; i++) {
    const j = getJob(id)!;
    if (j.status === "complete") return j;
    if (["failed", "cancelled", "interrupted"].includes(j.status)) throw Error(j.error || j.message);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Backdrop export timeout");
}
/** One RGB pixel of an exported frame. */
function pixel(file: string, time: number, [x, y]: readonly [number, number], width: number, height: number) {
  const raw = run(["-ss", String(time), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  assert.equal(raw.length, width * height * 3);
  const i = (y * width + x) * 3;
  return [raw[i], raw[i + 1], raw[i + 2]];
}
const near = (actual: number[], expected: number[], label: string) =>
  assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < 40), `${label}: got ${actual}, expected about ${expected}`);

test("a cut-out camera clip exports over a colour, a picture, a looping video and the screen recording", { timeout: 300000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "creatorclub-backdrop-"));
  const original = visionMasks.personMask;
  // The "person" is the left half of the camera picture: a drawn mask stands in for Vision so this runs on any machine.
  const cadence: number[] = [];
  visionMasks.personMask = async (_input, cacheDir, o) => {
    cadence.push(o.fps ?? 8);
    await fs.mkdir(cacheDir, { recursive: true });
    const file = path.join(cacheDir, `mask-${o.width}x${o.height}-${o.fps}-${o.start}-${o.end}.mkv`);
    run(["-f", "lavfi", "-i", `color=c=black:s=${o.width}x${o.height}:r=${o.fps}:d=${o.end - o.start},format=gray,geq=lum='if(lt(X,W/2),255,0)'`, "-c:v", "ffv1", file]);
    return file;
  };
  try {
    const W = 320, H = 180;
    const camera = path.join(dir, "camera.mp4"), picture = path.join(dir, "picture.png"), loop = path.join(dir, "loop.mp4"), screen = path.join(dir, "screen.mp4");
    run(["-f", "lavfi", "-i", "color=c=red:s=160x90:r=30:d=3", "-c:v", "libx264", "-pix_fmt", "yuv444p", "-qp", "0", camera]);
    run(["-f", "lavfi", "-i", "color=c=yellow:s=200x100", "-frames:v", "1", picture]);
    // One second of video, green then white, so where the loop is shows in the colour.
    run(["-f", "lavfi", "-i", "color=c=green:s=160x90:r=30:d=0.5", "-f", "lavfi", "-i", "color=c=white:s=160x90:r=30:d=0.5", "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv444p", "-qp", "0", loop]);
    run(["-f", "lavfi", "-i", "color=c=magenta:s=160x90:r=30:d=3", "-c:v", "libx264", "-pix_fmt", "yuv444p", "-qp", "0", screen]);
    const cache = path.join(dir, "cache");
    const [cam, pic, vid, scr] = await Promise.all([camera, picture, loop, screen].map((f) => probeMedia(f, cache)));
    const p = createProject("Backdrops");
    p.canvas = { width: W, height: H, fps: 30, background: "#000000", padding: 0, radius: 0 };
    p.captionStyle.enabled = false;
    p.scenes[0].duration = 2;
    p.media = [cam, pic, vid, scr];
    const clip = (id: string, m: Media, track: Clip["track"], transform: Partial<Clip["transform"]>, effects: Partial<Clip["effects"]> = {}): Clip => ({
      id, mediaId: m.id, name: id, track, start: 0, sourceIn: 0, sourceOut: 2, speed: 1, gain: 0, muted: true,
      transform: { ...defaultTransform(), fit: "cover", ...transform }, effects: { ...defaultEffects(), ...effects },
    });
    // The screen recording sits small in the top-left corner; the camera fills the right half of the frame.
    const cameraClip = clip("camera", cam, "camera", { x: 0.5, width: 0.5 }, { background: "remove" });
    p.clips = [clip("screen", scr, "screen", { width: 0.25, height: 0.25 }), cameraClip];
    // Inside the camera's box: the person on its left, the backdrop on its right.
    const person = [Math.round(W * 0.6), H / 2] as const, behind = [Math.round(W * 0.9), H / 2] as const;
    const exportNow = async () => {
      validateProject(structuredClone(p));
      return (await wait(startExport(structuredClone(p), { format: "mp4", quality: "high" }, path.join(dir, "out")).id)).outputPath!;
    };
    const exportWith = (backdrop: Clip["effects"]["backdrop"]) => {
      if (backdrop) cameraClip.effects.backdrop = backdrop;
      else delete cameraClip.effects.backdrop;
      return exportNow();
    };

    const none = await exportWith(undefined);
    near(pixel(none, 0.5, behind, W, H), [0, 0, 0], "no backdrop leaves the canvas showing");
    near(pixel(none, 0.5, person, W, H), [255, 0, 0], "the person stays");
    assert.equal(cadence.at(-1), 8, "see-through cut-outs keep the lighter mask cadence");

    const colour = await exportWith({ kind: "color", color: "#0000ff" });
    near(pixel(colour, 0.5, behind, W, H), [0, 0, 255], "colour backdrop");
    near(pixel(colour, 0.5, person, W, H), [255, 0, 0], "person over the colour");
    assert.equal(cadence.at(-1), 15, "a backdrop samples the mask more often");

    const still = await exportWith({ kind: "image", mediaId: pic.id });
    near(pixel(still, 1, behind, W, H), [255, 255, 0], "picture backdrop");
    near(pixel(still, 1, person, W, H), [255, 0, 0], "person over the picture");

    const looped = await exportWith({ kind: "video", mediaId: vid.id });
    near(pixel(looped, 0.2, behind, W, H), [0, 128, 0], "video backdrop, first half");
    near(pixel(looped, 0.75, behind, W, H), [255, 255, 255], "video backdrop, second half");
    near(pixel(looped, 1.2, behind, W, H), [0, 128, 0], "video backdrop loops");
    near(pixel(looped, 1.2, person, W, H), [255, 0, 0], "person over the video");

    // A split clip carries the loop on from where its first piece left it: at 1.6 s the loop is 0.6 s in (white), not 0.35 s (green).
    const second: Clip = { ...structuredClone(cameraClip), id: "camera-2", start: 1.25, sourceIn: 1.25, effectTiming: { sourceIn: 0, sourceOut: 2 } };
    cameraClip.sourceOut = 1.25;
    cameraClip.effectTiming = { sourceIn: 0, sourceOut: 2 };
    p.clips.push(second);
    near(pixel(await exportNow(), 1.6, behind, W, H), [255, 255, 255], "the loop keeps its phase across a split");
    p.clips.pop();
    cameraClip.sourceOut = 2;
    delete cameraClip.effectTiming;

    const behindScreen = await exportWith({ kind: "screen" });
    near(pixel(behindScreen, 1, behind, W, H), [255, 0, 255], "screen recording backdrop");
    near(pixel(behindScreen, 1, person, W, H), [255, 0, 0], "person over the screen recording");
    near(pixel(behindScreen, 1, [20, 20], W, H), [255, 0, 255], "the screen clip still draws in its own place");

    // Without Remove background the stored backdrop is not drawn.
    cameraClip.effects.background = "none";
    near(pixel(await exportWith({ kind: "color", color: "#0000ff" }), 0.5, behind, W, H), [255, 0, 0], "no cut-out, no backdrop");
  } finally {
    visionMasks.personMask = original;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("the project validator accepts well-formed backdrops and refuses broken ones", () => {
  const p = createProject("Validate");
  const m: Media = { id: "pic", name: "pic.png", path: path.resolve("/tmp/pic.png"), kind: "image", duration: 1, width: 10, height: 10 };
  const cam: Media = { ...m, id: "cam", name: "cam.mp4", kind: "video", path: path.resolve("/tmp/cam.mp4") };
  p.media = [m, cam];
  p.clips = [{ id: "c", mediaId: "cam", name: "c", track: "camera", start: 0, sourceIn: 0, sourceOut: 1, speed: 1, gain: 1, muted: false, transform: defaultTransform(), effects: { ...defaultEffects(), background: "remove" } }];
  const withBackdrop = (backdrop: unknown) => { const q = structuredClone(p); (q.clips[0].effects as Record<string, unknown>).backdrop = backdrop; return () => validateProject(q); };
  assert.doesNotThrow(withBackdrop(undefined), "old projects have no backdrop");
  for (const ok of [{ kind: "color", color: "#12ab34" }, { kind: "image", mediaId: "pic" }, { kind: "screen" }]) assert.doesNotThrow(withBackdrop(ok), JSON.stringify(ok));
  assert.throws(withBackdrop({ kind: "video", mediaId: "pic" }), /missing media/, "a picture is not a video");
  assert.throws(withBackdrop({ kind: "image", mediaId: "gone" }), /missing media/);
  for (const bad of [{ kind: "color", color: "blue" }, { kind: "image" }, { kind: "sky" }, "screen", { kind: "screen", extra: 1 }]) assert.throws(withBackdrop(bad), /Invalid clip background/, JSON.stringify(bad));
});
