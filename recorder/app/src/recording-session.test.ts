import test from 'node:test';
import assert from 'node:assert/strict';
import {RecordingClock,RecordingTransitionGate,browserRecordingSelection,nativeRecordingOutputs,nativeRecordingOutputErrors,nativeRecordingNote,recorderMimeType,recorderOptions} from './recording-session';

test('native epoch anchors browser sources and removes all paused time without duplicate transitions',()=>{const clock=new RecordingClock();clock.start(1000);assert.equal(clock.offset(1125),.125);assert.equal(clock.elapsed(2200),1.2);clock.pause(2500);clock.pause(2700);assert.equal(clock.elapsed(6000),1.5);clock.resume(6500);clock.resume(6800);assert.equal(clock.elapsed(7000),2);clock.pause(7200);clock.resume(7400);assert.equal(clock.elapsed(8000),2.8);});
test('native screen and system audio are excluded from browser recorders while camera and microphone remain',()=>{const all={camera:true,microphone:true,screen:true,systemAudio:true};assert.deepEqual(browserRecordingSelection(all,true),{camera:true,microphone:true,screen:false,systemAudio:false});assert.deepEqual(browserRecordingSelection(all,false),all);assert.equal(all.screen,true);assert.deepEqual(nativeRecordingOutputs({videoPath:'/screen.mp4',audioPath:'/system.m4a'},true,true),[{path:'/screen.mp4',track:'screen'},{path:'/system.m4a',track:'audio',audioRole:'system'}]);assert.deepEqual(nativeRecordingOutputs({videoPath:'/unexpected.mp4',audioPath:'/system.m4a'},false,true),[{path:'/system.m4a',track:'audio',audioRole:'system'}]);assert.deepEqual(nativeRecordingOutputs({videoPath:'/screen.mp4'},true,true),[{path:'/screen.mp4',track:'screen'}]);assert.deepEqual(nativeRecordingOutputErrors({videoPath:'/screen.mp4'},true,true),['Native capture did not return system sound.']);});
test('pause and resume cannot race and stop waits for the active transition',async()=>{const gate=new RecordingTransitionGate();let finish!:()=>void;const events:string[]=[];const first=gate.run(async()=>{events.push('pause');await new Promise<void>(resolve=>finish=resolve);events.push('paused');});await Promise.resolve();assert.equal(gate.run(async()=>{events.push('resume');}),null);let stopped=false;const stop=gate.stop().then(()=>{stopped=true;});assert.equal(stopped,false);finish();await first;await stop;assert.equal(stopped,true);assert.deepEqual(events,['pause','paused']);assert.equal(gate.run(async()=>{}),null);gate.reset();assert.ok(gate.run(async()=>{}));});
test('video recorders prefer hardware H.264 MP4 and fall back to WebM, while audio-only stays WebM/Opus',()=>{const all=()=>true,webm=(t:string)=>t.startsWith('video/webm')||t.startsWith('audio/webm'),baseline=(t:string)=>t==='video/mp4;codecs=avc1'||t==='video/webm';assert.equal(recorderMimeType(true,all),'video/mp4;codecs=avc1.640028');assert.equal(recorderMimeType(true,baseline),'video/mp4;codecs=avc1');assert.equal(recorderMimeType(true,webm),'video/webm;codecs=vp9,opus');assert.equal(recorderMimeType(false,all),'audio/webm;codecs=opus');assert.equal(recorderMimeType(false,t=>t==='audio/webm'),'audio/webm');assert.equal(recorderMimeType(true,()=>false),undefined);});
test('only MP4 video recorders force one-second keyframes; WebM keeps its default GOP and audio keeps its bitrate',()=>{assert.deepEqual(recorderOptions(true,'video/mp4;codecs=avc1.640028'),{mimeType:'video/mp4;codecs=avc1.640028',videoBitsPerSecond:8_000_000,videoKeyFrameIntervalDuration:1000});assert.deepEqual(recorderOptions(true,'video/webm;codecs=vp9,opus'),{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:8_000_000});assert.deepEqual(recorderOptions(false,'audio/webm;codecs=opus'),{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192_000});});
test('take notes stay silent for normal timing and use plain language for noticeable stutter or an early stop',()=>{
 assert.equal(nativeRecordingNote({videoFrames:600,lateVideoFrames:7,droppedVideo:0}),'');
 assert.match(nativeRecordingNote({videoFrames:880,lateVideoFrames:220,droppedVideo:0}),/may stutter in places/);
 assert.match(nativeRecordingNote({videoFrames:300,stoppedEarly:true}),/^macOS ended the screen recording early/);
 assert.equal(nativeRecordingNote({}),'');
});

test('recording lifecycle rejects late transitions and keeps review/confirmation in one synchronous snapshot',async()=>{
 const {RecordingLifecycle}=await import('./recording-session');const state=new RecordingLifecycle();
 assert.equal(state.transition('paused'),false);assert.equal(state.transition('starting'),true);assert.equal(state.transition('starting'),true);
 assert.equal(state.transition('saving'),false);assert.equal(state.transition('recording'),true);assert.equal(state.transition('paused'),true);assert.equal(state.transition('saving'),true);
 assert.equal(state.transition('recording'),false);assert.equal(state.transition('ready'),true);assert.equal(state.transition('starting'),true);assert.equal(state.transition('idle'),true);
 state.review('take');assert.equal(state.getSnapshot().reviewId,'take');assert.equal(state.confirm(true),true);assert.equal(state.confirm(true),false);state.confirm(false);assert.equal(state.confirming,false);
});
test('detached recording state remains active until its save ends, while setup state is independent of the DOM',async()=>{
 const {RecordingLifecycle,trackRecordingLifecycle,isRecordingActive,captureSetupOpened,isCaptureSetupActive}=await import('./recording-session');
 const state=new RecordingLifecycle(),detach=trackRecordingLifecycle(state);state.transition('starting');assert.equal(isRecordingActive(),true);state.transition('recording');state.transition('paused');assert.equal(isRecordingActive(),true);state.transition('saving');detach();assert.equal(isRecordingActive(),true);state.transition('idle');assert.equal(isRecordingActive(),false);
 const close=captureSetupOpened();assert.equal(isCaptureSetupActive(),true);close();assert.equal(isCaptureSetupActive(),false);
});
test('chunk retry preserves the same write until success, backs off, and stops after four attempts',async()=>{
 const {retryRecordingWrite}=await import('./recording-session');let attempts=0;const delays:number[]=[];
 assert.equal(await retryRecordingWrite(async()=>{if(++attempts<3)throw Error('transient');return 7;},async ms=>{delays.push(ms);}),7);assert.equal(attempts,3);assert.deepEqual(delays,[150,300]);
 attempts=0;await assert.rejects(retryRecordingWrite(async()=>{attempts++;throw Error('disk');},async()=>{}),/disk/);assert.equal(attempts,4);
});
