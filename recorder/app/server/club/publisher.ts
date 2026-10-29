import type { PublishChannel, PublishProgress, PublishVisibility } from '../../shared/club.js';
import { ClubError } from './errors.js';

/** Where a published video goes. Postiz is the first one; sending straight to YouTube can follow behind the same four methods. */

/** One sentence that is safe to show. */
export class PublisherError extends ClubError {
  constructor(message: string, status = 502) {
    super(message, status);
    this.name = 'PublisherError';
  }
}

/** A file on this computer. */
export interface LocalFile {
  path: string;
  name: string;
  size: number;
  /** For example video/mp4 or image/png. */
  type: string;
  /** Changes when the file's content does (an export's id), so an upload that was kept is only reused for the same video. */
  version?: string;
}

export interface PublishRequest {
  channelId: string;
  title: string;
  description: string;
  tags: string[];
  visibility: PublishVisibility;
  madeForKids: boolean;
  /** Absent to publish now. */
  scheduledFor?: Date;
  video: LocalFile;
  thumbnail?: LocalFile;
}

export type PostState = 'queued' | 'published' | 'failed';

export interface PostStatus {
  state: PostState;
  /** The YouTube link, once it is known. */
  url?: string;
}

export interface SentPost {
  /** The publisher's own id for the post, to ask about it later. */
  postId: string;
  /** The date the post was sent for. */
  date: Date;
}

export interface Publisher {
  /** Checks the credentials and returns the YouTube channels they can post to. */
  connect(signal?: AbortSignal): Promise<PublishChannel[]>;
  listChannels(signal?: AbortSignal): Promise<PublishChannel[]>;
  /** Sends the video (and thumbnail) and creates the post. Resolves once the publisher has accepted it. */
  publish(request: PublishRequest, progress: (event: PublishProgress) => void, signal?: AbortSignal): Promise<SentPost>;
  status(post: SentPost, signal?: AbortSignal): Promise<PostStatus>;
}
