// CreatorClub types shared by the server (server/club) and the UI (src/club).

export interface Workspace {
  slug: string;
  name: string;
  handle: string;
  channelUrl: string;
  topics: string[];
  about: string;
  cta: string;
  /** Teaching playbooks to apply to this channel. Always empty in v1. */
  knowledge?: string[];
  createdAt: string;
}

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
  /** Set on videos imported from the old board. */
  idea?: IdeaNotes;
  /**
   * What Continue to recording put in each recorder scene, in outline order: the scene's id in the recording project,
   * the text it was given, and when that text last changed. Used to tell when the outline changed after a scene was recorded.
   */
  recorderScenes?: RecorderScene[];
}

export interface RecorderScene {
  sceneId: string;
  /** The scene's name, script and notes as pushed, joined, so a change in any of them counts. */
  text: string;
  changedAt: string;
}

export const TILE_KINDS = ['link', 'video', 'text', 'image', 'note'] as const;
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
}

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
  createdAt: string;
}

export interface Package {
  demand: ConceptRating;
  gap: ConceptRating;
  show: ConceptRating;
  angle: string;
  twist: string;
  titles: [string, string, string];
  thumbnailText: string;
  hook: { visual: string; spoken: string; text: string };
}

export interface OutlineScene {
  title: string;
  talkingPoints: string[];
  show: string;
  seconds: number;
}
export interface Outline {
  scenes: OutlineScene[];
  fullScript?: string;
}

/** The three Plan steps, in order. Each shows its help line until it is first completed in the channel. */
export const PLAN_STEPS = ['research', 'package', 'outline'] as const;
export type PlanStep = (typeof PLAN_STEPS)[number];

/** What the Plan step loads for a video. */
export interface PlanData {
  package: Package | null;
  outline: Outline | null;
  /** The first scene (1-based) whose takes were recorded before the outline changed. */
  changedScene?: number;
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
  /** The saved Gemini API key, masked ("••••1234"), or null. The full key never leaves the server. */
  geminiKey: string | null;
  /** Plan steps already completed once in the current channel, whose help lines no longer show. */
  helpSeen: PlanStep[];
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
/** Result of the job behind `POST /workspaces/:slug/voice`. */
export interface VoiceResult {
  voice: 'built' | 'needs-answers';
}
