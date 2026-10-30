import { VIDEO_STAGES, type VideoStage } from './club.js';

/*
 * When a video may be moved to a stage by hand (the card's menu, a drag on Videos, the stage menu in a video's header).
 * One rule for the screens and the server; the server is the authority and refuses with the same sentence.
 * Moving back is always allowed. Moving forward needs what the stage works on: scenes to record, a take to edit,
 * an export to publish, and a YouTube link to be Published (which only Publish or "I uploaded it myself" give).
 */

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

const rank = (stage: VideoStage) => VIDEO_STAGES.indexOf(stage);

/** Why the video cannot be moved from `from` to `to`, as one sentence, or null when it can. */
export function moveProblem(from: VideoStage, to: VideoStage, facts: MoveFacts): string | null {
  if (rank(to) <= rank(from)) return null;
  switch (to) {
    case 'recording':
      return facts.scenes > 0 ? null : MOVE_NEEDS_SCENES;
    case 'editing':
      return facts.takes > 0 ? null : MOVE_NEEDS_TAKE;
    case 'publishing':
      return facts.exported ? null : MOVE_NEEDS_EXPORT;
    case 'published':
      return facts.published ? null : MOVE_NEEDS_LINK;
    default:
      return null;
  }
}
