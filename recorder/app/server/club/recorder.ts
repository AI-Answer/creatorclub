import type { Outline, RecorderScene, Video } from '../../shared/club.js';
import { createProject, makeId, projectDuration, type Project } from '../../shared/types.js';
import { ClubError } from './errors.js';
import { matchSection, readOutline, saveOutline, scriptSections } from './planning.js';
import * as store from './store.js';

/** Link a separately rendered project to a new video, keeping the source video and recording intact. */
export async function videoFromProject(slug: string, projectId: string): Promise<{video: Video; created: boolean}> {
  const { readProject } = await import('../storage.js');
  let project: Project;
  try { project = await readProject(projectId); }
  catch { throw new ClubError('That recording was not found.', 404); }
  return store.createVideoUnless(slug, {
    title: project.name.slice(0, 300), stage: 'editing', recorderProjectId: project.id,
  }, videos => videos.find(video => video.recorderProjectId === project.id));
}

/*
 * The hand-off to SceneForge: Continue to recording turns the outline into a recording project with one scene per outline
 * scene and the talking points as the scene's script. Going back and continuing again updates the scenes; it never removes
 * a scene or a take.
 */

export interface SceneContent {
  /** The outline scene's id. */
  outlineId: string;
  name: string;
  script: string;
  notes: string;
}

/** What each recorder scene gets: the scene title, its talking points one per line (or its part of the script, when it has one), and what to show as notes. */
export function recorderScenes(outline: Outline): SceneContent[] {
  const sections = outline.fullScript ? scriptSections(outline.fullScript) : [];
  return outline.scenes.map((scene, index) => ({
    outlineId: scene.id ?? `s_${index + 1}`,
    name: scene.title.trim() || `Scene ${index + 1}`,
    script: scene.script?.trim() || matchSection(sections, outline.scenes, index)?.body || scene.talkingPoints.map((point) => point.trim()).filter(Boolean).join('\n'),
    notes: scene.show.trim(),
  }));
}

const contentKey = (scene: SceneContent) => JSON.stringify([scene.name, scene.script, scene.notes]);

/** Scene names stay unique in the recorder: a later scene with a name already used gets " (2)", " (3)" and so on. */
function uniqueNames(scenes: Project['scenes']) {
  const seen = new Set<string>();
  for (const scene of scenes) {
    const base = scene.name.replace(/ \(\d+\)$/, '');
    let name = scene.name;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    scene.name = name;
    seen.add(name.toLowerCase());
  }
}

/** A creator's video starts as the camera filling the frame: no border, no rounded corners, no background pattern. */
export function newClubProject(title: string): Project {
  const project = createProject(title);
  const { backgroundPattern: _pattern, ...canvas } = project.canvas;
  return { ...project, scenes: [], canvas: { ...canvas, background: '#000000', padding: 0, radius: 0 } };
}

/**
 * Builds a new recording project, or brings an existing one up to date with the outline, matching scenes by the outline
 * scene's id, never by position. The recorder's scenes are timeline blocks in order, so existing scenes are never moved:
 * - a scene whose content changed gets the new name, script and notes in place and a new `changedAt`; its takes stay with it;
 * - a scene new to the outline is added after the last scene, at the end of the timeline, in outline order;
 * - scenes the outline no longer has stay where they are, untouched, and stay mapped so their takes are still flagged.
 */
export function syncProject(title: string, project: Project | undefined, mapping: RecorderScene[] | undefined, wanted: SceneContent[], now = new Date().toISOString()): { project: Project; mapping: RecorderScene[] } {
  const next = project ? structuredClone(project) : newClubProject(title);
  const known = new Map((mapping ?? []).map((entry) => [entry.outlineId, entry]));
  const result: RecorderScene[] = [];
  const matched = new Set<string>();
  for (const content of wanted) {
    const { outlineId, ...fields } = content;
    const key = contentKey(content);
    const entry = known.get(outlineId);
    const scene = entry && !matched.has(entry.sceneId) ? next.scenes.find((candidate) => candidate.id === entry.sceneId) : undefined;
    if (scene && entry) {
      matched.add(scene.id);
      if (entry.text !== key) Object.assign(scene, fields);
      result.push(entry.text === key ? entry : { outlineId, sceneId: scene.id, text: key, changedAt: now });
      continue;
    }
    const added = { id: makeId(), ...fields, start: projectDuration(next), duration: 0 };
    next.scenes.push(added);
    matched.add(added.id);
    result.push({ outlineId, sceneId: added.id, text: key, changedAt: now });
  }
  const outlineIds = new Set(wanted.map((content) => content.outlineId));
  for (const entry of mapping ?? []) if (!outlineIds.has(entry.outlineId) && !matched.has(entry.sceneId) && next.scenes.some((scene) => scene.id === entry.sceneId)) result.push(entry);
  uniqueNames(next.scenes);
  return { project: next, mapping: result };
}

