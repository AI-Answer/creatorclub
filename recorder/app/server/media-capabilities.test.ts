import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mediaCapabilityProbe } from './media-capabilities.ts';
const execute=promisify(execFile);

async function fixture(mode:'working'|'failed'|'hanging'|'oversized') {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sceneforge-capability-')),
    binary=path.join(dir,'ffmpeg.cjs'),log=path.join(dir,'calls.jsonl');
  await fs.writeFile(binary,`#!${process.execPath}\nconst fs=require('node:fs'),args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');
if(args.includes('-encoders')){console.log(' V..... h264_videotoolbox');process.exit(0)}
if(args.includes('-version')){console.log('ffprobe fixture');process.exit(0)}
${mode==='working'?'process.exit(0)':mode==='failed'?"console.error('Cannot create compression session: -12903');process.exit(187)":mode==='hanging'?'setInterval(()=>{},1000)':"process.stdout.write('x'.repeat(2*1024*1024));setInterval(()=>{},1000)"}
`,{mode:0o700});
  return {dir,binary,log};
}

test('a listed but unusable VideoToolbox encoder is not advertised as hardware',async()=>{
  const f=await fixture('failed');try{
    const get=mediaCapabilityProbe(f.binary,f.binary),results=await Promise.all(Array.from({length:20},()=>get()));
    assert.ok(results.every(r=>r.ffmpeg&&r.ffprobe&&!r.hardwareEncode));
    const calls=(await fs.readFile(f.log,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(calls.length,3,'Concurrent callers share one metadata and hardware probe');
    const encode=calls.find(a=>a.includes('-c:v'));assert.ok(encode);
    assert.equal(encode[encode.indexOf('-allow_sw')+1],'0');
    assert.equal(encode[encode.indexOf('-frames:v')+1],'1');
    await get();assert.equal((await fs.readFile(f.log,'utf8')).trim().split('\n').length,3);
  }finally{await fs.rm(f.dir,{recursive:true,force:true});}
});
test('successful real-session probe retains hardware acceleration',async()=>{
  const f=await fixture('working');try{assert.deepEqual(await mediaCapabilityProbe(f.binary,f.binary)(),{ffmpeg:true,ffprobe:true,hardwareEncode:true});}
  finally{await fs.rm(f.dir,{recursive:true,force:true});}
});
test('hardware probe deadlines and output bounds fall back without hanging callers',{timeout:10000},async()=>{
  for(const mode of ['hanging','oversized']as const){const f=await fixture(mode);try{
    const began=Date.now(),result=await mediaCapabilityProbe(f.binary,f.binary,500)();
    assert.equal(result.hardwareEncode,false);assert.ok(Date.now()-began<4000);
  }finally{await fs.rm(f.dir,{recursive:true,force:true});}}
  assert.deepEqual(await mediaCapabilityProbe('/nonexistent/sceneforge-ffmpeg','/nonexistent/sceneforge-ffprobe')(),{ffmpeg:false,ffprobe:false,hardwareEncode:false});
});
test('hardware-requested export completes through libx264 when VideoToolbox cannot start',{timeout:30000},async()=>{
  const f=await fixture('failed');try{
    const real=process.env.SCENEFORGE_FFMPEG||'ffmpeg';
    await fs.writeFile(f.binary,`#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process'),args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(f.log)},JSON.stringify(args)+'\\n');if(args.includes('-encoders')){console.log(' V..... h264_videotoolbox');process.exit(0)}if(args.includes('h264_videotoolbox')){console.error('Cannot create compression session: -12903');process.exit(187)}const c=cp.spawn(${JSON.stringify(real)},args,{stdio:'inherit'});c.on('error',()=>process.exit(1));c.on('exit',code=>process.exit(code??1));`,{mode:0o700});
    const script=`import {getCapabilities,startExport,getJob} from './server/media.ts';import {createProject} from './shared/types.ts';const p=createProject('CPU fallback');p.canvas={width:160,height:90,fps:30,background:'#e83c21',padding:0,radius:0};p.scenes[0].duration=.2;const job=startExport(p,{format:'mp4',hardware:true,quality:'draft'},process.env.TEST_OUTPUT);while(!['complete','failed'].includes(getJob(job.id).status))await new Promise(r=>setTimeout(r,25));console.log(JSON.stringify({cap:await getCapabilities(),job:getJob(job.id)}));`;
    const {stdout}=await execute(process.execPath,['--import','tsx','--input-type=module','-e',script],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,SCENEFORGE_FFMPEG:f.binary,TEST_OUTPUT:f.dir},timeout:25000,maxBuffer:1024*1024});
    const result=JSON.parse(stdout.trim());assert.equal(result.cap.hardwareEncode,false);assert.equal(result.job.status,'complete',result.job.error);
    const calls=(await fs.readFile(f.log,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(calls.filter(a=>a.includes('h264_videotoolbox')).length,1);
    assert.ok(calls.some(a=>a.includes('libx264')));
    const probe=await execute(process.env.SCENEFORGE_FFPROBE||'ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','csv=p=0',result.job.outputPath]);assert.equal(Number(probe.stdout.trim()),6);
  }finally{await fs.rm(f.dir,{recursive:true,force:true});}
});

test('proxies use VideoToolbox only when the probe confirms it, and sample child memory once a second',{timeout:120000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sceneforge-proxy-')),source=path.join(dir,'source.mp4'),ffmpegFake=path.join(dir,'ffmpeg.cjs');
  const calls=path.join(dir,'calls.jsonl'),psCalls=path.join(dir,'ps.log'),psBinary=path.join(dir,'bin','ps');
  try{
    const real=process.env.SCENEFORGE_FFMPEG||'ffmpeg';
    await execute(real,['-v','error','-y','-f','lavfi','-i','testsrc2=size=1280x720:rate=30','-t','1','-c:v','libx264','-pix_fmt','yuv420p',source]);
    await fs.mkdir(path.join(dir,'bin'));
    // Fake ffmpeg logs argv, reports VideoToolbox unless FAKE_VT=0, and delegates proxies to libx264 after a pause so sampling can run.
    await fs.writeFile(ffmpegFake,`#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process'),args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
if(args.includes('-encoders')){console.log(process.env.FAKE_VT==='0'?' V..... libx264':' V..... h264_videotoolbox');process.exit(0)}
if(args.includes('color=black:size=160x90:rate=30')){process.exit(0)}
setTimeout(()=>{const c=cp.spawn(${JSON.stringify(real)},args.map(a=>a==='h264_videotoolbox'?'libx264':a),{stdio:'inherit'});c.on('error',()=>process.exit(1));c.on('exit',code=>process.exit(code??1));},2500);`,{mode:0o700});
    await fs.writeFile(psBinary,`#!/bin/sh\necho sample >> ${JSON.stringify(psCalls)}\necho 4096\n`,{mode:0o700});
    const script=`import {probeMedia,startProxy,getJob} from './server/media.ts';const cache=process.env.TEST_CACHE;const m=await probeMedia(process.env.TEST_SOURCE,cache);const job=startProxy(m,cache);const began=Date.now();while(['queued','running'].includes(getJob(job.id).status))await new Promise(r=>setTimeout(r,50));console.log(JSON.stringify({status:getJob(job.id).status,error:getJob(job.id).error,seconds:(Date.now()-began)/1000}));`;
    const run=(vt:string)=>execute(process.execPath,['--import','tsx','--input-type=module','-e',script],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,SCENEFORGE_FFMPEG:ffmpegFake,SCENEFORGE_FFPROBE:process.env.SCENEFORGE_FFPROBE||'ffprobe',PATH:`${path.join(dir,'bin')}${path.delimiter}${process.env.PATH}`,FAKE_VT:vt,TEST_SOURCE:source,TEST_CACHE:path.join(dir,'cache')},timeout:100000,maxBuffer:1024*1024});
    const result=JSON.parse((await run('1')).stdout.trim().split('\n').pop()!);assert.equal(result.status,'complete',result.error);
    const proxyCall=(await fs.readFile(calls,'utf8')).trim().split('\n').map(line=>JSON.parse(line)).find(a=>a.includes('scale=960:540:force_original_aspect_ratio=decrease:force_divisible_by=2'));
    assert.ok(proxyCall,'proxy encode was requested');assert.equal(proxyCall[proxyCall.indexOf('-c:v')+1],'h264_videotoolbox');assert.equal(proxyCall[proxyCall.indexOf('-b:v')+1],'1M');assert.equal(proxyCall.includes('-crf'),false);
    const samples=(await fs.readFile(psCalls,'utf8')).trim().split('\n').length;assert.ok(samples>=2&&samples<=Math.ceil(result.seconds)+1,`one read at start, then once a second; got ${samples} in ${result.seconds}s`);
    await fs.rm(calls,{force:true});await fs.rm(path.join(dir,'cache'),{recursive:true,force:true});
    const fallback=JSON.parse((await run('0')).stdout.trim().split('\n').pop()!);assert.equal(fallback.status,'complete',fallback.error);
    const fallbackCall=(await fs.readFile(calls,'utf8')).trim().split('\n').map(line=>JSON.parse(line)).find(a=>a.includes('scale=960:540:force_original_aspect_ratio=decrease:force_divisible_by=2'));
    assert.ok(fallbackCall);assert.equal(fallbackCall[fallbackCall.indexOf('-c:v')+1],'libx264');assert.equal(fallbackCall[fallbackCall.indexOf('-crf')+1],'25');assert.equal(fallbackCall[fallbackCall.indexOf('-preset')+1],'veryfast');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
