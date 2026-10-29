// CreatorClub types shared by the server (server/club) and the UI (src/club).

export interface Workspace {
  slug: string;
  name: string;
  /** The person the channel belongs to, for greetings. Unset when only the channel's name is known (a channel added from its link). */
  person?: string;
  handle: string;
  channelUrl: string;
  topics: string[];
  /** Who the channel makes videos for ("Complete beginners", "Developers"…). Empty until chosen. */
  audience: string[];
  about: string;
  cta: string;
  /** Teaching playbooks to apply to this channel. Always empty in v1. */
  knowledge?: string[];
  createdAt: string;
}

/** The topics Welcome offers, in the spelling shown to the person. */
export const TOPIC_LABELS = ['Claude', 'AI agents', 'Vibe coding', 'AI for small business', 'Automation', 'ChatGPT', 'AI video', 'Making money with AI', 'Productivity'] as const;
/** The audiences Welcome offers. */
export const AUDIENCE_LABELS = ['Complete beginners', 'Small-business owners', 'Creators', 'Developers', 'Students'] as const;

export const VIDEO_STAGES = ['ideas', 'planning', 'recording', 'editing', 'publishing', 'published'] as const;
export type VideoStage = (typeof VIDEO_STAGES)[number];

export type ConceptLevel = 'high' | 'mid' | 'low';
export interface ConceptRating {
  level: ConceptLevel;
  note: string;
}

/** What an idea keeps beyond its title: the old board's notes (carried over by the migration), or the angle, twist, hook and ratings of a concept added from Break down. */
export interface IdeaNotes {
  lane?: string;
  why?: string;
  demand?: ConceptRating;
  gap?: ConceptRating;
  show?: ConceptRating;
  angle?: string;
  twist?: string;
  hook?: string;
  sources?: { label: string; url?: string }[];
  note?: string;
  dropReason?: string;
}

export interface Video {
  id: string;
  title: string;
  stage: VideoStage;
  order: number;
  createdAt: string;
  updatedAt: string;
  /** ISO time the video entered each stage. */
  stageDates: Partial<Record<VideoStage, string>>;
  source?: { kind: 'breakdown' | 'manual'; breakdownId?: string };
  planning: { research: boolean; package: boolean; outline: boolean };
  recorderProjectId?: string;
  publishDate?: string;
  youtubeUrl?: string;
  publishedAt?: string;
  /** Views of the published video on YouTube. Unset until they are known. */
  views?: number;
  /** ISO time `views` was last read. */
  viewsCheckedAt?: string;
  hidden?: 'later' | 'skipped';
  /** The length the person is aiming for, in seconds. Unset for none. */
  targetSeconds?: number;
  /** Set on videos imported from the old board. */
  idea?: IdeaNotes;
  /**
   * What Continue to recording put in each recorder scene, in outline order: the scene's id in the recording project,
   * the text it was given, and when that text last changed. Used to tell when the outline changed after a scene was recorded.
   */
  recorderScenes?: RecorderScene[];
}

export interface RecorderScene {
  /** The outline scene's id. An entry stays after its outline scene is removed, so its takes are still flagged. */
  outlineId: string;
  sceneId: string;
  /** The scene's name, script and notes as pushed, joined, so a change in any of them counts. */
  text: string;
  changedAt: string;
}

export const TILE_KINDS = ['link', 'video', 'text', 'image', 'note', 'signal', 'breakdown', 'idea'] as const;
export type TileKind = (typeof TILE_KINDS)[number];

export interface TileMeta {
  views?: number;
  channel?: string;
  multiplier?: number;
  thumbnail?: string;
  likes?: number;
  comments?: number;
  ageDays?: number;
  platform?: 'youtube' | 'instagram';
  /** True once the video's transcript is saved with the tile. */
  transcript?: boolean;
  /** Signal tiles: where the post was read, who wrote it ("@name" on X, "r/sub" on Reddit), and how many replies it has. Its text and link are the tile's own; its likes are `likes`. */
  source?: SignalSource;
  author?: string;
  replies?: number;
  /** Breakdown tiles: the saved breakdown the tile shows. */
  breakdownId?: string;
  /** The idea tile: how the idea was rated when it was made. Its `text` is why it could work. */
  demand?: ConceptRating;
  gap?: ConceptRating;
  show?: ConceptRating;
}

/** Where a tile sits on the video's Board, in pixels from its top left corner. `w` is its width; the Board gives it a default when it is missing. */
export interface TilePosition {
  x: number;
  y: number;
  w?: number;
}

/** The width a tile has on the Board until it is given one. */
export const defaultTileWidth = (kind: TileKind) => (kind === 'breakdown' ? 320 : 280);

