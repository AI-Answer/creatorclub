import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DiskSpace } from '../../shared/club.js';

/** Under this much free space the recorder warns before a take: 10 GB. */
export const LOW_DISK_BYTES = 10 * 1024 ** 3;

type StatFs = (dir: string) => Promise<{ bavail: number | bigint; bsize: number | bigint }>;

/**
 * Free space on the disk that holds `dir`. A folder that does not exist yet is measured at its nearest existing parent,
 * so a fresh install still gets an answer.
 */
export async function diskSpace(dir: string, statfs: StatFs = (target) => fs.statfs(target)): Promise<DiskSpace> {
  let target = path.resolve(dir);
  for (;;) {
    try {
      const stats = await statfs(target);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      return { freeBytes, low: freeBytes < LOW_DISK_BYTES };
    } catch (error) {
      const parent = path.dirname(target);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === target) throw error;
      target = parent;
    }
  }
}

/** SceneForge's data folder, where takes are written. Read lazily so SCENEFORGE_DATA_DIR is honoured at call time. */
export async function recordingsDiskSpace(): Promise<DiskSpace> {
  const { DATA_DIR } = await import('../storage.js');
  return diskSpace(DATA_DIR);
}
