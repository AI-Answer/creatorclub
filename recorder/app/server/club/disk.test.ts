import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-disk-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'club');
// The data folder is not created: the route must still answer, measured at the nearest existing parent.
process.env.SCENEFORGE_DATA_DIR = path.join(temp, 'sceneforge', 'studio');
const { LOW_DISK_BYTES, diskSpace } = await import('./disk.js');
const { clubRouter } = await import('./index.js');

const app = express();
app.use('/api/club', clubRouter());
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async () => {
  server.close();
  await rm(temp, { recursive: true, force: true });
});

const GB = 1024 ** 3;

test('low disk means under 10 GB free', async () => {
  assert.equal(LOW_DISK_BYTES, 10 * GB);
  const blocks = (free: number) => async () => ({ bavail: free / 4096, bsize: 4096 });
  assert.deepEqual(await diskSpace('/any', blocks(9 * GB)), { freeBytes: 9 * GB, low: true });
  assert.deepEqual(await diskSpace('/any', blocks(10 * GB)), { freeBytes: 10 * GB, low: false });
  assert.deepEqual(await diskSpace('/any', blocks(250 * GB)), { freeBytes: 250 * GB, low: false });
});

test('bigint block counts are read as numbers', async () => {
  const space = await diskSpace('/any', async () => ({ bavail: 1024n, bsize: 4096n }));
  assert.deepEqual(space, { freeBytes: 4 * 1024 * 1024, low: true });
});

test('a folder that does not exist yet is measured at its nearest existing parent', async () => {
  const asked: string[] = [];
  const statfs = async (dir: string) => {
    asked.push(dir);
    if (dir !== '/Users') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return { bavail: 50 * GB, bsize: 1 };
  };
  assert.deepEqual(await diskSpace('/Users/someone/Library/SceneForge', statfs), { freeBytes: 50 * GB, low: false });
  assert.deepEqual(asked, ['/Users/someone/Library/SceneForge', '/Users/someone/Library', '/Users/someone', '/Users']);
});

test('other failures are not hidden', async () => {
  const statfs = async () => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' });
  };
  await assert.rejects(diskSpace('/x', statfs), /denied/);
});

test('GET /disk reports free space where takes are saved, with no channel needed', async () => {
  const res = await fetch(`${base}/disk`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { freeBytes: number; low: boolean };
  assert.equal(typeof body.freeBytes, 'number');
  assert.ok(body.freeBytes > 0);
  assert.equal(body.low, body.freeBytes < 10 * GB);
});
