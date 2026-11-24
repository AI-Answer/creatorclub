// Local speech-to-text for the desktop apps: whisper.cpp's whisper-cli, built from its pinned source for the platform
// this runs on, and the ggml-base.en model that desktop/runtime.cjs hands the app by default. Each is built or
// downloaded once into .runtime-build/ and copied into runtime/, which the installers ship.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmod,copyFile,mkdir,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const WHISPER={version:'1.9.4',url:'https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.9.4.tar.gz',sha256:'57e280cee375ab02425b806ad5146b99f6eb9357e3c2b31357c8a6af2e2e44ae'};
const MODEL={file:'ggml-base.en.bin',url:'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',sha256:'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002'};

const exe=process.platform==='win32'?'whisper-cli.exe':'whisper-cli';
const cache=app=>path.join(app,'.runtime-build');
const sourceDir=app=>path.join(cache(app),`whisper.cpp-${WHISPER.version}`);
/** whisper.cpp's own sample recording (JFK, "ask not what your country can do for you"), for the smoke test. */
export const whisperSample=app=>path.join(sourceDir(app),'samples','jfk.wav');

const exists=file=>stat(file).then(()=>true,()=>false);
const sha256=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
function run(command,args,cwd){
 const result=spawnSync(command,args,{cwd,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(`${path.basename(command)} ${args[0]} exited ${result.status}`);
}
async function download({url,sha256:expected},file){
 if(await exists(file)&&await sha256(file)===expected)return;
 const response=await fetch(url,{redirect:'follow'});
 if(!response.ok)throw Error(`Could not download ${url}: HTTP ${response.status}`);
 await writeFile(file+'.part',Buffer.from(await response.arrayBuffer()));
 if(await sha256(file+'.part')!==expected){await rm(file+'.part',{force:true});throw Error(`${url}: SHA-256 mismatch`);}
 await rename(file+'.part',file);
}

const platformFlags=()=>process.platform==='darwin'
 ?[`-DCMAKE_OSX_ARCHITECTURES=${process.arch==='arm64'?'arm64':'x86_64'}`,'-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0',...(process.arch==='arm64'?['-DGGML_CPU_ARM_ARCH=armv8-a']:[]),
   '-DGGML_METAL=ON','-DGGML_METAL_EMBED_LIBRARY=ON','-DGGML_BLAS=ON','-DGGML_BLAS_VENDOR=Apple','-DGGML_ACCELERATE=ON']
 // The C runtime is linked in, so the app needs no Visual C++ redistributable. AVX2 covers x64 PCs from 2015 on.
 :['-DCMAKE_POLICY_DEFAULT_CMP0091=NEW','-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded','-DGGML_AVX=ON','-DGGML_AVX2=ON','-DGGML_FMA=ON','-DGGML_F16C=ON'];

async function buildWhisperCli(app){
 const build=path.join(cache(app),`whisper-build-${process.platform}-${process.arch}`);
 const outputs=[path.join(build,'bin',exe),path.join(build,'bin','Release',exe)];
 const built=async()=>{for(const file of outputs)if(await exists(file))return file;};
 const found=await built();if(found)return found;
 const archive=path.join(cache(app),`whisper.cpp-${WHISPER.version}.tar.gz`);
 await download(WHISPER,archive);
 if(!await exists(path.join(sourceDir(app),'CMakeLists.txt'))){
  // Windows' own bsdtar: a Git-for-Windows GNU tar on PATH would read "C:" as a remote host.
  const tar=process.platform==='win32'?path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'):'tar';
  run(tar,['-xzf',path.basename(archive)],cache(app));
 }
 run('cmake',['-S',sourceDir(app),'-B',build,'-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=OFF','-DWHISPER_BUILD_TESTS=OFF','-DWHISPER_BUILD_SERVER=OFF','-DWHISPER_BUILD_EXAMPLES=ON',
  '-DWHISPER_USE_SYSTEM_GGML=OFF','-DWHISPER_CURL=OFF','-DWHISPER_SDL2=OFF','-DGGML_NATIVE=OFF','-DGGML_BACKEND_DL=OFF','-DGGML_OPENMP=OFF','-DGGML_CCACHE=OFF',...platformFlags()]);
 run('cmake',['--build',build,'--config','Release','--target','whisper-cli','-j',String(os.availableParallelism())]);
 const file=await built();if(!file)throw Error(`whisper-cli was not built in ${build}`);
 return file;
}

/** Puts whisper-cli in runtime/bin and the speech model in runtime/models. Returns the manifest entries. */
export async function prepareWhisper(app){
 const runtime=path.join(app,'runtime');
 await mkdir(cache(app),{recursive:true});
 for(const dir of ['bin','licenses','models'])await mkdir(path.join(runtime,dir),{recursive:true});
 const cli=await buildWhisperCli(app),target=path.join(runtime,'bin',exe);
 await copyFile(cli,target);if(process.platform!=='win32')await chmod(target,0o755);
 const model=path.join(cache(app),MODEL.file);await download(MODEL,model);
 await copyFile(model,path.join(runtime,'models',MODEL.file));
 await copyFile(path.join(sourceDir(app),'LICENSE'),path.join(runtime,'licenses','whisper.cpp-LICENSE'));
 return [{name:'whisper-cli',file:exe,version:WHISPER.version,sha256:await sha256(target)},{name:'whisper-model',file:`../models/${MODEL.file}`,source:MODEL.url,sha256:MODEL.sha256}];
}
