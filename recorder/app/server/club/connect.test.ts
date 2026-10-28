import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm, writeFile, chmod, readFile, mkdir, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { ConnectProgress } from '../../shared/club.js';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-connect-test-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'data');
const bin = path.join(temp, 'bin');
const stash = path.join(temp, 'stash');
const state = path.join(temp, 'state');
const geminiDir = path.join(temp, 'gemini-home');
await Promise.all([bin, stash, state, geminiDir].map((dir) => mkdir(dir, { recursive: true })));

const { connectProvider, startConnect } = await import('./connect.js');
const { clubRouter } = await import('./index.js');
const { cancelJob, getJob } = await import('./jobs.js');
const { aiStatus } = await import('./ai.js');
const store = await import('./store.js');

const originalPath = process.env.PATH;
const originalKey = process.env.ANTHROPIC_API_KEY;
after(async () => {
  process.env.PATH = originalPath;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
  server.close();
  await rm(temp, { recursive: true, force: true });
});

// Fake tools. They are bash scripts that keep their state in files next to them, because the child environment is an allow-list.
// Nothing here can reach a real installer, browser or login: PATH is only the fake folder plus the system folders.
const script = (body: string) => `#!/bin/bash\nD="$(cd "$(dirname "$0")" && pwd)"\nS=${JSON.stringify(state)}\nmode=$(cat "$S/mode" 2>/dev/null || echo ok)\n${body}\n`;

const claudeBody = (name: 'claude' | 'codex') => `
log() { echo "$*" >> "$S/${name}-calls"; }
login() {
  log "login $*"
  echo "key=\${ANTHROPIC_API_KEY:-none} api=\${OPENAI_API_KEY:-none}" > "$S/${name}-login-env"
  echo $$ > "$S/${name}-login-pid"
  echo "Opening your browser"
  case "$mode" in
    fail) echo "boom secret detail" >&2; exit 1;;
    nosign) exit 0;;
    hang) sleep 30; exit 0;;
    slow) sleep 0.6; touch "$S/${name}-signed-in"; exit 0;;
    *) sleep 0.2; touch "$S/${name}-signed-in"; exit 0;;
  esac
}
case "$1" in
  --version) echo "9.9.9";;
  auth) case "$2" in
          status) if [ -f "$S/${name}-signed-in" ]; then echo '{"loggedIn":true,"email":"dani@example.com"}'; else echo '{"loggedIn":false}'; exit 1; fi;;
          login) login "$@";;
        esac;;
  login) case "$2" in
           status) if [ -f "$S/${name}-signed-in" ]; then echo "Logged in using ChatGPT" >&2; else echo "Not logged in" >&2; exit 1; fi;;
           *) login "$@";;
         esac;;
esac
`;

const geminiBody = `
if [ "$1" = "--version" ]; then echo "0.9.0"; exit 0; fi
echo "gemini $*" >> "$S/gemini-calls"
echo $$ > "$S/gemini-pid"
CREDS=${JSON.stringify(path.join(geminiDir, 'oauth_creds.json'))}
case "$mode" in
  stale) sleep 30;;
  refresh) sleep 0.6; touch "$CREDS"; sleep 30;;
  *) sleep 0.2; echo '{"not":"read"}' > "$CREDS"; sleep 30;;
esac
`;

// The official installer is piped into bash, so the fake curl prints a script. It "installs" by copying the stashed tool into bin.
const curlBody = `
echo "$*" > "$S/curl-args"
if [ "$mode" = "curl-fail" ]; then echo "curl: (22) The requested URL returned error: 404" >&2; exit 22; fi
printf '  10%%\\r 55%%\\r100%%\\n' >&2
cat <<EOF
echo "Downloading Claude Code"
echo "\\$(printf '\\033[32m')Installing\\$(printf '\\033[0m') to ~/.local/bin"
if [ "$mode" != "install-nothing" ]; then cp "${stash}/claude" "${bin}/claude"; chmod +x "${bin}/claude"; fi
EOF
`;

const put = async (dir: string, name: string, body: string) => {
  await writeFile(path.join(dir, name), script(body));
  await chmod(path.join(dir, name), 0o755);
};
await Promise.all([
  put(stash, 'claude', claudeBody('claude')),
  put(stash, 'codex', claudeBody('codex')),
  put(stash, 'gemini', geminiBody),
  put(bin, 'curl', curlBody),
]);
// npm installs whichever tool its argument names.
await put(bin, 'npm', `
echo "$*" >> "$S/npm-calls"
if [ "$mode" = "npm-fail" ]; then echo "npm ERR! EACCES permission denied" >&2; exit 1; fi
echo "added 1 package"
tool="$3"; tool="\${tool##*/}"; tool="\${tool/gemini-cli/gemini}"
cp "${stash}/$tool" "${bin}/$tool"; chmod +x "${bin}/$tool"
`);

