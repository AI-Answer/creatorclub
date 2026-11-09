import { spawn, type ChildProcess } from 'node:child_process';
import type { ConnectProgress, ConnectProvider, ConnectResult, JobSnapshot } from '../../shared/club.js';
import { AiError, childEnv, findBinary, findExecutable, providerStatus, type Lookup } from './ai.js';
import { startJobOnce, type JobContext } from './jobs.js';
import * as store from './store.js';

/*
 * Connects the person's own AI login: installs the command line tool when it is missing, starts the
 * tool's own sign-in (which opens their browser), then waits until the tool says it is signed in.
 * No key or token is ever asked for, read or stored. Runs as a job so the screen can stream progress.
 */

const LABEL: Record<ConnectProvider, string> = { claude: 'Claude', codex: 'ChatGPT' };

/** How each tool is installed. The Claude installer is the official one from claude.ai. */
const INSTALL: Record<ConnectProvider, { file: string; args: string[] }> = {
  claude: { file: '/bin/bash', args: ['-c', 'set -o pipefail; curl -fsSL https://claude.ai/install.sh | bash'] },
  codex: { file: 'npm', args: ['install', '-g', '@openai/codex'] },
};

/** The tool's own sign-in command. */
const LOGIN: Record<ConnectProvider, string[]> = { claude: ['auth', 'login'], codex: ['login'] };

export interface ConnectOptions extends Lookup {
  /** Sign in again even though the tool already reports being signed in. */
  reconnect?: boolean;
  /** Time between sign-in checks. Defaults to 2 seconds. */
  pollMs?: number;
  installTimeoutMs?: number;
  loginTimeoutMs?: number;
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const MAX_LINE = 160;

/** Starts a process and hands every output line (stdout and stderr, ANSI codes removed) to `onLine`. */
function run(file: string, args: string[], env: NodeJS.ProcessEnv, onLine: (line: string) => void) {
  // A process group of its own, so stopping it also stops whatever it started (a shell, curl, npm's scripts).
  const child = spawn(file, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let tail = '';
  const buffers = { out: '', err: '' };
  const feed = (key: 'out' | 'err') => (chunk: string) => {
    const parts = (buffers[key] + chunk).split(/\r\n|\r|\n/);
    buffers[key] = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.replace(ANSI, '').trim();
      if (!line) continue;
      tail = (tail + line + '\n').slice(-2000);
      onLine(line.slice(0, MAX_LINE));
    }
  };
  child.stdout.setEncoding('utf8').on('data', feed('out'));
  child.stderr.setEncoding('utf8').on('data', feed('err'));
  const done = new Promise<{ code: number | null; failedToStart: boolean; tail: string }>((resolve) => {
    let failedToStart = false;
    child.on('error', () => {
      failedToStart = true;
    });
    child.on('close', (code) => resolve({ code, failedToStart, tail }));
  });
  return { child, done };
}

const signalGroup = (child: ChildProcess, signal: NodeJS.Signals) => {
  try {
    if (child.pid) process.kill(-child.pid, signal);
  } catch {
    // already gone
  }
};

const stop = (child: ChildProcess) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalGroup(child, 'SIGTERM');
  setTimeout(() => signalGroup(child, 'SIGKILL'), 3000).unref();
};

const cancelled = () => new AiError('cancelled', 'That was stopped.');

/** Resolves after `ms`, or early when the signal aborts. */
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

async function install(provider: ConnectProvider, context: JobContext, options: ConnectOptions) {
  if (context.signal.aborted) throw cancelled();
  const label = LABEL[provider];
  const { file, args } = INSTALL[provider];
  const resolved = file.startsWith('/') ? file : await findExecutable(file, options);
  if (!resolved) throw new AiError('not-installed', `Node.js is needed to install ${label}.`);

  context.emit({ phase: 'installing' } satisfies ConnectProgress);
  const { child, done } = run(resolved, args, childEnv(options), (line) => context.emit({ phase: 'installing', line } satisfies ConnectProgress));
  const onAbort = () => stop(child);
  context.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => stop(child), options.installTimeoutMs ?? 10 * 60_000);
  try {
    const result = await done;
    if (context.signal.aborted) throw cancelled();
    if (result.code !== 0 || result.failedToStart) throw new AiError('failed', `Couldn't install ${label}.`, result.tail);
  } finally {
    clearTimeout(timer);
    context.signal.removeEventListener('abort', onAbort);
  }
  if (!(await findBinary(provider, options))) throw new AiError('failed', `Couldn't install ${label}.`);
}

/** Runs the tool's sign-in and checks its status until it reports signed in. */
async function signIn(provider: ConnectProvider, file: string, context: JobContext, options: ConnectOptions, wasSignedIn: boolean): Promise<ConnectResult> {
  if (context.signal.aborted) throw cancelled();
  const label = LABEL[provider];
  const pollMs = options.pollMs ?? 2000;
  const deadline = Date.now() + (options.loginTimeoutMs ?? 5 * 60_000);
  // A sign-in that already exists (Reconnect) only counts as redone once the tool's own login has finished.
  const waitForExit = options.reconnect === true && wasSignedIn;
  context.emit({ phase: 'signing-in' } satisfies ConnectProgress);
  const { child, done } = run(file, LOGIN[provider], childEnv(options), () => {});
  let exit = undefined as { code: number | null; failedToStart: boolean } | undefined;
  void done.then((result) => (exit = result));
  try {
    for (;;) {
      await sleep(pollMs, context.signal);
      if (context.signal.aborted) throw cancelled();
      const exitedBeforeCheck = exit;
      const status = await providerStatus(provider, options);
      if (context.signal.aborted) throw cancelled();
      const finished = exitedBeforeCheck !== undefined;
      const signedIn = status.signedIn;
      if (signedIn && (!waitForExit || (finished && exitedBeforeCheck.code === 0))) {
        return { provider, ...(status.account ? { account: status.account } : {}) };
      }
      if (finished) throw new AiError('not-signed-in', `Couldn't sign in to ${label}.`);
      if (Date.now() > deadline) throw new AiError('failed', `Signing in to ${label} took too long.`);
    }
  } finally {
    stop(child);
  }
}

/** The connect state machine: already connected, install if missing, sign in, wait. */
export async function connectProvider(provider: ConnectProvider, context: JobContext, options: ConnectOptions = {}): Promise<ConnectResult> {
  const before = await providerStatus(provider, options);
  if (before.installed && before.signedIn && !options.reconnect) return finished(provider, before.account, context);

  if (!before.installed) await install(provider, context, options);
  const file = await findBinary(provider, options);
  if (!file) throw new AiError('not-installed', `Couldn't install ${LABEL[provider]}.`);

  const result = await signIn(provider, file, context, options, before.signedIn);
  return finished(provider, result.account, context);
}

/** The first of Claude or ChatGPT to connect becomes the default AI. */
async function finished(provider: ConnectProvider, account: string | undefined, context: JobContext): Promise<ConnectResult> {
  await store.setDefaultAiIfUnset(provider);
  context.emit({ phase: 'connected', ...(account ? { account } : {}) } satisfies ConnectProgress);
  return { provider, ...(account ? { account } : {}) };
}

/** Reconnect must never join a check-only job. */
export function startConnect(provider: ConnectProvider, options: ConnectOptions = {}): JobSnapshot {
  return startJobOnce(`connect:${provider}:${options.reconnect ? 'reconnect' : 'check'}`, `connect-${provider}`, context => connectProvider(provider, context, options));
}
