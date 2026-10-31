// Board rules shared by the server (which saves them) and the UI (which shows them before the save returns).
import type { Video, VideoStage } from './club.js';

const byOrder = (a: Video, b: Video) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

/**
 * The ids of one stage's videos in their new order after `id` is placed there, just before `beforeId` or last
 * when `beforeId` is missing or not in that stage. Hidden (Later, Skipped) videos keep their place in the order.
 */
export function arrangeColumn(videos: readonly Video[], id: string, stage: VideoStage, beforeId?: string | null): string[] {
  const column = videos.filter((v) => v.stage === stage && v.id !== id).sort(byOrder).map((v) => v.id);
  const at = beforeId ? column.indexOf(beforeId) : -1;
  column.splice(at < 0 ? column.length : at, 0, id);
  return column;
}
