import { existsSync } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PREVIEW_EXT, SKILL_NAME, skillsAsked, slashSkill, type InstalledSkill } from '../../shared/skills.js';

/**
 * The skills that come with Creator Compiler (`recorder/app/skills`, copied next to the bundled server as `server-dist/skills`). They are
 * offered on Edit like the creator's own; a skill of theirs with the same name wins.
 */
export function bundledSkillsDir(): string | undefined {
  const here = import.meta.dirname;
  return [process.env.CREATORCLUB_SKILLS_DIR, path.join(here, 'skills'), path.resolve(here, '../../skills')].find((dir): dir is string => !!dir && existsSync(dir));
}

const MAX_SKILL_CHARS = 8000;
const MAX_DESCRIPTION_CHARS = 120;
const MAX_PREVIEWS = 6;
const PREVIEW_DEPTH = 4;
const PREVIEW_SKIP = new Set(['node_modules', '.git', 'workspace', 'headshots', 'shots', 'scripts', 'fixtures', 'tests']);
/** A file counts as a preview when its name says it shows a result, or it sits in a folder made for that. */
const PREVIEW_NAME = /preview|sample|demo|example|showcase|hero|reference-output/i;
const PREVIEW_FOLDER = /^(previews?|samples?|examples?|templates|frame-presets)$/i;
export const isPreview = (rel: string): boolean => {
  const parts = rel.split('/');
  return PREVIEW_NAME.test(parts[parts.length - 1]) || parts.slice(0, -1).some((part) => PREVIEW_FOLDER.test(part) || PREVIEW_NAME.test(part));
};
const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;

/** How well a file's name says "this shows the result": a file called preview first, then samples, demos and examples, then the rest. */
function previewRank(file: string): number {
  const name = path.basename(file).toLowerCase();
  if (name.startsWith('preview')) return 0;
  if (/sample|demo|example|showcase|reference-output/.test(file.toLowerCase())) return 1;
  return 2;
}

/** Files inside a skill that show what it makes: pages, GIFs, images and short videos, found up to four folders deep (relative paths, best first). */
export async function findPreviews(dir: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (current: string, depth: number): Promise<void> => {
    let names: string[];
    try {
      names = await readdir(current);
    } catch {
      return;
    }
    for (const name of names.sort()) {
      if (PREVIEW_SKIP.has(name) || name.startsWith('.')) continue;
      const full = path.join(current, name);
      try {
        const info = await stat(full);
        if (info.isDirectory()) {
          if (depth < PREVIEW_DEPTH) await walk(full, depth + 1);
        } else if (info.isFile() && PREVIEW_EXT.test(name) && info.size <= MAX_PREVIEW_BYTES) {
          const rel = path.relative(dir, full).split(path.sep).join('/');
          if (isPreview(rel)) found.push(rel);
        }
      } catch {
        /* unreadable: not a preview */
      }
    }
  };
  await walk(dir, 0);
  return found.sort((a, b) => previewRank(a) - previewRank(b) || a.localeCompare(b)).slice(0, MAX_PREVIEWS);
}

/** A preview file of an installed skill, as an absolute path: only a plain file of an allowed kind that really sits inside that skill's folder. */
export async function previewFile(name: string, file: string, home = os.homedir()): Promise<string | undefined> {
  if (!SKILL_NAME.test(name) || !PREVIEW_EXT.test(file)) return undefined;
  try {
    const base = await realpath(path.join(home, '.claude', 'skills', name));
    const target = await realpath(path.join(base, file));
    if (!target.startsWith(base + path.sep) || !(await stat(target)).isFile()) return undefined;
    return target;
  } catch {
    return undefined;
  }
}

/** The `description:` of a skill's front matter, as one short line: folded or block text joined, cut at its first sentence. */
export function oneLine(raw: string): string {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? '';
  const lines = front.split(/\r?\n/);
  const at = lines.findIndex((line) => /^description:/.test(line));
  if (at < 0) return '';
  const parts = [lines[at].replace(/^description:\s*/, '')];
  for (const line of lines.slice(at + 1)) {
    if (!/^\s+\S/.test(line)) break;
    parts.push(line.trim());
  }
  const text = parts.filter((part) => part && !/^[|>][+-]?$/.test(part)).join(' ').replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
  const sentence = /^(.*?[.!?])(\s|$)/.exec(text)?.[1] ?? text;
  return sentence.length > MAX_DESCRIPTION_CHARS ? `${sentence.slice(0, MAX_DESCRIPTION_CHARS - 1).trimEnd()}…` : sentence;
}

