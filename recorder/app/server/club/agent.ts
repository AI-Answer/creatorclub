import { z } from 'zod';
import { CLEAN_LOOK } from '../../shared/look.js';
import { TAB_ACTIONS, isEditAction, type CompanionAction, type CompanionActionType, type CompanionTab } from '../../shared/companion.js';
import type { Project } from '../../shared/types.js';
import { childEnv, findBinary, runQuick } from './ai.js';
import { boardText } from './board-chat.js';
import { boardTiles } from './board-docs.js';
import { readCanvas } from './board-canvas.js';
import { applyAction, undoVersion, validateActions, versionExists } from './companion-actions.js';
import { editOptions, editProject } from './companion-edit.js';
import { ClubError } from './errors.js';
import { readOutline, readPackage } from './planning.js';
import { videoScenes } from './scenes.js';
import * as store from './store.js';

/*
 * What an outside agent (Claude Code, Codex, any MCP client) reads and changes in a channel: a video with its plan and takes, a Board as
 * text and cards, and the same actions the in-app companion offers as cards. Actions go through the companion's own checks, locks and
 * versions, so an agent's change can be undone like a card's, and is refused where a card would be.
 */

/** Sent by the MCP server on every request, so a change it makes shows on an open Board. */
export const AGENT_HEADER = 'X-Creator-Compiler-Agent';

/** How much of a Board's text an agent gets in one read. */
const BOARD_CHARS = 40_000;

/** A video, its plan (package, scenes with their scripts), its takes and the recording project the timeline tools edit. */
export async function agentVideo(slug: string, id: string) {
  const video = await store.readVideo(slug, id);
  const [pkg, outline, scenes, project] = await Promise.all([
    readPackage(slug, id),
    readOutline(slug, id),
    videoScenes(slug, id).catch(() => []),
    editProject(slug, id).then(({ project, revision }) => ({ project_id: project.id, revision, look: project.look ?? CLEAN_LOOK }), () => null),
  ]);
  return { video, package: pkg, outline, scenes, recording: project };
}

/** A Board (a video's, or Research when `id` is the channel board): its cards, frames and connections, and all of it as one text. */
export async function agentBoard(slug: string, id: string) {
  const tiles = await boardTiles(slug, id);
  const [{ frames, links }, text] = await Promise.all([readCanvas(slug, id, tiles), boardText(slug, id, tiles, BOARD_CHARS, { ids: true })]);
  return {
    board: store.isChannelBoard(id) ? 'research' : id,
    cards: tiles.map(({ id: tileId, kind, title, url, text: tileText, pos, doc }) => ({ id: tileId, kind, title, url, text: tileText, pos, ...(doc ? { file: doc.path, base: doc.hash } : {}) })),
    frames,
    links,
    text,
  };
}

export const agentActionsBody = z.object({ actions: z.array(z.unknown()).min(1).max(20), revision: z.string().max(200).optional() }).strict();
export const agentUndoBody = z.object({ version: z.string().regex(/^cv_[0-9a-f]{12}$/) }).strict();

/** The step an action is checked as. A video takes every step's actions; Research takes its own. Questions are for a person in the chat. */
const VIDEO_TABS: readonly CompanionTab[] = ['plan', 'board', 'edit', 'publish', 'record'];
function tabFor(type: CompanionActionType, research: boolean): CompanionTab | undefined {
  if (type === 'ask_choice') return undefined;
  if (research) return TAB_ACTIONS.research.includes(type) ? 'research' : undefined;
  if (type === 'group_tiles') return 'research';
  return VIDEO_TABS.find((tab) => TAB_ACTIONS[tab].includes(type));
}

export interface AgentApplied {
  applied: Array<{ type: CompanionActionType; version: string; result: string; videoId?: string }>;
  /** The action it stopped at and why; the ones after it were not tried. */
  stopped?: { index: number; reason: string };
  /** The recording project's revision after the last timeline action. */
  revision?: string;
}

