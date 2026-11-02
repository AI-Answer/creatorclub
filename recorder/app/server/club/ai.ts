import { spawn } from 'node:child_process';
import { promises as fs, constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClubError } from './errors.js';
import type { AiProvider, AiProviderStatus, AiStatus, ConnectProvider } from '../../shared/club.js';

/*
 * The only module that talks to an AI. It starts the user's own `claude` or `codex` command line tool
 * and lets that tool handle sign-in. It never reads tokens, the Keychain or credential files, and it
 * gives the child an allow-listed environment, so ANTHROPIC_API_KEY and other keys or provider switches never reach it.
 */

const BINARY: Record<ConnectProvider, string> = { claude: 'claude', codex: 'codex' };
/** The name the person sees for each AI. Codex signs in with ChatGPT, and every screen calls it ChatGPT. */
const LABEL: Record<AiProvider, string> = { claude: 'Claude', codex: 'ChatGPT' };
export const aiLabel = (provider: AiProvider) => LABEL[provider];

/** Apps opened from the Dock get a minimal PATH, so look in the usual install places too. */
export const commonBinDirs = () => {
  const home = os.homedir();
  return [path.join(home, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.claude', 'local')];
};

export type AiErrorCode = 'not-installed' | 'not-signed-in' | 'over-budget' | 'bad-answer' | 'cancelled' | 'failed';

/** `message` is one user-safe sentence. `detail` is raw output for logs only. */
export class AiError extends ClubError {
  constructor(readonly code: AiErrorCode, message: string, readonly detail?: string) {
    super(message, 502);
    this.name = 'AiError';
  }
}

export interface Lookup {
  /** Extra directories to search after PATH. Defaults to the common install locations. */
  extraDirs?: string[];
}

/** Finds a command on PATH, then in the common install places. */
export async function findExecutable(name: string, { extraDirs = commonBinDirs() }: Lookup = {}): Promise<string | undefined> {
  const dirs = [...(process.env.PATH ?? '').split(path.delimiter), ...extraDirs].filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    try {
      if ((await fs.stat(candidate)).isFile()) {
        await fs.access(candidate, fsConstants.X_OK);
        return candidate;
      }
    } catch {
      // keep looking
    }
  }
  return undefined;
}

export const findBinary = (provider: ConnectProvider, lookup: Lookup = {}) => findExecutable(BINARY[provider], lookup);

/** The only variables a child CLI receives. Everything else (API keys, tokens, base URLs, cloud-provider switches) stays behind. */
const ENV_ALLOW = /^(PATH|HOME|USER|LOGNAME|TMPDIR|LANG|LC_[A-Z_]+|SHELL|TERM|(http|https|no|all)_proxy|(HTTP|HTTPS|NO|ALL)_PROXY)$/;

export function childEnv({ extraDirs = commonBinDirs() }: Lookup = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (ENV_ALLOW.test(key) && value !== undefined) env[key] = value;
  env.PATH = [...(env.PATH ?? '').split(path.delimiter), ...extraDirs].filter(Boolean).join(path.delimiter);
  return env;
}

/** A neutral working directory, so project files and CLAUDE.md files of wherever the app started are not picked up. */
async function neutralCwd() {
  const dir = path.join(os.tmpdir(), 'creatorclub-ai');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

interface Finished {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function runQuick(file: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs = 15_000): Promise<Finished> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(file, args, { env, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs });
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', () => resolve({ code: null, stdout, stderr }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const parseVersion = (text: string) => text.match(/\d+\.\d+\.\d+[\w.+-]*/)?.[0] ?? null;

/**
 * `claude auth status` prints JSON (`--json` is the default): `{"loggedIn":true,"email":"…",…}`.
 * Only `loggedIn` and `email` are read.
 */
export function parseClaudeAuth(output: string): Pick<AiProviderStatus, 'signedIn' | 'account'> {
  try {
    const data = JSON.parse(output) as { loggedIn?: unknown; email?: unknown };
    return { signedIn: data.loggedIn === true, ...(typeof data.email === 'string' && data.email ? { account: data.email } : {}) };
  } catch {
    return { signedIn: false };
  }
}

/**
 * `codex login status` prints one line to stderr and exits 0 when signed in, e.g. `Logged in using ChatGPT`.
 * With an API key it prints the key (masked), so only a ChatGPT sign-in is named as the account.
 */
export function parseCodexAuth(code: number | null, output: string): Pick<AiProviderStatus, 'signedIn' | 'account'> {
  const signedIn = code === 0 && /^\s*logged in/i.test(output);
  return { signedIn, ...(signedIn && /chatgpt/i.test(output) ? { account: 'ChatGPT' } : {}) };
}

export async function providerStatus(provider: ConnectProvider, lookup: Lookup = {}): Promise<AiProviderStatus> {
  const file = await findBinary(provider, lookup);
  if (!file) return { installed: false, version: null, signedIn: false };
  const env = childEnv(lookup);
  const [version, auth] = await Promise.all([
    runQuick(file, ['--version'], env),
    provider === 'claude' ? runQuick(file, ['auth', 'status'], env) : runQuick(file, ['login', 'status'], env),
  ]);
  const signIn = provider === 'claude' ? parseClaudeAuth(auth.stdout) : parseCodexAuth(auth.code, `${auth.stdout}\n${auth.stderr}`);
  return { installed: true, version: parseVersion(version.stdout || version.stderr), ...signIn };
}

export async function aiStatus(lookup: Lookup = {}): Promise<AiStatus> {
  const [claude, codex] = await Promise.all([providerStatus('claude', lookup), providerStatus('codex', lookup)]);
  return { claude, codex };
}

// ---------------------------------------------------------------- running a prompt

export type AIEvent =
  | { type: 'started' }
  /** A whole message's text (claude's `assistant` line, codex's `agent_message`). */
  | { type: 'text'; text: string }
  /** A piece of text as it is written. Claude with `stream` only; codex sends whole messages. */
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string };

export interface RunAIOptions extends Lookup {
  provider?: AiProvider;
  prompt: string;
  system?: string;
  /** JSON Schema object the answer must follow. */
  jsonSchema?: object;
  /** Claude alias or model name (default `sonnet`). Codex uses its own default unless a model is given. */
  model?: string;
  /** Spending cap for one call. Claude enforces it; Codex has no equivalent flag. */
  budgetUsd: number;
  /** Image file paths. They are named in the prompt and read from their own folder only. */
  images?: string[];
  /**
   * A skill run (Claude only): the tools it may use, the folders it may touch and the folder it works in. Still no MCP servers, hooks or
   * settings; edits and commands are allowed without asking because the person started this run for this folder.
   */
  agent?: { cwd: string; dirs: string[]; tools: string[] };
  onEvent?: (event: AIEvent) => void;
  /** Claude: also send the text as it is written (`--include-partial-messages`), as `delta` events. */
  stream?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RunAIResult {
  text: string;
  json?: unknown;
  costUsd?: number;
}

/** Pulls a JSON value out of a model answer: plain, fenced or surrounded by prose. */
export function parseJSONLoose(text: string): unknown {
  const candidates = [text.trim(), text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  return undefined;
}

interface Invocation {
  args: string[];
  stdin: string;
  cleanup?: () => Promise<void>;
}

const DEFAULT_SYSTEM = 'You are a precise assistant. Follow the instructions you are given and answer only in the format requested.';

async function claudeInvocation(o: RunAIOptions): Promise<Invocation> {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', o.model ?? 'sonnet', '--max-budget-usd', String(o.budgetUsd)];
  if (o.stream) args.push('--include-partial-messages');
  if (o.jsonSchema) args.push('--json-schema', JSON.stringify(o.jsonSchema));
  // Isolation: no MCP servers, skills, user/project settings (hooks, plugins) and a replaced system prompt, so the
  // user's own Claude Code setup (CLAUDE.md, brain hooks) is not loaded into every call. Verified with a real call.
  args.push('--system-prompt', o.system ?? DEFAULT_SYSTEM);
  args.push('--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands', '--setting-sources', '');
  let prompt = o.prompt;
  if (o.agent) {
    const tools = o.agent.tools.join(',');
    args.push('--tools', tools, '--allowedTools', tools, '--permission-mode', 'acceptEdits');
    for (const dir of o.agent.dirs) args.push('--add-dir', dir);
    if (o.images?.length) prompt += `\n\nImage files to look at (use the Read tool):\n${o.images.map((image) => `- ${path.resolve(image)}`).join('\n')}`;
  } else if (o.images?.length) {
    const dirs = [...new Set(o.images.map((image) => path.dirname(path.resolve(image))))];
    args.push('--tools', 'Read', '--allowedTools', 'Read');
    for (const dir of dirs) args.push('--add-dir', dir);
    prompt += `\n\nImage files to look at (use the Read tool):\n${o.images.map((image) => `- ${path.resolve(image)}`).join('\n')}`;
  } else {
    args.push('--tools', '');
  }
  return { args, stdin: prompt };
}

async function codexInvocation(o: RunAIOptions, cwd: string): Promise<Invocation> {
  const args = ['exec', '--json', '--skip-git-repo-check', '--ephemeral'];
  // -i takes several values, so it goes before other flags and the trailing "-" (prompt from stdin) stays a prompt.
  for (const image of o.images ?? []) args.push('-i', path.resolve(image));
  args.push('-s', 'read-only', '-C', cwd);
  if (o.model) args.push('-m', o.model);
  let cleanup: Invocation['cleanup'];
  if (o.jsonSchema) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'creatorclub-schema-'));
    const file = path.join(dir, 'schema.json');
    await fs.writeFile(file, JSON.stringify(o.jsonSchema));
    args.push('--output-schema', file);
    cleanup = () => fs.rm(dir, { recursive: true, force: true });
  }
  args.push('-');
  return { args, stdin: o.system ? `${o.system}\n\n${o.prompt}` : o.prompt, cleanup };
}

export interface StreamState {
  text: string;
  /** Claude sent partial messages, so whole messages carry nothing new. */
  streamed?: boolean;
  failure?: string;
  budgetHit?: boolean;
  costUsd?: number;
  structured?: unknown;
  finished?: boolean;
}

type Json = Record<string, any>;

/**
 * Claude `stream-json`: system init, assistant messages with content blocks, then one `result` line. With partial messages,
 * `stream_event` lines carry the API's events: text deltas, and a tool use as its block starts.
 */
function readClaudeLine(event: Json, state: StreamState, emit: (e: AIEvent) => void) {
  if (event.type === 'system' && event.subtype === 'init') emit({ type: 'started' });
  if (event.type === 'stream_event') {
    state.streamed = true;
    const inner = event.event ?? {};
    if (inner.type === 'content_block_delta' && inner.delta?.type === 'text_delta' && typeof inner.delta.text === 'string' && inner.delta.text) emit({ type: 'delta', text: inner.delta.text });
    if (inner.type === 'content_block_start' && inner.content_block?.type === 'tool_use') emit({ type: 'tool', name: String(inner.content_block.name) });
  }
  if (event.type === 'assistant') {
    for (const block of event.message?.content ?? []) {
      if (block.type === 'text' && block.text) emit({ type: 'text', text: block.text });
      if (block.type === 'tool_use' && !state.streamed) emit({ type: 'tool', name: String(block.name) });
    }
  }
  if (event.type === 'result') {
    state.finished = true;
    state.text = typeof event.result === 'string' ? event.result : state.text;
    if (typeof event.total_cost_usd === 'number') state.costUsd = event.total_cost_usd;
    if (event.structured_output !== undefined) state.structured = event.structured_output;
    if (event.is_error || (event.subtype && event.subtype !== 'success')) {
      state.budgetHit = event.subtype === 'error_max_budget_usd';
      state.failure = state.budgetHit ? 'budget' : state.text || String(event.subtype ?? 'error');
    }
  }
}

/** Codex `exec --json`: `thread.started`, `turn.started`, `item.*` events, `turn.completed` or `turn.failed`. */
function readCodexLine(event: Json, state: StreamState, emit: (e: AIEvent) => void) {
  if (event.type === 'thread.started') emit({ type: 'started' });
  if (event.type === 'item.completed' && event.item) {
    if (event.item.type === 'agent_message' && typeof event.item.text === 'string') {
      state.text = event.item.text;
      emit({ type: 'text', text: event.item.text });
    }
    if (event.item.type === 'command_execution') emit({ type: 'tool', name: 'command' });
  }
  if (event.type === 'turn.completed') state.finished = true;
  if (event.type === 'turn.failed') state.failure = String(event.error?.message ?? 'turn failed');
}

/**
 * Reads a CLI's JSON lines as they arrive in chunks of any size: a line split across chunks is joined, a line that is not JSON is skipped,
 * and `end` reads what is left without a final newline.
 */
export function createStreamReader(provider: AiProvider, emit: (event: AIEvent) => void, state: StreamState = { text: '' }) {
  const readLine = provider === 'claude' ? readClaudeLine : readCodexLine;
  let buffer = '';
  const handle = (line: string) => {
    if (!line.trim()) return;
    try {
      readLine(JSON.parse(line) as Json, state, emit);
    } catch {
      // not a JSON event line, or one of a shape we do not read
    }
  };
  return {
    state,
    feed(chunk: string) {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        handle(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    },
    end() {
      handle(buffer);
      buffer = '';
    },
  };
}

const AUTH_FAILURE = /not logged in|please run \/login|\/login|invalid api key|authentication|log ?in required|sign in/i;

export async function runAI(options: RunAIOptions): Promise<RunAIResult> {
  const provider = options.provider ?? 'claude';
  const label = LABEL[provider];
  const file = await findBinary(provider, options);
  if (!file) throw new AiError('not-installed', `${label} is not installed on this Mac.`);
  if (options.signal?.aborted) throw new AiError('cancelled', 'That was stopped.');

  if (options.agent && provider !== 'claude') throw new AiError('not-installed', 'Skills run with Claude only.');
  const cwd = options.agent?.cwd ?? (await neutralCwd());
  const invocation = provider === 'claude' ? await claudeInvocation(options) : await codexInvocation(options, cwd);
  const reader = createStreamReader(provider, (event) => options.onEvent?.(event));
  const state = reader.state;

  try {
    // Setup above awaited, so an abort may already have fired with no listener to hear it. No await sits between this
    // check and the listener registered inside the promise below, so no abort can slip through.
    if (options.signal?.aborted) throw new AiError('cancelled', 'That was stopped.');
    const { code, stderr, interrupted } = await new Promise<{ code: number | null; stderr: string; interrupted?: 'timeout' | 'abort' | 'spawn' }>((resolve) => {
      const child = spawn(file, invocation.args, { cwd, env: childEnv(options), stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      let interrupted: 'timeout' | 'abort' | 'spawn' | undefined;
      const stop = (reason: 'timeout' | 'abort') => {
        interrupted = reason;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 3000).unref();
      };
      const timer = setTimeout(() => stop('timeout'), options.timeoutMs ?? 15 * 60_000);
      const onAbort = () => stop('abort');
      options.signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => reader.feed(chunk));
      child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)));
      child.stdin.on('error', () => {});
      child.stdin.end(invocation.stdin);
      child.on('error', () => {
        interrupted = 'spawn';
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        reader.end();
        resolve({ code, stderr, interrupted });
      });
    });

    if (interrupted === 'abort') throw new AiError('cancelled', 'That was stopped.');
    if (interrupted === 'timeout') throw new AiError('failed', `${label} took too long to answer.`, stderr);
    if (interrupted === 'spawn') throw new AiError('not-installed', `${label} could not be started.`, stderr);
    if (state.budgetHit) throw new AiError('over-budget', 'That needed more than its spending limit.');
    if (state.failure || (!state.finished && code !== 0)) {
      const raw = `${state.failure ?? ''}\n${stderr}`;
      if (AUTH_FAILURE.test(raw)) throw new AiError('not-signed-in', `${label} is not signed in.`, raw);
      throw new AiError('failed', `${label} could not finish that.`, raw);
    }
    if (!state.text && state.structured === undefined) throw new AiError('failed', `${label} sent back no answer.`, stderr);

    const result: RunAIResult = { text: state.text };
    if (state.costUsd !== undefined) result.costUsd = state.costUsd;
    if (options.jsonSchema) {
      const json = state.structured ?? parseJSONLoose(state.text);
      if (json === undefined) throw new AiError('bad-answer', `${label} answered in a shape we could not read.`, state.text);
      result.json = json;
    }
    return result;
  } finally {
    await invocation.cleanup?.();
  }
}