/** A video tile's transcript, split into the video's own chapters (one untitled chapter when it has none). */
export interface TranscriptChapter {
  title: string;
  /** Seconds from the start of the video. */
  start: number;
  text: string;
}

export interface ResearchTile {
  id: string;
  kind: TileKind;
  url?: string;
  title?: string;
  text?: string;
  /** File name inside the video's research folder (image tiles and uploads). */
  file?: string;
  meta: TileMeta;
  /** Set when the tile is added, so a tile always has a place on the Board. */
  pos?: TilePosition;
  createdAt: string;
}

/** The package of a video. The ratings are left out until they are judged: a package made by Use as hook or Use as title has none, and the blank fields stay blank. */
export interface Package {
  demand?: ConceptRating;
  gap?: ConceptRating;
  show?: ConceptRating;
  angle: string;
  twist: string;
  titles: [string, string, string];
  thumbnailText: string;
  hook: { visual: string; spoken: string; text: string };
  /** The YouTube description as edited in Publish. Unset until it is edited: Publish then starts from the hook, the angle and the chapters. */
  description?: string;
}

export interface OutlineScene {
  /** Stable for the scene's whole life: kept through edits, reorders and re-runs that keep its title. Links it to its recorder scene. */
  id?: string;
  title: string;
  talkingPoints: string[];
  show: string;
  seconds: number;
  /** The scene's part of the script, when it has one. Derived when the outline is read (a script is saved in one file); sending it back does nothing. */
  script?: string;
}
/** Whether the outline has a script: none, some scenes only (written one scene at a time), or every scene. Absent means none. */
export type ScriptState = 'none' | 'partial' | 'full';
export interface Outline {
  scenes: OutlineScene[];
  /** The whole script as one text. Set when the script covers every scene, or was written as one piece; not set while only some scenes have a script (see `scriptState` and each scene's `script`). */
  fullScript?: string;
  scriptState?: ScriptState;
}

/** Steps whose help line or first-visit tip stops showing once they were done in a channel: the three Plan steps and the Board's tip. */
export const HELP_STEPS = ['research', 'package', 'outline', 'board'] as const;
export type HelpStep = (typeof HELP_STEPS)[number];

/** The three Plan steps, in order. Each shows its help line until it is first completed in the channel. */
export const PLAN_STEPS = ['research', 'package', 'outline'] as const;
export type PlanStep = (typeof PLAN_STEPS)[number];

/** What the Plan step loads for a video. */
export interface PlanData {
  package: Package | null;
  outline: Outline | null;
  /** The first scene (1-based, in the recorder's order) whose takes were recorded before the outline changed. */
  changedScene?: number;
  /** AI steps still running for this video, by step, so a page opened mid-run follows them. */
  running: Partial<Record<PlanJobKind, string>>;
  /** Results that finished after the step was edited, held instead of written: their token, by step. */
  ready: Partial<Record<PlanJobKind, string>>;
}

/** The AI steps of Plan. Each runs at most once at a time per video. */
export const PLAN_JOB_KINDS = ['package', 'outline', 'script'] as const;
export type PlanJobKind = (typeof PLAN_JOB_KINDS)[number];

/** What a finished AI step returns: the new version, plus `replaced` (Undo puts the earlier one back) or `held` (it was kept aside, because the step changed while it ran). */
export interface PlanJobResult<T> {
  value: T;
  replaced?: string;
  held?: string;
}

export interface BreakdownVideoMeta {
  title: string;
  channel: string;
  views: number;
  likes: number;
  comments: number;
  ageDays: number;
  thumbnail: string;
  multiplier?: number;
}

export interface Breakdown {
  id: string;
  url: string;
  platform: string;
  video: BreakdownVideoMeta;
  createdAt: string;
  /** Set to 'gemini' when Gemini watched the video from its link. Absent when Claude worked from the transcript, comments and thumbnail. */
  watchedWith?: 'gemini';
  whyItWorked: {
    titlePackaging: string;
    hookSpeed: string;
    structure: string[];
    retention: string;
    payoff: string;
    short: string[];
  };
  reusableOutline: string[];
  viewerQuestions: { question: string; likes: number }[];
  concepts: {
    title: string;
    angle: string;
    twist: string;
    hook: string;
    demand: ConceptRating;
    gap: ConceptRating;
    show: ConceptRating;
    why: string;
  }[];
}

/** A finished breakdown in `GET /api/club/breakdowns`, enough to tell which video it is about and to open it. */
export interface BreakdownSummary {
  id: string;
  /** The link it was made from. Empty for a dropped video file. */
  url: string;
  platform: string;
  createdAt: string;
  title: string;
  channel: string;
}

