import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { z } from 'zod';
import { chromePath, chromeWebTab } from '../motion-chrome.js';
import { ClubError } from './errors.js';

/*
 * A proof shot (editroom's rule, rebuilt on our own Chrome driver): the real page a claim comes from, scrolled to the words that back it,
 * with those words highlighted, framed in a window on the stage, as a 1920×1080 picture for the Overlays row. A claim shown this way is evidence, not illustration.
 */

export const proofBody = z.object({ url: z.string().trim().min(8).max(2000), phrase: z.string().trim().max(300).optional() }).strict();

/** Only public web pages: never this Mac, its network, or files. */
export function proofUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ClubError('That is not a web address.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ClubError('Only web pages (http or https) can be shown as proof.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const local = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal');
  const privateIp = isIP(host) !== 0 && (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === '::1' || /^f[cd]/.test(host) || /^fe80/.test(host));
  if (local || privateIp) throw new ClubError('Only public web pages can be shown as proof.');
  return url;
}

/** Runs in the page: finds the phrase in the visible text, wraps it in a highlight and centres it. Returns where it is, as fractions of the viewport. */
const HIGHLIGHT = (phrase: string) => `(() => {
  const wanted = ${JSON.stringify(phrase)}.replace(/\\s+/g, ' ').trim().toLowerCase();
  document.querySelectorAll('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i]').forEach((el) => { if (el.getBoundingClientRect().height < innerHeight * 0.6) el.style.display = 'none'; });
  // Cookie and sign-up dialogs named any other way: anything pinned over the page that talks about cookies.
  for (const el of document.querySelectorAll('body *')) { const style = getComputedStyle(el); if ((style.position === 'fixed' || style.position === 'sticky') && /cookie|consent/i.test(el.textContent || '') && el.getBoundingClientRect().height < innerHeight * 0.6) el.style.display = 'none'; }
  if (!wanted) return { found: false };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const style = node.parentElement && getComputedStyle(node.parentElement);
    if (!style || style.display === 'none' || style.visibility === 'hidden') continue;
    nodes.push({ node, from: text.length });
    text += node.nodeValue;
  }
  const flat = text.replace(/\\s/g, ' ').toLowerCase();
  // Whitespace differs between the page and the transcript: match on a whitespace-tolerant pattern.
  const pattern = new RegExp(wanted.split(' ').map((w) => w.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')).join('\\\\s+'));
  const hit = pattern.exec(flat);
  if (!hit) return { found: false };
  const start = hit.index, end = hit.index + hit[0].length;
  const at = (offset) => { const entry = nodes.findLast((n) => n.from <= offset); return { node: entry.node, offset: offset - entry.from }; };
  const a = at(start), b = at(end);
  const range = document.createRange();
  range.setStart(a.node, Math.min(a.offset, a.node.nodeValue.length));
  range.setEnd(b.node, Math.min(b.offset, b.node.nodeValue.length));
  const first = range.getBoundingClientRect();
  window.scrollBy({ top: first.top - innerHeight * 0.42, behavior: 'instant' });
  // A link or bold word inside the phrase adds rects of its own: one box per line, made of every rect on that line.
  const lines = [];
  for (const r of range.getClientRects()) {
    if (r.width < 1 || r.height < 1) continue;
    const line = lines.find((l) => Math.abs(l.top - r.top) < r.height * 0.6);
    if (line) { line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right); line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.bottom); }
    else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  }
  for (const l of lines) l.width = l.right - l.left, l.height = l.bottom - l.top;
  const marks = [];
  for (const rect of lines) {
    const mark = document.createElement('div');
    Object.assign(mark.style, { position: 'fixed', left: rect.left - 4 + 'px', top: rect.top - 2 + 'px', width: rect.width + 8 + 'px', height: rect.height + 4 + 'px', background: 'rgba(255, 214, 10, 0.42)', borderRadius: '4px', boxShadow: '0 0 0 2px rgba(255, 196, 0, 0.9)', zIndex: 2147483647, pointerEvents: 'none' });
    document.body.appendChild(mark);
    marks.push(rect);
  }
  const box = range.getBoundingClientRect();
  return { found: true, x: box.left / innerWidth, y: box.top / innerHeight, width: box.width / innerWidth, height: box.height / innerHeight };
})()`;

export interface ProofShot {
  file: string;
  url: string;
  /** Whether the phrase was found on the page and highlighted. */
  found: boolean;
  /** Where the highlighted words are, as fractions of the picture, when found. */
  box?: { x: number; y: number; width: number; height: number };
}

/** The page sits in a window on the stage: a 1280×720 frame (1920×1080 at 1.5×) with the page area here, the bar above it. */
const FRAME = { width: 1280, height: 720, left: 80, top: 44, page: { width: 1120, height: 556 }, bar: 36 };
const PAGE_WIDTH = 960;