/** Mapping entries saved before outline scenes had ids were in outline order: they take the id of the scene in their place. */
export const migrateMapping = (entries: RecorderScene[] | undefined, wanted: SceneContent[]) =>
  entries?.map((entry, index) => (entry.outlineId ? entry : { ...entry, outlineId: wanted[index]?.outlineId ?? `old_${index}` }));

/**
 * The first scene (1-based, in the recorder's order) whose takes were recorded before its outline content changed: the
 * outline now says something else than what the scene was given, the scene was given new content after its last take, or
 * the outline no longer has the scene at all.
 */
export function changedSceneNumber(project: Project, mapping: RecorderScene[] | undefined, wanted: SceneContent[]): number | undefined {
  if (!mapping?.length) return undefined;
  const latest = new Map<string, string>();
  for (const take of project.recordedTakes ?? []) {
    const before = latest.get(take.sceneId);
    if (!before || take.createdAt > before) latest.set(take.sceneId, take.createdAt);
  }
  const byScene = new Map(mapping.map((entry) => [entry.sceneId, entry]));
  const byOutline = new Map(wanted.map((content) => [content.outlineId, content]));
  for (const [index, scene] of project.scenes.entries()) {
    const entry = byScene.get(scene.id);
    const lastTake = latest.get(scene.id);
    if (!entry || !lastTake) continue;
    const now = byOutline.get(entry.outlineId);
    if (!now || contentKey(now) !== entry.text || lastTake < entry.changedAt) return index + 1;
  }
  return undefined;
}

// ---------------------------------------------------------------- SceneForge's storage

type Storage = typeof import('../storage.js');
let storage: Promise<Storage> | undefined;
/** SceneForge's own project storage, loaded on first use so SCENEFORGE_DATA_DIR is read when it is needed. */
export const sceneforge = () =>
  (storage ??= import('../storage.js')
    .then(async (module) => (await module.initStorage(), module))
    .catch((error) => {
      storage = undefined;
      throw error;
    }));

export async function readProjectIfThere(id: string | undefined): Promise<Project | undefined> {
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
    if (!project) return undefined;
    const wanted = recorderScenes(outline);
    return changedSceneNumber(project, migrateMapping(video.recorderScenes, wanted), wanted);
  } catch {
    return undefined;
  }
}


/**
 * Continue to recording: creates the video's recording project (or updates it), saves its id and the scene mapping,
 * marks the outline step done and moves the video to Recording when it was not further along. One at a time per video.
 */
export function continueToRecording(slug: string, id: string, quick = false): Promise<Video> {
  return store.withLock(`recorder:${store.videoDir(slug, id)}`, async () => {
    const video = await store.readVideo(slug, id);
    const outline = await readOutline(slug, id);
    if (!quick && !outline?.scenes.length) throw new ClubError('Create the outline first.');
    const { saveProject } = await sceneforge();
    const existing = await readProjectIfThere(video.recorderProjectId);
    // Quick setup is idempotent: reopening it must never replace scenes, takes or edits.
    if (quick && existing?.scenes.length && !outline?.scenes.length) return video;
    const unplanned = !outline?.scenes.length;
    const wanted: SceneContent[] = unplanned
      ? [{ outlineId: 'quick-recording', name: 'Quick recording', script: '', notes: '' }]
      : recorderScenes(outline!);
    const saved = existing ? migrateMapping(video.recorderScenes, wanted) : undefined;
    const { project, mapping } = syncProject(video.title, existing, saved, wanted);
    // Reserve the link first: a crash after saveProject can reuse this exact project id.
    if (video.recorderProjectId) project.id = video.recorderProjectId;
    else await store.updateVideo(slug, id, { recorderProjectId: project.id });
    const written = await saveProject(project);
    await store.updateVideo(slug, id, { recorderProjectId: written.id, recorderScenes: mapping, ...(unplanned ? { quickRecording: true } : { planning: { ...video.planning, outline: true }, quickRecording: null }) });
    const stages = ['ideas', 'planning'];
    return store.moveVideo(slug, id, 'recording', { expectedStages: stages as Video['stage'][] });
  });
}
