// Creator Compiler's native shell: the data module. Every answer comes from the studio's own local service
// (recorder/app/server, the same one the Electron app talks to), so the board and Research here are the live ones.
import type { Answer, Result, Sources } from './app.contract.d.ts';

// Where the studio's service listens. The installed app's service is on 4194 and `npm run dev`'s on 4184; the shell
// uses the first that answers as Creator Compiler. A build with CLUB_URL set (the demo service on 4199:
// `CLUB_URL=http://127.0.0.1:4199 bun exact.mjs mac`) talks to that one only. Grants are fixed at build: the two studio
// ports and CLUB_URL are the only `net.fetch` lines, so nothing else on the network is reachable.
const DEV = 'http://127.0.0.1:4184';
const INSTALLED = 'http://127.0.0.1:4194';
const CLUB_URL = import.meta.env.CLUB_URL ?? 'http://127.0.0.1:4184';
const CANDIDATES = CLUB_URL === DEV ? [INSTALLED, DEV] : [CLUB_URL];
export const grants = [`net.fetch ${INSTALLED}`, `net.fetch ${DEV}`, `net.fetch ${CLUB_URL}`].join('\n');

async function findStudio(): Promise<string> {
  for (const origin of CANDIDATES) {
    try {
      const res = await fetch(`${origin}/api/ready`, { exactTimeout: 1500 });
      const body = (await res.json().catch(() => ({}))) as { application?: unknown };
      if (res.ok && body.application === 'Creator Compiler') return origin;
    } catch (e) {
      if ((e as { code?: string }).code === 'bake') throw e;
    }
  }
  throw new Error(`Creator Compiler is not answering at ${CANDIDATES.join(' or ')}`);
}

const STAGES = ['ideas', 'planning', 'recording', 'editing', 'publishing', 'published'];

type Video = {
  id: string;
  number?: number;
  title: string;
  stage: string;
  order: number;
  hidden?: string;
  planning?: { research: boolean; package: boolean; outline: boolean };
  views?: number;
};
type Tile = { id: string; kind: string; title?: string; text?: string; url?: string; createdAt: string };

async function get(api: string, path: string, workspace = ''): Promise<unknown> {
  if (!CANDIDATES.includes(api)) throw new Error('Not a studio address this build may reach.');
  const res = await fetch(`${api}/api/club${path}`, {
    exactTimeout: 8000,
    headers: workspace ? { 'X-Club-Workspace': workspace } : {},
  });
  if (!res.ok) throw new Error(`${path}: the studio answered ${res.status}`);
  return res.json();
}

function cardDetail(video: Video): string {
  if (video.stage === 'published') return video.views === undefined ? 'Published' : `${video.views.toLocaleString('en-US')} views`;
  if (video.stage === 'ideas' || video.stage === 'planning') {
    const plan = video.planning ?? { research: false, package: false, outline: false };
    const done = [plan.research, plan.package, plan.outline].filter(Boolean).length;
    return done === 0 ? 'Not planned yet' : `${done} of 3 planned`;
  }
  return '';
}

const SYMBOL: Record<string, string> = {
  link: 'symbol:link', video: 'symbol:play', text: 'symbol:quote', note: 'symbol:document', idea: 'symbol:pencil',
  image: 'symbol:photo', signal: 'symbol:feeds', breakdown: 'symbol:layers', mine: 'symbol:bookmark',
};
const KIND: Record<string, string> = {
  link: 'Link', video: 'Video', text: 'Text', note: 'Note', idea: 'Idea', image: 'Image', signal: 'Signal', breakdown: 'Breakdown', mine: 'My video',
};

function tileTitle(tile: Tile): string {
  if (tile.title?.trim()) return tile.title.trim();
  const line = (tile.text ?? '').split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean);
  return line || tile.url || KIND[tile.kind] || 'Card';
}

function host(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/.exec(url);
  return match ? match[1].replace(/^www\./, '') : '';
}

const sources: Sources = {
  loadStudio: async (): Promise<Result<'loadStudio'>> => {
    const api = await findStudio();
    const body = (await get(api, '/workspaces')) as { current: string | null; workspaces: { slug: string; name: string; handle?: string }[] };
    const current = body.workspaces.find((w) => w.slug === body.current);
    return { api, slug: current?.slug ?? '', channel: current?.name ?? '', handle: current?.handle ?? '' };
  },
  loadVideos: async ([api, workspace]): Promise<Result<'loadVideos'>> => {
    const videos = (await get(api, '/videos', workspace)) as Video[];
    return videos
      .filter((v) => STAGES.includes(v.stage) && !(v.stage === 'ideas' && v.hidden))
      .sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.order - b.order)
      .map((v) => ({ id: v.id, title: v.title, stage: v.stage, number: v.number === undefined ? '' : `#${v.number}`, detail: cardDetail(v) }));
  },
  loadResearch: async ([api, workspace]): Promise<Result<'loadResearch'>> => {
    const tiles = (await get(api, '/channel/research', workspace)) as Tile[];
    return tiles
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => {
        const url = t.url && /^https?:/.test(t.url) ? t.url : '';
        const body = t.title?.trim() ? (t.text ?? '') : (t.text ?? '').split('\n').slice(1).join(' ');
        const title = tileTitle(t);
        const flat = body.replace(/^#+\s*/gm, '').replace(/\s+/g, ' ').trim();
        // A note's title is its first heading: the detail starts after it.
        const words = flat.startsWith(title) ? flat.slice(title.length).trim() : flat;
        return {
          id: t.id,
          title,
          detail: [KIND[t.kind] ?? t.kind, url ? host(url) : words.slice(0, 90)].filter(Boolean).join(' · '),
          url,
          symbol: SYMBOL[t.kind] ?? 'symbol:document',
        };
      });
  },
  moveVideo: async ([api, workspace, id, stage, before]): Promise<Result<'moveVideo'>> => {
    if (!CANDIDATES.includes(api)) return { ok: false, error: 'Not a studio address this build may reach.' };
    try {
      const res = await fetch(`${api}/api/club/videos/${encodeURIComponent(id)}/move`, {
        method: 'POST',
        exactTimeout: 8000,
        headers: { 'content-type': 'application/json', 'X-Club-Workspace': workspace },
        body: JSON.stringify({ stage, beforeId: before === '' ? null : before }),
      });
      if (res.ok) return { ok: true, error: '' };
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      return { ok: false, error: typeof body.error === 'string' ? body.error : `The studio refused the move (${res.status}).` };
    } catch (e) {
      if ((e as { code?: string }).code === 'bake') throw e;
      return { ok: false, error: 'Can’t reach Creator Compiler. Is it running?' };
    }
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