const setMode = (mode: string) => writeFile(path.join(state, 'mode'), mode);
const calls = async (file: string) => (existsSync(path.join(state, file)) ? (await readFile(path.join(state, file), 'utf8')).trim().split('\n') : []);
const install = async (name: 'claude' | 'codex' | 'gemini') => {
  await writeFile(path.join(bin, name), await readFile(path.join(stash, name)));
  await chmod(path.join(bin, name), 0o755);
};
const until = async (check: () => boolean, ms = 5000) => {
  for (const end = Date.now() + ms; !check() && Date.now() < end; ) await new Promise((r) => setTimeout(r, 20));
};
const isGone = (pid: number) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
};
const signedIn = (name: 'claude' | 'codex') => writeFile(path.join(state, `${name}-signed-in`), '');

beforeEach(async () => {
  for (const name of ['claude', 'codex', 'gemini']) await rm(path.join(bin, name), { force: true });
  await rm(state, { recursive: true, force: true });
  await mkdir(state);
  await rm(path.join(geminiDir, 'oauth_creds.json'), { force: true });
  await rm(path.join(temp, 'data'), { recursive: true, force: true });
  process.env.PATH = `${bin}${path.delimiter}/usr/bin${path.delimiter}/bin`;
  delete process.env.ANTHROPIC_API_KEY;
});

const options = { extraDirs: [] as string[], geminiDir, pollMs: 40 };
const harness = () => {
  const events: ConnectProgress[] = [];
  const abort = new AbortController();
  return { events, abort, context: { emit: (data: unknown) => events.push(data as ConnectProgress), signal: abort.signal } };
};
const phases = (events: ConnectProgress[]) => events.map((e) => (e.line ? `line:${e.line}` : e.phase));
const rejects = (promise: Promise<unknown>, message: string | RegExp) =>
  assert.rejects(promise, (error: Error) => (typeof message === 'string' ? error.message === message : message.test(error.message)));

test('already signed in: no install, no login, and the first connected AI becomes the default', async () => {
  await install('claude');
  await signedIn('claude');
  const { context, events } = harness();
  const result = await connectProvider('claude', context, options);
  assert.deepEqual(result, { provider: 'claude', account: 'dani@example.com' });
  assert.deepEqual(events, [{ phase: 'connected', account: 'dani@example.com' }]);
  assert.deepEqual(await calls('claude-calls'), []);
  assert.equal(await store.defaultAi(), 'claude');
});

test('installed but signed out: runs claude auth login with a clean environment, then waits for the status to turn', async () => {
  await install('claude');
  process.env.ANTHROPIC_API_KEY = 'sk-ant-must-not-reach-login';
  const { context, events } = harness();
  const result = await connectProvider('claude', context, options);
  assert.deepEqual(result, { provider: 'claude', account: 'dani@example.com' });
  assert.deepEqual(phases(events), ['signing-in', 'connected']);
  assert.deepEqual(await calls('claude-calls'), ['login auth login']);
  assert.match(await readFile(path.join(state, 'claude-login-env'), 'utf8'), /key=none/);
});

test('a default AI that was already chosen is kept when another one connects', async () => {
  await store.setDefaultAi('codex');
  await install('claude');
  await signedIn('claude');
  await connectProvider('claude', harness().context, options);
  assert.equal(await store.defaultAi(), 'codex');
});

test('Claude missing: runs the official installer, streams clean lines, then signs in', async () => {
  const { context, events } = harness();
  const result = await connectProvider('claude', context, options);
  assert.equal(result.account, 'dani@example.com');
  assert.equal(await readFile(path.join(state, 'curl-args'), 'utf8').then((s) => s.trim()), '-fsSL https://claude.ai/install.sh');
  const seen = phases(events);
  assert.equal(seen[0], 'installing');
  assert.ok(seen.includes('line:Downloading Claude Code'));
  assert.ok(seen.includes('line:Installing to ~/.local/bin'), 'colour codes are removed');
  assert.ok(seen.includes('line:100%') && seen.includes('line:10%'), 'carriage-return progress becomes separate lines');
  assert.deepEqual(seen.slice(-2), ['signing-in', 'connected']);
  assert.ok(seen.indexOf('signing-in') > seen.indexOf('line:Installing to ~/.local/bin'));
});

test('installer failures give one sentence, never the raw output, and never start a login', async () => {
  await setMode('curl-fail');
  const { context } = harness();
  await rejects(connectProvider('claude', context, options), "Couldn't install Claude.");
  assert.deepEqual(await calls('claude-calls'), []);
});

