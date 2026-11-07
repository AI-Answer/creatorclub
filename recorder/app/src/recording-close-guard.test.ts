import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const {createRecordingCloseGuard}=createRequire(import.meta.url)('../desktop/recording-close-guard.cjs');
test('closing an active or paused take asks once, then waits for saving to finish before closing',async()=>{
 let asks=0,stops=0;const guard=createRecordingCloseGuard({ask:async()=>{asks++;return true;},stop:()=>{stops++;guard.update('saving');}});guard.update('paused');const a=guard.attempt(),b=guard.attempt();await new Promise(resolve=>setImmediate(resolve));assert.equal(asks,1);assert.equal(stops,1);assert.equal(guard.active(),true);let done=false;void a.then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);guard.update('idle');assert.deepEqual(await Promise.all([a,b]),[true,true]);
});
test('cancel keeps recording; an already saving take asks immediately and waits',async()=>{
 let asks=0,stops=0;const guard=createRecordingCloseGuard({ask:async()=>{asks++;return false;},stop:()=>{stops++;}});guard.update('starting');assert.equal(await guard.attempt(),false);assert.equal(stops,0);guard.update('recording');guard.update('saving');const saved=guard.attempt();await new Promise(resolve=>setImmediate(resolve));assert.equal(asks,2);guard.update('idle');assert.equal(await saved,true);guard.update('ready');assert.equal(guard.active(),false);
});
test('renderer reload or loss releases its stale close state while native files finalize',async()=>{
 const source=await readFile(new URL('../desktop/main.cjs',import.meta.url),'utf8'),listeners=new Map<string,Function[]>();let status='recording',resets=0;
 const start=source.indexOf(" mainWindow.webContents.on('did-start-loading',resetShortcutContext);"),end=source.indexOf(" mainWindow.webContents.on('did-start-loading',()=>{mainVisibility=null;});",start);
 runInNewContext(source.slice(start,end),{mainWindow:{webContents:{on:(name:string,fn:Function)=>listeners.set(name,[...(listeners.get(name)??[]),fn])}},resetShortcutContext(){},recordingCloseGuard:{update:(value:string)=>{status=value;}},captureManager:{reset(){}},recordingHud:{end(){}},nativeRecording:{reset:()=>{resets++;return new Promise(()=>{});}}});
 for(const name of ['did-start-loading','render-process-gone']){status='recording';for(const listener of listeners.get(name)!)listener();assert.equal(status,'idle');}assert.equal(resets,2);
});
test('a stalled save times out into an explicit quit escape, preserving the stop request and allowing later attempts',async()=>{
 const questions:any[]=[];let stops=0;const guard=createRecordingCloseGuard({timeoutMs:5,ask:async(question:any)=>{questions.push(question);return questions.length===1?false:'discard';},stop:()=>{stops++;}});guard.update('saving');assert.equal(await guard.attempt(),true);assert.deepEqual(questions,[{status:'saving',timedOut:false},{status:'saving',timedOut:true}]);assert.equal(guard.active(),false);assert.equal(stops,0);assert.equal(questions[1].timedOut,true);
});
test('stop and save waits only until the timeout then can quit without saving',async()=>{
 const questions:any[]=[];let stops=0;const guard=createRecordingCloseGuard({timeoutMs:5,ask:async(question:any)=>{questions.push(question);return question.timedOut?'discard':true;},stop:()=>{stops++;guard.update('saving');}});guard.update('recording');assert.equal(await guard.attempt(),true);assert.equal(stops,1);assert.deepEqual(questions,[{status:'recording',timedOut:false},{status:'saving',timedOut:true}]);assert.equal(guard.active(),false);
});
test('finishing before the timeout closes once without a quit-without-saving question',async()=>{
 let asks=0;const guard=createRecordingCloseGuard({timeoutMs:50,ask:async()=>{asks++;return true;},stop:()=>{}});guard.update('saving');const pending=guard.attempt();setImmediate(()=>guard.update('idle'));assert.equal(await pending,true);assert.equal(asks,1);
});
test('main labels source setup and immediately offers the saving quit escape',async()=>{
 const source=await readFile(new URL('../desktop/main.cjs',import.meta.url),'utf8'),start=source.indexOf('const recordingCloseGuard='),end=source.indexOf('\nlet pendingRecordingClose',start),dialogs:any[]=[];let options:any;
 runInNewContext(source.slice(start,end),{createRecordingCloseGuard:(value:any)=>{options=value;},showEditor(){},mainWindow:{},dialog:{showMessageBox:async(_window:any,value:any)=>{dialogs.push(value);return {response:1};}}});
 assert.equal(await options.ask({status:'starting',timedOut:false}),true);assert.equal(dialogs[0].message,'Recording is starting');assert.equal(await options.ask({status:'saving',timedOut:true}),'discard');assert.deepEqual([...dialogs[1].buttons],['Keep waiting','Quit without saving']);assert.match(dialogs[1].detail,/recovery/);assert.equal(await options.ask({status:'saving',timedOut:false}),'discard');assert.equal(dialogs[2].message,'Saving your take…');assert.deepEqual([...dialogs[2].buttons],['Keep waiting','Quit without saving']);
});

test('saving asks immediately and completion aborts the visible dialog and quits automatically',async()=>{
 let asks=0,signal:AbortSignal|undefined;const guard=createRecordingCloseGuard({ask:(_question:unknown,value:AbortSignal)=>{asks++;signal=value;return new Promise(()=>{});},stop:()=>assert.fail('already saving')});guard.update('saving');const pending=guard.attempt();await new Promise(resolve=>setImmediate(resolve));assert.equal(asks,1);assert.equal(signal?.aborted,false);guard.update('idle');assert.equal(await pending,true);assert.equal(signal?.aborted,true);
});
test('Keep waiting still quits automatically after a later timeout question',async()=>{
 let asks=0;const guard=createRecordingCloseGuard({timeoutMs:5,ask:async()=>{asks++;if(asks===2)setImmediate(()=>guard.update('idle'));return false;},stop(){}});guard.update('saving');assert.equal(await guard.attempt(),true);assert.equal(asks,2);
});

test('completion wins even when dismissing the native dialog rejects its promise',async()=>{
 const guard=createRecordingCloseGuard({ask:(_question:unknown,signal:AbortSignal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('dialog dismissed')))),stop(){}});guard.update('saving');const pending=guard.attempt();await new Promise(resolve=>setImmediate(resolve));guard.update('idle');assert.equal(await pending,true);
});