/** The skills installed in the person's own Claude Code (`~/.claude/skills/<name>/SKILL.md`), by name. Reads only; a folder without a SKILL.md is not a skill. */
export async function listSkills(home = os.homedir()): Promise<InstalledSkill[]> {
  const own = await skillsIn(path.join(home, '.claude', 'skills'));
  const bundled = bundledSkillsDir();
  const extra = bundled ? (await skillsIn(bundled)).filter((skill) => !own.some((each) => each.name === skill.name)) : [];
  return [...own, ...extra].sort((a, b) => a.name.localeCompare(b.name));
}

async function skillsIn(root: string): Promise<InstalledSkill[]> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const found: InstalledSkill[] = [];
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    if (!SKILL_NAME.test(name)) continue;
    try {
      const file = path.join(root, name, 'SKILL.md');
      if (!(await stat(file)).isFile()) continue;
      const raw = await readFile(file, 'utf8');
      const front = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? '';
      // A skill made for CreatorClub's Edit says so in its front matter: `creatorclub: edit`.
      const forEdit = /^creatorclub:\s*\[?[^\n]*\bedit\b/m.test(front);
      found.push({ name, description: oneLine(raw), previews: await findPreviews(path.join(root, name)), ...(forEdit ? { forEdit } : {}) });
    } catch {
      /* not a skill */
    }
  }
  return found;
}

/** The body of one of the person's Claude Code skills (without its front matter), or undefined when it is not installed. */
async function readSkill(name: string, home = os.homedir()): Promise<string | undefined> {
  if (!SKILL_NAME.test(name)) return undefined;
  try {
    const raw = await readFile(path.join(home, '.claude', 'skills', name, 'SKILL.md'), 'utf8');
    return raw.replace(/^---[\s\S]*?\n---\s*/, '').slice(0, MAX_SKILL_CHARS).trim();
  } catch {
    return undefined;
  }
}

/**
 * The companion runs without the person's Claude Code setup (no skills, settings or hooks). When a message asks for one of their writing
 * skills, that skill's own instructions are added to the system prompt, with the video's board, outline and recordings standing in for the
 * questions the skill would ask.
 */
export async function withSkills(system: string | undefined, message: string, home?: string): Promise<string | undefined> {
  const bodies: string[] = [];
  const typed = slashSkill(message);
  const names = [...new Set([...(typed ? [typed] : []), ...skillsAsked(message)])];
  for (const name of names) {
    const body = await readSkill(name, home);
    if (body) bodies.push(`## Skill: ${name}\n${body}`);
  }
  if (!bodies.length) return system;
  return `${system ?? 'You are a precise writing assistant.'}\n\nThe person asked for one of their own skills. Follow its method below. Do not ask the clarifying questions it lists: answer them yourself from the board, the package, the outline and the transcript above, and say which assumption you made. Reply with the finished text, as cards the person can apply where the actions allow.\n\n${bodies.join('\n\n')}`;
}

/**
 * A skill's preview page is often an animation that waits for a player to start it (its GSAP timelines sit in `window.__timelines`).
 * Served for the preview, the page also starts those timelines on a loop and tells the panel its real size. The skill's file is not changed.
 */
const PLAYER = `<script>(function(){function go(){var T=window.__timelines;if(T){Object.keys(T).forEach(function(k){try{T[k].repeat(-1).play(0);}catch(e){}});}var r=document.getElementById('root')||document.body,b=r.getBoundingClientRect();parent.postMessage({skillPreviewSize:[Math.round(b.width)||1280,Math.round(b.height)||720]},'*');}window.addEventListener('load',function(){setTimeout(go,300);});})();</script>`;
export const withPlayer = (html: string): string => (/<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${PLAYER}</body>`) : html + PLAYER);