test('an installer that finishes without leaving the tool behind is a failure', async () => {
  await setMode('install-nothing');
  await rejects(connectProvider('claude', harness().context, options), "Couldn't install Claude.");
});

test('ChatGPT missing: npm install -g @openai/codex, then codex login', async () => {
  const { context, events } = harness();
  const result = await connectProvider('codex', context, options);
  assert.deepEqual(result, { provider: 'codex', account: 'ChatGPT' });
  assert.deepEqual(await calls('npm-calls'), ['install -g @openai/codex']);
  assert.deepEqual(await calls('codex-calls'), ['login login']);
  assert.ok(phases(events).includes('line:added 1 package'));
  assert.equal(await store.defaultAi(), 'codex');
});

test('npm failing or missing is one plain sentence', async () => {
  await setMode('npm-fail');
  await rejects(connectProvider('codex', harness().context, options), "Couldn't install ChatGPT.");
  process.env.PATH = '/usr/bin:/bin';
  await rejects(connectProvider('codex', harness().context, options), 'Node.js is needed to install ChatGPT.');
});

test('a login that fails, or ends without signing in, is a plain sentence', async () => {
  await install('claude');
  await setMode('fail');
  await rejects(connectProvider('claude', harness().context, options), "Couldn't sign in to Claude.");
  await setMode('nosign');
  await rejects(connectProvider('claude', harness().context, options), "Couldn't sign in to Claude.");
});

test('a login that never finishes times out and its process is stopped', async () => {
  await install('claude');
  await setMode('hang');
  const started = Date.now();
  await rejects(connectProvider('claude', harness().context, { ...options, loginTimeoutMs: 300 }), 'Signing in to Claude took too long.');
  assert.ok(Date.now() - started < 5000);
  const pid = Number(await readFile(path.join(state, 'claude-login-pid'), 'utf8'));
  await until(() => isGone(pid));
  assert.ok(isGone(pid), 'the login process is gone');
});

test('cancelling the job stops the login', async () => {
  await install('claude');
  await setMode('hang');
  const job = startConnect('claude', options);
  await until(() => existsSync(path.join(state, 'claude-login-pid')));
  cancelJob(job.id);
  assert.equal(getJob(job.id)?.status, 'cancelled');
  const pid = Number(await readFile(path.join(state, 'claude-login-pid'), 'utf8'));
  await until(() => isGone(pid));
  assert.ok(isGone(pid), 'the login process is stopped');
});

test('reconnect signs in again and only finishes when the login process has ended', async () => {
  await install('claude');
  await signedIn('claude');
  await setMode('slow');
  const started = Date.now();
  const result = await connectProvider('claude', harness().context, { ...options, reconnect: true });
  assert.equal(result.account, 'dani@example.com');
  assert.ok(Date.now() - started >= 550, 'waited for the login to exit');
  assert.deepEqual(await calls('claude-calls'), ['login auth login']);
});

test('Google: installs the Gemini CLI with npm, runs gemini once, and is connected when its sign-in file appears', async () => {
  const { context, events } = harness();
  const result = await connectProvider('gemini', context, options);
  assert.deepEqual(result, { provider: 'gemini' });
  assert.deepEqual(await calls('npm-calls'), ['install -g @google/gemini-cli']);
  assert.deepEqual(await calls('gemini-calls'), ['gemini']);
  assert.deepEqual(phases(events).filter((p) => !p.startsWith('line:')), ['installing', 'signing-in', 'connected']);
  assert.equal(await store.defaultAi(), undefined, 'Google never becomes the AI that runs prompts');
  const pid = Number(await readFile(path.join(state, 'gemini-pid'), 'utf8'));
  await until(() => isGone(pid));
  assert.ok(isGone(pid), 'gemini is stopped once connected');
});

const OLD = new Date('2020-01-01T00:00:00Z');
const existingGoogleSignIn = async () => {
  await install('gemini');
  const creds = path.join(geminiDir, 'oauth_creds.json');
  await writeFile(creds, 'not even json');
  await utimes(creds, OLD, OLD);
};

test('Google reconnect with an existing sign-in file keeps waiting until the file is rewritten', async () => {
  await existingGoogleSignIn();
  await setMode('refresh');
  const started = Date.now();
  const result = await connectProvider('gemini', harness().context, { ...options, reconnect: true });
  assert.deepEqual(result, { provider: 'gemini' });
  assert.ok(Date.now() - started >= 550, 'the stale file did not count as connected');
  assert.deepEqual(await calls('gemini-calls'), ['gemini']);
  const pid = Number(await readFile(path.join(state, 'gemini-pid'), 'utf8'));
  await until(() => isGone(pid));
  assert.ok(isGone(pid));
});