// ---------------------------------------------------------------- watching a YouTube video with Gemini

/** Google's documented endpoint for video understanding by link (the Interactions API). */
export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
/** The model the Gemini docs use for YouTube links. Change it here when Google moves on. */
export const GEMINI_MODEL = 'gemini-3.8-flash';

export interface WatchOptions {
  /** The person's own Gemini API key. Sent to Google and nowhere else; never logged. */
  apiKey: string;
  /** A public YouTube link. Google reads the video itself, so nothing is downloaded. */
  videoUrl: string;
  prompt: string;
  system?: string;
  jsonSchema: object;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Tests pass a stand-in for the network. */
  fetch?: typeof fetch;
}

/** The text of a finished interaction: the `model_output` steps' text parts. */
function geminiText(body: unknown): string {
  const data = (typeof body === 'object' && body !== null ? body : {}) as { steps?: unknown; outputs?: unknown };
  const parts: string[] = [];
  const read = (content: unknown) => {
    for (const part of Array.isArray(content) ? content : []) if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') parts.push((part as { text: string }).text);
  };
  for (const step of Array.isArray(data.steps) ? data.steps : []) if (step && typeof step === 'object' && (step as { type?: unknown }).type === 'model_output') read((step as { content?: unknown }).content);
  if (!parts.length) read(data.outputs);
  return parts.join('');
}

