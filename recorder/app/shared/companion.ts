import type {MotionTemplateId,Project} from './types';

/*
 * The companion: one conversation per video across Board, Plan, Record, Edit and Publish (`companion.json` in the video's folder).
 * A reply is markdown text plus cards; each card holds one typed action the screen can apply, and every applied action is a version
 * that Undo puts back. Edit's actions change the recording project's timeline through the editor's own timeline rules.
 */

/** A video's steps, and `research`: the channel's own Board, which has a conversation of its own. */
export const COMPANION_TABS = ['board', 'plan', 'record', 'edit', 'publish', 'research'] as const;
export type CompanionTab = (typeof COMPANION_TABS)[number];

export interface DraftScene {
  title: string;
  talkingPoints: string[];
  show: string;
  seconds: number;
}

export type PauseLevel = 'gentle' | 'balanced' | 'tight';
/** The shortest pause each level cuts, in seconds: the one table the Edit card, the Auto-edit sheet and the companion all read. */
export const PAUSE_SECONDS: Record<PauseLevel, number> = { gentle: 2, balanced: 1, tight: 0.5 };
/** The level used wherever nobody chose one (the Edit card, the sheet's first choice, a companion card without a level). */
export const DEFAULT_PAUSE_LEVEL: PauseLevel = 'balanced';
/** The Remove pauses plan keeps this much breath on each side of a quiet gap it proposes. */
export const PLAN_PAUSE_MARGIN = 0.16;
export type TextPosition = 'top' | 'center' | 'bottom';

/** Edit's actions: each changes the timeline of the video's recording project. Times are timeline seconds. */
export type EditAction =
  | { type: 'cut_pauses'; level: PauseLevel }
  | { type: 'remove_fillers' }
  | { type: 'close_gaps' }
  | { type: 'split_at'; time: number; clipId?: string }
  | { type: 'trim_clip'; clipId: string; side: 'start' | 'end'; time: number }
  | { type: 'delete_range'; start: number; end: number }
  | { type: 'set_caption_style'; enabled?: boolean; fontSize?: number; color?: string; background?: string; position?: TextPosition; maxWords?: number }
  | { type: 'add_caption'; start: number; end: number; text: string }
  | { type: 'add_text'; start: number; duration: number; text: string; position?: TextPosition }
  | { type: 'set_zoom'; start: number; duration: number; scale: number; x?: number; y?: number; target?: 'screen' | 'camera' }
  /** An animated graphic on the Motion row: `text` is its main line (title, name, label or chapter title), `detail` the second (subtitle, role, chapter number), `x`/`y` a callout's point. */
  | { type: 'add_motion_block'; template: MotionTemplateId; style?: string; start: number; duration?: number; text: string; detail?: string; x?: number; y?: number }
  /** Changes the motion graphic that is on screen at `at`: its words, style, point, start or length. Leave out what stays. */
  | { type: 'update_motion_block'; at: number; text?: string; detail?: string; style?: string; start?: number; duration?: number; x?: number; y?: number }
  /** Removes the motion graphic that is on screen at `at`. */
  | { type: 'remove_motion_block'; at: number }
  | { type: 'normalize_audio' };
export type EditActionType = EditAction['type'];
export const EDIT_ACTION_TYPES = ['cut_pauses', 'remove_fillers', 'close_gaps', 'split_at', 'trim_clip', 'delete_range', 'set_caption_style', 'add_caption', 'add_text', 'set_zoom', 'add_motion_block', 'update_motion_block', 'remove_motion_block', 'normalize_audio'] as const satisfies readonly EditActionType[];
export const isEditAction = (action: { type: string }): action is EditAction => (EDIT_ACTION_TYPES as readonly string[]).includes(action.type);

export type CompanionAction =
  | { type: 'use_hook'; text: string }
  | { type: 'use_title'; text: string }
  | { type: 'set_thumbnail_text'; text: string }
  | { type: 'add_note'; text: string }
  | { type: 'set_scene'; sceneId: string; title?: string; talkingPoints?: string[] }
  /** The words the creator says out loud in one scene that exists. */
  | { type: 'set_scene_script'; sceneId: string; script: string }
  | { type: 'draft_scenes'; scenes: DraftScene[] }
  | { type: 'set_description'; text: string }
  /** Research: a frame named `title` around these cards. */
  | { type: 'group_tiles'; title: string; tileIds: string[] }
  /** Research: a new idea whose first Board holds copies of these cards. */
  | { type: 'start_video'; title: string; tileIds: string[] }
  | EditAction;
