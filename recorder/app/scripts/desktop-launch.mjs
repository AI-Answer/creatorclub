// `npm run desktop`: the desktop shell on this source tree, with its own studio and channels under .local/.
// On a Mac it runs inside `.local/Creator Compiler Dev.app`, a renamed copy of the local Electron.app (scripts/dev-app.mjs), so the
// Dock and menu bar say Creator Compiler with its icon instead of Electron's. It is still started from this terminal, as before, so
// logs stay here and macOS privacy prompts work as they always have. The copy is rebuilt only when Electron, the icon or the signing
// identity changes; CREATORCLUB_PLAIN_ELECTRON=1 runs the stock Electron.app instead.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env={...process.env,SCENEFORGE_DATA_DIR:process.env.SCENEFORGE_DATA_DIR||path.join(root,'.local/studio'),CREATORCLUB_DIR:process.env.CREATORCLUB_DIR||path.join(root,'.local/channels')};
delete env.ELECTRON_RUN_AS_NODE;

/** The Electron executable to start: the stock one, or on a Mac the one inside the Creator Compiler Dev bundle. */
async function electronBinary(){
 const stock=createRequire(import.meta.url)('electron');
 if(process.platform!=='darwin'||process.env.CREATORCLUB_PLAIN_ELECTRON==='1')return stock;
 try{
  const {buildDevBundle,devSigningIdentity}=await import('./dev-app.mjs');
  const target=path.join(root,'.local/Creator Compiler Dev.app'),stampFile=path.join(root,'.local/dev-bundle.json');
  const identity=await devSigningIdentity({root});
  const stamp=JSON.stringify({format:1,electron:JSON.parse(await readFile(path.join(root,'node_modules/electron/package.json'),'utf8')).version,
   icon:createHash('sha256').update(await readFile(path.join(root,'assets/icon.icns'))).digest('hex'),identity});
  const binary=path.join(target,'Contents/MacOS/Electron');
  let current=null;try{current=await readFile(stampFile,'utf8');}catch{/* Not built yet. */}
  if(current!==stamp||!existsSync(binary)){
   console.log('Preparing Creator Compiler Dev.app (once per Electron version)…');
   await buildDevBundle({root,target,identity});
   await writeFile(stampFile,stamp);
  }
  return binary;
 }catch(error){
  console.warn(`Could not prepare Creator Compiler Dev.app (${error.message}); using Electron.app.`);
  return stock;
 }
}

const child=spawn(await electronBinary(),['desktop/main.cjs'],{cwd:root,env,stdio:'inherit'});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code||0));
