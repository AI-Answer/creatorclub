import type { Outline, RecorderScene, ScenesByVideo, SceneTakeInfo, Video, VideoScene } from '../../shared/club.js';
import { sceneStatus } from '../../shared/club-scene-status.js';
import type { Project, RecordedTake } from '../../shared/types.js';
import { pool } from './channel.js';
import { readOutline } from './planning.js';
import { migrateMapping, readProjectIfThere, recorderScenes } from './recorder.js';
import * as store from './store.js';

/*
 * The scenes of a video as the screens show them: the outline's scenes, each with the takes the video's recording project
 * holds for it. The recording project is only read here, never written.
 */

/** How many videos are read at once for the batch. */
const PARALLEL = 6;

const round = (seconds: number) => Math.round(seconds * 10) / 10;

/** The length of a take: the end of its last source. */
const takeSeconds = (take: RecordedTake) => round(Math.max(0, ...take.media.map((media, index) => media.duration + (take.offsets[index] ?? 0))));

/**
 * The outline's scenes with their takes. A scene is linked to its recorder scene by the outline scene's id (through the
 * mapping Continue to recording saved), never by place. A take is kept while its clips are on the timeline; takes are
 * numbered in the order they were recorded. With no recording project, or a scene it does not hold yet, the scene has no takes.
 *
 * `cutSeconds` is not set: the recording project does not record how much was taken out of each scene, and a figure
 * worked out from clip lengths would count a trim as a removed pause.
 */
export function mergeScenes(outline: Outline | null, project: Project | undefined, mapping: RecorderScene[] | undefined): VideoScene[] {
  if (!outline) return [];
  const bySceneId = new Map<string, RecordedTake[]>();
  for (const take of project?.recordedTakes ?? []) bySceneId.set(take.sceneId, [...(bySceneId.get(take.sceneId) ?? []), take]);
  const live = new Set((project?.clips ?? []).flatMap((clip) => (clip.recordingTakeId ? [clip.recordingTakeId] : [])));
  const recorderIds = new Map((mapping ?? []).map((entry) => [entry.outlineId, entry.sceneId]));
  return outline.scenes.map((scene, index) => {
    const id = scene.id ?? `s_${index + 1}`;
    const recorded = [...(bySceneId.get(recorderIds.get(id) ?? '') ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const takes: SceneTakeInfo[] = recorded.map((take) => ({ id: take.id, seconds: takeSeconds(take), kept: live.has(take.id), retained: take.retained === true }));
    return { id, title: scene.title, seconds: scene.seconds, takes, status: sceneStatus({ takes: takes.map((take, n) => ({ n: n + 1, kept: take.kept })) }).label };
  });
}

async function scenesOf(slug: string, video: Video): Promise<VideoScene[]> {
  const outline = await readOutline(slug, video.id);
  if (!outline?.scenes.length && !video.quickRecording) return [];
  const project = await readProjectIfThere(video.recorderProjectId);
  const planned = mergeScenes(outline, project, migrateMapping(video.recorderScenes, outline ? recorderScenes(outline) : []));
  // Keep the unplanned take visible even if the creator adds an outline later.
  if (video.quickRecording && project) {
    const outlineIds = new Set(outline?.scenes.map(scene => scene.id) ?? []);
    const plannedRecorderIds = new Set(video.recorderScenes?.filter(entry => outlineIds.has(entry.outlineId)).map(entry => entry.sceneId) ?? []);
    const extra = project.scenes.filter(scene => !plannedRecorderIds.has(scene.id));
    const scenes = extra.map(scene => ({ id: scene.id, title: scene.name, seconds: scene.duration, talkingPoints: [], show: '' }));
    const mapping = extra.map(scene => ({ outlineId: scene.id, sceneId: scene.id, text: '', changedAt: '' }));
    return [...mergeScenes({ scenes }, project, mapping), ...planned];
  }
  return planned;
}

/** `GET /videos/:id/scenes`. */
export async function videoScenes(slug: string, id: string): Promise<VideoScene[]> {
  return scenesOf(slug, await store.readVideo(slug, id));
}

/**
 * `GET /videos/scenes`: the scenes of every video that is not published, by video id. A video whose scenes cannot be read
 * is left out, so the screen can tell "could not read" from "no scenes".
 */
export async function videosScenes(slug: string): Promise<ScenesByVideo> {
  const videos = (await store.listVideos(slug)).filter((video) => video.stage !== 'published');
  const found = await pool(videos, PARALLEL, async (video) => {
    try {
      return [video.id, await scenesOf(slug, video)] as const;
    } catch (error) {
      console.error('[club] scenes of', video.id, (error as Error).message);
      return undefined;
    }
  });
  return Object.fromEntries(found.filter((entry) => !!entry));
}
