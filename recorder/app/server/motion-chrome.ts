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
let users=0;
function releaseBrowser(){users--;if(users)return;clearTimeout(idle);idle=setTimeout(stop,30000);idle.unref();}

async function launch(): Promise<Browser> {
  const binary = chromePath();
  if (!binary) throw new Error("Chrome is missing. Open Creator Compiler for app motion rendering, or install Google Chrome or set CREATORCLUB_CHROME.");
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
  const broken=(error:Error)=>{failAll(error);child.kill("SIGKILL");};
  input.on("error",broken);output.on("error",broken);output.once("end",()=>broken(Error("Chrome CDP connection closed.")));
  child.once("error", (error) => {failAll(error);running=undefined;void fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});});
  return {
    child,
    profile,
    send(method, params = {}, sessionId) {
      const message = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
      return new Promise((resolve, reject) => {
        const timer=setTimeout(()=>{waiting.delete(message.id);reject(Error(`Chrome ${method} timed out.`));},30000);timer.unref();
        waiting.set(message.id, { resolve:value=>{clearTimeout(timer);resolve(value);}, reject:error=>{clearTimeout(timer);reject(error);} });
        input.write(JSON.stringify(message) + "\0",error=>{if(error){const entry=waiting.get(message.id);waiting.delete(message.id);entry?.reject(error);}});
      });
    },
    once(event, sessionId) {
      return new Promise((resolve,reject) => {
        const key = `${sessionId}:${event}`;
        const done=(value:any)=>{clearTimeout(timer);resolve(value);};
        const timer=setTimeout(()=>{listeners.set(key,(listeners.get(key)??[]).filter(l=>l!==done));reject(Error(`Chrome ${event} timed out.`));},30000);timer.unref();
        listeners.set(key, [...(listeners.get(key) ?? []), done]);
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
export async function chromePages(page: string, pages: number,signal?:AbortSignal): Promise<{ sessions: Send[]; close(): Promise<void> }> {
  clearTimeout(idle);
  running ??= launch().catch((error) => {
    running = undefined;
    throw error;
  });
  users++;let browser:Browser;try{browser=await running;}catch(error){releaseBrowser();throw error;}
  const opened: string[] = [];let closed=false;
  const close=async()=>{if(closed)return;closed=true;signal?.removeEventListener('abort',abort);await Promise.all(opened.map(targetId=>browser.send('Target.closeTarget',{targetId}).catch(()=>{})));releaseBrowser();};
  const abort=()=>{void close();};signal?.addEventListener('abort',abort,{once:true});
  try{
  signal?.throwIfAborted();
  const sessions = await Promise.all(
    Array.from({ length: pages }, async () => {
      const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
      opened.push(targetId);
      if(closed||signal?.aborted){await browser.send('Target.closeTarget',{targetId}).catch(()=>{});throw signal?.reason??Error('Motion page closed.');}
      const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
      await browser.send("Page.enable", {}, sessionId);
      const loaded = browser.once("Page.loadEventFired", sessionId);void loaded.catch(()=>{});
      void loaded.catch(()=>{});
      await browser.send("Page.navigate", { url: pathToFileURL(page).href }, sessionId);
      await loaded;signal?.throwIfAborted();if(closed)throw Error('Motion page closed.');
      return ((method, params) => {signal?.throwIfAborted();return browser.send(method, params, sessionId);}) as Send;
    }),
  );
  return {sessions,close};
  }catch(error){await close();throw error;}
}

/** Closes Chrome now (tests). */
export const closeChrome = stop;

/**
 * Opens one tab on a web page (a proof shot's source) at a viewport and scale, waits for it to load, and returns a sender for it;
 * `close` closes the tab. The same Chrome as motion graphics: development, tests and the desktop app on a Mac with Chrome installed.
 */
export async function chromeWebTab(url: string, viewport: { width: number; height: number; scale: number }, timeoutMs = 20000): Promise<{ send: Send; close(): Promise<void> }> {
  clearTimeout(idle);
  running ??= launch().catch((error) => {
    running = undefined;
    throw error;
  });
  users++;let browser:Browser;try{browser=await running;}catch(error){releaseBrowser();throw error;}
  let targetId:string;try{({targetId}=await browser.send("Target.createTarget", { url: "about:blank" }));}catch(error){releaseBrowser();throw error;}
  const close=async()=>{await browser.send("Target.closeTarget",{targetId}).catch(()=>{});releaseBrowser();};
  try{
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const send: Send = (method, params) => browser.send(method, params, sessionId);
    await send("Page.enable", {});
    await send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.scale, mobile: false });
    const loaded = browser.once("Page.loadEventFired", sessionId);void loaded.catch(()=>{});
    const navigated = await send("Page.navigate", { url });
    if (navigated?.errorText) throw new Error(`The page did not open (${navigated.errorText}).`);
    await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
    return { send, close };
  } catch (error) {
    await close();
    throw error;
  }
}
