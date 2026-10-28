import type { Outline, RecorderScene, Video } from '../../shared/club.js';
import { createProject, makeId, projectDuration, type Project } from '../../shared/types.js';
import { ClubError } from './errors.js';
import { readOutline, scriptSections } from './planning.js';
import * as store from './store.js';

/*
 * The hand-off to SceneForge: Continue to recording turns the outline into a recording project with one scene per outline
 * scene and the talking points as the scene's script. Going back and continuing again updates the scenes; it never removes
 * a scene or a take.
 */

export interface SceneContent {
  name: string;
  script: string;
  notes: string;
}

/** What each recorder scene gets: the scene title, its talking points one per line (or its part of the full script, when one was written), and what to show as notes. */
export function recorderScenes(outline: Outline): SceneContent[] {
  const sections = outline.fullScript ? scriptSections(outline.fullScript) : [];
  const key = (title: string) => title.trim().toLowerCase();
  // A scene's part of the script is the section under its own title, else the section in its place when the counts match.
  const sectionFor = (title: string, index: number) =>
    sections.find((section) => key(section.heading) === key(title)) ?? (sections.length === outline.scenes.length ? sections[index] : undefined);
  return outline.scenes.map((scene, index) => ({
    name: scene.title.trim() || `Scene ${index + 1}`,
    script: sectionFor(scene.title, index)?.body || scene.talkingPoints.map((point) => point.trim()).filter(Boolean).join('\n'),
    notes: scene.show.trim(),
  }));
}

const contentKey = (scene: SceneContent) => JSON.stringify([scene.name, scene.script, scene.notes]);

/**
 * Builds a new recording project, or brings an existing one up to date with the outline. A scene whose outline content
 * changed gets the new name, script and notes and a new `changedAt`; outline scenes with no recorder scene yet are added at
 * the end. Recorder scenes the outline no longer has are left alone.
 */
export function syncProject(title: string, project: Project | undefined, mapping: RecorderScene[] | undefined, wanted: SceneContent[], now = new Date().toISOString()): { project: Project; mapping: RecorderScene[] } {
  const next = project ? structuredClone(project) : { ...createProject(title), scenes: [] };
  const result: RecorderScene[] = [];
  for (const [index, content] of wanted.entries()) {
    const key = contentKey(content);
    const known = mapping?.[index];
    const scene = known && next.scenes.find((candidate) => candidate.id === known.sceneId);
    if (scene) {
      if (known.text === key) {
        result.push(known);
        continue;
      }
      Object.assign(scene, content);
      result.push({ sceneId: scene.id, text: key, changedAt: now });
      continue;
    }
    const added = { id: makeId(), ...content, start: projectDuration(next), duration: 0 };
    next.scenes.push(added);
    result.push({ sceneId: added.id, text: key, changedAt: now });
  }
  return { project: next, mapping: result };
}

/**
 * The first scene (1-based, in outline order) whose takes were recorded before its outline content changed: either the
 * outline now says something else than what the scene was given, or the scene was given new content after its last take.
 */
export function changedSceneNumber(project: Project, mapping: RecorderScene[] | undefined, wanted: SceneContent[]): number | undefined {
  if (!mapping?.length) return undefined;
  const latest = new Map<string, string>();
  for (const take of project.recordedTakes ?? []) {
    const before = latest.get(take.sceneId);
    if (!before || take.createdAt > before) latest.set(take.sceneId, take.createdAt);
  }
  for (const [index, known] of mapping.entries()) {
    const lastTake = latest.get(known.sceneId);
    if (!lastTake || !project.scenes.some((scene) => scene.id === known.sceneId)) continue;
    const now = wanted[index];
    if (!now || contentKey(now) !== known.text || lastTake < known.changedAt) return index + 1;
  }
  return undefined;
}

// ---------------------------------------------------------------- SceneForge's storage

type Storage = typeof import('../storage.js');
let storage: Promise<Storage> | undefined;
/** SceneForge's own project storage, loaded on first use so SCENEFORGE_DATA_DIR is read when it is needed. */
const sceneforge = () =>
  (storage ??= import('../storage.js')
    .then(async (module) => (await module.initStorage(), module))
    .catch((error) => {
      storage = undefined;
      throw error;
    }));

async function readProjectIfThere(id: string | undefined): Promise<Project | undefined> {
  if (!id) return undefined;
  const { readProject } = await sceneforge();
  return readProject(id).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' || error.message === 'Invalid identifier') return undefined;
    throw error;
  });
}

/** For the Plan step: the first scene recorded before the outline changed, when there is one. Never throws. */
export async function outlineChangedScene(video: Video, outline: Outline | null): Promise<number | undefined> {
  if (!outline || !video.recorderProjectId) return undefined;
  try {
    const project = await readProjectIfThere(video.recorderProjectId);
    return project ? changedSceneNumber(project, video.recorderScenes, recorderScenes(outline)) : undefined;
  } catch {
    return undefined;
  }
}

const running = new Map<string, Promise<Video>>();

/**
 * Continue to recording: creates the video's recording project (or updates it), saves its id and the scene mapping,
 * marks the outline step done and moves the video to Recording when it was not further along. One at a time per video.
 */
export function continueToRecording(slug: string, id: string): Promise<Video> {
  const key = `${slug}/${id}`;
  const earlier = running.get(key);
  if (earlier) return earlier;
  const work = (async () => {
    const video = await store.readVideo(slug, id);
    const outline = await readOutline(slug, id);
    if (!outline) throw new ClubError('Create the outline first.');
    const { saveProject } = await sceneforge();
    const existing = await readProjectIfThere(video.recorderProjectId);
    const { project, mapping } = syncProject(video.title, existing, existing ? video.recorderScenes : undefined, recorderScenes(outline));
    const saved = await saveProject(project);
    await store.updateVideo(slug, id, { recorderProjectId: saved.id, recorderScenes: mapping, planning: { ...video.planning, outline: true } });
    const stages = ['ideas', 'planning'];
    return stages.includes(video.stage) ? store.moveVideo(slug, id, 'recording') : store.readVideo(slug, id);
  })();
  running.set(key, work);
  void work.finally(() => running.delete(key)).catch(() => {});
  return work;
}
