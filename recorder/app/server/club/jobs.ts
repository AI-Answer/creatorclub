import { randomBytes } from 'node:crypto';
import type { JobSnapshot, JobStatus } from '../../shared/club.js';
import { userMessage } from './errors.js';

export interface JobEvent {
  id: number;
  type: 'reset' | 'progress' | 'done' | 'failed' | 'cancelled';
  data: unknown;
}

export interface JobContext {
  /** Publishes a progress event to everyone watching the job. */
  emit: (data: unknown) => void;
  /** Aborted when the job is cancelled. */
  signal: AbortSignal;
}

interface Job {
  id: string;
  kind: string;
  status: JobStatus;
  createdAt: string;
  events: JobEvent[];
  result?: unknown;
  error?: string;
  nextEventId: number;
  listeners: Set<(event: JobEvent) => void>;
  abort: AbortController;
  cancelling: boolean;
  settled: Promise<void>;
  onceKey?: string;
  cancelTimer?: ReturnType<typeof setTimeout>;
}

const MAX_EVENTS = 500;
const KEEP_FINISHED_MS = 60 * 60 * 1000;
const jobs = new Map<string, Job>();
// Terminal client state can precede settlement of a worker that ignored cancellation.
const workers=new Set<Job>();

const isTerminal = (event: JobEvent) => event.type !== 'progress' && event.type !== 'reset';

function publish(job: Job, type: JobEvent['type'], data: unknown) {
  const event: JobEvent = { id: job.nextEventId++, type, data };
  job.events.push(event);
  if (job.events.length > MAX_EVENTS) job.events.splice(0, job.events.length - MAX_EVENTS);
  for (const listener of [...job.listeners]) listener(event);
}

function finish(job: Job, status: Exclude<JobStatus, 'running'>, type: JobEvent['type'], data: unknown) {
  if (job.status !== 'running') return;
  if(job.cancelTimer)clearTimeout(job.cancelTimer);
  job.status = status;
  if (job.onceKey && onceKeys.get(job.onceKey) === job.id) onceKeys.delete(job.onceKey);
  publish(job, type, data);
  job.listeners.clear();
  setTimeout(() => jobs.delete(job.id), KEEP_FINISHED_MS).unref();
}

export const snapshot = (job: Job): JobSnapshot => ({
  id: job.id,
  kind: job.kind,
  status: job.status,
  createdAt: job.createdAt,
  ...(job.status === 'done' ? { result: job.result } : {}),
  ...(job.error ? { error: job.error } : {}),
});

/**
 * Starts work in the background and returns at once. Progress and the outcome are kept in memory,
 * so a screen that was left can reconnect to `GET /api/club/jobs/:id/events` and replay them.
 */
export function startJob<T>(kind: string, work: (context: JobContext) => Promise<T>): JobSnapshot {
  const job: Job = {
    id: `j_${randomBytes(8).toString('hex')}`,
    kind,
    status: 'running',
    createdAt: new Date().toISOString(),
    events: [],
    nextEventId: 1,
    listeners: new Set(),
    abort: new AbortController(),
    cancelling: false,
    settled: Promise.resolve(),
  };
  jobs.set(job.id, job);workers.add(job);
  const context: JobContext = {
    emit: (data) => job.status === 'running' && publish(job, 'progress', data),
    signal: job.abort.signal,
  };
  // Defer invocation so the registry and dedupe key exist even for synchronous throws.
  job.settled = Promise.resolve().then(() => { context.signal.throwIfAborted(); return work(context); }).then(
    (result) => {
      if(job.status!=='running'){console.error(`[club] ignored late result for ${job.id}`);return;}
      job.result = result;
      finish(job, 'done', 'done', result ?? null);
    },
    (error) => {
      if(job.status!=='running'){console.error(`[club] ignored late failure for ${job.id}`);return;}
      if (job.cancelling) {
        finish(job, 'cancelled', 'cancelled', {});
        return;
      }
      console.error(`[club] job ${job.kind} failed:`, error instanceof Error ? error.message : error);
      job.error = userMessage(error);
      finish(job, 'failed', 'failed', { message: job.error });
    },
  ).finally(()=>workers.delete(job));
  return snapshot(job);
}

export const runningJobCount=()=>workers.size;

export const getJob = (id: string) => jobs.get(id);

const onceKeys = new Map<string, string>();

/** The job started with this key that is still running, if any. */
export function runningOnce(key: string): JobSnapshot | undefined {
  const running = onceKeys.get(key) ? jobs.get(onceKeys.get(key)!) : undefined;
  return running?.status === 'running' ? snapshot(running) : undefined;
}

/** `startJob`, but a second start with the same key while its job still runs gets that running job instead. */
export function startJobOnce<T>(key: string, kind: string, work: (context: JobContext) => Promise<T>): JobSnapshot {
  const running = runningOnce(key);
  if (running) return running;
  const started = startJob(kind, work);
  onceKeys.set(key, started.id);
  jobs.get(started.id)!.onceKey = key;
  return started;
}

export function cancelJob(id: string): JobSnapshot | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (job.status === 'running'&&!job.cancelling) {
    job.cancelTimer=setTimeout(()=>finish(job,'cancelled','cancelled',{}),30000);job.cancelTimer.unref();
    job.cancelling = true;
    job.abort.abort();
  }
  return snapshot(job);
}

/**
 * Replays stored events after `afterId`, then streams new ones. Returns an unsubscribe function.
 * `onEvent` also receives the terminal event, after which no more arrive.
 */
export function watchJob(job: Job, afterId: number, onEvent: (event: JobEvent) => void): () => void {
  if (job.events.length && afterId < job.events[0].id - 1) {
    onEvent({ id: job.events[0].id - 1, type: 'reset', data: snapshot(job) });
  }
  for (const event of job.events) if (event.id > afterId) onEvent(event);
  if (job.status !== 'running') return () => {};
  job.listeners.add(onEvent);
  return () => job.listeners.delete(onEvent);
}

export { isTerminal };
export type { Job };

/** Stops every running job (the server is quitting), so no AI command line tool started by one outlives the app. */
async function awaitStopped(pending: Job[], timeoutMs: number): Promise<number> {
  for (const job of pending) cancelJob(job.id);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(pending.map(job => job.settled)),
      new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
  return pending.filter(job => !workers.has(job)).length;
}

export function cancelAllJobs(timeoutMs = 5000): Promise<number> {
  return awaitStopped([...workers], timeoutMs);
}

/** Abort before deleting a video and wait briefly for its worker to settle. */
export function cancelVideoJobs(slug: string, id: string, timeoutMs = 5000): Promise<number> {
  const matches = (key: string) => key.split(':').some((part, index, parts) => part === slug && parts[index + 1] === id) || key.includes(`${slug}/${id}/`) || key.endsWith(`${slug}/${id}`);
  return awaitStopped([...workers].filter(job => job.onceKey && matches(job.onceKey)), timeoutMs);
}

/** "about 2 min left", from the time the parts read so far took (a refresh reads sources one by one). Nothing before the first is read. */
export function timeLeft(elapsedMs: number, done: number, total: number): string | undefined {
  if (done <= 0 || done >= total) return undefined;
  const seconds = Math.round(((elapsedMs / done) * (total - done)) / 1000);
  return seconds < 60 ? 'under a minute left' : `about ${Math.round(seconds / 60)} min left`;
}