/** What the Break down prompt returns. The app adds the rest (id, url, platform, video, createdAt). */
export type BreakdownResult = Pick<Breakdown, 'whyItWorked' | 'reusableOutline' | 'viewerQuestions' | 'concepts'>;

/** The two command line tools that can run a prompt. */
export type AiProvider = 'claude' | 'codex';
/** Everything Settings can connect with a sign-in. Google is not one: it takes an optional Gemini API key instead. */
export type ConnectProvider = AiProvider;
export interface AiProviderStatus {
  installed: boolean;
  version: string | null;
  signedIn: boolean;
  account?: string;
}
export type AiStatus = Record<ConnectProvider, AiProviderStatus>;

export interface ClubSettings {
  /** The AI that runs prompts. Null until one is chosen or the first one connects. */
  defaultAi: AiProvider | null;
  /** True once the first-visit "How CreatorClub works" dialog has been closed. */
  welcomed: boolean;
  /** The theme chosen in Settings, or null while none is chosen (light). */
  appearance: 'light' | 'dark' | null;
  /** The saved Gemini API key, masked ("••••1234"), or null. The full key never leaves the server. */
  geminiKey: string | null;
  /** Steps already completed once in the current channel (Plan's help lines, the Board tip), which no longer show. */
  helpSeen: HelpStep[];
}

/** Progress events of a connect job. `line` is one cleaned-up line of installer output. */
export interface ConnectProgress {
  phase: 'installing' | 'signing-in' | 'connected';
  line?: string;
  account?: string;
}
/** The result of a connect job. */
export interface ConnectResult {
  provider: ConnectProvider;
  account?: string;
}

export type JobStatus = 'running' | 'done' | 'failed' | 'cancelled';
export interface JobSnapshot {
  id: string;
  kind: string;
  status: JobStatus;
  createdAt: string;
  result?: unknown;
  /** One user-safe sentence when the job failed. */
  error?: string;
}

/** The three Voice DNA questions, asked when a channel has too few captions to learn from. */
export const VOICE_QUESTIONS = [
  { key: 'voice', label: 'In one or two sentences, how would you describe your voice?', required: true },
  { key: 'audience', label: 'Who is your audience and what do you teach them?', required: true },
  { key: 'moves', label: 'Any signature moves?', help: 'Recurring analogies, phrases you always or never use, a standard closing line.', required: false },
] as const;
export type VoiceAnswers = Record<(typeof VOICE_QUESTIONS)[number]['key'], string>;

/** Result of the job behind `POST /workspaces {channelUrl}`. */
export interface AddChannelResult {
  workspace: Workspace;
  voice: 'built' | 'needs-answers';
}
/** What `GET /workspaces/:slug/voice` says about the voice guide: its opening lines, and how many transcripts it was built from (0 when it was written from the person's answers). */
export interface VoiceGuideSummary {
  summary: string;
  transcripts: number;
}
/** Result of the job behind `POST /workspaces/:slug/voice`. */
export interface VoiceResult {
  voice: 'built' | 'needs-answers';
}

/** `GET /api/club/disk`: free space where takes are saved. `low` is true under 10 GB. */
export interface DiskSpace {
  freeBytes: number;
  low: boolean;
}

// ---------------------------------------------------------------- Working now and Signals

/** A channel to watch in Working now (`followed.json`). It is found by its link, handle or channel id; one of the three is needed. */
export interface FollowedChannel {
  name: string;
  channelId?: string;
  /** "@name". */
  handle?: string;
  /** The channel page, like https://www.youtube.com/@name. */
  url?: string;
  /** The channel's usual views, the median of its last 30 uploads, as last read. */
  median?: number;
}

export type TrendingKind = 'followed' | 'creator' | 'news';

/** One video in Working now (`trending.json`). `mult` is null when the channel's usual views are not known. */
export interface TrendingItem {
  videoId: string;
  title: string;
  channel: string;
  kind: TrendingKind;
  views: number;
  likes: number | null;
  comments: number | null;
  /** YYYY-MM-DD. */
  published: string;
  /** As of the last refresh. */
  ageDays: number;
  /** Views per day, as of the last refresh. */
  vpd: number;
  /** Views over the channel's usual views, two decimals. Null when the usual is not known. */
  mult: number | null;
  /** One reading per day the video was seen: date and views. */
  history: { d: string; v: number }[];
  /** YYYY-MM-DD. */
  firstSeen: string;
  fit: boolean;
  /** The channel's id, when known, so the video's channel can be followed. */
  channelId?: string;
  /** The topic whose YouTube search found the video (a channel that follows nobody yet). */
  topic?: string;
}

