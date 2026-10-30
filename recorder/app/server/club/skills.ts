import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { skillsAsked } from '../../shared/skills.js';

const MAX_SKILL_CHARS = 8000;

/** The body of one of the person's Claude Code skills (without its front matter), or undefined when it is not installed. */
async function readSkill(name: string, home = os.homedir()): Promise<string | undefined> {
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
  for (const name of skillsAsked(message)) {
    const body = await readSkill(name, home);
    if (body) bodies.push(`## Skill: ${name}\n${body}`);
  }
  if (!bodies.length) return system;
  return `${system ?? 'You are a precise writing assistant.'}\n\nThe person asked for one of their own writing skills. Follow its method below. Do not ask the clarifying questions it lists: answer them yourself from the board, the package, the outline and the transcript above, and say which assumption you made. Reply with the finished text, as cards the person can apply where the actions allow.\n\n${bodies.join('\n\n')}`;
}
