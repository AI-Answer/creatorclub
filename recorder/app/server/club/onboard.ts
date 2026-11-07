import type { AddChannelResult, VoiceAnswers, VoiceResult, Workspace } from '../../shared/club.js';
import { channelFile, parseChannelInput, readChannel, sameChannelUrl, savedTranscripts, type ChannelRead } from './channel.js';
import { ensureChannelAvatar, type AvatarFetch } from './channel-avatar.js';
import type { JobContext } from './jobs.js';
import * as store from './store.js';
import { prepareYtDlp, type ToolOptions } from './tools.js';
import { buildVoiceGuide, hasVoiceGuide, MIN_TRANSCRIPTS, saveTranscripts, writeVoiceFromAnswers } from './voice.js';

const say = (context: JobContext) => (message: string) => context.emit({ message });

const yt = (context: JobContext, options: ToolOptions) => prepareYtDlp(say(context), options);

async function saveChannel(slug: string, read: ChannelRead) {
  await store.writeJSON(channelFile(slug), read.data);
  await saveTranscripts(slug, read.transcripts);
}

/** The job behind `POST /workspaces {channelUrl}`: reads the channel, saves it as a workspace and writes its voice guide. */
export async function addChannel(channelUrl: string, context: JobContext, options: ToolOptions = {}, avatarFetch?: AvatarFetch): Promise<AddChannelResult> {
  const ref = parseChannelInput(channelUrl);
  // Adding a channel again (after the voice step failed, say) picks up the workspace that is already there.
  const existing = (await store.listWorkspaces()).find((workspace) => sameChannelUrl(workspace.channelUrl, ref.url));
  if (existing && (await hasVoiceGuide(existing.slug))) {
    return { workspace: await ensureChannelAvatar(existing, avatarFetch), voice: 'built' };
  }
  const read = await readChannel(ref, { ...options, ytdlp: await yt(context, options), signal: context.signal, say: say(context) });
  const created = await store.withLock(`workspace-create:${store.rootDir()}`, async () => {
    const latest = (await store.listWorkspaces()).find(workspace => sameChannelUrl(workspace.channelUrl, ref.url));
    return latest ?? store.createWorkspace({ name: read.data.name, handle: read.data.handle, channelUrl: ref.url, topics: read.data.topics, about: '', cta: '' });
  });
  const workspace = await ensureChannelAvatar(created, avatarFetch);
  await saveChannel(workspace.slug, read);
  if (read.transcripts.length < MIN_TRANSCRIPTS) return { workspace, voice: 'needs-answers' };
  await buildVoiceGuide(workspace.slug, workspace.name, read.transcripts, { ...options, signal: context.signal, say: say(context) });
  return { workspace, voice: 'built' };
}

/**
 * The job behind `POST /workspaces/:slug/voice`.
 * With answers it writes the guide from them. Without, it re-reads the channel's latest videos and rebuilds the guide,
 * or asks for answers when the channel has too few captions (the existing guide is left alone then).
 */
export async function rebuildVoice(slug: string, answers: VoiceAnswers | undefined, context: JobContext, options: ToolOptions = {}): Promise<VoiceResult> {
  const workspace = await store.readWorkspace(slug);
  if (answers) {
    await writeVoiceFromAnswers(slug, workspace.name, answers);
    await store.updateWorkspace(slug, latest => latest.about.trim() ? latest : { ...latest, about: answers.audience.trim() });
    return { voice: 'built' };
  }
  let transcripts;
  if (workspace.channelUrl) {
    const read = await readChannel(parseChannelInput(workspace.channelUrl), { ...options, ytdlp: await yt(context, options), signal: context.signal, say: say(context) });
    await saveChannel(slug, read);
    transcripts = read.transcripts;
  } else {
    transcripts = (await savedTranscripts(slug)).slice(0, 10);
  }
  if (transcripts.length < MIN_TRANSCRIPTS) return { voice: 'needs-answers' };
  await buildVoiceGuide(slug, workspace.name, transcripts, { ...options, signal: context.signal, say: say(context) });
  return { voice: 'built' };
}

export interface FreshChannel {
  name: string;
  topics: string[];
  audience: string[];
  /** The Voice DNA questions the person chose to answer. */
  voice?: Partial<VoiceAnswers>;
}

/**
 * Starts a channel with no YouTube channel behind it: a name, topics and who it is for, and a voice guide from any answers given.
 * It becomes the current channel.
 */
export async function startFresh(input: FreshChannel): Promise<Workspace> {
  const answers = input.voice ?? {};
  const answered = Object.values(answers).some((value) => value?.trim());
  const workspace = await store.createWorkspace({
    name: input.name,
    person: input.name,
    handle: '',
    channelUrl: '',
    topics: input.topics,
    audience: input.audience,
    about: answers.audience?.trim() ?? '',
    cta: '',
  });
  if (answered) await writeVoiceFromAnswers(workspace.slug, workspace.name, answers);
  await store.setCurrentWorkspace(workspace.slug);
  return workspace;
}