export type CompanionActionType = CompanionAction['type'];

export const COMPANION_ACTION_TYPES = ['use_hook', 'use_title', 'set_thumbnail_text', 'add_note', 'set_scene', 'set_scene_script', 'draft_scenes', 'set_description', 'group_tiles', 'start_video', ...EDIT_ACTION_TYPES] as const satisfies readonly CompanionActionType[];

/** The actions the companion may offer on each step. */
export const TAB_ACTIONS: Record<CompanionTab, readonly CompanionActionType[]> = {
  board: ['use_hook', 'use_title', 'add_note', 'draft_scenes'],
  plan: ['use_hook', 'use_title', 'set_thumbnail_text', 'set_scene', 'set_scene_script', 'draft_scenes', 'add_note'],
  record: ['set_scene', 'add_note'],
  edit: EDIT_ACTION_TYPES,
  publish: ['set_description', 'use_title', 'set_thumbnail_text'],
  research: ['add_note', 'group_tiles', 'start_video'],
};

/** What a card is called, by its action. */
export const ACTION_TITLE: Record<CompanionActionType, string> = {
  use_hook: 'Spoken hook',
  use_title: 'Title',
  set_thumbnail_text: 'Thumbnail text',
  add_note: 'Note for the board',
  set_scene: 'Scene',
  set_scene_script: 'Scene script',
  draft_scenes: 'Scenes',
  set_description: 'Description',
  group_tiles: 'Frame',
  start_video: 'New video',
  cut_pauses: 'Cut pauses',
  remove_fillers: 'Remove filler words',
  close_gaps: 'Close gaps',
  split_at: 'Split',
  trim_clip: 'Trim',
  delete_range: 'Delete a stretch',
  set_caption_style: 'Caption style',
  add_caption: 'Caption',
  add_text: 'Text on screen',
  set_zoom: 'Zoom',
  add_motion_block: 'Motion graphic',
  update_motion_block: 'Change a graphic',
  remove_motion_block: 'Remove a graphic',
  normalize_audio: 'Even out loudness',
};

/** The step shown while the companion writes an action of this type. */
export const ACTION_STEP: Record<CompanionActionType, string> = {
  use_hook: 'Writing hooks',
  use_title: 'Writing titles',
  set_thumbnail_text: 'Writing thumbnail text',
  add_note: 'Writing a note',
  set_scene: 'Rewriting the scene',
  set_scene_script: 'Writing the script',
  draft_scenes: 'Drafting scenes',
  set_description: 'Writing the description',
  group_tiles: 'Grouping cards',
  start_video: 'Planning a video',
  cut_pauses: 'Finding pauses',
  remove_fillers: 'Finding filler words',
  close_gaps: 'Finding gaps',
  split_at: 'Planning a split',
  trim_clip: 'Planning a trim',
  delete_range: 'Planning a cut',
  set_caption_style: 'Styling captions',
  add_caption: 'Writing a caption',
  add_text: 'Writing text',
  set_zoom: 'Planning a zoom',
  add_motion_block: 'Placing a graphic',
  update_motion_block: 'Changing a graphic',
  remove_motion_block: 'Finding the graphic',
  normalize_audio: 'Checking loudness',
};

/** The button that applies a card. */
export const ACTION_VERB: Record<CompanionActionType, string> = {
  use_hook: 'Use as hook',
  use_title: 'Use as title',
  set_thumbnail_text: 'Use it',
  add_note: 'Add to board',
  set_scene: 'Apply',
  set_scene_script: 'Use this script',
  draft_scenes: 'Apply',
  set_description: 'Use it',
  group_tiles: 'Group them',
  start_video: 'Start the video',
  cut_pauses: 'Cut them',
  remove_fillers: 'Remove them',
  close_gaps: 'Close them',
  split_at: 'Split',
  trim_clip: 'Trim',
  delete_range: 'Delete it',
  set_caption_style: 'Apply',
  add_caption: 'Add it',
  add_text: 'Add it',
  set_zoom: 'Add zoom',
  add_motion_block: 'Add it',
  update_motion_block: 'Change it',
  remove_motion_block: 'Remove it',
  normalize_audio: 'Even it out',
};

