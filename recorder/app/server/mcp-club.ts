/*
 * The channel side of the Creator Compiler MCP: the channel, its videos with their plans, every Board (a video's and Research),
 * Discover's ideas, and the in-app companion's actions applied directly. The timeline tools in mcp.ts edit a video's recording;
 * these reach everything before and around it. All of it goes through the app's own HTTP routes, so the same checks, locks and Undo apply.
 */

const string = { type: 'string' };
const number = { type: 'number' };
const ID = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' };
const definition = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = [], readOnly = false) => ({
  name,
  description,
  inputSchema: { type: 'object' as const, properties, required, additionalProperties: false },
  annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: false },
});
const board = { video_id: { ...ID, description: "The video whose Board this is. Leave it out for Research, the channel's own Board." } };
const video = { video_id: ID };

/** The actions `apply_actions` takes: the same ones the app's companion offers as cards. Times are seconds on the video's timeline. */
export const ACTIONS_HELP = [
  'Idea page: set_idea {angle?, twist?, why?} (what the video is about, its twist, why it could work: only from what the board and the idea show); set_pairs {pairs:[{title, thumb}] (1 to 3, titles of 7 words or fewer and not a question, thumbs of 2 to 5 words), use?: 1-3 (that pair\'s title becomes the video\'s title)}; set_hook {spoken?, visual?, text?}.',
  'Plan and package: use_title {text}; use_hook {text}; set_thumbnail_text {text}; set_description {text}; set_scene {sceneId, title?, talkingPoints?[]}; set_scene_script {sceneId, script}; draft_scenes {scenes:[{title, talkingPoints[], show, seconds}]} (replaces every scene).',
  'Board: add_note {text}; group_tiles {title, tileIds[]} (2 or more cards in a frame); start_video {title, tileIds[]} (Research only: a new video from those cards).',
  "Timeline (the video's recording): cut_pauses {level: gentle|balanced|tight}; remove_fillers {}; close_gaps {}; split_at {time, clipId?}; trim_clip {clipId, side: start|end, time}; delete_range {start, end}; add_caption {start, end, text}; set_caption_style {enabled?, fontSize?, color?, background?, position?, maxWords?}; add_text {start, duration, text, position?}; add_blur {start, duration, x, y, width, height} (fractions of the frame; hides something private); set_look {preset?: clean|editorial, display?: sans|serif, paper?, ink?, accent?, muted? (#rrggbb), motion?: still|subtle|lively, stage?: {background?, side?: right|left, size? 0.12-0.3} | null} (the look every graphic reads; get_video shows the current one); set_stage {start, end} (the speaker becomes a tile at the side of the look's stage and graphics in that stretch take the middle: for lists, comparisons, processes and proof, not for personal moments); set_zoom {start, duration, scale 1.05-4, x?, y?, target?: screen|camera}; add_motion_block {template: title-card|lower-third|callout|chapter-label|bullets|stat|compare|steps|quote|keyword|flow|tree, start, text, detail?, duration?, style?, x?, y?} (lists, the two sides of a compare, a flow's boxes and a tree's branches are joined with ' | '; any item can start with [check], [x], [warn] or an icon name such as [bot], [code], [youtube] or [claude]; graphics are placed away from the face, or in the middle on a stage stretch); update_motion_block {at, ...}; remove_motion_block {at}; normalize_audio {}.",
].join('\n');

export const CLUB_GUIDE = {
  model:
    "A channel has videos. Each video moves Idea → Record → Edit → Publish: create_video, move_video to planning, fill the Idea page with apply_actions (set_idea, set_pairs, set_hook, draft_scenes), then start_recording. Idea is one page: the video's plan (the idea, the package of titles with their thumbnail texts and the hook, and the scenes with their scripts) beside its Board, which holds research cards (notes, links, videos, images) with frames and connections. Research is the channel's own Board, where ideas gather before they become videos. Record makes takes per scene. Edit is the recording's timeline (a project: use the timeline tools with the video's recording.project_id).",
  workflow:
    'Start with get_channel (who the videos are for and how they sound), then list_videos and get_video. Read a Board with get_board before changing it. Change plans, Boards and the timeline with apply_actions: each action is checked and applied like a card in the app, returns a version that undo_action puts back, and later actions see the earlier ones (a cut moves the times after it). For changes the actions do not cover, use the timeline tools (begin_project_edit … commit_project_edit) on recording.project_id. Ask the person before start_video, draft_scenes (it replaces every scene) or remove_board_card.',
  actions: ACTIONS_HELP,
};

