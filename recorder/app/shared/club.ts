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
/**
 * Well-known subreddits for a topic, keyed by the topic in lower case. Signals sources offers them as chips and never adds one by itself.
 * A topic that is not here has no suggestion.
 */
export const TOPIC_SUBREDDITS: Readonly<Record<string, readonly string[]>> = {
  claude: ['ClaudeAI'],
  'ai agents': ['AI_Agents'],
  'vibe coding': ['vibecoding'],
  'ai for small business': ['smallbusiness'],
  automation: ['automation'],
  chatgpt: ['ChatGPT'],
  'making money with ai': ['sidehustle'],
  productivity: ['productivity'],
  cooking: ['Cooking'],
};

/** The subreddits to suggest for a channel's topics, each once, leaving out those already in `have` (compared without `r/` and ignoring case). */
export function suggestSubreddits(topics: readonly string[], have: readonly string[]): string[] {
  const bare = (name: string) => name.trim().replace(/^r\//i, '').toLowerCase();
  const taken = new Set(have.map(bare));
  const out: string[] = [];
  for (const topic of topics)
    for (const name of TOPIC_SUBREDDITS[topic.trim().toLowerCase()] ?? [])
      if (!taken.has(bare(name))) {
        taken.add(bare(name));
        out.push(name);
      }
  return out;
}

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

/** `mine` is a card for one of the channel's own ideas or videos (`meta.videoId`): it opens that idea's drawer or that video's page. */
export const TILE_KINDS = ['link', 'video', 'text', 'image', 'note', 'signal', 'breakdown', 'idea', 'mine'] as const;
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
  /** `mine` tiles: the id of the channel's idea or video the card stands for. */
  videoId?: string;
}

/**
 * The channel's own Board, Research: one canvas for the whole channel, kept in the channel's `research/` folder. Boards are named by a video's id
 * or by this, which can never be a video's id (those are letters, digits, `_` and `-`), so the two never mix.
 */
export const CHANNEL_BOARD = ':channel';

/** A line between two cards on a Board, drawn from one card's edge to the other's. The label is optional. */
export interface BoardLink {
  id: string;
  from: string;
  to: string;
  label?: string;
}

