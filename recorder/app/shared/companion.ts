/*
 * The companion: one conversation per video across Board, Plan, Record, Edit and Publish (`companion.json` in the video's folder).
 * A reply is markdown text plus cards; each card holds one typed action the screen can apply, and every applied action is a version
 * that Undo puts back. Edit's own actions arrive later through the same card and version shapes.
 */

export const COMPANION_TABS = ['board', 'plan', 'record', 'edit', 'publish'] as const;
export type CompanionTab = (typeof COMPANION_TABS)[number];

export interface DraftScene {
  title: string;
  talkingPoints: string[];
  show: string;
  seconds: number;
}

export type CompanionAction =
  | { type: 'use_hook'; text: string }
  | { type: 'use_title'; text: string }
  | { type: 'set_thumbnail_text'; text: string }
  | { type: 'add_note'; text: string }
  | { type: 'set_scene'; sceneId: string; title?: string; talkingPoints?: string[] }
  | { type: 'draft_scenes'; scenes: DraftScene[] }
  | { type: 'set_description'; text: string };
export type CompanionActionType = CompanionAction['type'];

export const COMPANION_ACTION_TYPES = ['use_hook', 'use_title', 'set_thumbnail_text', 'add_note', 'set_scene', 'draft_scenes', 'set_description'] as const satisfies readonly CompanionActionType[];

/** The actions the companion may offer on each step. Edit's arrive with the Edit companion. */
export const TAB_ACTIONS: Record<CompanionTab, readonly CompanionActionType[]> = {
  board: ['use_hook', 'use_title', 'add_note', 'draft_scenes'],
  plan: ['use_hook', 'use_title', 'set_thumbnail_text', 'set_scene', 'draft_scenes', 'add_note'],
  record: ['set_scene', 'add_note'],
  edit: [],
  publish: ['set_description', 'use_title', 'set_thumbnail_text'],
};

/** What a card is called, by its action. */
export const ACTION_TITLE: Record<CompanionActionType, string> = {
  use_hook: 'Spoken hook',
  use_title: 'Title',
  set_thumbnail_text: 'Thumbnail text',
  add_note: 'Note for the board',
  set_scene: 'Scene',
  draft_scenes: 'Scenes',
  set_description: 'Description',
};

/** The step shown while the companion writes an action of this type. */
export const ACTION_STEP: Record<CompanionActionType, string> = {
  use_hook: 'Writing hooks',
  use_title: 'Writing titles',
  set_thumbnail_text: 'Writing thumbnail text',
  add_note: 'Writing a note',
  set_scene: 'Rewriting the scene',
  draft_scenes: 'Drafting scenes',
  set_description: 'Writing the description',
};

/** The button that applies a card. */
export const ACTION_VERB: Record<CompanionActionType, string> = {
  use_hook: 'Use as hook',
  use_title: 'Use as title',
  set_thumbnail_text: 'Use it',
  add_note: 'Add to board',
  set_scene: 'Apply',
  draft_scenes: 'Apply',
  set_description: 'Use it',
};

export type CardState = 'offered' | 'applied' | 'undone';

export interface CompanionCard {
  action: CompanionAction;
  state: CardState;
  /** The version an applied card made: Undo takes it. Absent for cards carried over from the old Board chat. */
  version?: string;
  /** One line saying what applying it changed, e.g. "Replaced 4 scenes". */
  result?: string;
}

/** What the screen tells the companion with every message. */
export interface CompanionContext {
  tab: CompanionTab;
  sceneId?: string;
  sceneTitle?: string;
  /** A short summary of what the screen shows. */
  screen?: string;
  /** Edit: the playhead in seconds and the selected clip ids. */
  playhead?: number;
  selection?: string[];
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

/** What an apply or undo changed, so the screen reads it again. */
export type CompanionChanged = 'package' | 'outline' | 'board';

/** Undo's answer when the part a card changed was changed again after it: nothing newer is ever overwritten. */
export const CHANGED_SINCE = "This changed after it was applied, so it can't be undone safely.";

/** `POST …/cards/:index/apply` and `…/undo`. */
export interface CompanionApplied {
  message: CompanionReplyMessage;
  changed: CompanionChanged[];
}
