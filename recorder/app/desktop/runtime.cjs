const path=require('node:path');
const fs=require('node:fs');
/**
 * The CreatorClub desktop app's own identity, so it runs next to a SceneForge app on the same Mac: its own name,
 * user-data folder (and with it its own single-instance lock), its own SceneForge data folder and its own service port.
 * SceneForge's standalone defaults (port 4174, ~/Library/Application Support/SceneForge) stay with the standalone server.
 */
const CREATORCLUB=Object.freeze({name:'CreatorClub',port:4184});
/** The name macOS lists in Privacy & Security: the app bundle that runs this process ("CreatorClub Dev", "CreatorClub"), else CreatorClub. */
const privacyAppName=(execPath=process.execPath)=>/([^/]+)\.app\/Contents\/MacOS\/[^/]+$/.exec(execPath)?.[1]||CREATORCLUB.name;
function creatorClubPaths({appData,env=process.env}){
 const userData=path.join(appData,CREATORCLUB.name);
 return {userData,studio:env.SCENEFORGE_DATA_DIR||path.join(userData,'studio')};
}
/** True only for this app's own service (its /api/ready or /api/health answer), never a SceneForge one. */
const isCreatorClubService=health=>Boolean(health&&health.application==='SceneForge'&&health.product===CREATORCLUB.name&&health.version==='0.1.0');
/**
 * The CreatorClub prompt files: CREATORCLUB_METHODOLOGY_DIR, else `methodology/` at the repo root (the app run from
 * source or the dev app), else the copy bundled next to the server (a packaged app). Undefined when none has the files.
 */
function methodologyDir({root,env=process.env}){
 if(env.CREATORCLUB_METHODOLOGY_DIR)return env.CREATORCLUB_METHODOLOGY_DIR;
 return [path.resolve(root,'../../methodology'),path.join(root,'server-dist','methodology')].find(dir=>fs.existsSync(path.join(dir,'package.md')));
}
function runtimeEnvironment({root,data,port,env=process.env}){
 const runtime=path.join(root,'runtime'),bin=path.join(runtime,'bin');
 const model=path.join(runtime,'models','ggml-base.en.bin');
 const launcher=path.resolve(root,'../../MacOS/sceneforge-mcp');
 const methodology=methodologyDir({root,env});
 return {...env,SCENEFORGE_DATA_DIR:data,SCENEFORGE_PORT:String(port),
  PATH:[bin,env.PATH||'','/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin'].filter(Boolean).join(path.delimiter),
  ...(fs.existsSync(model)?{SCENEFORGE_DEFAULT_MODEL:model,SCENEFORGE_WHISPER_MODEL:env.SCENEFORGE_WHISPER_MODEL||model}:{}),
  ...(fs.existsSync(launcher)?{SCENEFORGE_MCP_COMMAND:launcher}:{}),
  ...(fs.existsSync(path.join(bin,'ffmpeg'))&&!env.SCENEFORGE_FFMPEG?{SCENEFORGE_FFMPEG:path.join(bin,'ffmpeg')}:{}),
  ...(fs.existsSync(path.join(bin,'ffprobe'))&&!env.SCENEFORGE_FFPROBE?{SCENEFORGE_FFPROBE:path.join(bin,'ffprobe')}:{}),
  ...(methodology?{CREATORCLUB_METHODOLOGY_DIR:methodology}:{}),
 };
}
module.exports={CREATORCLUB,creatorClubPaths,privacyAppName,isCreatorClubService,methodologyDir,runtimeEnvironment};
