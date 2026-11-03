import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MotionBlock } from "../shared/types.ts";
import { MOTION_CSS, MOTION_TEMPLATES, motionMarkup } from "../shared/motion/templates.ts";
import { MOTION_SEEK, motionClip, motionDocument } from "../shared/motion/document.ts";
import { chromePages } from "./motion-chrome.ts";
// The same capture loop the desktop app runs in its offscreen windows.
import { captureFrames } from "../desktop/motion-capture.cjs";

/*
 * A motion block for the export: its frames captured in Chromium at the export's size and frame rate, clipped to the block's box, and
 * encoded losslessly with alpha (qtrle) for ffmpeg to overlay. Renders are cached by everything that changes the pixels (template and
 * its version, style, props, length, size, frame rate, the stylesheet and the font).
 *
 * Where the frames are captured:
 * - in the Creator Compiler desktop app (`CREATORCLUB_MOTION_BRIDGE=1`, set by desktop/main.cjs): the main process, in offscreen windows,
 *   asked over the service's message channel (`process.parentPort` in the packaged utility process, `process.send` in the dev app);
 * - otherwise (the dev server run with plain node, tests): headless Chrome over the DevTools pipe (server/motion-chrome.ts).
 */

export interface MotionRender {
  file: string;
  x: number;
  y: number;
  width: number;
  height: number;
  frames: number;
}
interface CaptureJob {
  dir: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  clip: { x: number; y: number; width: number; height: number };
  seek: string;
}

const FFMPEG = process.env.SCENEFORGE_FFMPEG || "ffmpeg";
const CACHE = path.join(tmpdir(), "creatorclub-motion-v1");
const FONT_FILE = "inter-latin-wght-normal.woff2";
const SERIF_FILE = "instrument-serif-latin-400-normal.woff2";

/** Inter (the latin variable file), as a data: URL the page can load: next to the bundled server, or from the installed package. */
let font: string | undefined;
export function motionFont(): string {
  if (font !== undefined) return font;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, FONT_FILE)];
  try {
    candidates.push(createRequire(import.meta.url).resolve(`@fontsource-variable/inter/files/${FONT_FILE}`));
  } catch {}
  const file = candidates.find((candidate) => existsSync(candidate));
  font = file ? `data:font/woff2;base64,${readFileSync(file).toString("base64")}` : "";
  return font;
}

/** The editorial look's serif as a data: URL: next to the bundled server, or from the installed package. */
let serif: string | undefined;
export function motionSerifFont(): string {
  if (serif !== undefined) return serif;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, SERIF_FILE)];
  try {
    candidates.push(createRequire(import.meta.url).resolve(`@fontsource/instrument-serif/files/${SERIF_FILE}`));
  } catch {}
  const file = candidates.find((candidate) => existsSync(candidate));
  serif = file ? `data:font/woff2;base64,${readFileSync(file).toString("base64")}` : "";
  return serif;
}

const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex").slice(0, 32);
/** Everything that changes a block's pixels (its start does not: the clip is shifted into place when it is overlaid). */
export function motionCacheKey(block: MotionBlock, width: number, height: number, fps: number) {
  const template = MOTION_TEMPLATES[block.template];
  // The markup carries the template, style, props and length; the stylesheet and font carry the look.
  return hash({ template: block.template, version: template.version, markup: motionMarkup(block), width, height, fps, css: hash(MOTION_CSS), font: hash(motionFont()), serif: block.look?.display === 'serif' ? hash(motionSerifFont()) : '' });
}
export const motionFrameCount = (duration: number, fps: number) => Math.max(1, Math.round(duration * fps));

// ---------------------------------------------------------------- the desktop app's bridge

type Port = { postMessage(message: unknown): void; on(event: "message", listener: (event: any) => void): void };
const pending = new Map<string, { resolve(): void; reject(error: Error): void }>();
let port: Port | null | undefined;
function bridge(): Port | null {
  if (port !== undefined) return port;
  port = null;
  if (process.env.CREATORCLUB_MOTION_BRIDGE !== "1") return port;
  const parent = (process as unknown as { parentPort?: { postMessage(m: unknown): void; on(e: "message", l: (e: { data: unknown }) => void): void } }).parentPort;
  if (parent) port = { postMessage: (m) => parent.postMessage(m), on: (_e, l) => parent.on("message", (e) => l(e.data)) };
  else if (typeof process.send === "function") port = { postMessage: (m) => process.send!(m), on: (_e, l) => process.on("message", l) };
  port?.on("message", (message: { type?: string; id?: string; ok?: boolean; error?: string }) => {
    if (message?.type !== "creatorclub:motion-rendered" || !message.id) return;
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.ok) entry?.resolve();
    else entry?.reject(new Error(message.error || "The motion block could not be rendered."));
  });
  return port;
}
/** Which capture this process uses: "app" (the desktop app's offscreen windows) or "chrome" (development and tests). */
export const motionRenderer = () => (bridge() ? "app" : "chrome");

async function capture(job: CaptureJob): Promise<void> {
  const app = bridge();
  if (app) {
    const id = randomUUID();
    await new Promise<void>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      app.postMessage({ type: "creatorclub:motion-render", id, job });
    });
    return;
  }
  const pages = Math.max(1, Math.min(4, Math.ceil(job.frames / 8)));
  const browser = await chromePages(path.join(job.dir, "page.html"), pages);
  try {
    await captureFrames(browser.sessions, job, (index: number, png: Buffer) => fs.writeFile(path.join(job.dir, `f${String(index).padStart(6, "0")}.png`), png));
  } finally {
    await browser.close();
  }
}

function encode(dir: string, fps: number, out: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ["-v", "error", "-nostdin", "-y", "-framerate", String(fps), "-i", path.join(dir, "f%06d.png"), "-c:v", "qtrle", "-pix_fmt", "argb", "-f", "mov", out], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-4000)));
    child.once("error", reject);
    child.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg could not encode the motion block: ${err.trim()}`))));
  });
}

const inflight = new Map<string, Promise<MotionRender>>();
/** The block rendered for an export of `width`×`height` at `fps`: a cached qtrle file and where it goes on the frame. */
export function renderMotionBlock(block: MotionBlock, width: number, height: number, fps: number): Promise<MotionRender> {
  const key = motionCacheKey(block, width, height, fps), clip = motionClip(block, width, height), frames = motionFrameCount(block.duration, fps);
  const out = path.join(CACHE, `${key}.mov`), result: MotionRender = { file: out, ...clip, frames };
  const running = inflight.get(key);
  if (running) return running;
  const work = (async () => {
    if (existsSync(out)) return result;
    await fs.mkdir(CACHE, { recursive: true });
    const dir = path.join(CACHE, `.${key}-${randomUUID()}`), temp = path.join(CACHE, `.${key}-${randomUUID()}.mov`);
    await fs.mkdir(dir);
    try {
      await fs.writeFile(path.join(dir, "page.html"), motionDocument(block, width, height, motionFont() || undefined, motionSerifFont() || undefined));
      await capture({ dir, width, height, fps, frames, clip, seek: MOTION_SEEK });
      await encode(dir, fps, temp);
      await fs.rename(temp, out);
      return result;
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
      await fs.rm(temp, { force: true });
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, work);
  return work;
}
