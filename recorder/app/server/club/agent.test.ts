import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Video } from '../../shared/club.js';
import { createProject, defaultEffects, defaultTransform, type Clip, type Project } from '../../shared/types.js';

/*
 * The channel tools an outside agent gets over MCP, end to end: the MCP handler calls the club's HTTP routes, which read the channel,
 * videos and Boards, and apply the companion's own actions with their checks and Undo.
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-agent-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');
process.env.SCENEFORGE_DATA_DIR = path.join(temp, 'sceneforge');

const { clubRouter } = await import('./index.js');
const { createClubToolHandler, clubToolDefinitions } = await import('../mcp-club.js');
const { mcpToolDefinitions, createMcpToolHandler } = await import('../mcp.js');
const storage = await import('../storage.js');
await storage.initStorage();

const app = express();
app.use('/api/club', clubRouter({ runAI: async () => ({ text: '' }) }));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
after(async () => {
  server.close();
  await rm(temp, { recursive: true, force: true });
});
const tool = createClubToolHandler(api) as (name: string, a?: any) => Promise<any>;

const clip = (id: string, track: Clip['track'], start: number, length: number): Clip => ({ id, mediaId: 'm', name: id, track, start, sourceIn: 0, sourceOut: length, speed: 1, gain: 1, muted: false, transform: defaultTransform(), effects: defaultEffects() });
function recording(): Project {
  const p = createProject('Agent video');
  p.media = [{ id: 'm', name: 'take', path: '/tmp/take.mov', kind: 'video', duration: 60, width: 1920, height: 1080, hasAudio: true }];
  p.clips = [clip('screen-1', 'screen', 0, 20), clip('camera-1', 'camera', 0, 20)];
  // Words every second with a 4 s pause after 5 s.
  const words = [0, 1, 2, 3, 4, 5, 10, 11, 12, 13].map((t) => ({ text: `w${t}`, start: t, end: t + 0.6 }));
  p.captions = [{ id: 'cap1', start: 0, end: 13.6, text: words.map((w) => w.text).join(' '), words }];
  return p;
}

await fetch(`${api}/club/workspaces`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Maya Lopez', handle: '@maya', topics: ['claude'] }) });

test('every channel tool is offered next to the timeline tools, each name once', () => {
  const names = mcpToolDefinitions.map((each) => each.name);
  assert.equal(new Set(names).size, names.length);
  for (const each of clubToolDefinitions) assert.ok(names.includes(each.name), each.name);
  assert.ok(names.includes('begin_project_edit'));
});

test('an agent reads the channel, makes a video and reads it back with its recording', async () => {
  const { channel } = await tool('get_channel');
  assert.equal(channel.name, 'Maya Lopez');
  const made = (await tool('create_video', { title: 'Five Claude skills' })) as Video;
  assert.ok((await tool('list_videos')).some((each: Video) => each.id === made.id));
  assert.equal((await tool('get_video', { video_id: made.id })).recording, null, 'nothing recorded yet');
  const project = await storage.saveProject(recording());
  await fetch(`${api}/club/videos/${made.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recorderProjectId: project.id }) });
  const read = await tool('get_video', { video_id: made.id });
  assert.equal(read.video.title, 'Five Claude skills');
  assert.equal(read.recording.project_id, project.id);
  assert.match(read.recording.revision, /\S/);
});

test('an agent writes on a Board: a note, an edit to it, a link between two cards, a frame, and Undo of the frame', async () => {
  const made = (await tool('create_video', { title: 'Board video' })) as Video;
  const note = await tool('add_board_card', { video_id: made.id, kind: 'note', text: 'Open with the result' });
  const link = await tool('add_board_card', { video_id: made.id, kind: 'link', url: 'https://example.com/guide', title: 'Guide' });
  let board = await tool('get_board', { video_id: made.id });
  const card = board.cards.find((each: { id: string }) => each.id === note.id);
  assert.equal(card.text, 'Open with the result');
  assert.match(board.text, new RegExp(`\\[${note.id}\\]`), 'the text names each card by its id');
  await tool('edit_board_note', { video_id: made.id, card_id: note.id, text: 'Open with the result, then the steps', base: card.base });
  await tool('move_board_card', { video_id: made.id, card_id: link.id, x: 400, y: 120 });
  await tool('connect_board_cards', { video_id: made.id, from: note.id, to: link.id, label: 'source' });
  const grouped = await tool('apply_actions', { video_id: made.id, actions: [{ type: 'group_tiles', title: 'Opening', tileIds: [note.id, link.id] }] });
  assert.equal(grouped.applied.length, 1, JSON.stringify(grouped));
  board = await tool('get_board', { video_id: made.id });
  assert.equal(board.cards.find((each: { id: string }) => each.id === note.id).text, 'Open with the result, then the steps');
  assert.deepEqual([board.cards.find((each: { id: string }) => each.id === link.id).pos.x, board.links.length, board.frames[0]?.title], [400, 1, 'Opening']);
  await tool('undo_action', { video_id: made.id, version: grouped.applied[0].version });
  assert.equal((await tool('get_board', { video_id: made.id })).frames.length, 0);
  await tool('remove_board_card', { video_id: made.id, card_id: link.id });
  assert.equal((await tool('get_board', { video_id: made.id })).cards.some((each: { id: string }) => each.id === link.id), false);
});

test('an agent plans a video with the app’s actions, and each one can be undone', async () => {
  const made = (await tool('create_video', { title: 'Plan video' })) as Video;
  const drafted = await tool('apply_actions', { video_id: made.id, actions: [{ type: 'draft_scenes', scenes: [{ title: 'Hook', talkingPoints: ['The result first'], show: 'Face', seconds: 20 }, { title: 'Steps', talkingPoints: ['Three steps'], show: 'Screen', seconds: 60 }] }] });
  assert.equal(drafted.applied.length, 1, JSON.stringify(drafted));
  const scenes = (await tool('get_video', { video_id: made.id })).outline.scenes;
  assert.equal(scenes.length, 2);
  const scripted = await tool('apply_actions', { video_id: made.id, actions: [{ type: 'set_scene_script', sceneId: scenes[0].id, script: 'Here is what you will have by the end.' }, { type: 'use_hook', text: 'Five skills, one afternoon.' }] });
  assert.deepEqual(scripted.applied.map((each: { type: string }) => each.type), ['set_scene_script', 'use_hook']);
  let read = await tool('get_video', { video_id: made.id });
  assert.equal(read.outline.scenes[0].script, 'Here is what you will have by the end.');
  await tool('undo_action', { video_id: made.id, version: scripted.applied[0].version });
  read = await tool('get_video', { video_id: made.id });
  assert.notEqual(read.outline.scenes[0].script, 'Here is what you will have by the end.');
});

test('a wrong action stops the batch with the reason, and the ones before it stay applied', async () => {
  const made = (await tool('create_video', { title: 'Stops' })) as Video;
  const result = await tool('apply_actions', { video_id: made.id, actions: [{ type: 'add_note', text: 'Kept' }, { type: 'set_scene_script', sceneId: 'nope', script: 'x' }, { type: 'add_note', text: 'Never tried' }] });
  assert.equal(result.applied.length, 1);
  assert.equal(result.stopped.index, 1);
  assert.match(result.stopped.reason, /no scene nope/);
  const asked = await tool('apply_actions', { video_id: made.id, actions: [{ type: 'ask_choice', question: 'Which?', options: ['A', 'B'] }] });
  assert.match(asked.stopped.reason, /person in the chat/);
});

test('an agent cuts the pauses of a recording, and a stale revision is refused instead of landing on a moved timeline', async () => {
  const made = (await tool('create_video', { title: 'Cut video' })) as Video;
  const project = await storage.saveProject(recording());
  await fetch(`${api}/club/videos/${made.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recorderProjectId: project.id }) });
  const before = (await tool('get_video', { video_id: made.id })).recording.revision;
  const cut = await tool('apply_actions', { video_id: made.id, expected_revision: before, actions: [{ type: 'cut_pauses', level: 'balanced' }] });
  assert.equal(cut.applied.length, 1, JSON.stringify(cut));
  assert.notEqual(cut.revision, before);
  const saved = (await storage.readProject(project.id)) as Project;
  assert.ok(saved.clips.filter((each) => each.track === 'screen').reduce((sum, each) => sum + (each.sourceOut - each.sourceIn), 0) < 20, 'the pause is gone');
  const stale = await tool('apply_actions', { video_id: made.id, expected_revision: before, actions: [{ type: 'add_text', start: 1, duration: 2, text: 'Hi' }] });
  assert.equal(stale.applied.length, 0);
  assert.ok(stale.stopped.reason);
});

test('Research: an agent adds a note, starts a video from it, and a change shows on an open Board at once', async () => {
  const events = await fetch(`${api}/club/channel/board/events`);
  const reader = events.body!.getReader();
  const decoder = new TextDecoder();
  let seen = '';
  const heard = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return false;
      seen += decoder.decode(value);
      if (seen.includes('event: files')) return true;
    }
  })();
  const note = await tool('add_board_card', { kind: 'note', text: 'Claude skills for reels' });
  assert.equal(await Promise.race([heard, new Promise((r) => setTimeout(() => r(false), 5000))]), true, 'the open Board is told to read itself again');
  await reader.cancel();
  const started = await tool('apply_actions', { actions: [{ type: 'start_video', title: 'Skills for reels', tileIds: [note.id] }] });
  assert.equal(started.applied.length, 1, JSON.stringify(started));
  assert.ok((await tool('list_videos')).some((each: Video) => each.id === started.applied[0].videoId));
  const wrong = await tool('apply_actions', { actions: [{ type: 'use_title', text: 'Not here' }] });
  assert.match(wrong.stopped.reason, /not an action Research takes/);
});

test('the combined handler sends channel tools to the club and timeline tools to the projects', async () => {
  const handle = createMcpToolHandler(api);
  assert.equal(((await handle('get_channel')) as { channel: { name: string } }).channel.name, 'Maya Lopez');
  const guide = (await handle('get_guides')) as { channel: { workflow: string } };
  assert.match(guide.channel.workflow, /apply_actions/);
});

test('an agent takes an idea to a recording on its own: move it to planning, fill the Idea page, then start the recording', async () => {
  const made = (await tool('create_video', { title: 'Agent idea' })) as Video;
  assert.equal(((await tool('move_video', { video_id: made.id, stage: 'planning' })) as Video).stage, 'planning');
  const filled = await tool('apply_actions', {
    video_id: made.id,
    actions: [
      { type: 'set_idea', angle: 'Three skills that edit for you', twist: 'Shown on a real video' },
      { type: 'set_pairs', pairs: [{ title: 'Three skills edit my videos', thumb: 'NO EDITOR' }, { title: 'I stopped editing', thumb: 'CLAUDE EDITS' }, { title: 'Claude cut this video', thumb: 'WATCH IT CUT' }], use: 1 },
      { type: 'set_hook', spoken: 'This video was cut by Claude.', visual: 'The timeline', text: 'NO EDITOR' },
      { type: 'draft_scenes', scenes: [{ title: 'Hook', talkingPoints: ['The result first'], show: 'Face', seconds: 20 }, { title: 'Skill one', talkingPoints: ['What it does'], show: 'Screen', seconds: 60 }] },
    ],
  });
  assert.deepEqual(filled.applied.map((each: { type: string }) => each.type), ['set_idea', 'set_pairs', 'set_hook', 'draft_scenes'], JSON.stringify(filled));
  let read = await tool('get_video', { video_id: made.id });
  assert.equal(read.video.title, 'Three skills edit my videos', 'the pair in use is the video title');
  assert.deepEqual(read.package.thumbs, ['NO EDITOR', 'CLAUDE EDITS', 'WATCH IT CUT']);
  assert.equal(read.package.hook.visual, 'The timeline');
  const started = (await tool('start_recording', { video_id: made.id })) as Video;
  assert.equal(started.stage, 'recording');
  read = await tool('get_video', { video_id: made.id });
  assert.ok(read.recording?.project_id, 'the recording is set up from the scenes');
  assert.deepEqual(read.scenes.map((scene: { title: string }) => scene.title), ['Hook', 'Skill one']);
});
