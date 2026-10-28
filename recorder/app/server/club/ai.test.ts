import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, chmod, readFile, mkdir } from 'node:fs/promises';
import { writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aiStatus, runAI, parseClaudeAuth, parseCodexAuth, parseJSONLoose, AiError, type AIEvent } from './ai.js';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-ai-test-'));
const bin = path.join(temp, 'bin');
const emptyBin = path.join(temp, 'empty');
const log = path.join(temp, 'invocation.json');
await mkdir(bin);
await mkdir(emptyBin);

const originalPath = process.env.PATH;
const originalEnv = { ...process.env };
after(async () => {
  process.env.PATH = originalPath;
  for (const key of Object.keys(SECRETS)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  await rm(temp, { recursive: true, force: true });
});

/** A stand-in for the real command line tools: records how it was called and prints canned output. FAKE_MODE picks the behaviour. */
const fakeTool = (name: 'claude' | 'codex') => `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
// The mode comes from a file next to the script, because the child environment is an allow-list.
const mode = (() => { try { return fs.readFileSync(__dirname + '/mode', 'utf8'); } catch { return 'ok'; } })();
const line = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
if (args[0] === '--version') { console.log(${name === 'claude' ? "'9.9.9 (Claude Code)'" : "'codex-cli 8.8.8'"}); process.exit(0); }
if (args[0] === 'auth' && args[1] === 'status') {
  console.log(JSON.stringify({ loggedIn: mode !== 'signed-out', email: 'dani@example.com', orgId: 'secret-org' }));
  process.exit(mode === 'signed-out' ? 1 : 0);
}
if (args[0] === 'login' && args[1] === 'status') {
  if (mode === 'signed-out') { console.error('Not logged in'); process.exit(1); }
  console.error('Logged in using ChatGPT'); process.exit(0);
}
const WATCHED = ['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX','OPENAI_API_KEY','CODEX_API_KEY','CREATORCLUB_SECRET','HOME','HTTPS_PROXY'];
let stdin = '';
process.stdin.on('data', (c) => (stdin += c));
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args, stdin, cwd: process.cwd(), env: Object.fromEntries(WATCHED.map((k) => [k, process.env[k] ?? null])) }));
  if (mode === 'hang') { setInterval(() => {}, 1000); return; }
  if (${name === 'claude'}) {
    line({ type: 'system', subtype: 'init' });
    line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Thinking out loud' }] } });
    if (mode === 'not-signed-in') { line({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' }); process.exit(1); }
    if (mode === 'budget') { line({ type: 'result', subtype: 'error_max_budget_usd', is_error: true, total_cost_usd: 0.5 }); process.exit(1); }
    if (mode === 'structured') line({ type: 'result', subtype: 'success', is_error: false, result: '', structured_output: { ok: true }, total_cost_usd: 0.0123 });
    else line({ type: 'result', subtype: 'success', is_error: false, result: mode === 'fenced' ? 'Here:\\n\`\`\`json\\n{"ok":true}\\n\`\`\`' : 'Plain answer', total_cost_usd: 0.01 });
  } else {
    line({ type: 'thread.started', thread_id: 't' });
    line({ type: 'item.completed', item: { type: 'agent_message', text: mode === 'structured' ? '{"ok":true}' : 'Codex answer' } });
    line({ type: 'turn.completed', usage: {} });
  }
});
`;

for (const name of ['claude', 'codex'] as const) {
  await writeFile(path.join(bin, name), fakeTool(name));
  await chmod(path.join(bin, name), 0o755);
}

const SECRETS = {
  ANTHROPIC_API_KEY: 'sk-ant-must-not-reach-child',
  ANTHROPIC_AUTH_TOKEN: 'token-must-not-reach-child',
  ANTHROPIC_BASE_URL: 'https://proxy.invalid',
  CLAUDE_CODE_USE_BEDROCK: '1',
  CLAUDE_CODE_USE_VERTEX: '1',
  OPENAI_API_KEY: 'sk-openai-must-not-reach-child',
  CODEX_API_KEY: 'codex-must-not-reach-child',
  CREATORCLUB_SECRET: 'anything-not-allow-listed',
};
const withFake = (mode: string) => {
  process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
  writeFileSync(path.join(bin, 'mode'), mode);
  Object.assign(process.env, SECRETS, { HTTPS_PROXY: 'http://proxy.invalid:8080' });
};
const invocation = async () =>
  JSON.parse(await readFile(log, 'utf8')) as { args: string[]; stdin: string; cwd: string; env: Record<string, string | null> };
const base = { extraDirs: [] as string[], budgetUsd: 0.5 };

test('claude: builds the agreed command, sends the prompt on stdin, strips ANTHROPIC_API_KEY, streams events', async () => {
  withFake('structured');
  const events: AIEvent[] = [];
  const result = await runAI({ ...base, prompt: 'Say hi', system: 'Be brief', jsonSchema: { type: 'object' }, onEvent: (e) => events.push(e) });
  assert.deepEqual(result.json, { ok: true });
  assert.equal(result.costUsd, 0.0123);
  assert.deepEqual(events, [{ type: 'started' }, { type: 'text', text: 'Thinking out loud' }]);

  const call = await invocation();
  for (const key of Object.keys(SECRETS)) assert.equal(call.env[key], null, `${key} must not reach the child`);
  assert.equal(call.env.HTTPS_PROXY, 'http://proxy.invalid:8080', 'proxy settings are passed on');
  assert.equal(call.env.HOME, os.homedir());
  assert.equal(call.stdin, 'Say hi');
  const { args } = call;
  assert.deepEqual(args.slice(0, 8), ['-p', '--output-format', 'stream-json', '--verbose', '--model', 'sonnet', '--max-budget-usd', '0.5']);
  assert.equal(args[args.indexOf('--json-schema') + 1], '{"type":"object"}');
  assert.equal(args[args.indexOf('--system-prompt') + 1], 'Be brief');
  assert.equal(args[args.indexOf('--tools') + 1], '', 'all tools are off without images');
  // Isolation from the user's own Claude Code setup (CLAUDE.md, hooks, skills, MCP servers, plugins).
  assert.ok(args.includes('--strict-mcp-config'));
  assert.ok(args.includes('--disable-slash-commands'));
  assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.ok(args.includes('--no-session-persistence'));
  assert.ok(!args.includes('--add-dir'));
  assert.ok(!call.cwd.includes('recorder'), 'runs in a neutral directory');
});

test('claude: a default system prompt is always set, so the stock one is never used', async () => {
  withFake('ok');
  await runAI({ ...base, prompt: 'p' });
  const { args } = await invocation();
  assert.match(args[args.indexOf('--system-prompt') + 1], /precise assistant/);
});

test('claude: without a schema there is no --json-schema and no json', async () => {
  withFake('ok');
  const result = await runAI({ ...base, prompt: 'p', model: 'opus' });
  assert.equal(result.text, 'Plain answer');
  assert.equal(result.json, undefined);
  const { args } = await invocation();
  assert.ok(!args.includes('--json-schema'));
  assert.equal(args[args.indexOf('--model') + 1], 'opus');
});

test('claude: falls back to JSON in the answer text when there is no structured output', async () => {
  withFake('fenced');
  const result = await runAI({ ...base, prompt: 'p', jsonSchema: {} });
  assert.deepEqual(result.json, { ok: true });
});

test('claude: images are named in the prompt and only their folder is readable', async () => {
  withFake('ok');
  const pictures = path.join(temp, 'pictures');
  await mkdir(pictures);
  const image = path.join(pictures, 'thumb.png');
  await runAI({ ...base, prompt: 'Look', images: [image, path.join(pictures, 'b.png')] });
  const { args, stdin } = await invocation();
  assert.ok(stdin.includes(image));
  assert.equal(args[args.indexOf('--tools') + 1], 'Read');
  assert.equal(args[args.indexOf('--allowedTools') + 1], 'Read');
  assert.deepEqual(args.filter((_, i) => args[i - 1] === '--add-dir'), [pictures]);
});

test('claude: sign-in, budget and missing-tool failures become short user-safe errors', async () => {
  withFake('not-signed-in');
  await assert.rejects(runAI({ ...base, prompt: 'p' }), (e: AiError) => e.code === 'not-signed-in' && e.message === 'Claude is not signed in.');
  withFake('budget');
  await assert.rejects(runAI({ ...base, prompt: 'p' }), (e: AiError) => e.code === 'over-budget');
  process.env.PATH = emptyBin;
  await assert.rejects(runAI({ ...base, prompt: 'p' }), (e: AiError) => e.code === 'not-installed' && e.message === 'Claude is not installed on this Mac.');
});

test('cancelling stops the child process', async () => {
  withFake('hang');
  const controller = new AbortController();
  const pending = runAI({ ...base, prompt: 'p', signal: controller.signal });
  setTimeout(() => controller.abort(), 400);
  await assert.rejects(pending, (e: AiError) => e.code === 'cancelled');
});

test('abort before the call, or during its setup, never starts the child', async () => {
  withFake('hang');
  rmSync(log, { force: true });
  const early = new AbortController();
  early.abort();
  await assert.rejects(runAI({ ...base, prompt: 'p', signal: early.signal }), (e: AiError) => e.code === 'cancelled');

  // Aborted while runAI is still awaiting its setup (binary lookup, working directory, schema file).
  for (const provider of ['claude', 'codex'] as const) {
    const racing = new AbortController();
    const pending = runAI({ ...base, provider, prompt: 'p', jsonSchema: {}, signal: racing.signal });
    racing.abort();
    await assert.rejects(pending, (e: AiError) => e.code === 'cancelled');
  }
  assert.ok(!existsSync(log), 'no child was started');
});

test('codex: uses exec --json, passes the schema as a file and images with -i', async () => {
  withFake('structured');
  const result = await runAI({ ...base, provider: 'codex', prompt: 'Go', system: 'Sys', jsonSchema: { type: 'object' }, images: ['/tmp/a.png'] });
  assert.deepEqual(result.json, { ok: true });
  const call = await invocation();
  assert.deepEqual(call.args.slice(0, 4), ['exec', '--json', '--skip-git-repo-check', '--ephemeral']);
  assert.equal(call.args[call.args.indexOf('-i') + 1], '/tmp/a.png');
  assert.ok(call.args.includes('--output-schema'));
  assert.equal(call.args.at(-1), '-');
  assert.ok(!call.args.includes('-m'), 'no Claude alias is passed to Codex');
  assert.equal(call.stdin, 'Sys\n\nGo');
});

test('aiStatus reads versions and sign-in state from claude auth status and codex login status', async () => {
  withFake('ok');
  assert.deepEqual(await aiStatus({ extraDirs: [] }), {
    claude: { installed: true, version: '9.9.9', signedIn: true, account: 'dani@example.com' },
    codex: { installed: true, version: '8.8.8', signedIn: true, account: 'ChatGPT' },
  });
  withFake('signed-out');
  const out = await aiStatus({ extraDirs: [] });
  assert.equal(out.claude.signedIn, false);
  assert.equal(out.codex.signedIn, false);
  assert.equal(out.codex.account, undefined);
  process.env.PATH = emptyBin;
  assert.deepEqual((await aiStatus({ extraDirs: [] })).claude, { installed: false, version: null, signedIn: false });
});

test('parsers handle the real output shapes', () => {
  assert.deepEqual(parseClaudeAuth('{"loggedIn":true,"email":"a@b.c","orgId":"x"}'), { signedIn: true, account: 'a@b.c' });
  assert.deepEqual(parseClaudeAuth('{"loggedIn":false}'), { signedIn: false });
  assert.deepEqual(parseClaudeAuth('nonsense'), { signedIn: false });
  assert.deepEqual(parseCodexAuth(0, 'Logged in using ChatGPT\n'), { signedIn: true, account: 'ChatGPT' });
  assert.deepEqual(parseCodexAuth(0, 'Logged in using an API key - sk-***'), { signedIn: true });
  assert.deepEqual(parseCodexAuth(1, 'Not logged in'), { signedIn: false });
  assert.deepEqual(parseJSONLoose('text {"a":1} more'), { a: 1 });
  assert.equal(parseJSONLoose('no json'), undefined);
});
