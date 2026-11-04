import type {Video} from '../../shared/club';
import type {VideoTab} from './routes';

/** What each step asks an agent to look at first. */
const STEP_START:Record<VideoTab,string>={
 idea:'Read its Board with get_board, then its package and scenes in get_video.',
 record:'Read its scenes and takes in get_video.',
 edit:'Read its recording with get_project_overview and get_transcript (project_id is in get_video).',
 publish:'Read its package in get_video.',
};

/**
 * The prompt a person pastes into their own agent (Claude Code, Codex) to hand it one video: which video, where it is, and how to start.
 * The agent learns the rest from the Creator Compiler MCP's get_guides.
 */
export function agentPrompt(video:Pick<Video,'id'|'title'>,tab:VideoTab):string{
 return [
  `Use the Creator Compiler MCP to work on my video "${video.title}" (video_id: ${video.id}).`,
  `Start with get_guides and get_channel, then get_video. ${STEP_START[tab]}`,
  'Make changes with apply_actions (each returns a version undo_action can put back), or the timeline tools for edits it does not cover. Ask me before replacing all scenes, starting a new video or removing cards.',
  'Tell me what you changed when you are done.',
 ].join('\n');
}
