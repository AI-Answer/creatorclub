import { randomBytes } from 'node:crypto';
import type { JobSnapshot, JobStatus } from '../../shared/club.js';
import { userMessage } from './errors.js';

export interface JobEvent {
  id: number;
  type: 'progress' | 'done' | 'failed' | 'cancelled';
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
}

const MAX_EVENTS = 500;
const KEEP_FINISHED_MS = 60 * 60 * 1000;
const jobs = new Map<string, Job>();

const isTerminal = (event: JobEvent) => event.type !== 'progress';

function publish(job: Job, type: JobEvent['type'], data: unknown) {
  const event: JobEvent = { id: job.nextEventId++, type, data };
  job.events.push(event);
  if (job.events.length > MAX_EVENTS) job.events.splice(0, job.events.length - MAX_EVENTS);
  for (const listener of [...job.listeners]) listener(event);
}

function finish(job: Job, status: Exclude<JobStatus, 'running'>, type: JobEvent['type'], data: unknown) {
  if (job.status !== 'running') return;
  job.status = status;
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
  };
  jobs.set(job.id, job);
  const context: JobContext = {
    emit: (data) => job.status === 'running' && publish(job, 'progress', data),
    signal: job.abort.signal,
  };
  work(context).then(
    (result) => {
      job.result = result;
      finish(job, 'done', 'done', result ?? null);
    },
    (error) => {
      if (job.abort.signal.aborted) return;
      console.error(`[club] job ${job.kind} failed:`, error instanceof Error ? error.message : error);
      job.error = userMessage(error);
      finish(job, 'failed', 'failed', { message: job.error });
    },
  );
  return snapshot(job);
}

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
  return started;
}

export function cancelJob(id: string): JobSnapshot | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (job.status === 'running') {
    job.abort.abort();
    finish(job, 'cancelled', 'cancelled', {});
  }
  return snapshot(job);
}

/**
 * Replays stored events after `afterId`, then streams new ones. Returns an unsubscribe function.
 * `onEvent` also receives the terminal event, after which no more arrive.
 */
export function watchJob(job: Job, afterId: number, onEvent: (event: JobEvent) => void): () => void {
  for (const event of job.events) if (event.id > afterId) onEvent(event);
  if (job.status !== 'running') return () => {};
  job.listeners.add(onEvent);
  return () => job.listeners.delete(onEvent);
}

export { isTerminal };
export type { Job };

/** Stops every running job (the server is quitting), so no AI command line tool started by one outlives the app. */
export function cancelAllJobs(): number {
  let stopped = 0;
  for (const job of jobs.values()) {
    if (job.status !== 'running') continue;
    cancelJob(job.id);
    stopped++;
  }
  return stopped;
}
