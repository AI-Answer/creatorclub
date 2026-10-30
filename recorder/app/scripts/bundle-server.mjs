import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {copyMethodology} from './methodology-copy.mjs';
// CreatorClub prompt files sit next to the bundled server (see methodologyDirs in server/club/prompts.ts). Missing files stop the build first.
await copyMethodology({from:'../../methodology',to:'server-dist/methodology'});
await build({entryPoints:['server/index.ts','server/mcp.ts'],outdir:'server-dist',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',target:'node24',format:'esm',packages:'bundle',external:['electron'],banner:{js:'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);'},sourcemap:true});
await mkdir('server-dist',{recursive:true});
for(const file of ['media-text.swift','vision-helper.swift'])await copyFile('server/'+file,'server-dist/'+file);
await copyFile('desktop/mcp-entry.mjs','server-dist/mcp-entry.mjs');
// Motion blocks render with Inter (server/motion-render.ts reads it next to the bundle).
await copyFile('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2','server-dist/inter-latin-wght-normal.woff2');
if(process.platform==='darwin')for(const [source,binary] of [['media-text.swift','sceneforge-text-renderer'],['vision-helper.swift','sceneforge-vision']])await promisify(execFile)('swiftc',['-O','-target','arm64-apple-macos14.0','server/'+source,'-o','server-dist/'+binary]);
if(process.platform==='darwin')await promisify(execFile)('swiftc',['-O','-target','arm64-apple-macos14.0','desktop/native-recording.swift','-o','server-dist/sceneforge-screen-recorder']);