/**
 * Applies actions in order, each checked against the video as it is after the ones before it (a cut moves the times after it).
 * The first that is not valid or cannot apply stops the rest. Each applied action returns a version for `undoAgentAction`.
 */
export async function applyAgentActions(slug: string, id: string, body: z.infer<typeof agentActionsBody>): Promise<AgentApplied> {
  const research = store.isChannelBoard(id);
  if (!research) await store.readVideo(slug, id);
  const out: AgentApplied = { applied: [] };
  let revision = body.revision;
  for (const [index, raw] of body.actions.entries()) {
    const type = (raw && typeof raw === 'object' ? (raw as { type?: unknown }).type : undefined) as CompanionActionType;
    const tab = tabFor(type, research);
    if (!tab) {
      out.stopped = { index, reason: type === 'ask_choice' ? 'ask_choice is for a person in the chat; ask in your own reply instead.' : `${String(type)} is not an action ${research ? 'Research' : 'a video'} takes.` };
      break;
    }
    const [tiles, outline, project] = await Promise.all([
      store.listTiles(slug, id),
      research ? null : readOutline(slug, id),
      tab === 'edit' ? editProject(slug, id).then(({ project }) => project, () => undefined as Project | undefined) : undefined,
    ]);
    const sceneIds = (outline?.scenes ?? []).map((scene) => scene.id).filter((sceneId): sceneId is string => !!sceneId);
    const { actions, rejected } = validateActions([raw], { tab, sceneIds, tileIds: tiles.map((tile) => tile.id), project, editOptions: project ? await editOptions(project) : undefined });
    const action = actions[0] as CompanionAction | undefined;
    if (!action) {
      out.stopped = { index, reason: rejected[0] ?? 'not valid' };
      break;
    }
    try {
      const done = await applyAction(slug, id, action, isEditAction(action) && revision ? { revision } : {});
      if (done.revision) revision = done.revision;
      out.applied.push({ type: action.type, version: done.version, result: done.result, ...(done.videoId ? { videoId: done.videoId } : {}) });
    } catch (error) {
      out.stopped = { index, reason: error instanceof Error ? error.message : String(error) };
      break;
    }
  }
  if (revision) out.revision = revision;
  return out;
}

/** Puts back what one applied action changed, or refuses when that part changed since. */
export async function undoAgentAction(slug: string, id: string, version: string) {
  if (!(await versionExists(slug, id, version))) throw new ClubError('That change is no longer kept, so it cannot be undone.', 404);
  const { changed, revision } = await undoVersion(slug, id, version);
  return { undone: version, changed, ...(revision ? { revision } : {}) };
}

export const agentConnectBody = z.object({ app: z.enum(['claude', 'codex']) }).strict();
/** The name the Creator Compiler MCP server is added under. */
export const MCP_NAME = 'creator-compiler';

/**
 * Adds the Creator Compiler MCP server to the person's Claude Code (for every project) or Codex, by running that app's own `mcp add`.
 * An entry already there is replaced, so it points at this copy of the app.
 */
export async function connectAgentApp(app: 'claude' | 'codex', launcher: { command: string; args: string[] } | undefined) {
  if (!launcher) throw new ClubError('This copy of Creator Compiler has no MCP launcher. Install the app, then try again.', 409);
  const file = await findBinary(app);
  if (!file) throw new ClubError(`${app === 'claude' ? 'Claude Code' : 'Codex'} is not installed on this Mac.`, 409);
  const env = childEnv();
  const scope = app === 'claude' ? ['--scope', 'user'] : [];
  await runQuick(file, ['mcp', 'remove', ...scope, MCP_NAME], env);
  const added = await runQuick(file, ['mcp', 'add', ...scope, MCP_NAME, '--', launcher.command, ...launcher.args], env, 30_000);
  if (added.code !== 0) throw new ClubError(`${app === 'claude' ? 'Claude Code' : 'Codex'} could not add it: ${(added.stderr || added.stdout).trim().slice(0, 300) || `exit ${added.code}`}`, 502);
  return { added: true, app };
}
