const path=require('node:path');
const fs=require('node:fs');
/**
 * The CreatorClub desktop app's own identity, so it runs next to a SceneForge app on the same Mac: its own name,
 * user-data folder (and with it its own single-instance lock), its own SceneForge data folder and its own service port.
 * SceneForge's standalone defaults (port 4174, ~/Library/Application Support/SceneForge) stay with the standalone server.
 * `name` is what people see. `dataFolder` and `service` keep the app's earlier name: the folder holds every installed
 * copy's recordings (the MCP launcher finds it by that name too), and `service` is the handshake its local service answers.
 */
const CREATORCLUB=Object.freeze({name:'CreatorClub',dataFolder:'Creator Compiler',service:'Creator Compiler',port:4194});
/** The name macOS lists in Privacy & Security: the app bundle that runs this process ("CreatorClub Dev", "CreatorClub"), else CreatorClub. */
const privacyAppName=(execPath=process.execPath)=>/([^/]+)\.app\/Contents\/MacOS\/[^/]+$/.exec(execPath)?.[1]||CREATORCLUB.name;
function creatorClubPaths({appData,env=process.env,developmentRoot}){
 const userData=developmentRoot?path.join(developmentRoot,'.local','desktop-user-data'):path.join(appData,CREATORCLUB.dataFolder);
 return {userData,studio:env.SCENEFORGE_DATA_DIR||(developmentRoot?path.join(developmentRoot,'.local','studio'):path.join(userData,'studio')),models:path.join(userData,'models')};
}
/** True only for this app's own service (its /api/ready or /api/health answer), never a SceneForge one. */
const isCreatorClubService=health=>Boolean(health&&health.application===CREATORCLUB.service&&health.product===CREATORCLUB.service&&health.version==='0.1.0');
/**
 * The Creator Compiler prompt files: CREATORCLUB_METHODOLOGY_DIR, else `methodology/` at the repo root (the app run from
 * source or the dev app), else the copy bundled next to the server (a packaged app). Undefined when none has the files.
 */
function methodologyDir({root,env=process.env}){
 if(env.CREATORCLUB_METHODOLOGY_DIR)return env.CREATORCLUB_METHODOLOGY_DIR;
 return [path.resolve(root,'../../methodology'),path.join(root,'server-dist','methodology')].find(dir=>fs.existsSync(path.join(dir,'package.md')));
}
/**
 * The Whisper model that finds pauses and filler words: the one bundled in the packaged app, else a `ggml-*.bin` in the app's own `models`
 * folder (the dev app has none bundled; a person drops one there). Voice-activity models (`silero`) are not speech models.
 */
function whisperModel({bundled,modelsDir}){
 if(fs.existsSync(bundled))return bundled;
 try{const found=fs.readdirSync(modelsDir).filter(name=>/^ggml-.+\.bin$/.test(name)&&!/silero/i.test(name)).sort();if(found.length)return path.join(modelsDir,found[0]);}catch{/* No models folder. */}
 return undefined;
}
function runtimeEnvironment({root,data,port,modelsDir,env=process.env}){
 const runtime=env.CREATOR_COMPILER_RUNTIME_DIR||(fs.existsSync(path.join(root,'../runtime/bin'))?path.resolve(root,'../runtime'):path.join(root,'runtime')),bin=path.join(runtime,'bin'),suffix=process.platform==='win32'?'.exe':'';
 const model=whisperModel({bundled:path.join(runtime,'models','ggml-base.en.bin'),modelsDir:modelsDir||path.join(runtime,'models')});
 const launcher=process.platform==='win32'?path.resolve(root,'../../creator-compiler-mcp.exe'):path.resolve(root,'../../MacOS/sceneforge-mcp');
 const methodology=methodologyDir({root,env});
 return {...env,CREATOR_COMPILER_RUNTIME_DIR:runtime,SCENEFORGE_DATA_DIR:data,SCENEFORGE_PORT:String(port),
  PATH:[bin,env.PATH||'','/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin'].filter(Boolean).join(path.delimiter),
  ...(fs.existsSync(path.join(bin,'cutroom'+suffix))?{CREATOR_COMPILER_CUTROOM:path.join(bin,'cutroom'+suffix)}:{}),
  ...(model?{SCENEFORGE_DEFAULT_MODEL:model,SCENEFORGE_WHISPER_MODEL:env.SCENEFORGE_WHISPER_MODEL||model}:{}),
  ...(fs.existsSync(launcher)?{SCENEFORGE_MCP_COMMAND:launcher}:{}),
  ...(fs.existsSync(path.join(bin,'ffmpeg'+suffix))&&!env.SCENEFORGE_FFMPEG?{SCENEFORGE_FFMPEG:path.join(bin,'ffmpeg'+suffix)}:{}),
  ...(fs.existsSync(path.join(bin,'ffprobe'+suffix))&&!env.SCENEFORGE_FFPROBE?{SCENEFORGE_FFPROBE:path.join(bin,'ffprobe'+suffix)}:{}),
  ...(methodology?{CREATORCLUB_METHODOLOGY_DIR:methodology}:{}),
 };
}
module.exports={CREATORCLUB,creatorClubPaths,privacyAppName,isCreatorClubService,methodologyDir,whisperModel,runtimeEnvironment};
