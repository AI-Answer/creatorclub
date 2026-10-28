import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startJob, getJob, cancelJob, watchJob, type JobEvent } from './jobs.js';
import { ClubError } from './errors.js';

const collect = (id: string, after = 0) => {
  const events: JobEvent[] = [];
  watchJob(getJob(id)!, after, (e) => events.push(e));
  return events;
};
const tick = () => new Promise((r) => setTimeout(r, 20));

test('a job streams progress, then its result, and late watchers replay everything', async () => {
  const job = startJob('demo', async ({ emit }) => {
    emit({ line: 'one' });
    await tick();
    emit({ line: 'two' });
    return { answer: 42 };
  });
  assert.equal(job.status, 'running');
  const live = collect(job.id);
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(live.map((e) => e.type), ['progress', 'progress', 'done']);
  assert.deepEqual(live.at(-1)?.data, { answer: 42 });
  assert.deepEqual(collect(job.id).map((e) => e.id), [1, 2, 3]);
  assert.deepEqual(collect(job.id, 2).map((e) => e.id), [3]);
  assert.equal(getJob(job.id)?.status, 'done');
});

test('failures show one safe sentence, never the raw error', async () => {
  const raw = startJob('boom', async () => {
    throw new Error('ECONNRESET at 10.0.0.1');
  });
  const safe = startJob('boom', async () => {
    throw new ClubError('Claude is not signed in.');
  });
  await tick();
  assert.equal(getJob(raw.id)?.error, 'That did not work.');
  assert.equal(getJob(safe.id)?.error, 'Claude is not signed in.');
  assert.equal(collect(safe.id).at(-1)?.type, 'failed');
});

test('cancelling aborts the signal and ends the stream', async () => {
  let aborted = false;
  const job = startJob('slow', ({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('stopped')); })));
  assert.equal(cancelJob(job.id)?.status, 'cancelled');
  await tick();
  assert.ok(aborted);
  assert.equal(collect(job.id).at(-1)?.type, 'cancelled');
  assert.equal(cancelJob('missing'), undefined);
});
