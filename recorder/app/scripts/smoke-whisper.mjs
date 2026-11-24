// Transcribes whisper.cpp's sample recording with the staged runtime (runtime/bin, runtime/models) through the app's own
// transcription code, so every release build proves local speech-to-text works on the platform it was built for.
// Run with `node --import tsx scripts/smoke-whisper.mjs` after `npm run runtime:desktop`.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {whisperSample} from './whisper-runtime.mjs';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),runtime=path.join(app,'runtime');
// As desktop/runtime.cjs starts the service: the runtime's programs first on PATH, its bundled model as the default.
process.env.PATH=[path.join(runtime,'bin'),process.env.PATH].join(path.delimiter);
process.env.CREATOR_COMPILER_RUNTIME_DIR=runtime;
process.env.SCENEFORGE_WHISPER_MODEL=path.join(runtime,'models','ggml-base.en.bin');
const {transcribe,transcriptionCapabilities}=await import('../server/ai.ts');

const capabilities=await transcriptionCapabilities();
assert.ok(capabilities.local,'whisper-cli is not on the runtime PATH');
assert.equal(path.dirname(capabilities.command),path.join(runtime,'bin'),'whisper-cli must come from the runtime');
const dir=await mkdtemp(path.join(os.tmpdir(),'creatorclub-whisper-smoke-'));
try{
 const started=Date.now();
 const {captions,provider}=await transcribe({id:'smoke',name:'jfk.wav',path:whisperSample(app),kind:'audio',duration:11,width:0,height:0,hasAudio:true},{provider:'local',baseUrl:'',model:'',language:'auto'},dir);
 const text=captions.map(c=>c.text).join(' ');
 assert.equal(provider,'local whisper.cpp');
 // The small base.en model can drop a short word ("can do you"), so check phrases it reliably gets.
 const words=text.toLowerCase().replace(/[^a-z ]/g,'');
 for(const phrase of ['my fellow americans','ask not what your country','ask what you can do for your country'])assert.ok(words.includes(phrase),`"${phrase}" missing from the transcript: ${text}`);
 assert.ok(captions.every(c=>Number.isFinite(c.start)&&c.end>c.start),'every caption is timed');
 console.log(`PASS ${process.platform}/${process.arch}: local whisper.cpp transcribed the sample in ${((Date.now()-started)/1000).toFixed(1)} s: "${text}"`);
}finally{await rm(dir,{recursive:true,force:true});}
