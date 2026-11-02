import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const files=[path.join(here,'index.ts'),...fs.readdirSync(path.join(here,'club')).filter(name=>name.endsWith('.ts')&&!name.endsWith('.test.ts')).map(name=>path.join(here,'club',name))];

test('every file served from app data allows dot-folders, since the dev app keeps its data in .local', () => {
  const found: string[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!line.includes('sendFile(')) return;
      // The built page itself (dist/index.html) is never under a dot-folder.
      if (line.includes("'index.html'")) return;
      if (!/dotfiles\s*:\s*'allow'/.test(line)) found.push(`${path.relative(here, file)}:${index + 1}`);
    });
  }
  assert.deepEqual(found, [], 'pass { dotfiles: "allow" } to sendFile, or the dev app answers 404 for its own media');
});
