import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SKILL_NAME, skillsAsked, slashSkill, type InstalledSkill } from '../../shared/skills.js';

const MAX_SKILL_CHARS = 8000;
const MAX_DESCRIPTION_CHARS = 120;

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
  const root = path.join(home, '.claude', 'skills');
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
      found.push({ name, description: oneLine(await readFile(file, 'utf8')) });
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
