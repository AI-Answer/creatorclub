import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const {createNativeRecordingManager,nativeOptions}=createRequire(import.meta.url)('../desktop/native-recording.cjs');
const selection={kind:'region',sourceId:'screen:1:0',displayId:'7',crop:{normalized:{x:.2,y:.3,width:.4,height:.5}}};
async function fixture(reply=true,{started:startedExtra={},stopped:stoppedExtra={},controls=true,...options}:any={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sceneforge-native-adapter-')),helper=path.join(dir,'helper');await fs.writeFile(helper,'fixture');
 const handlers=new Map<string,Function>(),events:any[]=[],states:any[]=[],commands:any[]=[],children:any[]=[];
 const frame={url:'http://127.0.0.1:5000/'},webContents={mainFrame:frame,send:(_channel:string,value:any)=>events.push(value)},window:any={isDestroyed:()=>false,webContents};
 const manager=createNativeRecordingManager({dataDir:dir,helperPath:helper,platform:'darwin',hostPid:1234,origin:'http://127.0.0.1:5000',getMainWindow:()=>window,onState:(state:any)=>states.push(state),ipcMain:{handle:(name:string,fn:Function)=>handlers.set(name,fn),removeHandler:(name:string)=>handlers.delete(name)},...options,spawnProcess:()=>{
  const child:any=new EventEmitter();children.push(child);child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.killed=[];child.kill=(signal:string)=>{child.killed.push(signal);queueMicrotask(()=>child.emit('close',null,signal));};
  const send=(value:any)=>child.stdout.write(JSON.stringify(value)+'\n');child.send=send;let directory='';
  child.stdin.on('data',(data:Buffer)=>{for(const line of data.toString().trim().split('\n')){const command=JSON.parse(line);commands.push(command);if(command.command==='start')directory=command.directory;if(!reply)continue;
   if(command.command==='start')queueMicrotask(()=>send({type:'started',startedAtMs:1000,width:320,height:180,...startedExtra}));
   if(command.command==='pause'&&controls)queueMicrotask(()=>send({type:'paused',duration:1,transitionAtMs:2000}));
   if(command.command==='resume'&&controls)queueMicrotask(()=>send({type:'resumed',duration:1,transitionAtMs:2500}));
   if(command.command==='stop')queueMicrotask(()=>{send({type:'stopped',duration:2,videoPath:path.join(directory,'screen.mp4'),audioPath:path.join(directory,'system.wav'),droppedVideo:0,droppedAudio:0,...stoppedExtra});child.emit('close',0,null);});
  }});return child;
 }});
 return {manager,handlers,events,states,commands,children,window,event:{sender:webContents,senderFrame:frame},close:async()=>{await manager.dispose();await fs.rm(dir,{recursive:true,force:true});}};
}
test('native options bind exclusion to host PID and validate source/region without accepting output paths',()=>{
 const options=nativeOptions({selection,systemAudio:true,directory:'/untrusted'},'/owned',42);assert.equal(options.directory,'/owned');assert.deepEqual(options.excludePids,[42]);assert.equal(options.displayId,7);assert.deepEqual(options.region,selection.crop.normalized);
 assert.throws(()=>nativeOptions({selection:{...selection,crop:{normalized:{x:.9,y:0,width:.2,height:1}}},systemAudio:true},'/owned',42),/region/);
 assert.throws(()=>nativeOptions({selection:{kind:'window',sourceId:'../bad'},systemAudio:true},'/owned',42),/window/);
 assert.throws(()=>nativeOptions({systemAudio:false,recordVideo:false},'/owned',42),/Choose/);
 assert.equal(nativeOptions({systemAudio:true,recordVideo:false},'/owned',42).recordVideo,false);
});
test('native adapter lifecycle returns exact transition times and separate outputs; stop is idempotent',async()=>{
 const f=await fixture();try{assert.equal((await f.manager.status()).available,true);const started=await f.manager.start({selection,systemAudio:true});assert.equal(started.startedAtMs,1000);assert.equal((await f.manager.pause(started.id)).transitionAtMs,2000);assert.equal((await f.manager.pause(started.id)).status,'paused');assert.equal((await f.manager.resume(started.id)).transitionAtMs,2500);const stopped=await f.manager.stop(started.id);assert.equal(stopped.duration,2);assert.match(stopped.videoPath,/screen\.mp4$/);assert.match(stopped.audioPath,/system\.wav$/);assert.deepEqual(await f.manager.stop(started.id),stopped);assert.deepEqual(f.commands.map(c=>c.command),['start','pause','resume','stop']);assert.deepEqual(f.commands[0].excludePids,[1234]);}finally{await f.close();}
});
test('native adapter rejects non-owner frames and concurrent recordings',async()=>{
 const f=await fixture();try{await assert.rejects(f.handlers.get('native-recording-status')!({...f.event,senderFrame:{url:'http://127.0.0.1:5000/'}}),/Untrusted/);const first=await f.manager.start({selection,systemAudio:false});await assert.rejects(f.manager.start({selection,systemAudio:false}),/already/);await f.manager.stop(first.id);}finally{await f.close();}
});
test('closing during native startup rejects request and ignores a late started response',async()=>{
 const f=await fixture(false);try{const request=f.manager.start({selection,systemAudio:true});const rejected=assert.rejects(request,/closed/);while(!f.children.length)await new Promise(r=>setTimeout(r,1));await f.manager.dispose();await rejected;f.children[0].send({type:'started',startedAtMs:10,width:1,height:1});assert.deepEqual(f.children[0].killed,['SIGTERM']);await assert.rejects(f.manager.start({selection,systemAudio:false}),/shutting down/);}finally{await f.close();}
});
test('native adapter refuses a helper output outside its managed take directory',async()=>{
 const f=await fixture();try{const started=await f.manager.start({selection,systemAudio:true});f.children[0].send({type:'stopped',duration:1,videoPath:'/outside/screen.mp4'});await assert.rejects(f.manager.stop(started.id),/unexpected output/);assert.ok(f.events.some(e=>e.type==='error'));}finally{await f.close();}
});
test('renderer reset finalizes the owned session and keeps handlers reusable with source-aware state callbacks',async()=>{
 const f=await fixture();try{const first=await f.manager.start({selection,systemAudio:true});await f.manager.reset();assert.equal(f.handlers.size,6);assert.deepEqual(f.states.map(s=>s.type),['started','stopped']);assert.deepEqual(f.states[0].selection,selection);assert.equal(f.states[0].recordVideo,true);const second=await f.manager.start({selection,systemAudio:false});assert.notEqual(first.id,second.id);await f.manager.stop(second.id);}finally{await f.close();}
});
test('renderer reset invalidates a start still awaiting helper availability',async()=>{
 const f=await fixture();try{const pending=f.manager.start({selection,systemAudio:false});const rejected=assert.rejects(pending,/cancelled/);await f.manager.reset();await rejected;assert.equal(f.children.length,0);}finally{await f.close();}
});


test('selected-window native bounds updates reach border state callback with source/session identity',async()=>{
 const f=await fixture();try{const chosen={kind:'window',sourceId:'window:12:0',label:'Selected window'},started=await f.manager.start({selection:chosen,systemAudio:false}),bounds={x:-1200,y:-80,width:800,height:600};f.children[0].send({type:'bounds',captureBounds:bounds});
  assert.deepEqual(f.states.at(-1),{id:started.id,type:'bounds',captureBounds:bounds,selection:chosen,recordVideo:true});assert.equal(f.events.some(e=>e.type==='bounds'),false);await f.manager.stop(started.id);
 }finally{await f.close();}
});

test('status launches one idle spare helper that the next start adopts; reset stops an unused spare',async()=>{
 const f=await fixture();try{const status=f.handlers.get('native-recording-status')!;assert.equal((await status(f.event)).available,true);await status(f.event);assert.equal(f.children.length,1);assert.equal(f.commands.length,0);
  const started=await f.manager.start({selection,systemAudio:false});assert.equal(f.children.length,1);assert.deepEqual(f.commands.map(c=>c.command),['start']);await f.manager.stop(started.id);
  await status(f.event);assert.equal(f.children.length,2);await f.manager.reset();assert.deepEqual(f.children[1].killed,['SIGTERM']);
  const next=await f.manager.start({selection,systemAudio:false});assert.equal(f.children.length,3);await f.manager.stop(next.id);
  await status(f.event);await f.manager.dispose();assert.deepEqual(f.children[3].killed,['SIGTERM']);
 }finally{await f.close();}
});
test('an idle spare helper exits after its idle window and a dead spare is never adopted',async()=>{
 const f=await fixture(true,{spareIdleMs:5});try{const status=f.handlers.get('native-recording-status')!;await status(f.event);await new Promise(r=>setTimeout(r,20));assert.deepEqual(f.children[0].killed,['SIGTERM']);}finally{await f.close();}
 // The dead-spare half keeps the default idle window so start() cannot race the idle timer.
 const g=await fixture();try{await g.handlers.get('native-recording-status')!(g.event);const dead=g.children[0];dead.exitCode=1;let wrote=false;dead.stdin.on('data',()=>{wrote=true;});
  const started=await g.manager.start({selection,systemAudio:false});assert.equal(g.children.length,2);assert.equal(wrote,false);assert.deepEqual(dead.killed,[]);assert.deepEqual(g.commands.map(c=>c.command),['start']);await g.manager.stop(started.id);
 }finally{await g.close();}
});
test('started state reaches the border callback after the start reply, and later state keeps its order',async()=>{
 const f=await fixture(true,{onPrepare:(value:any)=>f.states.push({type:'prepare',...value})} as any);try{
  const started=await f.manager.start({selection,systemAudio:false});assert.deepEqual(f.states.map(s=>s.type),['prepare']);assert.equal(f.states[0].recordVideo,true);
  await new Promise(r=>setImmediate(r));assert.deepEqual(f.states.map(s=>s.type),['prepare','started']);await f.manager.stop(started.id);
  f.states.length=0;const second=await f.manager.start({selection:{kind:'window',sourceId:'window:12:0'},systemAudio:false});f.children[1].send({type:'bounds',captureBounds:{x:0,y:0,width:640,height:480}});
  assert.deepEqual(f.states.map(s=>s.type),['prepare','started','bounds']);await f.manager.stop(second.id);assert.deepEqual(f.states.map(s=>s.type),['prepare','started','bounds','stopped']);
 }finally{await f.close();}
});
test('previews are not read or sent while the editor is hidden, and a capable helper is told to pause them',async()=>{
 const f=await fixture(true,{started:{previewControl:true}});try{let visible=false;f.window.isVisible=()=>visible;f.window.isMinimized=()=>false;f.manager.setPreviewEnabled(false);
  const started=await f.manager.start({selection,systemAudio:false}),directory=f.commands[0].directory,file=path.join(directory,'preview.jpg');await fs.writeFile(file,Buffer.from([0xff,0xd8,0xff,0xd9]));
  assert.deepEqual(f.commands.at(-1),{command:'preview',enabled:false});f.children[0].send({type:'preview',path:file,width:4,height:4});await new Promise(r=>setTimeout(r,20));assert.equal(f.events.some(e=>e.type==='preview'),false);
  visible=true;f.manager.setPreviewEnabled(true);assert.deepEqual(f.commands.at(-1),{command:'preview',enabled:true});f.children[0].send({type:'preview',path:file,width:4,height:4});await new Promise(r=>setTimeout(r,20));assert.equal(f.events.filter(e=>e.type==='preview').length,1);
  await f.manager.stop(started.id);const count=f.commands.length;f.manager.setPreviewEnabled(false);assert.equal(f.commands.length,count);
 }finally{await f.close();}
});
test('an editor that is merely not frontmost at start keeps helper previews on, though unread until visible',async()=>{
 const f=await fixture(true,{started:{previewControl:true}});try{let visible=false;f.window.isVisible=()=>visible;f.window.isMinimized=()=>false;
  const started=await f.manager.start({selection,systemAudio:false}),file=path.join(f.commands[0].directory,'preview.jpg');await fs.writeFile(file,Buffer.from([0xff,0xd8,0xff,0xd9]));assert.deepEqual(f.commands.map(c=>c.command),['start']);
  f.children[0].send({type:'preview',path:file,width:4,height:4});await new Promise(r=>setTimeout(r,20));assert.equal(f.events.some(e=>e.type==='preview'),false);
  visible=true;f.children[0].send({type:'preview',path:file,width:4,height:4});await new Promise(r=>setTimeout(r,20));assert.equal(f.events.filter(e=>e.type==='preview').length,1);await f.manager.stop(started.id);
 }finally{await f.close();}
});
test('helpers without preview control never receive preview commands',async()=>{
 const f=await fixture();try{f.window.isVisible=()=>false;const started=await f.manager.start({selection,systemAudio:false});f.manager.setPreviewEnabled(false);f.manager.setPreviewEnabled(true);assert.deepEqual(f.commands.map(c=>c.command),['start']);await f.manager.stop(started.id);}finally{await f.close();}
});
test('discarding a take that never began stops the helper and removes its take folder; started takes are unaffected',async()=>{
 const f=await fixture();try{
  const started=await f.manager.start({selection,systemAudio:true}),directory=f.commands[0].directory;await fs.writeFile(path.join(directory,'screen.mp4'),'partial');
  assert.deepEqual(await f.handlers.get('native-recording-discard')!(f.event,started.id),{id:started.id,status:'discarded'});
  await assert.rejects(fs.access(directory));assert.deepEqual(f.commands.map(c=>c.command),['start','stop']);assert.deepEqual(f.states.map(s=>s.type),['started','stopped'],'the capture border and keep-awake end as for a stop');
  await assert.rejects(f.handlers.get('native-recording-discard')!({...f.event,senderFrame:{url:'http://127.0.0.1:5000/'}},started.id),/Untrusted/);
  const next=await f.manager.start({selection,systemAudio:false});const stopped=await f.manager.stop(next.id);await fs.access(path.dirname(stopped.videoPath));
 }finally{await f.close();}
});
test('append warnings and stopped errors preserve valid native media without killing the helper',async()=>{
 const f=await fixture(true,{stopped:{error:'Audio append failed'}});try{const started=await f.manager.start({selection,systemAudio:true});f.children[0].send({type:'warning',message:'Video append delayed'});assert.equal((await f.manager.pause(started.id)).status,'paused');const stopped=await f.manager.stop(started.id);assert.equal(stopped.status,'complete');assert.match(stopped.warning,/Audio append failed/);assert.deepEqual(f.children[0].killed,[]);assert.ok(f.events.some(event=>event.type==='warning'));const metadata=JSON.parse(await fs.readFile(path.join(f.commands[0].directory,'recovery.json'),'utf8'));assert.equal(metadata.videoPath,stopped.videoPath);}finally{await f.close();}
});
test('a pause timeout stops and finalizes the recording instead of terminating it',async()=>{
 const f=await fixture(true,{controls:false,controlTimeoutMs:5});try{const started=await f.manager.start({selection,systemAudio:false});await assert.rejects(f.manager.pause(started.id),/timed out/);const output=await f.manager.stop(started.id);assert.equal(output.status,'complete');assert.deepEqual(f.children[0].killed,[]);assert.deepEqual(f.commands.map(command=>command.command),['start','pause','stop']);}finally{await f.close();}
});
test('current-state replies settle duplicate native controls without waiting for a timeout',async()=>{
 const f=await fixture(true,{controls:false});try{const started=await f.manager.start({selection,systemAudio:false}),paused=f.manager.pause(started.id);f.children[0].send({type:'state',status:'paused',duration:1,transitionAtMs:2100});assert.equal((await paused).status,'paused');const resumed=f.manager.resume(started.id);f.children[0].send({type:'state',status:'recording',duration:1,transitionAtMs:2400});assert.equal((await resumed).transitionAtMs,2400);await f.manager.stop(started.id);}finally{await f.close();}
});
test('late native state replies cannot revive failed or completed sessions',async()=>{
 const f=await fixture();try{const started=await f.manager.start({selection,systemAudio:false});f.children[0].send({type:'error',message:'Capture failed'});f.children[0].send({type:'state',status:'recording',duration:1});await assert.rejects(f.manager.pause(started.id),/not active/);const next=await f.manager.start({selection,systemAudio:false}),stopped=await f.manager.stop(next.id);f.children[1].send({type:'state',status:'recording',duration:3});assert.deepEqual(await f.manager.stop(next.id),stopped);assert.deepEqual(f.commands.map(command=>command.command),['start','start','stop']);}finally{await f.close();}
});
test('reset during startup closes stdin and gives a late-starting helper time to finalize',async()=>{
 const f=await fixture(false);try{const pending=f.manager.start({selection,systemAudio:false}),rejected=assert.rejects(pending,/closed/);while(!f.children.length)await new Promise(resolve=>setTimeout(resolve,1));const child=f.children[0],directory=f.commands[0].directory;child.stdin.on('finish',()=>queueMicrotask(()=>{child.send({type:'stopped',videoPath:path.join(directory,'screen.mp4'),duration:1});child.emit('close',0,null);}));await f.manager.reset();await rejected;assert.deepEqual(child.killed,[]);const metadata=JSON.parse(await fs.readFile(path.join(directory,'recovery.json'),'utf8'));assert.equal(metadata.videoPath,path.join(directory,'screen.mp4'));}finally{await f.close();}
});
