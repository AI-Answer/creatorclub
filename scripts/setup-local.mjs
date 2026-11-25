// `npm run setup:local`: your own copy of Creator Compiler, built from this checkout and installed next to the downloaded app.
// It checks the tools a build needs and says how to install any that are missing (it never installs system tools itself),
// installs dependencies, builds Cutroom, the interface and the local service, stages the bundled media tools, and installs
// "Creator Compiler (Local)": ~/Applications on a Mac, %LOCALAPPDATA%\Programs on Windows. That app keeps its own data folder,
// projects folder and port, and never updates itself from the published releases. Run it again after a change or a git pull.
//   --check   only check the tools
//   --open    open the app when it is installed
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {cp,mkdir,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const LOCAL_APP='Creator Compiler (Local)';
export const LOCAL_BUNDLE_ID='com.aianswer.creatorcompiler.local';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(root,'recorder/app');
const mac=process.platform==='darwin',windows=process.platform==='win32';

const quiet=(command,args)=>{const r=spawnSync(command,args,{encoding:'utf8'});return r.status===0?(r.stdout||r.stderr||'').trim():null;};
// npm's own script, so npm runs through this Node without a shell (npm.cmd on Windows needs one).
const npmCli=process.env.npm_execpath||[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),path.join(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(file=>existsSync(file));

/** Each tool a build needs, whether it is here, and how to get it. `optional` ones are reported but never stop the build. */
export function prerequisites({platform=process.platform,nodeVersion=process.versions.node,probe=quiet,npm=Boolean(npmCli)}={}){
 const checks=[];
 const major=Number(nodeVersion.split('.')[0]);
 checks.push({name:'Node.js 24',ok:major===24,found:`Node.js ${nodeVersion}`,fix:'Install Node.js 24 from https://nodejs.org (or `nvm install 24 && nvm use 24`, or `fnm use 24`).'});
 checks.push({name:'npm',ok:npm,fix:'npm comes with Node.js; reinstall Node.js 24.'});
 checks.push({name:'git',ok:Boolean(probe('git',['--version'])),fix:platform==='darwin'?'Run `xcode-select --install`.':'Install Git from https://git-scm.com/download/win.'});
 checks.push({name:'Rust (cargo)',ok:Boolean(probe('cargo',['--version'])),fix:'Install Rust from https://rustup.rs, then open a new terminal.'});
 checks.push({name:'CMake',ok:Boolean(probe('cmake',['--version'])),fix:platform==='darwin'?'Run `brew install cmake` (Homebrew: https://brew.sh), or install it from https://cmake.org/download.':'Install CMake from https://cmake.org/download (or `winget install Kitware.CMake`).'});
 if(platform==='darwin'){
  checks.push({name:'Xcode Command Line Tools',ok:Boolean(probe('xcode-select',['-p']))&&Boolean(probe('swiftc',['--version'])),fix:'Run `xcode-select --install`.'});
 }else if(platform==='win32'){
  const vswhere=path.join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Microsoft Visual Studio','Installer','vswhere.exe');
  const vs=existsSync(vswhere)&&probe(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath']);
  checks.push({name:'Visual Studio Build Tools (C++)',ok:Boolean(vs),fix:'Install Visual Studio Build Tools with "Desktop development with C++": https://visualstudio.microsoft.com/visual-cpp-build-tools/ (or `winget install Microsoft.VisualStudio.2022.BuildTools`).'});
 }
 checks.push({name:'FFmpeg',optional:true,ok:Boolean(probe('ffmpeg',['-version'])),fix:'Optional: the app bundles its own FFmpeg. `brew install ffmpeg` / `winget install Gyan.FFmpeg` only helps scripts you run yourself.'});
 return checks;
}

/** The installed app's folder. */
export function localAppTarget({platform=process.platform,home=os.homedir(),env=process.env}={}){
 if(platform==='darwin')return path.join(env.CREATORCLUB_LOCAL_APP_DIR||path.join(home,'Applications'),`${LOCAL_APP}.app`);
 if(platform==='win32')return path.join(env.CREATORCLUB_LOCAL_APP_DIR||path.join(env.LOCALAPPDATA||path.join(home,'AppData','Local'),'Programs'),LOCAL_APP);
 throw Error('Creator Compiler builds for macOS and Windows.');
}

/** An existing app is replaced only when it is a Creator Compiler (Local) build. */
export async function assertLocalBuild(target,platform=process.platform){
 if(!existsSync(target))return;
 const marker=platform==='darwin'?path.join(target,'Contents/Info.plist'):path.join(target,'resources/app/package.json');
 let text='';try{text=await readFile(marker,'utf8');}catch{/* Not an app. */}
 if(!text.includes(platform==='darwin'?LOCAL_BUNDLE_ID:'"creatorCompilerEdition":"local"'))throw Error(`${target} is not a Creator Compiler (Local) build. Move it aside yourself; setup:local will not replace it.`);
}

function step(title,command,args,options={}){
 console.log(`\n== ${title}`);
 const r=spawnSync(command,args,{cwd:root,stdio:'inherit',...options});
 if(r.error)throw r.error;
 if(r.status!==0){console.error(`\n${title} failed (exit ${r.status}). Fix the error above, then run npm run setup:local again.`);process.exit(r.status||1);}
}
const npm=(title,args,options)=>step(title,process.execPath,[npmCli,...args],options);

async function main(){
 const args=new Set(process.argv.slice(2));
 if(!mac&&!windows)throw Error('Creator Compiler builds for macOS (Apple Silicon) and Windows x64.');
 console.log('Checking the tools Creator Compiler needs to build…');
 const checks=prerequisites();
 for(const check of checks)console.log(`  ${check.ok?'ok     ':check.optional?'not set':'MISSING'}  ${check.name}${check.found&&!check.ok?` (found ${check.found})`:''}`);
 const missing=checks.filter(check=>!check.ok&&!check.optional);
 if(missing.length){
  console.error('\nInstall these, then run npm run setup:local again:');
  for(const check of missing)console.error(`  - ${check.name}: ${check.fix}`);
  process.exit(1);
 }
 for(const check of checks.filter(check=>!check.ok&&check.optional))console.log(`  ${check.fix}`);
 if(args.has('--check'))return;

 // Dependencies are installed again only when the lockfile changed (after a git pull, say).
 const lock=createHash('sha256').update(readFileSync(path.join(app,'package-lock.json'))).digest('hex'),stamp=path.join(app,'node_modules/.setup-local-lock');
 if(!existsSync(stamp)||readFileSync(stamp,'utf8')!==lock){npm('Installing dependencies',['ci','--prefix','recorder/app']);writeFileSync(stamp,lock);}
 else console.log('\n== Dependencies are up to date');
 step('Building Cutroom, the Rust editing engine',process.platform==='win32'?'cargo.exe':'cargo',['build','--release','--locked','--manifest-path','engine/cutroom/Cargo.toml']);
 npm('Staging FFmpeg, FFprobe, Cutroom and Whisper for the app',['run','runtime:desktop']);
 npm('Building the interface and the local service',['run','build']);

 const env={...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'};
 delete env.CREATORCLUB_SIGN_SHA1;
 if(mac){
  // A real certificate keeps camera, microphone and screen permissions across rebuilds; without one the build is ad-hoc signed.
  const {devSigningIdentity}=await import(pathToFileURL(path.join(app,'scripts/dev-app.mjs')).href);
  const identity=await devSigningIdentity({root:app});
  if(/^[A-F\d]{40}$/i.test(identity))env.CREATORCLUB_SIGN_SHA1=identity.toUpperCase();
  console.log(`\n${env.CREATORCLUB_SIGN_SHA1?`Signing with certificate ${env.CREATORCLUB_SIGN_SHA1}.`:'No signing certificate found: ad-hoc signing (macOS asks for camera and screen permissions again after each rebuild).'}`);
 }
 const output=path.join(root,'release/local');
 await rm(output,{recursive:true,force:true});
 step(`Packaging ${LOCAL_APP}`,process.execPath,['node_modules/electron-builder/cli.js','--config','electron-builder.local.cjs','--dir','--publish','never'],{cwd:app,env});

 const target=localAppTarget();
 const built=mac?path.join(output,process.arch==='arm64'?'mac-arm64':'mac','Creator Compiler.app'):path.join(output,'win-unpacked');
 if(!existsSync(built))throw Error(`The packaged app is missing: ${built}`);
 await assertLocalBuild(target);
 console.log(`\n== Installing ${target}`);
 if(mac){
  // A running copy is asked to quit first, so the new build replaces it cleanly.
  spawnSync('osascript',['-e',`if application id "${LOCAL_BUNDLE_ID}" is running then tell application id "${LOCAL_BUNDLE_ID}" to quit`],{stdio:'ignore'});
  await rm(target,{recursive:true,force:true});
  await mkdir(path.dirname(target),{recursive:true});
  step('Copying the app',"/usr/bin/ditto",[built,target]);
  spawnSync('/usr/bin/codesign',['--verify','--deep','--strict',target],{stdio:'inherit'});
 }else{
  spawnSync('taskkill',['/IM','Creator Compiler.exe','/FI',`WINDOWTITLE eq ${LOCAL_APP}*`],{stdio:'ignore'});
  await rm(target,{recursive:true,force:true});
  await mkdir(path.dirname(target),{recursive:true});
  await cp(built,target,{recursive:true});
  const exe=path.join(target,'Creator Compiler.exe'),shortcut=path.join(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming'),'Microsoft','Windows','Start Menu','Programs',`${LOCAL_APP}.lnk`);
  const ps=`$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${shortcut.replaceAll("'","''")}');$s.TargetPath='${exe.replaceAll("'","''")}';$s.WorkingDirectory='${target.replaceAll("'","''")}';$s.Save()`;
  spawnSync('powershell',['-NoProfile','-Command',ps],{stdio:'inherit'});
 }
 if(args.has('--open'))spawnSync(mac?'open':'cmd',mac?[target]:['/c','start','',path.join(target,'Creator Compiler.exe')],{stdio:'ignore'});

 const data=mac?`~/Library/Application Support/${LOCAL_APP}`:`%APPDATA%\\${LOCAL_APP}`;
 console.log(`
${LOCAL_APP} is installed: ${target}
Open it from ${mac?'Launchpad, Spotlight or ~/Applications (drag it to the Dock to keep it there)':'the Start menu'}.
It keeps its own recordings (${data}) and projects (~/Documents/${LOCAL_APP}), and it never replaces or updates the downloaded app.

Make a change:
  npm run dev              live interface edits at http://127.0.0.1:4183 (code in recorder/app/src, service in recorder/app/server)
  npm run desktop          the desktop shell on this checkout, with its own test data
  npm test                 the editor and service tests
  npm run setup:local      rebuild and reinstall ${LOCAL_APP} with your changes (also after git pull)
`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