export type CardState = 'offered' | 'applied' | 'undone';

export interface CompanionCard {
  action: CompanionAction;
  state: CardState;
  /** The version an applied card made: Undo takes it. Absent for cards carried over from the old Board chat. */
  version?: string;
  /** One line saying what applying it changed, e.g. "Replaced 4 scenes". */
  result?: string;
  /** A timeline card: the hash of the timeline it was applied on; applying it again after Undo needs that timeline. */
  appliedOn?: string;
  /** A `start_video` card once applied: the idea it made, so the card can open it. */
  videoId?: string;
  /** Applied so long ago that its version was pruned: it can no longer be undone. */
  tooOld?: true;
}

/** What the screen tells the companion with every message. */
export interface CompanionContext {
  tab: CompanionTab;
  sceneId?: string;
  sceneTitle?: string;
  /** A short summary of what the screen shows. */
  screen?: string;
  /** Edit: the playhead in seconds, the selected clip ids (Research: the selected cards' ids), the selected captions, texts, zooms and markers, and the time they all span. */
  playhead?: number;
  selection?: string[];
  items?: SelectedItem[];
  range?: { start: number; end: number };
}

/** A selected caption, text or graphic, zoom or marker on Edit's timeline. */
export interface SelectedItem {
  id: string;
  kind: 'caption' | 'text' | 'zoom' | 'marker' | 'motion';
  start: number;
  end: number;
  text?: string;
}

/** A finished step of a reply, with how long it took. */
export interface CompanionStep {
  label: string;
  ms: number;
}

export interface CompanionUserMessage {
  id: string;
  role: 'user';
  text: string;
  at?: string;
  context: CompanionContext;
}

export interface CompanionReplyMessage {
  id: string;
  role: 'assistant';
  text: string;
  at?: string;
  tab: CompanionTab;
  cards: CompanionCard[];
  steps?: CompanionStep[];
  /** Absent when the reply finished; `stopped` when the person stopped it (the text is what had arrived). */
  status?: 'stopped';
}

export type CompanionMessage = CompanionUserMessage | CompanionReplyMessage;

/** `GET /videos/:id/companion`: the conversation, and the reply being written, if any. */
export interface CompanionThread {
  messages: CompanionMessage[];
  /** The reply being written: its steps and the text shown so far, so a panel that opens late shows all of it. */
  running?: { jobId: string; messageId: string; steps: string[]; text: string };
}

/** `POST /videos/:id/companion`: the saved question and the job that writes the reply (follow it at `/jobs/:id/events`). */
export interface CompanionAsked {
  jobId: string;
  message: CompanionUserMessage;
}

/** A progress event of a reply job: step `index` starts, or more text arrives at `at` (its offset in the reply). Both can be replayed safely. */
export type CompanionEvent = { type: 'step'; label: string; index: number } | { type: 'text'; at: number; text: string };

/** What an apply or undo changed, so the screen reads it again. `timeline`: the recording project. */
export type CompanionChanged = 'package' | 'outline' | 'board' | 'timeline' | 'videos';

/** Undo's answer when the part a card changed was changed again after it: nothing newer is ever overwritten. */
export const CHANGED_SINCE = "This changed after it was applied, so it can't be undone safely.";

/** `POST …/cards/:index/apply` and `…/undo`. */
export interface CompanionApplied {
  message: CompanionReplyMessage;
  changed: CompanionChanged[];
  /** A timeline change: the recording project as saved, and its revision, for the open editor to take as one undo step. */
  project?: Project;
  revision?: string;
}

/** `POST …/cards/:index/apply|undo` body for a timeline card: the revision the editor saved last, so a change never lands on a timeline it did not see. */
export interface CompanionEditRequest {
  revision?: string;
}

/** The answer when the timeline changed between the editor's save and the card. */
export const TIMELINE_MOVED = 'The timeline changed just now. Try again.';
