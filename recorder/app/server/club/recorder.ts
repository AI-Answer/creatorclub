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
  /** The outline scene's id. */
  outlineId: string;
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
    outlineId: scene.id ?? `s_${index + 1}`,
    name: scene.title.trim() || `Scene ${index + 1}`,
    script: sectionFor(scene.title, index)?.body || scene.talkingPoints.map((point) => point.trim()).filter(Boolean).join('\n'),
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

/**
 * Builds a new recording project, or brings an existing one up to date with the outline, matching scenes by the outline
 * scene's id, never by position:
 * - a scene whose content changed gets the new name, script and notes and a new `changedAt`; its takes stay with it;
 * - a scene new to the outline is added;
 * - the recorder's scenes follow the outline's order, and scenes the outline no longer has stay, untouched, at the end
 *   (their mapping is kept so their takes are still flagged).
 */
export function syncProject(title: string, project: Project | undefined, mapping: RecorderScene[] | undefined, wanted: SceneContent[], now = new Date().toISOString()): { project: Project; mapping: RecorderScene[] } {
  const next = project ? structuredClone(project) : { ...createProject(title), scenes: [] };
  const known = new Map((mapping ?? []).map((entry) => [entry.outlineId, entry]));
  const result: RecorderScene[] = [];
  const ordered: Project['scenes'] = [];
  for (const content of wanted) {
    const { outlineId, ...fields } = content;
    const key = contentKey(content);
    const entry = known.get(outlineId);
    const scene = entry && next.scenes.find((candidate) => candidate.id === entry.sceneId);
    if (scene && !ordered.includes(scene)) {
      if (entry.text !== key) Object.assign(scene, fields);
      result.push(entry.text === key ? entry : { outlineId, sceneId: scene.id, text: key, changedAt: now });
      ordered.push(scene);
      continue;
    }
    const added = { id: makeId(), ...fields, start: projectDuration(next), duration: 0 };
    ordered.push(added);
    result.push({ outlineId, sceneId: added.id, text: key, changedAt: now });
  }
  const outlineIds = new Set(wanted.map((content) => content.outlineId));
  for (const entry of mapping ?? []) if (!outlineIds.has(entry.outlineId) && next.scenes.some((scene) => scene.id === entry.sceneId)) result.push(entry);
  next.scenes = [...ordered, ...next.scenes.filter((scene) => !ordered.includes(scene))];
  uniqueNames(next.scenes);
  return { project: next, mapping: result };
}

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
    const wanted = recorderScenes(outline);
    // Entries saved before scenes had ids were in outline order.
    const saved = existing ? video.recorderScenes?.map((entry, index) => (entry.outlineId ? entry : { ...entry, outlineId: wanted[index]?.outlineId ?? `old_${index}` })) : undefined;
    const { project, mapping } = syncProject(video.title, existing, saved, wanted);
    const written = await saveProject(project);
    await store.updateVideo(slug, id, { recorderProjectId: written.id, recorderScenes: mapping, planning: { ...video.planning, outline: true } });
    const stages = ['ideas', 'planning'];
    return stages.includes(video.stage) ? store.moveVideo(slug, id, 'recording') : store.readVideo(slug, id);
  })();
  running.set(key, work);
  void work.finally(() => running.delete(key)).catch(() => {});
  return work;
}