/**
 * Asks Gemini to watch a public YouTube video from its link and answer in JSON. Every failure is an AiError with a
 * sentence safe to show and no key in it, so the caller can fall back to Claude.
 */
export async function watchWithGemini(options: WatchOptions): Promise<RunAIResult> {
  if (options.signal?.aborted) throw new AiError('cancelled', 'That was stopped.');
  const { title: _title, description: _description, ...schema } = options.jsonSchema as Record<string, unknown>;
  const body = {
    model: GEMINI_MODEL,
    input: [
      { type: 'text', text: [options.system ?? DEFAULT_SYSTEM, options.prompt].join('\n\n') },
      { type: 'video', uri: options.videoUrl },
    ],
    response_format: { type: 'text', mime_type: 'application/json', schema },
  };
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 5 * 60_000);
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
      body: JSON.stringify(body),
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
  } catch {
    if (options.signal?.aborted) throw new AiError('cancelled', 'That was stopped.');
    throw new AiError('failed', timeout.aborted ? 'Gemini took too long to answer.' : "Couldn't reach Gemini.");
  }
  const raw = await response.text().catch(() => '');
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!response.ok) {
    const sign = response.status === 400 || response.status === 401 || response.status === 403;
    throw new AiError('failed', sign ? 'Gemini could not read that video with your key.' : 'Gemini could not finish that.', `HTTP ${response.status}`);
  }
  const text = geminiText(parsed);
  const json = text ? parseJSONLoose(text) : undefined;
  if (json === undefined) throw new AiError('bad-answer', 'Gemini answered in a shape we could not read.');
  return { text, json };
}
