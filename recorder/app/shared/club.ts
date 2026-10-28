// CreatorClub types shared by the server (server/club) and the UI (src/club).

export interface Workspace {
  slug: string;
  name: string;
  handle: string;
  channelUrl: string;
  topics: string[];
  about: string;
  cta: string;
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

export type AiProvider = 'claude' | 'codex';
export interface AiProviderStatus {
  installed: boolean;
  version: string | null;
  signedIn: boolean;
  account?: string;
}
export type AiStatus = Record<AiProvider, AiProviderStatus>;

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
