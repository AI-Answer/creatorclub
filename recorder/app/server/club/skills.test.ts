import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findPreviews, listSkills, oneLine, previewFile, withPlayer, withSkills } from './skills.js';
import { featuredSkills, matchSkills, slashQuery, slashSkill } from '../../shared/skills.js';

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
    { name: 'folded', description: 'Review a plan against the playbook and list gaps.', previews: [] },
    { name: 'write-hook', description: 'Create or improve opening hooks.', previews: [] },
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
  const list = [{ name: 'write-hook', description: 'Hooks.', previews: [] }, { name: 'review', description: 'Check a write-up.', previews: [] }];
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

test('previews: a file called preview first, then samples; only allowed kinds; none outside the skill', async () => {
  await skill('motion', '---\nname: motion\ndescription: Motion graphics.\n---\nBody');
  await mkdir(path.join(root, 'motion', 'samples'), { recursive: true });
  await mkdir(path.join(root, 'motion', 'node_modules'), { recursive: true });
  await writeFile(path.join(root, 'motion', 'samples', 'orbit.html'), '<p>orbit</p>');
  await writeFile(path.join(root, 'motion', 'preview.gif'), 'GIF89a');
  await writeFile(path.join(root, 'motion', 'notes.md'), 'x');
  await writeFile(path.join(root, 'motion', 'node_modules', 'junk.html'), 'x');
  await mkdir(path.join(root, 'motion', 'headshots'), { recursive: true });
  await writeFile(path.join(root, 'motion', 'headshots', 'me.jpg'), 'x');
  await writeFile(path.join(root, 'motion', 'logo.png'), 'x');
  assert.deepEqual(await findPreviews(path.join(root, 'motion')), ['preview.gif', 'samples/orbit.html']);
  assert.equal((await listSkills(home)).find((s) => s.name === 'motion')?.previews.length, 2);
  assert.ok(await previewFile('motion', 'samples/orbit.html', home));
  assert.equal(await previewFile('motion', '../write-hook/SKILL.md', home), undefined);
  assert.equal(await previewFile('motion', 'notes.md', home), undefined);
  assert.equal(await previewFile('../motion', 'preview.gif', home), undefined);
});

test('a preview page is served with a player that loops its timelines and reports its size', () => {
  const out = withPlayer('<html><body><div id="root"></div></body></html>');
  assert.match(out, /__timelines/);
  assert.match(out, /skillPreviewSize/);
  assert.ok(out.indexOf('<script>') < out.indexOf('</body>'));
  assert.match(withPlayer('<p>no body tag</p>'), /<p>no body tag<\/p><script>/);
});

test('the "/" list starts with the few featured skills that are installed, in a fixed order', () => {
  const all = ['zeta', 'write-cta', 'reel-editor', 'write-hook', 'alpha'].map((name) => ({ name, description: '', previews: [] }));
  assert.deepEqual(featuredSkills(all).map((s) => s.name), ['write-hook', 'write-cta', 'reel-editor']);
  assert.deepEqual(featuredSkills([]), []);
});
