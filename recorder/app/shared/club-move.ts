import { type VideoStage } from './club.js';

/* Manual stage changes are unrestricted in both the UI and server. */

/** What a video has, as far as moving it is concerned. */
export interface MoveFacts {
  /** Scenes in its outline. */
  scenes: number;
  /** Scenes with at least one recorded take (kept or not). */
  takes: number;
  /** A finished MP4 export of its recording exists. */
  exported: boolean;
  /** It has a YouTube link. */
  published: boolean;
}

export const MOVE_NEEDS_SCENES = 'This video has no scenes yet, so plan them before it moves to Recording.';
export const MOVE_NEEDS_TAKE = 'Nothing is recorded for this video yet, so record a scene before it moves to Editing.';
export const MOVE_NEEDS_EXPORT = 'This video has no exported file yet, so export it in Edit before it moves to Publishing.';
export const MOVE_NEEDS_LINK = 'This video is not on YouTube yet, so publish it from the Publish step or say you uploaded it yourself.';

/** The HTTP status the server refuses a move with, so a screen can tell a refusal from a failure. */
export const MOVE_REFUSED_STATUS = 422;

/** A stage is an organizational label; moving a card never requires production artifacts. */
export function moveProblem(_from: VideoStage, _to: VideoStage, _facts: MoveFacts): string | null {
  return null;
}
