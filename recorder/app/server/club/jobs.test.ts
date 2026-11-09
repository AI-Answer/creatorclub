import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startJob, startJobOnce, runningOnce, cancelAllJobs, getJob, cancelJob, watchJob, runningJobCount, type JobEvent } from './jobs.js';
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
  await tick();
  assert.equal(cancelJob(job.id)?.status, 'running');
  await tick();
  assert.ok(aborted);
  assert.equal(collect(job.id).at(-1)?.type, 'cancelled');
  assert.equal(cancelJob('missing'), undefined);
});

test('cancel then retry joins the settling worker, and a late successful commit remains done', async () => {
  let release!: (value: { replaced: string }) => void;
  let calls = 0;
  const work = async () => { calls++; return new Promise<{ replaced: string }>(resolve => { release = resolve; }); };
  const first = startJobOnce('cancel-retry', 'plan', work);
  await tick();
  assert.equal(cancelJob(first.id)?.status, 'running');
  assert.equal(startJobOnce('cancel-retry', 'plan', work).id, first.id);
  assert.equal(calls, 1);
  release({ replaced: 'undo-token' });
  await tick();
  assert.equal(getJob(first.id)?.status, 'done');
  assert.deepEqual(getJob(first.id)?.result, { replaced: 'undo-token' });
  assert.equal(runningOnce('cancel-retry'), undefined);
  const second = startJobOnce('cancel-retry', 'plan', async () => 2);
  assert.notEqual(second.id, first.id);
  await tick();
});

test('truncated replay sends a reset snapshot before the retained events', async () => {
  const job = startJob('many', async ({ emit }) => { for (let i = 0; i < 550; i++) emit({ i }); return 42; });
  await tick();
  const replay = collect(job.id, 1);
  assert.equal(replay[0].type, 'reset');
  assert.equal((replay[0].data as { status: string }).status, 'done');
  assert.equal(replay.at(-1)?.type, 'done');
  assert.equal(replay.length, 501);
});

test('shutdown awaits workers and has a bounded timeout for one that ignores abort', async () => {
  let release!: () => void;
  const job = startJob('stuck', () => new Promise<void>(resolve => { release = resolve; }));
  await tick();
  assert.equal(await cancelAllJobs(5), 0);
  assert.equal(getJob(job.id)?.status, 'running');
  release();
  await tick();
  assert.equal(getJob(job.id)?.status, 'done');
});

test('a stuck cancelled worker releases its key after thirty seconds and ignores late results',async t=>{let release!:(value:string)=>void;const before=runningJobCount(),job=startJobOnce('cancel-timeout','stuck',()=>new Promise<string>(resolve=>release=resolve));await Promise.resolve();assert.equal(runningJobCount(),before+1);t.mock.timers.enable({apis:['setTimeout']});try{cancelJob(job.id);t.mock.timers.tick(29999);assert.equal(runningOnce('cancel-timeout')?.id,job.id);t.mock.timers.tick(1);assert.equal(getJob(job.id)?.status,'cancelled');assert.equal(runningOnce('cancel-timeout'),undefined);assert.equal(runningJobCount(),before+1);const previous=getJob(job.id)!;t.mock.timers.tick(60*60*1000);assert.equal(getJob(job.id),undefined);assert.equal(runningJobCount(),before+1);const next=startJobOnce('cancel-timeout','retry',async()=>42);assert.notEqual(next.id,job.id);release('late');await Promise.all([previous.settled,getJob(next.id)!.settled]);assert.equal(previous.status,'cancelled');assert.equal(previous.result,undefined);assert.equal(getJob(next.id)?.result,42);assert.equal(runningJobCount(),before);}finally{t.mock.timers.reset();}});