test('Google reconnect where the person never signs in does not report connected, and gemini is stopped', async () => {
  await existingGoogleSignIn();
  await setMode('stale');
  await rejects(connectProvider('gemini', harness().context, { ...options, reconnect: true, loginTimeoutMs: 400 }), 'Signing in to Google took too long.');
  const pid = Number(await readFile(path.join(state, 'gemini-pid'), 'utf8'));
  await until(() => isGone(pid));
  assert.ok(isGone(pid));
});

test('status: Google is signed in when oauth_creds.json exists, and the file is never read', async () => {
  assert.deepEqual((await aiStatus(options)).gemini, { installed: false, version: null, signedIn: false });
  await install('gemini');
  assert.deepEqual((await aiStatus(options)).gemini, { installed: true, version: '0.9.0', signedIn: false });
  await writeFile(path.join(geminiDir, 'oauth_creds.json'), 'not even json');
  assert.deepEqual((await aiStatus(options)).gemini, { installed: true, version: '0.9.0', signedIn: true });
});

test('a second request while a sign-in is running joins it instead of opening another', async () => {
  await install('claude');
  await setMode('hang');
  const first = startConnect('claude', options);
  const second = startConnect('claude', options);
  assert.equal(second.id, first.id);
  cancelJob(first.id);
  await new Promise((r) => setTimeout(r, 100));
  const third = startConnect('claude', options);
  assert.notEqual(third.id, first.id, 'a finished job is not joined');
  cancelJob(third.id);
  await new Promise((r) => setTimeout(r, 100));
});

// ---- over HTTP

const app = express();
app.use('/api/club', clubRouter({ ai: options }));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
};

test('POST /ai/connect validates the provider, starts a job, and its event stream ends after the result', async () => {
  assert.equal((await call('POST', '/ai/connect', { provider: 'openai' })).status, 400);
  assert.equal((await call('POST', '/ai/connect', { provider: 'claude', apiKey: 'sk-x' })).status, 400, 'no keys, ever');
  assert.equal((await call('POST', '/ai/connect', {})).status, 400);

  await install('claude');
  const started = await call('POST', '/ai/connect', { provider: 'claude' });
  assert.equal(started.status, 202);
  assert.equal(started.body.kind, 'connect-claude');
  const stream = await (await fetch(`${base}/jobs/${started.body.id}/events`)).text(); // resolves only when the server ends the stream
  assert.match(stream, /event: progress\ndata: \{"phase":"signing-in"\}/);
  assert.match(stream, /event: done\ndata: \{"provider":"claude","account":"dani@example.com"\}/);
  const status = await call('GET', '/ai/status');
  assert.equal(status.body.claude.signedIn, true);
  assert.deepEqual(Object.keys(status.body).sort(), ['claude', 'codex', 'gemini']);
});

test('a failed connect reaches the stream as one safe sentence', async () => {
  await install('claude');
  await setMode('fail');
  const started = await call('POST', '/ai/connect', { provider: 'claude' });
  const stream = await (await fetch(`${base}/jobs/${started.body.id}/events`)).text();
  assert.match(stream, /event: failed\ndata: \{"message":"Couldn't sign in to Claude\."\}/);
  assert.ok(!stream.includes('secret detail'));
});

test('settings: default AI is saved, validated and starts empty', async () => {
  assert.deepEqual((await call('GET', '/settings')).body, { defaultAi: null });
  assert.deepEqual((await call('PUT', '/settings', { defaultAi: 'codex' })).body, { defaultAi: 'codex' });
  assert.equal((await call('PUT', '/settings', { defaultAi: 'gemini' })).status, 400);
  assert.deepEqual((await call('GET', '/settings')).body, { defaultAi: 'codex' });
});

test('cancel over HTTP stops the login process, and the next Connect starts a new job with a new login', async () => {
  await install('claude');
  await setMode('hang');
  const pidFile = path.join(state, 'claude-login-pid');
  const first = await call('POST', '/ai/connect', { provider: 'claude' });
  await until(() => existsSync(pidFile));
  const firstPid = Number(await readFile(pidFile, 'utf8'));

  const cancelled = await call('DELETE', `/jobs/${first.body.id}`);
  assert.equal(cancelled.body.status, 'cancelled');
  await until(() => isGone(firstPid));
  assert.ok(isGone(firstPid), 'the login process was killed');

  await rm(pidFile);
  const second = await call('POST', '/ai/connect', { provider: 'claude' });
  assert.notEqual(second.body.id, first.body.id, 'a cancelled job is not rejoined');
  await until(() => existsSync(pidFile));
  const secondPid = Number(await readFile(pidFile, 'utf8'));
  assert.notEqual(secondPid, firstPid);
  assert.equal((await call('DELETE', `/jobs/${second.body.id}`)).body.status, 'cancelled');
  await until(() => isGone(secondPid));
  assert.ok(isGone(secondPid));
});
