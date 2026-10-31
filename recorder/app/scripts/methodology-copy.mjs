import {access,cp} from 'node:fs/promises';
import path from 'node:path';

/** The files the server reads from methodology/ (see server/club/prompts.ts). A packaged app without them cannot run any AI step. */
export const METHODOLOGY_FILES = ['breakdown.md','breakdown.schema.json','expand.md','outline.md','outline.schema.json','companion.md','research-companion.md','package.md','package.schema.json','revise.md','scene-script.md','script.md','voice.md','ref/hook-library.md','ref/cta-permutations.md'];

/** Copies the prompt files next to the bundled server. Throws when any of them is missing, so a package never ships without them. */
export async function copyMethodology({from, to}) {
  const missing = [];
  for (const file of METHODOLOGY_FILES) await access(path.join(from, file)).catch(() => missing.push(file));
  if (missing.length) throw Error(`Missing methodology files in ${from}: ${missing.join(', ')}. The bundled server needs them to write AI prompts.`);
  await cp(from, to, { recursive: true });
}