export const clubToolDefinitions = [
  definition('get_channel', "Read the current channel: its name, topics, audience and the voice it writes in. Read first: it says who the videos are for.", {}, [], true),
  definition('list_videos', 'List the channel’s videos with their stage (ideas, planning, recording, editing, published) and planning progress.', {}, [], true),
  definition('get_video', "Read one video: its details, package (titles, hook, thumbnail text, description), scenes with talking points and scripts, takes per scene, and recording (project_id and revision for the timeline tools, and the look its graphics use; null before anything is recorded).", video, ['video_id'], true),
  definition('create_video', 'Create a new video at the ideas stage.', { title: string }, ['title']),
  definition('move_video', "Move a video to a stage, as the stage menu in the app does: ideas, planning, recording, editing, publishing or published. Move an idea to planning before you plan it. A move the video is not ready for (editing with nothing recorded) is refused with the reason.", { video_id: string, stage: { enum: ['ideas', 'planning', 'recording', 'editing', 'publishing', 'published'] } }, ['video_id', 'stage']),
  definition('start_recording', "Set up the recording from the video's scenes, as Continue to recording does in the app: each scene becomes a scene to record, with its talking points, and the video moves to recording. Run it once the scenes are planned; running it again after the scenes change brings the recording's scenes up to date and keeps the takes.", { video_id: string }, ['video_id']),
  definition('get_board', "Read a Board: every card (id, kind, title, url, note text, position), its frames and connections, and the whole Board as one text with each card's id.", board, [], true),
  definition('add_board_card', 'Add a card to a Board. kind note: a Markdown note (text). link or video: a web or YouTube/Instagram link (url, optional title). text: a short text card (text).', { ...board, kind: { enum: ['note', 'link', 'video', 'text'] }, text: string, url: string, title: string }, ['kind']),
  definition('edit_board_note', "Replace a note's text (Markdown). Pass base, the note's last read version from get_board, so a change made meanwhile is kept as a copy instead of lost.", { ...board, card_id: ID, text: string, base: string }, ['card_id', 'text']),
  definition('move_board_card', 'Move a card on a Board to x, y (canvas pixels), optionally with a new width w.', { ...board, card_id: ID, x: number, y: number, w: number }, ['card_id', 'x', 'y']),
  definition('connect_board_cards', 'Draw a connection between two cards on a Board, with an optional label.', { ...board, from: ID, to: ID, label: string }, ['from', 'to']),
  definition('remove_board_card', 'Take a card off a Board. A note’s file is kept in the video’s folder.', { ...board, card_id: ID }, ['card_id']),
  definition('get_card_transcript', "Read the transcript of a video card on a Board (a YouTube or Instagram video), once the app has read it.", { ...board, card_id: ID }, ['card_id'], true),
  definition('list_ideas', "Read Discover: trending videos in the channel's topics, or posts from followed sources (signals).", { kind: { enum: ['trending', 'signals'] } }, ['kind'], true),
  definition('add_to_research', 'Put a Discover card (trending: videoId; signal: id) or one of the channel’s videos (video: id) on Research.', { source: { enum: ['trending', 'signal', 'video'] }, id: string }, ['source', 'id']),
  definition('apply_actions', `Apply the app's own actions to a video (or to Research when video_id is left out), in order. Each is checked like a card in the app; the first that cannot apply stops the rest and says why. Returns a version per applied action for undo_action, and the recording's new revision. Pass expected_revision (from get_video) so timeline actions never land on a timeline that moved.\n${ACTIONS_HELP}`, { ...board, actions: { type: 'array', items: { type: 'object' }, minItems: 1, maxItems: 20 }, expected_revision: string }, ['actions']),
  definition('undo_action', 'Put back what one applied action changed. Refused when that part changed since, by hand or by a newer action.', { ...board, version: { type: 'string', pattern: '^cv_[0-9a-f]{12}$' } }, ['version']),
  definition('capture_proof', "Show the real source behind a claim: captures a public web page scrolled to the words that back it, with those words highlighted, as a 1920×1080 picture in the video's folder (found tells whether the words were on the page). With at (seconds), it is also placed on the Overlays row for duration seconds as one change undo_action can put back. Prefer sources already on the video's Board (get_board).", { ...video, url: string, phrase: string, at: number, duration: number, title: string }, ['video_id', 'url']),
  definition('check_pacing', 'Check the pacing of the video\'s recording as it is now: stretches over 6 s with nothing changing on screen, graphics on screen together, and graphics too short to read, each with its time. Run it after an edit and fix what it finds.', video, ['video_id'], true),
  definition('list_skills', "List the person's Claude skills the app knows, with what each is for.", {}, [], true),
];

