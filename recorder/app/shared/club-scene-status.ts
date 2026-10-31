// What a scene says about its recording, shared by the server (which sends the words) and the UI (which draws the dots).

/** A take of a scene; the kept one is the one the edit uses. */
export type SceneTake = { n: number; kept?: boolean };
/** What the scene strip and the scene dots need to know: its takes, and the seconds cut from it once the pauses are removed. */
export type SceneProgress = { takes: readonly SceneTake[]; cut?: number };

export type SceneStatusKind = 'cut' | 'kept' | 'takes' | 'none';

/** The word for a scene: "Cut 3s" after pauses were removed, "Kept take 2", "2 takes" or "Not recorded". */
export function sceneStatus(scene: SceneProgress, pausesRemoved = false): { k: SceneStatusKind; label: string } {
  const kept = scene.takes.find((take) => take.kept);
  if (pausesRemoved && scene.cut && kept) return { k: 'cut', label: `Cut ${scene.cut}s` };
  if (kept) return { k: 'kept', label: `Kept take ${kept.n}` };
  if (scene.takes.length) return { k: 'takes', label: `${scene.takes.length} ${scene.takes.length > 1 ? 'takes' : 'take'}` };
  return { k: 'none', label: 'Not recorded' };
}

/**
 * Whether a scene is recorded: it has a kept take (one on the timeline). A take that was recorded but not kept does not count,
 * because the video does not use it. The one rule behind every "scenes recorded" count (Home, the cards, the table, the strip, Publish).
 */
export const isSceneRecorded = <T extends { kept?: boolean }>(scene: { takes: readonly T[] }) => scene.takes.some((take) => take.kept);

/** How many scenes have a kept take. */
export const recordedCount = <T extends { kept?: boolean }>(scenes: readonly { takes: readonly T[] }[]) => scenes.filter(isSceneRecorded).length;

/** "1 of 4 scenes recorded". */
export const recordedLine = <T extends { kept?: boolean }>(scenes: readonly { takes: readonly T[] }[]) =>
  `${recordedCount(scenes)} of ${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'} recorded`;