/** A named rectangle on a Board that groups the cards inside it: moving it moves them. */
export interface BoardFrame {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The connections and frames of a Board (`board-canvas.json` in the Board's folder). */
export interface BoardCanvas {
  links: BoardLink[];
  frames: BoardFrame[];
}

/** `POST /channel/research/start-video`: the idea made from a selection on Research. */
export interface StartedVideo {
  video: Video;
  tiles: number;
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

/**
 * The Markdown file behind a note. `root` says where it lives: `video` is the video's own folder (new notes go in its `notes` folder), `folder` is the
 * channel's Notes folder. `path` is relative to that root. The server adds `hash` (what the file held when it was read, sent back as `base` when saving
 * so a change made elsewhere in the meantime is noticed), and `missing` or `tooLarge` when the file cannot be shown.
 */
export interface TileDoc {
  root: 'video' | 'folder';
  path: string;
  hash?: string;
  missing?: boolean;
  tooLarge?: boolean;
  /** `folder` notes: the whole path of the Notes folder the file was pinned from. The card only reads and writes the file while that is still the Notes folder. */
  folder?: string;
  /** Set while the file of an old note is being made; only the server sees it. */
  pending?: boolean;
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
  /** Notes: the Markdown file that holds the text. The tile's `text` is that file's content when the server lists it. */
  doc?: TileDoc;
  createdAt: string;
}

/** What saving a note says when the file had changed since the editor read it: the other version is kept as a copy in the video's notes folder. */
export interface DocConflict {
  copy: string;
}

/** The Markdown files the Board can take: in the video's folder, and in the channel's Notes folder. */
export interface BoardFiles {
  /** The video's folder: the absolute path (to copy) and the same with the home folder shortened (to show). */
  /** `hidden` is how many files in the folder have had their card removed and are not shown. */
  folder: { path: string; display: string; hidden: number };
  notes: null | { path: string; display: string; files: NotesFile[]; truncated?: boolean };
}

export interface NotesFile {
  path: string;
  title: string;
  bytes: number;
  modified: string;
  /** Already a card on this video's Board. */
  pinned: boolean;
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
  /**
   * Choices left for the creator ("which tool to use"), shown in Plan as the scene's "To decide" list and never in the teleprompter or the
   * recording's text. Older outlines wrote them as `[YOUR CALL: …]` inside talking points; they are moved here when the outline is read,
   * and the file is rewritten (as `To decide:` lines) only when the scene is next saved.
   */
  decide?: string[];
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

/** A channel that follows fewer channels than this has Working now filled from a YouTube search on its topics. Server and screen use this one number. */
export const SEED_BELOW = 3;

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

// ---------------------------------------------------------------- Use as hook / title and scene status

/** Result of `POST /api/club/videos/:id/package/text`: the package as saved, and the one it replaced (null when there was none), so Undo can put it back with `PUT /package`, or remove the package with `DELETE /package` when there was none. */
export interface PackageUseResult {
  package: Package;
  previous: Package | null;
}

/** One take of a scene in the recording project. `kept` is true while the take is on the timeline. */
export interface SceneTakeInfo {
  id: string;
  seconds: number;
  /** On the timeline. */
  kept: boolean;
  /** Set aside on purpose (Close, Record another take); it is not waiting to be added. */
  retained: boolean;
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

// ---------------------------------------------------------------- publishing (Postiz)

export type PublishVisibility = 'public' | 'unlisted' | 'private';
export const PUBLISH_VISIBILITIES: readonly PublishVisibility[] = ['public', 'unlisted', 'private'];

/** A YouTube channel connected in the person's Postiz. */
export interface PublishChannel {
  id: string;
  name: string;
}

/** `GET /api/club/publishing`: what Publish and Settings know about where videos go. The API key itself never leaves the server. */
export interface PublishingState {
  postiz: {
    /** A key is saved. */
    connected: boolean;
    /** The person's own Postiz address, or null for Postiz Cloud. */
    address: string | null;
    /** The YouTube channel videos are posted to. */
    channel: PublishChannel | null;
  };
  /** Who can watch a new video until the person says otherwise. */
  defaultVisibility: PublishVisibility;
}

/** `PUT /api/club/publishing/postiz`: the key was accepted. `channels` are the YouTube channels Postiz has. */
export interface PostizConnectResult {
  state: PublishingState;
  channels: PublishChannel[];
}

/** The body of `POST /api/club/videos/:id/postiz`. */
export interface PublishStart {
  /** The export (SceneForge export history id) to send. */
  exportId: string;
  title: string;
  description: string;
  tags: string[];
  visibility: PublishVisibility;
  madeForKids: boolean;
  /** Absent to publish now; an ISO time in the future to schedule. */
  scheduledFor?: string;
}

/** Progress of the publish job. `percent` is of the step, when it can be known. */
export interface PublishProgress {
  step: 'check' | 'upload' | 'post' | 'wait';
  message: string;
  percent?: number;
}

/** What Postiz was given for a video, and where it stands. Kept with the video so Publish shows it again. */
export interface PublishRecord {
  postId: string;
  title: string;
  visibility: PublishVisibility;
  sentAt: string;
  /** ISO time it is set to go live, for a scheduled video. */
  scheduledFor?: string;
  /** Postiz has it queued, YouTube has it, or Postiz could not post it. */
  state: 'queued' | 'published' | 'failed';
  /** The YouTube link, once Postiz reports it. */
  url?: string;
  /** One sentence, when `state` is failed. */
  message?: string;
  /** Where to see the post in Postiz. */
  postizUrl: string;
  /** The YouTube channel it was sent to in Postiz. */
  channelId?: string;
  /** Postiz did not confirm the post, so it may exist: nothing more is sent until Check again finds it or rules it out. `postId` is empty. */
  unconfirmed?: boolean;
}