/** The routes a Board's tools use: a video's, or Research's. */
const boardBase = (a: { video_id?: unknown }) => (typeof a.video_id === 'string' && a.video_id ? `/club/videos/${encodeURIComponent(a.video_id)}` : '/club/channel');
const need = (value: unknown, name: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return encodeURIComponent(value);
};

/** Handles the channel tools; `undefined` for any other tool name. */
export function createClubToolHandler(baseUrl: string, fetcher: typeof fetch = fetch) {
  async function http(route: string, method = 'GET', body?: unknown) {
    const res = await fetcher(baseUrl.replace(/\/$/, '') + route, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Creator-Compiler-Agent': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const data: any = res.status === 204 ? { done: true } : await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || (Array.isArray(data.issues) ? data.issues.join('; ') : '') || `Creator Compiler HTTP ${res.status}`), { status: res.status });
    return data;
  }
  return async (name: string, a: any = {}): Promise<unknown> => {
    switch (name) {
      case 'get_channel': {
        const { current } = await http('/club/workspaces');
        if (!current) throw new Error('No channel yet. Open Creator Compiler and add a channel or start fresh.');
        const [channel, voice] = await Promise.all([http(`/club/workspaces/${encodeURIComponent(current)}`), http(`/club/workspaces/${encodeURIComponent(current)}/voice`).catch(() => null)]);
        return { channel, voice };
      }
      case 'list_videos':
        return http('/club/videos');
      case 'get_video':
        return http(`/club/videos/${need(a.video_id, 'video_id')}/agent`);
      case 'create_video':
        return http('/club/videos', 'POST', { title: a.title });
      case 'move_video':
        return http(`/club/videos/${need(a.video_id, 'video_id')}/move`, 'POST', { stage: a.stage });
      case 'start_recording':
        return http(`/club/videos/${need(a.video_id, 'video_id')}/recorder`, 'POST');
      case 'get_board':
        return http(`${boardBase(a)}/agent/board`);
      case 'add_board_card':
        return http(`${boardBase(a)}/research`, 'POST', { kind: a.kind, ...(a.text !== undefined ? { text: a.text } : {}), ...(a.url !== undefined ? { url: a.url } : {}), ...(a.title !== undefined ? { title: a.title } : {}) });
      case 'edit_board_note':
        return http(`${boardBase(a)}/research/${need(a.card_id, 'card_id')}`, 'PATCH', { text: a.text, ...(a.base ? { base: a.base } : {}) });
      case 'move_board_card':
        return http(`${boardBase(a)}/research/${need(a.card_id, 'card_id')}`, 'PATCH', { pos: { x: a.x, y: a.y, ...(a.w !== undefined ? { w: a.w } : {}) } });
      case 'connect_board_cards':
        return http(`${boardBase(a)}/board/links`, 'POST', { from: a.from, to: a.to, ...(a.label ? { label: a.label } : {}) });
      case 'remove_board_card':
        return http(`${boardBase(a)}/research/${need(a.card_id, 'card_id')}`, 'DELETE');
      case 'get_card_transcript':
        return http(`${boardBase(a)}/research/${need(a.card_id, 'card_id')}/transcript`);
      case 'list_ideas':
        return http(a.kind === 'signals' ? '/club/signals' : '/club/trending');
      case 'add_to_research':
        return http('/club/channel/research/add', 'POST', { source: a.source, id: a.id });
      case 'apply_actions':
        return http(`${boardBase(a)}/agent/actions`, 'POST', { actions: a.actions, ...(a.expected_revision ? { revision: a.expected_revision } : {}) });
      case 'undo_action':
        return http(`${boardBase(a)}/agent/actions/undo`, 'POST', { version: a.version });
      case 'capture_proof':
        return http(`/club/videos/${need(a.video_id, 'video_id')}/proof`, 'POST', { url: a.url, ...(a.phrase ? { phrase: a.phrase } : {}), ...(a.at !== undefined ? { at: a.at } : {}), ...(a.duration !== undefined ? { duration: a.duration } : {}), ...(a.title ? { title: a.title } : {}) });
      case 'check_pacing':
        return http(`/club/videos/${need(a.video_id, 'video_id')}/agent/pacing`);
      case 'list_skills':
        return http('/club/skills');
      default:
        return undefined;
    }
  };
}

export const clubToolNames = new Set(clubToolDefinitions.map((tool) => tool.name));
