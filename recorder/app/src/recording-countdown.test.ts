import test from 'node:test';import assert from 'node:assert/strict';import {ARM_AT_COUNT,PRE_ROLL_MS,countdownWithPreRoll,recordingCountdown} from './recording-countdown';
test('three countdown chimes precede the recording start, including a full last-second tail',async()=>{const events:unknown[]=[],abort=new AbortController();await recordingCountdown(abort.signal,n=>events.push(n),()=>events.push('chime'),async ms=>{events.push(ms);});events.push('start');assert.deepEqual(events,[3,'chime',1000,2,'chime',1000,1,'chime',1000,'start']);});
test('cancelling countdown prevents later chimes and recording start',async()=>{const events:unknown[]=[],abort=new AbortController();await assert.rejects(async()=>{await recordingCountdown(abort.signal,n=>events.push(n),()=>events.push('chime'),async()=>{abort.abort();});events.push('start');},{name:'AbortError'});assert.deepEqual(events,[3,'chime']);});
const deferred=()=>{let resolve!:()=>void,reject!:(error:unknown)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('capture arms when the countdown shows 2 and the take keeps half a second before go',async()=>{
 const events:unknown[]=[];let now=0;
 const result=await countdownWithPreRoll({clock:()=>now,cancel:()=>events.push('cancel'),arm:async()=>{events.push('arm');return 'armed';},countdown:async tick=>{for(const value of [3,2,1]){events.push(value);tick(value);now+=1000;}}});
 assert.deepEqual(events,[3,2,'arm',1]);assert.equal(ARM_AT_COUNT,2);assert.equal(PRE_ROLL_MS,500);
 assert.deepEqual(result,{armed:'armed',goAtMs:3000,keepFromMs:2500});
});
test('with the countdown off or skipped, capture arms at go and only once',async()=>{
 let arms=0;const result=await countdownWithPreRoll({clock:()=>100,cancel:()=>{},arm:async()=>++arms,countdown:async()=>{}});
 assert.deepEqual(result,{armed:1,goAtMs:100,keepFromMs:-400});
 const skipped=await countdownWithPreRoll({clock:()=>0,cancel:()=>{},arm:async()=>++arms,countdown:async tick=>{tick(3);tick(2);tick(1);}});assert.equal(skipped.armed,2);
});
test('an arming failure ends the countdown at once and is the error reported',async()=>{
 const abort=new AbortController();
 const run=countdownWithPreRoll({cancel:()=>abort.abort(),arm:async()=>{throw new Error('Screen capture failed');},countdown:async tick=>{tick(2);await new Promise((_,reject)=>abort.signal.addEventListener('abort',()=>reject(new DOMException('Countdown cancelled','AbortError'))));}});
 await assert.rejects(run,/Screen capture failed/);assert.equal(abort.signal.aborted,true);
});
test('a cancelled countdown waits for arming to settle, so the caller can discard what it started',async()=>{
 const armed=deferred(),events:string[]=[];
 const run=countdownWithPreRoll({cancel:()=>events.push('cancel'),arm:async()=>{await armed.promise;events.push('armed');},countdown:async tick=>{tick(2);throw new DOMException('Countdown cancelled','AbortError');}});
 let settled=false;void run.catch(()=>{settled=true;});await new Promise(r=>setTimeout(r,5));assert.equal(settled,false,'the start cannot end while capture is still arming');
 armed.resolve();await assert.rejects(run,{name:'AbortError'});assert.deepEqual(events,['armed']);
});
