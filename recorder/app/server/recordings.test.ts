import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const folder=await mkdtemp(path.join(os.tmpdir(),'sceneforge-recording-'));process.env.SCENEFORGE_DATA_DIR=folder;
const s=await import('./storage.js'),r=await import('./recordings.js');await s.initStorage();
const release=(id:string)=>r.appendRecording(id,-2,Buffer.from([0]));
const finish=async(id:string,timing?:Parameters<typeof r.finishRecording>[1])=>{await release(id).catch(()=>{});return r.finishRecording(id,timing);};
after(()=>rm(folder,{recursive:true,force:true}));
test('streaming recording chunks are retry-safe, recoverable and finalize with duration and unchanged decoded frames',async()=>{
 const input=path.join(folder,'fixture.webm');await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=15:duration=1','-c:v','libvpx','-live','1','-y',input]);const data=await readFile(input),middle=Math.floor(data.length/2);const session=await r.createRecording('Recovered take','video/webm');
 const before=JSON.parse((await promisify(execFile)('ffprobe',['-v','error','-show_format','-of','json',input])).stdout);assert.equal(before.format.duration,undefined);
 await assert.rejects(()=>r.appendRecording(session.id,1,data.subarray(middle)));
 await r.appendRecording(session.id,0,data.subarray(0,middle));await r.appendRecording(session.id,0,data.subarray(0,middle));
 await assert.rejects(()=>r.appendRecording(session.id,0,Buffer.from('different')));
 await r.appendRecording(session.id,1,data.subarray(middle));await release(session.id);assert.equal((await r.recoverableRecordings())[0].chunks,2);
 const timing={startedAtMs:1000,firstSampleAtMs:1125,sourceTimestampUs:220000};const media=await finish(session.id,timing);assert.deepEqual(JSON.parse(await readFile(path.join(path.dirname(media.path),'metadata.json'),'utf8')).timing,timing);assert.ok(media.duration>.9&&media.duration<1.1);assert.equal(media.kind,'video');
 const hash=async(file:string)=>(await promisify(execFile)('ffmpeg',['-v','error','-i',file,'-f','md5','-'])).stdout;
 assert.equal(await hash(media.path),await hash(input));assert.equal((await finish(session.id)).id,media.id);assert.equal((await r.recoverableRecordings()).length,0);
});


