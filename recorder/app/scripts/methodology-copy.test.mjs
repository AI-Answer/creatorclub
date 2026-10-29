import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {copyMethodology,METHODOLOGY_FILES} from './methodology-copy.mjs';

test('the bundle gets every methodology file, and a missing one fails loudly', async () => {
 const dir = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-methodology-'));
 try {
  const from = path.join(dir, 'methodology'), to = path.join(dir, 'server-dist/methodology');
  await mkdir(path.join(from, 'ref'), { recursive: true });
  for (const file of METHODOLOGY_FILES) await writeFile(path.join(from, file), `${file}\n`);
  await copyMethodology({ from, to });
  for (const file of METHODOLOGY_FILES) assert.equal(await readFile(path.join(to, file), 'utf8'), `${file}\n`);
  await rm(path.join(from, 'ref/cta-permutations.md'));
  await assert.rejects(copyMethodology({ from, to: path.join(dir, 'second') }), /Missing methodology files.*ref\/cta-permutations\.md/);
  await assert.rejects(copyMethodology({ from: path.join(dir, 'absent'), to: path.join(dir, 'third') }), /Missing methodology files/);
 } finally {
  await rm(dir, { recursive: true, force: true });
 }
});