/** The window around a page shot: a slim dark bar with the page's address, rounded corners and a soft shadow, on the stage colour, and
 * under it where and when the page was read. */
const windowHtml = (shot: string, host: string, background: string, captured: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${FRAME.width}px;height:${FRAME.height}px;background:${background};overflow:hidden}
.w{position:absolute;left:${FRAME.left}px;top:${FRAME.top}px;width:${FRAME.page.width}px;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 24px 60px rgb(0 0 0 / .45),0 0 0 1px rgb(255 255 255 / .08)}
.b{height:${FRAME.bar}px;background:#2b2b2b;display:flex;align-items:center;gap:7px;padding:0 14px;position:relative}
.b i{width:11px;height:11px;border-radius:50%;background:#4a4a4a}
.b span{position:absolute;left:0;right:0;text-align:center;font:500 13px -apple-system,BlinkMacSystemFont,"Inter",sans-serif;color:#a6a6a6;letter-spacing:.01em}
img{display:block;width:${FRAME.page.width}px;height:${FRAME.page.height}px}
.c{position:absolute;left:${FRAME.left}px;top:${FRAME.top + FRAME.bar + FRAME.page.height + 18}px;display:flex;align-items:center;gap:9px;padding:7px 14px;border-radius:999px;background:rgb(255 255 255 / .06);box-shadow:inset 0 0 0 1px rgb(255 255 255 / .08);font:500 14px -apple-system,BlinkMacSystemFont,"Inter",sans-serif;color:#b5b5b5}
.c i{width:7px;height:7px;border-radius:50%;background:#e9b04a}
</style></head><body><div class="w"><div class="b"><i></i><i></i><i></i><span>${host.replace(/[<&>"]/g, '')}</span></div><img src="data:image/png;base64,${shot}"></div><div class="c"><i></i>${host.replace(/[<&>"]/g, '')} · captured ${captured}</div></body></html>`;

/** Captures `url` into `dir` as a PNG named by the page, phrase and stage colour, so the same proof is not captured twice. */
export async function captureProof(dir: string, raw: string, phrase = '', { background = '#1c1c1c' }: { background?: string } = {}): Promise<ProofShot> {
  const url = proofUrl(raw).href;
  if (!chromePath()) throw new ClubError('Proof shots need Google Chrome on this Mac. Install it, then try again.', 409);
  if (!/^#[0-9a-f]{6}$/i.test(background)) background = '#1c1c1c';
  await fs.mkdir(dir, { recursive: true });
  const name = `proof-${createHash('sha256').update(`${url}\n${phrase}\n${background}`).digest('hex').slice(0, 16)}.png`;
  const file = path.join(dir, name);
  // The page is read 960 px wide and drawn into the 1120 px window, so its text is large enough to read on a phone.
  const tab = await chromeWebTab(url, { width: PAGE_WIDTH, height: Math.round((FRAME.page.height * PAGE_WIDTH) / FRAME.page.width), scale: (1.5 * FRAME.page.width) / PAGE_WIDTH });
  try {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const { result } = await tab.send('Runtime.evaluate', { expression: HIGHLIGHT(phrase), returnByValue: true });
    const found = result?.value ?? { found: false };
    await new Promise((resolve) => setTimeout(resolve, 250));
    const page = await tab.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    // Then the same tab draws the window around it, at 1280×720 and 1.5×: a 1920×1080 picture with text a viewer can read.
    await tab.send('Emulation.setDeviceMetricsOverride', { width: FRAME.width, height: FRAME.height, deviceScaleFactor: 1.5, mobile: false });
    const { frameTree } = await tab.send('Page.getFrameTree', {});
    await tab.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html: windowHtml(page.data, new URL(url).hostname.replace(/^www\./, ''), background, new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })) });
    await tab.send('Runtime.evaluate', { expression: 'document.images[0].decode().catch(() => {})', awaitPromise: true });
    const shot = await tab.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile(file, Buffer.from(shot.data, 'base64'));
    // The highlight's box, moved from the page into the framed picture.
    const into = (f: number, at: number, size: number, whole: number) => (at + f * size) / whole;
    const box = found.found
      ? { x: into(found.x, FRAME.left, FRAME.page.width, FRAME.width), y: into(found.y, FRAME.top + FRAME.bar, FRAME.page.height, FRAME.height), width: (found.width * FRAME.page.width) / FRAME.width, height: (found.height * FRAME.page.height) / FRAME.height }
      : undefined;
    return { file, url, found: Boolean(found.found), ...(box ? { box } : {}) };
  } finally {
    await tab.close();
  }
}
