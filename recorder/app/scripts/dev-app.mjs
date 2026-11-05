// Builds `~/Applications/Creator Compiler Dev.app` (folder override: CREATORCLUB_DEV_APP_DIR): the local Electron runtime with its own name, icon and
// bundle identifier, running this source tree. It never touches SceneForge Dev.app: the target name is fixed, and an existing bundle is replaced
// only when it is a Creator Compiler dev bundle. macOS keys camera, microphone and screen permissions to the signing identity, so sign it with a
// persistent certificate (CREATORCLUB_DEV_SIGN_IDENTITY, or SCENEFORGE_DEV_SIGN_IDENTITY) to keep grants across rebuilds; ad-hoc signing works
// but macOS asks again after every rebuild.
import {execFileSync} from 'node:child_process';
import {cp,rm,mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const DEV_APP_NAME='Creator Compiler Dev.app';
export const DEV_BUNDLE_ID='com.aianswer.creatorcompiler.dev';

/** The one path this script may create, replace or remove: `Creator Compiler Dev.app` in the chosen folder. */
export function resolveDevAppTarget({env=process.env,home=os.homedir()}={}){
 const dir=path.resolve(env.CREATORCLUB_DEV_APP_DIR||env.SCENEFORGE_DEV_APP_DIR||path.join(home,'Applications'));
 const target=path.join(dir,DEV_APP_NAME);
 if(path.basename(target)!==DEV_APP_NAME||/sceneforge/i.test(target))throw Error('Refusing to build anywhere but Creator Compiler Dev.app.');
 return target;
}

/** An existing bundle at the target is replaced only when it is a Creator Compiler dev build. */
export async function assertReplaceable(target){
 let plist;
 try{plist=await readFile(path.join(target,'Contents/Info.plist'),'utf8');}catch(error){if(error.code==='ENOENT')return;throw error;}
 if(!plist.includes(`<string>${DEV_BUNDLE_ID}</string>`))throw Error(`${target} is not a Creator Compiler dev app. Move it aside yourself; this script will not replace it.`);
}

async function main(){
 if(process.platform!=='darwin')throw Error('The development app bundle is macOS only.');
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const source=path.join(root,'node_modules/electron/dist/Electron.app');
 const target=resolveDevAppTarget();
 const plist=path.join(target,'Contents/Info.plist');
 const identity=process.env.CREATORCLUB_DEV_SIGN_IDENTITY||process.env.SCENEFORGE_DEV_SIGN_IDENTITY||'-';
 const run=(command,args)=>execFileSync(command,args,{stdio:['ignore','pipe','inherit']}).toString().trim();
 const set=(key,value)=>run('plutil',['-replace',key,'-string',value,plist]);

 await assertReplaceable(target);
 await rm(target,{recursive:true,force:true});
 await mkdir(path.dirname(target),{recursive:true});
 await cp(source,target,{recursive:true,verbatimSymlinks:true});
 set('CFBundleName','Creator Compiler Dev');
 set('CFBundleDisplayName','Creator Compiler Dev');
 set('CFBundleIdentifier',DEV_BUNDLE_ID);
 set('CFBundleIconFile','creatorclub.icns');
 set('NSCameraUsageDescription','Creator Compiler records your camera for the scenes you film.');
 set('NSMicrophoneUsageDescription','Creator Compiler records your microphone for the scenes you film.');
 set('NSSpeechRecognitionUsageDescription','Creator Compiler follows your voice to scroll the script while you record.');
 await copyFile(path.join(root,'assets/icon.icns'),path.join(target,'Contents/Resources/creatorclub.icns'));
 // Electron loads Resources/app before its default app. A stub that requires the source entry runs the live tree and keeps the bundle sealed (no symlink out of the bundle).
 const stub=path.join(target,'Contents/Resources/app'),{version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 await mkdir(stub);
 await writeFile(path.join(stub,'package.json'),JSON.stringify({name:'creatorclub',productName:'Creator Compiler',version,main:'main.cjs'})+'\n');
 await writeFile(path.join(stub,'main.cjs'),`require(${JSON.stringify(path.join(root,'desktop/main.cjs'))});\n`);
 run('codesign',['--force','--deep','--sign',identity,target]);
 run('codesign',['--verify','--deep','--strict',target]);
 console.log(`Built ${target} (${identity==='-'?'ad-hoc signed: macOS will ask for permissions again after each rebuild':`signed with ${identity}`}).`);
 if(process.argv.includes('--open'))run('open',['-n',target,'--args','--force-renderer-accessibility']);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
