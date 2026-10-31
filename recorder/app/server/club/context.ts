import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ChannelContext } from './prompts.js';
import * as store from './store.js';

const readIfThere = async (file: string) => fs.readFile(file, 'utf8').catch(() => undefined);

/** What the prompts know about a channel: its profile, the voice guide, and the criteria and structure files when it has them. */
export async function loadChannelContext(slug: string): Promise<ChannelContext> {
  const [workspace, voice, criteria, structure] = await Promise.all([
    store.readWorkspace(slug),
    readIfThere(path.join(store.workspaceDir(slug), 'voice.md')),
    readIfThere(path.join(store.workspaceDir(slug), 'criteria.md')),
    readIfThere(path.join(store.workspaceDir(slug), 'structure.md')),
  ]);
  return { workspace, voice: voice ?? '', criteria, structure };
}
