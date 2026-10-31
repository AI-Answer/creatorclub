import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AiError, createStreamReader, runAI, type AIEvent } from './ai.js';

/*
 * Streaming from the CLIs: claude's `stream-json` with partial messages read in chunks of any size, tool events, failures, and a
 * stop in the middle of a stream.
 */

const line = (value: unknown) => JSON.stringify(value) + '\n';
const delta = (text: string) => line({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } });

test('claude: partial lines are joined, deltas stream as they come, whole messages carry the text, junk is skipped', () => {
  const events: AIEvent[] = [];
  const reader = createStreamReader('claude', (event) => events.push(event));
  const raw = [
    line({ type: 'system', subtype: 'init' }),
    line({ type: 'stream_event', event: { type: 'message_start', message: {} } }),
    delta('Hel'),
    delta('lo, '),
    'not json at all\n',
    delta('world'),
    line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello, world' }] } }),
    line({ type: 'result', subtype: 'success', is_error: false, result: 'Hello, world', total_cost_usd: 0.01 }),
  ].join('');
  // Fed in chunks of 7 characters, so every line arrives in pieces.
  for (let at = 0; at < raw.length; at += 7) reader.feed(raw.slice(at, at + 7));
  reader.end();
  assert.deepEqual(events, [{ type: 'started' }, { type: 'delta', text: 'Hel' }, { type: 'delta', text: 'lo, ' }, { type: 'delta', text: 'world' }, { type: 'text', text: 'Hello, world' }]);
  assert.equal(reader.state.text, 'Hello, world');
  assert.equal(reader.state.finished, true);
  assert.equal(reader.state.costUsd, 0.01);
});

test('claude: a tool use is reported once, as its block starts, not again in the whole message', () => {
  const events: AIEvent[] = [];
  const reader = createStreamReader('claude', (event) => events.push(event));
  reader.feed(line({ type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', name: 'Read', input: {} } } }));
  reader.feed(line({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"file' } } }));
  reader.feed(line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } }));
  // The last line has no newline: `end` reads it.
  reader.feed(JSON.stringify({ type: 'result', subtype: 'success', result: 'Done' }));
  reader.end();
  assert.deepEqual(events, [{ type: 'tool', name: 'Read' }]);
  assert.equal(reader.state.text, 'Done');

  const plain: AIEvent[] = [];
  const old = createStreamReader('claude', (event) => plain.push(event));
  old.feed(line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } }));
  assert.deepEqual(plain, [{ type: 'tool', name: 'Read' }], 'without partial messages the whole message reports it');
});

test('claude: an error result and a budget stop are recorded as failures', () => {
  const failed = createStreamReader('claude', () => {});
  failed.feed(line({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' }));
  assert.equal(failed.state.failure, 'Invalid API key · Please run /login');
  const budget = createStreamReader('claude', () => {});
  budget.feed(line({ type: 'result', subtype: 'error_max_budget_usd', is_error: true }));
  assert.equal(budget.state.budgetHit, true);
});

test('codex: the whole message arrives as text and a failed turn is a failure', () => {
  const events: AIEvent[] = [];
  const reader = createStreamReader('codex', (event) => events.push(event));
  reader.feed(line({ type: 'thread.started' }) + line({ type: 'item.completed', item: { type: 'agent_message', text: 'Whole answer' } }).slice(0, 20));
  reader.feed(line({ type: 'item.completed', item: { type: 'agent_message', text: 'Whole answer' } }).slice(20) + line({ type: 'turn.failed', error: { message: 'boom' } }));
  assert.deepEqual(events, [{ type: 'started' }, { type: 'text', text: 'Whole answer' }]);
  assert.equal(reader.state.failure, 'boom');
});

// ---------------------------------------------------------------- a real child process that streams, then is stopped

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-ai-stream-'));
const bin = path.join(temp, 'bin');
await mkdir(bin);
const log = path.join(temp, 'args.json');
await writeFile(
  path.join(bin, 'claude'),
  `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)));
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
process.stdin.resume();
process.stdin.on('end', () => {
  out({ type: 'system', subtype: 'init' });
  // Half a line first, then the rest: the reader must join them.
  const first = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Partial ' } } }) + '\\n';
  process.stdout.write(first.slice(0, 25));
  setTimeout(() => { process.stdout.write(first.slice(25)); out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'answer' } } }); }, 20);
  setInterval(() => {}, 1000);
});
`,
);
await chmod(path.join(bin, 'claude'), 0o755);
after(() => rm(temp, { recursive: true, force: true }));

test('a stop in the middle of a stream ends the child, after the text that had arrived', async () => {
  const deltas: string[] = [];
  const stop = new AbortController();
  // The stand-in comes first on PATH, so the real CLI is never started.
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
  const run = runAI({
    prompt: 'Hi',
    budgetUsd: 0.1,
    stream: true,
    extraDirs: [bin],
    onEvent: (event) => {
      if (event.type === 'delta') deltas.push(event.text);
      if (deltas.join('') === 'Partial answer') stop.abort();
    },
    signal: stop.signal,
  });
  try {
    await assert.rejects(run, (error: unknown) => error instanceof AiError && error.code === 'cancelled');
  } finally {
    process.env.PATH = originalPath;
  }
  assert.deepEqual(deltas, ['Partial ', 'answer']);
  const args = JSON.parse(await readFile(log, 'utf8')) as string[];
  assert.ok(args.includes('--include-partial-messages'), 'streaming asks for partial messages');
  assert.ok(args.includes('--output-format') && args[args.indexOf('--output-format') + 1] === 'stream-json');
});
