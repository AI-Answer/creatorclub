const path=require('node:path');
const fs=require('node:fs');
function runtimeEnvironment({root,data,port,env=process.env}){
 const runtime=env.CREATOR_COMPILER_RUNTIME_DIR||(fs.existsSync(path.join(root,'../runtime/bin'))?path.resolve(root,'../runtime'):path.join(root,'runtime')),bin=path.join(runtime,'bin'),suffix=process.platform==='win32'?'.exe':'';
 const model=path.join(runtime,'models','ggml-base.en.bin');
 const launcher=process.platform==='win32'?path.resolve(root,'../../creator-compiler-mcp.exe'):path.resolve(root,'../../MacOS/sceneforge-mcp');
 return {...env,CREATOR_COMPILER_RUNTIME_DIR:runtime,SCENEFORGE_DATA_DIR:data,SCENEFORGE_PORT:String(port),
  PATH:[bin,env.PATH||'','/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin'].filter(Boolean).join(path.delimiter),
  ...(fs.existsSync(path.join(bin,'cutroom'+suffix))?{CREATOR_COMPILER_CUTROOM:path.join(bin,'cutroom'+suffix)}:{}),
  ...(fs.existsSync(model)?{SCENEFORGE_DEFAULT_MODEL:model,SCENEFORGE_WHISPER_MODEL:env.SCENEFORGE_WHISPER_MODEL||model}:{}),
  ...(fs.existsSync(launcher)?{SCENEFORGE_MCP_COMMAND:launcher}:{}),
  ...(fs.existsSync(path.join(bin,'ffmpeg'+suffix))&&!env.SCENEFORGE_FFMPEG?{SCENEFORGE_FFMPEG:path.join(bin,'ffmpeg'+suffix)}:{}),
  ...(fs.existsSync(path.join(bin,'ffprobe'+suffix))&&!env.SCENEFORGE_FFPROBE?{SCENEFORGE_FFPROBE:path.join(bin,'ffprobe'+suffix)}:{}),
 };
}
module.exports={runtimeEnvironment};
