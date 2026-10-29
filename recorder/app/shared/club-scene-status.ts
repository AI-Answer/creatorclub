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

/** How many scenes have a kept take. */
export const recordedCount = (scenes: readonly SceneProgress[]) => scenes.filter((scene) => scene.takes.some((take) => take.kept)).length;
