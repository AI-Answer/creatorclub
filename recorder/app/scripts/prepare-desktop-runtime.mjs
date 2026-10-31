import {createRequire} from 'node:module';
import {cp,mkdir,chmod,writeFile,access,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bin=path.join(app,'runtime/bin'),suffix=process.platform==='win32'?'.exe':'';
await mkdir(bin,{recursive:true});
const binaries={ffmpeg:require('ffmpeg-static'),ffprobe:require('@ffprobe-installer/ffprobe').path,cutroom:path.resolve(app,'../../engine/cutroom/target/release/cutroom'+suffix)};
const files=[];
for(const [name,source] of Object.entries(binaries)){
 await access(source).catch(()=>{throw Error(`Missing ${name}: ${source}. Run npm run setup first.`);});
 const target=path.join(bin,name+suffix);await cp(source,target);if(process.platform!=='win32')await chmod(target,0o755);
 files.push({name,file:name+suffix,sha256:createHash('sha256').update(await readFile(target)).digest('hex')});
}
await cp(path.resolve(app,'../../engine/cutroom/crates/gfx/assets/fonts'),path.join(app,'runtime/fonts'),{recursive:true});
await mkdir(path.join(app,'runtime/licenses'),{recursive:true});
for(const [pkg,name] of [['ffmpeg-static','ffmpeg-static'],['@ffprobe-installer/ffprobe','ffprobe-installer']]){
 const dir=path.dirname(require.resolve(pkg+'/package.json'));
 for(const license of ['LICENSE','LICENSE.txt','LICENSE.md']){try{await cp(path.join(dir,license),path.join(app,'runtime/licenses',name+'-'+license));}catch{}}
}
await cp(path.resolve(app,'../../engine/cutroom/LICENSE'),path.join(app,'runtime/licenses/Cutroom-LICENSE'));
await writeFile(path.join(app,'runtime/manifest.json'),JSON.stringify({platform:process.platform,arch:process.arch,files,source:'https://github.com/AI-Answer/cutroom'},null,2));
await writeFile(path.join(app,'runtime/THIRD-PARTY-NOTICES.txt'),'Cutroom: MIT; source in engine/cutroom. Inter and JetBrains Mono: SIL OFL; see fonts/. FFmpeg is a separate GPL executable provided by ffmpeg-static; see https://github.com/eugeneware/ffmpeg-static for the exact build and corresponding source. FFprobe is supplied by @ffprobe-installer/ffprobe; see https://github.com/SavageCore/node-ffprobe-installer. Electron and Chromium notices accompany the desktop runtime.\n');
console.log(`Prepared ${process.platform}/${process.arch}: FFmpeg, FFprobe, Cutroom, and fonts.`);
