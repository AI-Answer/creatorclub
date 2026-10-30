import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listSkills, oneLine, withSkills } from './skills.js';
import { matchSkills, slashQuery, slashSkill } from '../../shared/skills.js';

const home = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-skills-'));
after(() => rm(home, { recursive: true, force: true }));
const root = path.join(home, '.claude', 'skills');
async function skill(name: string, text: string) {
  await mkdir(path.join(root, name), { recursive: true });
  await writeFile(path.join(root, name, 'SKILL.md'), text);
}
await skill('write-hook', '---\nname: write-hook\ndescription: Create or improve opening hooks. Use when a user asks for a hook.\n---\n\n# Hook\nMake it short.');
await skill('folded', '---\nname: folded\ndescription: >\n  Review a plan against the playbook\n  and list gaps. More after.\n---\nBody');
await mkdir(path.join(root, 'empty-folder'), { recursive: true });

test('lists installed skills with a one-line description and skips folders without a SKILL.md', async () => {
  assert.deepEqual(await listSkills(home), [
    { name: 'folded', description: 'Review a plan against the playbook and list gaps.' },
    { name: 'write-hook', description: 'Create or improve opening hooks.' },
  ]);
  assert.deepEqual(await listSkills(path.join(home, 'nowhere')), []);
});

test('oneLine cuts long text and survives a missing description', () => {
  assert.equal(oneLine('---\nname: x\n---\n'), '');
  assert.ok(oneLine(`---\ndescription: ${'a'.repeat(300)}\n---`).length <= 120);
});

test('the picker opens only for a slash and a few letters, and filters by name then description', () => {
  assert.equal(slashQuery('/'), '');
  assert.equal(slashQuery('/Wri'), 'wri');
  assert.equal(slashQuery('/write-hook now'), undefined);
  assert.equal(slashQuery('hello'), undefined);
  const list = [{ name: 'write-hook', description: 'Hooks.' }, { name: 'review', description: 'Check a write-up.' }];
  assert.deepEqual(matchSkills(list, 'wri').map((s) => s.name), ['write-hook', 'review']);
  assert.equal(slashSkill('/write-hook make it punchy'), 'write-hook');
  assert.equal(slashSkill('write /hook'), undefined);
});

test('a slash message adds that skill to the system prompt; a name that climbs out of the folder adds nothing', async () => {
  const system = await withSkills('base', '/folded check my plan', home);
  assert.match(system ?? '', /## Skill: folded\nBody/);
  assert.equal(await withSkills('base', '/../../etc/passwd', home), 'base');
  assert.equal(await withSkills('base', '/missing hi', home), 'base');
});