/** A trending video as `GET /api/club/trending` returns it: ranked for the current channel. `fit` is true when its text matches the channel's topics or audience, and `reason` says which ("Because you picked Claude"). */
export interface TrendingEntry extends TrendingItem {
  reason: string | null;
}
export interface TrendingResponse {
  items: TrendingEntry[];
  /** ISO time of the last refresh, or null when the list was never refreshed. */
  updatedAt: string | null;
  /** How many channels are followed, so an empty list can say why. */
  followed: number;
}

export type SignalSource = 'x' | 'reddit';
export interface SignalMedia {
  type: 'image' | 'video';
  url: string | null;
  w?: number | null;
  h?: number | null;
}

/** One post in Signals (`signals.json`). X posts: `author` is the display name and `handle` the account. Reddit: `author` is "r/<sub>" and `handle` the poster. */
export interface SignalItem {
  id: string;
  source: SignalSource;
  author: string;
  handle: string;
  text: string;
  url: string;
  likes: number;
  replies: number;
  shares?: number;
  views?: number | null;
  media: SignalMedia | null;
  /** A Reddit flair, or the X topic the post was found by. */
  flair?: string | null;
  createdAt: string;
  /** As of the last refresh. */
  ageHours: number;
}

/** A post as `GET /api/club/signals` returns it. Same `fit` and `reason` as `TrendingEntry`. */
export interface SignalEntry extends SignalItem {
  reason: string | null;
  fit: boolean;
}
export interface SignalsResponse {
  items: SignalEntry[];
  updatedAt: string | null;
  /** Sources that could not be read in the last refresh, like "r/ClaudeAI". */
  errors: string[];
  /** How many sources are set up (X accounts, X searches and subreddits). Zero means Refresh has nothing to read. */
  sources: number;
}

/** Where Signals reads from (`signals-config.json`). Every number has a default. */
export interface SignalsConfig {
  /** X accounts, without the @. */
  x?: string[];
  /** X searches. A phrase goes in quotes. */
  xTopics?: string[];
  minXLikes?: number;
  /** Subreddits, without the r/. */
  reddit?: string[];
  maxAgeDays?: number;
  minRedditScore?: number;
  maxPerSource?: number;
}

/** Result of the job behind `POST /api/club/trending/refresh`. `failed` lists followed channels that could not be read (their earlier videos stay). */
export interface TrendingRefreshResult {
  videos: number;
  added: number;
  channels: number;
  failed: string[];
}
/** Result of the job behind `POST /api/club/signals/refresh`. `note` is set when part of the refresh was skipped. */
export interface SignalsRefreshResult {
  posts: number;
  added: number;
  errors: string[];
  /** How many sources were tried. When it equals the number in `errors`, nothing could be read. */
  tried: number;
  note?: string;
}

// ---------------------------------------------------------------- Board chat and scene status

/** What "Ask Claude about this board" can hand back to use: a spoken hook, a title, a note for the Board, or a scene idea. */
export const BOARD_ITEM_KINDS = ['hook', 'title', 'note', 'scene'] as const;
export type BoardItemKind = (typeof BOARD_ITEM_KINDS)[number];
export interface BoardItem {
  kind: BoardItemKind;
  text: string;
}

/** One message of a video's Board chat (`board-chat.json`). `used` marks the items already taken, by their place in `items`. */
export interface BoardChatMessage {
  role: 'user' | 'assistant';
  text: string;
  items?: BoardItem[];
  used?: number[];
}

/** The answer to `POST /api/club/videos/:id/board/chat`. */
export interface BoardChatReply {
  reply: string;
  items: BoardItem[];
}

/** Result of `POST /api/club/videos/:id/package/text`: the package as saved, and the one it replaced (null when there was none), so Undo can put it back with `PUT /package`, or remove the package with `DELETE /package` when there was none. */
export interface PackageUseResult {
  package: Package;
  previous: Package | null;
}

/** One take of a scene in the recording project. `kept` is true while the take is on the timeline. */
export interface SceneTakeInfo {
  id: string;
  seconds: number;
  kept: boolean;
}

/** One outline scene with what the recording project holds for it. */
export interface VideoScene {
  /** The outline scene's id. */
  id: string;
  title: string;
  /** The seconds the outline gives the scene. */
  seconds: number;
  /** In the order they were recorded, so "Kept take 2" is the second one. */
  takes: SceneTakeInfo[];
  /** "Not recorded", "2 takes", "Kept take 2" or "Cut 14s". */
  status: string;
  /** Seconds taken out of the scene by removing pauses. Left out while the recording project does not record them per scene. */
  cutSeconds?: number;
}

/** `GET /api/club/videos/scenes`: the scenes of every video that is not published, by video id. A video whose scenes could not be read has no entry, which is not the same as an empty list (an outline with no scenes). */
export type ScenesByVideo = Record<string, VideoScene[]>;