test('audio provenance survives unfinished recovery, finalization, catalog reread and reimport',async()=>{
 const input=path.join(folder,'tone.webm');await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.5','-c:a','libopus','-y',input]);const bytes=await readFile(input);
 for(const role of ['microphone','system'] as const){
  const created=await r.createRecording('Arbitrary name','audio/webm',role);await r.appendRecording(created.id,0,bytes);
  await release(created.id);assert.equal((await r.recoverableRecordings()).find(entry=>entry.id===created.id)?.audioRole,role);
  const media=await finish(created.id);assert.equal(media.audioRole,role);assert.equal((await s.readMedia(media.id)).audioRole,role);assert.equal((await finish(created.id)).audioRole,role);
  const {audioRole:_,...reprobed}=media;assert.equal((await s.registerMedia(reprobed)).audioRole,role);
 }
 await assert.rejects(r.createRecording('bad','audio/webm','filename-inference' as any),/audio role/);
});
test('fragmented MP4 chunks finalize to a front-indexed take.mp4 with unchanged frames, then release capture and chunks',async()=>{
 const {captureActivity}=await import('./capture-activity.js'),{readdir}=await import('node:fs/promises'),run=promisify(execFile),input=path.join(folder,'fragmented.mp4');
 await run('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=15:duration=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-g','15','-c:a','libopus','-movflags','frag_keyframe+empty_moov+default_base_moof','-f','mp4','-y',input]);
 const data=await readFile(input),third=Math.floor(data.length/3);const session=await r.createRecording('Camera take','video/mp4;codecs=avc1.640028');assert.ok(captureActivity.remaining()>0,'an open browser capture defers background work');
 for(const [index,part] of [data.subarray(0,third),data.subarray(third,2*third),data.subarray(2*third)].entries())await r.appendRecording(session.id,index,part);
 const media=await finish(session.id);assert.match(media.path,/take\.mp4$/);assert.equal(media.kind,'video');assert.equal(media.hasAudio,true);assert.ok(media.duration>.9&&media.duration<1.2);
 const bytes=await readFile(media.path);assert.ok(bytes.indexOf('moov')>0&&bytes.indexOf('moov')<bytes.indexOf('mdat'),'faststart index precedes media data');
 const frames=async(file:string)=>(await run('ffmpeg',['-v','error','-i',file,'-map','0:v','-fps_mode','passthrough','-f','framemd5','-'])).stdout.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1));
 assert.deepEqual(await frames(media.path),await frames(input));assert.ok(captureActivity.remaining()<=4000,'finishing closes the capture lease');
 for(let i=0;i<100&&(await readdir(path.dirname(media.path))).some(f=>f.endsWith('.chunk'));i++)await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal((await readdir(path.dirname(media.path))).some(f=>f.endsWith('.chunk')),false);assert.equal((await finish(session.id)).path,media.path);
 await assert.rejects(r.createRecording('Matroska','video/x-matroska;codecs=avc1'),/WebM or MP4/);
});
test('chunks stream through cat in order in several batches, a missing chunk fails, and startup cleanup removes only completed leftovers',async()=>{
 const {writeFile,readdir}=await import('node:fs/promises');const dir=await mkdtemp(path.join(folder,'stream-')),run=promisify(execFile),source=path.join(dir,'source.webm');
 await run('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=15:duration=1','-c:v','libvpx','-live','1','-y',source]);const data=await readFile(source),size=Math.ceil(data.length/5),chunks:string[]=[];
 for(let i=0;i*size<data.length;i++){const name=String(i).padStart(9,'0')+'.chunk';await writeFile(path.join(dir,name),data.subarray(i*size,(i+1)*size));chunks.push(name);}
 await r.remuxChunks(dir,chunks,['-f','webm','joined.webm'],2);const md5=async(file:string)=>(await run('ffmpeg',['-v','error','-i',file,'-map','0:v','-f','md5','-'])).stdout;assert.equal(await md5(path.join(dir,'joined.webm')),await md5(source));
 await assert.rejects(r.remuxChunks(dir,[...chunks,'000000099.chunk'],['-f','webm','broken.webm']));
 const many=await mkdtemp(path.join(folder,'many-')),small=Math.ceil(data.length/300),names:string[]=[];for(let i=0;i*small<data.length;i++){const name=String(i).padStart(9,'0')+'.chunk';await writeFile(path.join(many,name),data.subarray(i*small,(i+1)*small));names.push(name);}
 const code=`import {remuxChunks} from './server/recordings.ts';await remuxChunks(${JSON.stringify(many)},${JSON.stringify(names)},['-f','webm','joined.webm']);`;
 await run('/bin/sh',['-c','ulimit -n 128 && exec "$0" "$@"',process.execPath,'--import','tsx','--input-type=module','-e',code],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,SCENEFORGE_DATA_DIR:folder}});
 assert.equal(await md5(path.join(many,'joined.webm')),await md5(source),'hundreds of chunks finalize under a low descriptor limit');
 const input=path.join(folder,'cleanup.webm');await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.3','-c:a','libopus','-y',input]);const bytes=await readFile(input);
 const waves=async()=>(await readdir(s.CACHE_DIR)).filter(f=>f.endsWith('.wave-v2.json')).length;await r.waveformWarmup();const before=await waves();
 const done=await r.createRecording('Done','audio/webm'),open=await r.createRecording('Open','audio/webm');await r.appendRecording(done.id,0,bytes);await r.appendRecording(open.id,0,bytes);const media=await finish(done.id);
 await new Promise(resolve=>setTimeout(resolve,300));assert.equal(await waves(),before,'the review waveform waits while another capture is open');
 const stray=path.join(path.dirname(media.path),'000000000.chunk');await writeFile(stray,'left behind');await r.cleanupRecordings();
 await assert.rejects(readFile(stray));await release(open.id);assert.equal((await r.recoverableRecordings()).find(x=>x.id===open.id)?.chunks,1);await finish(open.id);
 await r.waveformWarmup();assert.equal(await waves(),before+2,'audio take review waveforms are cached in the background once no capture is open');
});
test('a countdown session holds a short lease, a chunk queued before finish cannot reopen it, and startup deletes only abandoned empty sessions',async()=>{
 const {captureActivity}=await import('./capture-activity.js'),{utimes,readdir,writeFile}=await import('node:fs/promises'),input=path.join(folder,'lease.webm');
 await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.4','-c:a','libopus','-y',input]);const bytes=await readFile(input),half=Math.floor(bytes.length/2);
 assert.equal(captureActivity.remaining(false),0);const take=await r.createRecording('Countdown','audio/webm'),lease=captureActivity.remaining();assert.ok(lease>0&&lease<=10_000,'a session without chunks holds only a short lease');
 await r.appendRecording(take.id,0,bytes.subarray(0,half));assert.ok(captureActivity.remaining()>10_000,'the first chunk renews the full lease');
 const late=r.appendRecording(take.id,1,bytes.subarray(half)),media=await finish(take.id);await late;assert.ok(media.duration>.3);assert.equal(captureActivity.remaining(false),0,'finishing after queued chunks leaves no lease open');
 const cancelled=await r.createRecording('Cancelled countdown','audio/webm'),fresh=await r.createRecording('Counting down','audio/webm'),crashed=await r.createRecording('Interrupted take','audio/webm');await r.appendRecording(crashed.id,0,bytes);
 const dir=(id:string)=>path.join(s.UPLOAD_DIR,'recordings',id),old=new Date(Date.now()-10*60*1000);for(const id of [cancelled.id,crashed.id])await utimes(path.join(dir(id),'metadata.json'),old,old);await writeFile(path.join(dir(cancelled.id),'000000000.chunk.tmp'),'interrupted');
 await release(crashed.id);await r.cleanupRecordings();await assert.rejects(readdir(dir(cancelled.id)),'an old session that never received a chunk is deleted');
 assert.deepEqual(await readdir(dir(fresh.id)),['metadata.json'],'a countdown still in progress is kept');assert.equal((await r.recoverableRecordings()).find(x=>x.id===crashed.id)?.chunks,1,'an old session with chunks stays recoverable');
 for(const id of [cancelled.id,fresh.id])await assert.rejects(finish(id));await finish(crashed.id);await r.waveformWarmup();assert.equal(captureActivity.remaining(false),0);
});
test('a start cancelled after capture armed discards its chunks: recovery never offers it, and a finished take is never removed',async()=>{
 const {captureActivity}=await import('./capture-activity.js'),{readdir}=await import('node:fs/promises'),input=path.join(folder,'armed.webm');
 await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.4','-c:a','libopus','-y',input]);const bytes=await readFile(input);
 const armed=await r.createRecording('Armed during countdown','audio/webm');await r.appendRecording(armed.id,0,bytes);
 assert.ok(!(await r.recoverableRecordings()).some(x=>x.id===armed.id),'an armed session is live and cannot be recovered');
 assert.deepEqual(await r.discardRecording(armed.id),{ok:true});await assert.rejects(readdir(path.join(s.UPLOAD_DIR,'recordings',armed.id)));
 assert.ok(!(await r.recoverableRecordings()).some(x=>x.id===armed.id));assert.equal(captureActivity.remaining(false),0,'its capture lease closes with it');
 assert.deepEqual(await r.discardRecording(armed.id),{ok:true},'discarding twice is harmless');await assert.rejects(r.discardRecording('../outside'));
 const kept=await r.createRecording('Finished take','audio/webm');await r.appendRecording(kept.id,0,bytes);const media=await finish(kept.id);
 await assert.rejects(r.discardRecording(kept.id),/completed recording/);assert.ok((await readFile(media.path)).length>0);await r.waveformWarmup();
});
test('arming stays live until the first heartbeat even when native capture takes longer than ten seconds',async()=>{
 const take=await r.createRecording('Still arming','audio/webm'),now=Date.now;
 try{const at=now();Date.now=()=>at+11_000;await assert.rejects(r.finishRecording(take.id),/still live/);}finally{Date.now=now;await r.discardRecording(take.id);}
});
test('live and paused heartbeats prevent recovery and finish without releasing the lease',async()=>{
 const {writeFile}=await import('node:fs/promises'),{captureActivity}=await import('./capture-activity.js'),input=path.join(folder,'heartbeat.webm');
 await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.25','-c:a','libopus','-y',input]);
 const take=await r.createRecording('Paused take','audio/webm');await r.appendRecording(take.id,0,await readFile(input));const file=path.join(s.UPLOAD_DIR,'recordings',take.id,'metadata.json'),meta=JSON.parse(await readFile(file,'utf8'));assert.ok(meta.lastChunkAt);
 await writeFile(file,JSON.stringify({...meta,liveUntil:0}));assert.ok((await r.recoverableRecordings()).some(entry=>entry.id===take.id));
 await r.appendRecording(take.id,-1,Buffer.from([0]));assert.ok(captureActivity.remaining(false)>10_000);assert.ok(!(await r.recoverableRecordings()).some(entry=>entry.id===take.id));
 await assert.rejects(r.finishRecording(take.id),/still live/);assert.ok(captureActivity.remaining(false)>0,'rejected recovery cannot close the live capture lease');
 await release(take.id);const media=await r.finishRecording(take.id);assert.ok(media.duration>0);await r.waveformWarmup();
});
test('finish failures have a durable reason and replay after final rename keeps the same media identity without chunks',async()=>{
 const {writeFile,readdir}=await import('node:fs/promises'),bad=await r.createRecording('Failed take','video/webm');await r.appendRecording(bad.id,0,Buffer.from('not media'));await release(bad.id);await assert.rejects(r.finishRecording(bad.id));
 const file=path.join(s.UPLOAD_DIR,'recordings',bad.id,'metadata.json'),meta=JSON.parse(await readFile(file,'utf8'));assert.equal(meta.status,'failed');assert.equal(typeof meta.reason,'string');assert.ok((await r.recoverableRecordings()).some(entry=>entry.id===bad.id));await r.discardRecording(bad.id);
 const input=path.join(folder,'replay.webm');await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.25','-c:a','libopus','-y',input]);
 const take=await r.createRecording('Replay','audio/webm');await r.appendRecording(take.id,0,await readFile(input));await release(take.id);const media=await r.finishRecording(take.id);await r.waveformWarmup();const directory=path.dirname(media.path),metadataFile=path.join(directory,'metadata.json'),complete=JSON.parse(await readFile(metadataFile,'utf8'));delete complete.media;complete.status='finishing';await writeFile(metadataFile,JSON.stringify(complete));for(const file of await readdir(directory))if(file.endsWith('.chunk'))await rm(path.join(directory,file));
 assert.ok((await r.recoverableRecordings()).some(entry=>entry.id===take.id));assert.equal((await r.finishRecording(take.id)).id,media.id);assert.equal((await r.finishRecording(take.id)).path,media.path);await r.waveformWarmup();
});
test('finalized native files are recoverable until imported, while live helpers and old empty folders are excluded',async()=>{
 const {mkdir,writeFile,utimes,stat}=await import('node:fs/promises'),root=path.join(s.DATA_DIR,'native-recordings'),take=path.join(root,'take-interrupted'),active=path.join(root,'take-active'),empty=path.join(root,'take-empty');await Promise.all([take,active,empty].map(file=>mkdir(file,{recursive:true})));
 for(const directory of [take,active]){await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.25','-y',path.join(directory,'system.wav')]);await writeFile(path.join(directory,'recovery.json'),JSON.stringify({id:'native',startedAtMs:1000}));}
 await writeFile(path.join(active,'active.json'),JSON.stringify({pid:process.pid}));const old=new Date(Date.now()-10*60_000);await utimes(empty,old,old);
 const found=await r.recoverableRecordings();assert.deepEqual(found.find(entry=>entry.id==='take-interrupted')?.nativePaths,[{path:path.join(take,'system.wav'),audioRole:'system'}]);assert.ok(!found.some(entry=>entry.id==='take-active'));await assert.rejects(stat(empty));
 const {probeMedia}=await import('./media.js'),media=await probeMedia(path.join(take,'system.wav'),s.CACHE_DIR);await s.registerMedia({...media,audioRole:'system'});assert.ok(!(await r.recoverableRecordings()).some(entry=>entry.id==='take-interrupted'));
});
