import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/*
 * Development and tests only: the media service run as plain node (no desktop app) captures motion blocks in Chrome, driven over the
 * DevTools pipe (`--remote-debugging-pipe`, no port, no extra dependency). The desktop app never uses this; it captures in its own
 * offscreen windows (desktop/motion-render.cjs). One headless Chrome is kept while blocks are being rendered and closed when idle.
 */

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];
export function chromePath(): string | undefined {
  const configured = process.env.CREATORCLUB_CHROME;
  if (configured) return existsSync(configured) ? configured : undefined;
  return CANDIDATES.find((file) => existsSync(file));
}

type Send = (method: string, params?: Record<string, unknown>) => Promise<any>;
interface Browser {
  child: ChildProcess;
  profile: string;
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<any>;
  once(event: string, sessionId: string): Promise<any>;
}

let running: Promise<Browser> | undefined;
let idle: NodeJS.Timeout | undefined;

async function launch(): Promise<Browser> {
  const binary = chromePath();
  if (!binary) throw new Error("Motion graphics render in the Creator Compiler app. Outside it, install Google Chrome or set CREATORCLUB_CHROME.");
  const profile = await fs.mkdtemp(path.join(tmpdir(), "creatorclub-motion-chrome-"));
  const child = spawn(binary, ["--headless=new", "--remote-debugging-pipe", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--force-color-profile=srgb", "--hide-scrollbars", "--mute-audio", "about:blank"], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const input = child.stdio[3] as NodeJS.WritableStream, output = child.stdio[4] as NodeJS.ReadableStream;
  let id = 0, buffer = "";
  const waiting = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  const listeners = new Map<string, Array<(params: any) => void>>();
  output.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (message.id !== undefined) {
        const entry = waiting.get(message.id);
        waiting.delete(message.id);
        if (message.error) entry?.reject(new Error(message.error.message));
        else entry?.resolve(message.result);
      } else {
        const key = `${message.sessionId ?? ""}:${message.method}`;
        for (const listener of listeners.get(key)?.splice(0) ?? []) listener(message.params);
      }
    }
  });
  const failAll = (error: Error) => {
    for (const entry of waiting.values()) entry.reject(error);
    waiting.clear();
  };
  child.once("exit", () => {
    failAll(new Error("Chrome closed while rendering motion graphics."));
    running = undefined;
    // Chrome may still be flushing its profile as it exits: retry, and never let a leftover folder reach the service as an error.
    void fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  });
  child.once("error", (error) => failAll(error));
  return {
    child,
    profile,
    send(method, params = {}, sessionId) {
      const message = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
      return new Promise((resolve, reject) => {
        waiting.set(message.id, { resolve, reject });
        input.write(JSON.stringify(message) + "\0");
      });
    },
    once(event, sessionId) {
      return new Promise((resolve) => {
        const key = `${sessionId}:${event}`;
        listeners.set(key, [...(listeners.get(key) ?? []), resolve]);
      });
    },
  };
}

function stop() {
  const current = running;
  running = undefined;
  void current?.then((browser) => browser.child.kill()).catch(() => {});
}

/** Opens `pages` tabs on the page file and returns a sender for each; `close` closes the tabs. Chrome stays open for 30 s after. */
export async function chromePages(page: string, pages: number): Promise<{ sessions: Send[]; close(): Promise<void> }> {
  clearTimeout(idle);
  running ??= launch().catch((error) => {
    running = undefined;
    throw error;
  });
  const browser = await running;
  const opened: string[] = [];
  const sessions = await Promise.all(
    Array.from({ length: pages }, async () => {
      const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
      opened.push(targetId);
      const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
      await browser.send("Page.enable", {}, sessionId);
      const loaded = browser.once("Page.loadEventFired", sessionId);
      await browser.send("Page.navigate", { url: pathToFileURL(page).href }, sessionId);
      await loaded;
      return ((method, params) => browser.send(method, params, sessionId)) as Send;
    }),
  );
  return {
    sessions,
    async close() {
      await Promise.all(opened.map((targetId) => browser.send("Target.closeTarget", { targetId }).catch(() => {})));
      clearTimeout(idle);
      idle = setTimeout(stop, 30000);
      idle.unref();
    },
  };
}

/** Closes Chrome now (tests). */
export const closeChrome = stop;
