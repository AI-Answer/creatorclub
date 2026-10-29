import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { childEnv, commonBinDirs, findExecutable, type Lookup } from './ai.js';
import { ClubError } from './errors.js';
import { rootDir, writeFileAtomic } from './store.js';

/*
 * The helper programs the app shells out to besides the AI: yt-dlp (channel and caption data), ffmpeg and treg (X posts).
 * They are found the same way as the AI command line tools: PATH, then the usual install places,
 * then `<root>/.bin/`, where the app puts a yt-dlp it downloaded itself.
 */

export const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';

export const localBinDir = () => path.join(rootDir(), '.bin');

const searchDirs = (lookup: Lookup) => [...(lookup.extraDirs ?? commonBinDirs()), localBinDir()];

export const findYtDlp = (lookup: Lookup = {}) => findExecutable('yt-dlp', { ...lookup, extraDirs: searchDirs(lookup) });
export const findTreg = (lookup: Lookup = {}) => findExecutable('treg', { ...lookup, extraDirs: searchDirs(lookup) });
export const findFfmpeg = (lookup: Lookup = {}) => findExecutable('ffmpeg', { ...lookup, extraDirs: searchDirs(lookup) });

/** The environment a helper program gets, with `<root>/.bin` on its PATH so yt-dlp finds the tools next to it. */
export const toolEnv = (lookup: Lookup = {}) => childEnv({ ...lookup, extraDirs: searchDirs(lookup) });

export interface ToolOptions extends Lookup {
  /** Used to download yt-dlp when it is missing. Tests pass a fake. */
  fetch?: typeof fetch;
}

const runVersion = (file: string, lookup: Lookup) =>
  new Promise<boolean>((resolve) => {
    let out = '';
    const child = spawn(file, ['--version'], { env: toolEnv(lookup), stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 });
    child.stdout.on('data', (chunk) => (out += chunk));
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0 && out.trim().length > 0));
  });

/** Finds yt-dlp, or downloads the official standalone build into `<root>/.bin/`. */
export async function ensureYtDlp(options: ToolOptions = {}): Promise<string> {
  const found = await findYtDlp(options);
  if (found) return found;
  if (!options.fetch && process.platform !== 'darwin') throw new ClubError("Couldn't set up the YouTube reader on this computer.", 502);
  const target = path.join(localBinDir(), 'yt-dlp');
  try {
    const response = await (options.fetch ?? fetch)(YT_DLP_URL, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await writeFileAtomic(target, Buffer.from(await response.arrayBuffer()));
    await fs.chmod(target, 0o755);
    if (!(await runVersion(target, options))) throw new Error('downloaded file does not run');
    return target;
  } catch (error) {
    console.error('[club] yt-dlp download failed:', error instanceof Error ? error.message : error);
    await fs.rm(target, { force: true });
    throw new ClubError("Couldn't set up the YouTube reader. Check your connection and try again.", 502);
  }
}

/** `ensureYtDlp`, telling the screen first when it has to be downloaded. */
export async function prepareYtDlp(say: (message: string) => void, options: ToolOptions = {}): Promise<string> {
  if (!(await findYtDlp(options))) say('Setting up the YouTube reader…');
  return ensureYtDlp(options);
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a helper program to the end. Aborting kills it; the caller checks the signal afterwards. */
export function runTool(file: string, args: string[], { env, signal, timeoutMs = 120_000 }: { env: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs?: number }): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    if (signal?.aborted) return resolve({ code: null, stdout, stderr });
    const child = spawn(file, args, { env, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, killSignal: 'SIGKILL', signal });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)));
    child.on('error', () => resolve({ code: null, stdout, stderr }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
