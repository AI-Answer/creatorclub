import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {copyMethodology} from './methodology-copy.mjs';
// Creator Compiler prompt files sit next to the bundled server (see methodologyDirs in server/club/prompts.ts). Missing files stop the build first.
await copyMethodology({from:'../../methodology',to:'server-dist/methodology'});
// The skills that come with the app (server/club/skills.ts bundledSkillsDir), offered on Edit like the creator's own.
await (await import('node:fs/promises')).cp('skills','server-dist/skills',{recursive:true});
await build({entryPoints:['server/index.ts','server/mcp.ts'],outdir:'server-dist',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',target:'node24',format:'esm',packages:'bundle',external:['electron','@resvg/resvg-js'],banner:{js:'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);'},sourcemap:true});
await mkdir('server-dist',{recursive:true});
// The desktop app's self-update library (desktop/updater.cjs loads it): the packaged app ships no node_modules.
await build({entryPoints:['node_modules/electron-updater/out/main.js'],outfile:'server-dist/electron-updater.cjs',bundle:true,platform:'node',target:'node24',format:'cjs',external:['electron'],logLevel:'warning'});
for(const file of ['media-text.swift','vision-helper.swift'])await copyFile('server/'+file,'server-dist/'+file);
await copyFile('desktop/mcp-entry.mjs','server-dist/mcp-entry.mjs');
// Motion blocks render with Inter (server/motion-render.ts reads it next to the bundle).
await copyFile('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2','server-dist/inter-latin-wght-normal.woff2');
await copyFile('node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2','server-dist/instrument-serif-latin-400-normal.woff2');
if(process.platform==='darwin')for(const [source,binary] of [['media-text.swift','sceneforge-text-renderer'],['vision-helper.swift','sceneforge-vision']])await promisify(execFile)('swiftc',['-O','-target',`${process.arch==='arm64'?'arm64':'x86_64'}-apple-macos14.0`,'server/'+source,'-o','server-dist/'+binary]);
if(process.platform==='darwin')await promisify(execFile)('swiftc',['-O','-target',`${process.arch==='arm64'?'arm64':'x86_64'}-apple-macos14.0`,'desktop/native-recording.swift','-o','server-dist/sceneforge-screen-recorder']);
if(process.platform==='darwin')await promisify(execFile)('swiftc',['-O','-target',`${process.arch==='arm64'?'arm64':'x86_64'}-apple-macos14.0`,'desktop/settings-window.swift','-o','server-dist/sceneforge-settings-window']);
// The island's voice follower; its embedded Info.plist carries the speech and microphone usage text macOS asks for.
if(process.platform==='darwin')await promisify(execFile)('swiftc',['-O','-target',`${process.arch==='arm64'?'arm64':'x86_64'}-apple-macos14.0`,'desktop/speech-follower.swift','-Xlinker','-sectcreate','-Xlinker','__TEXT','-Xlinker','__info_plist','-Xlinker','desktop/speech-follower-info.plist','-o','server-dist/sceneforge-speech-follower']);
