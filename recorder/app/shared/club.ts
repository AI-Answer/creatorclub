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
export const CONCEPT_KEYS = ['angle', 'twist', 'hook', 'demand', 'gap', 'show'] as const;
export type ConceptKey = (typeof CONCEPT_KEYS)[number];
export type Concept = Record<ConceptKey, ConceptRating>;

/** What the old board kept about an idea, carried over unchanged by the migration. */
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
  concept?: Concept;
  planning: { research: boolean; package: boolean; outline: boolean };
  recorderProjectId?: string;
  publishDate?: string;
  youtubeUrl?: string;
  publishedAt?: string;
  hidden?: 'later' | 'skipped';
  /** Set on videos imported from the old board. */
  idea?: IdeaNotes;
}

export const TILE_KINDS = ['link', 'video', 'text', 'image', 'note'] as const;
export type TileKind = (typeof TILE_KINDS)[number];

export interface TileMeta {
  views?: number;
  channel?: string;
  multiplier?: number;
  thumbnail?: string;
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
  demand: string;
  gap: string;
  show: string;
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
    demand: string;
    gap: string;
    show: string;
    why: string;
  }[];
}

/** The two command line tools that can run a prompt. */
export type AiProvider = 'claude' | 'codex';
/** Everything Settings can connect. Google (the Gemini CLI) is for watching video later and never runs prompts. */
export type ConnectProvider = AiProvider | 'gemini';
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
