import test from 'node:test';
import assert from 'node:assert/strict';
import {countdownWithPreRoll} from './recording-countdown';
import {RecordingClock,recordingNow} from './recording-session';

test('after the Mac slept, a take still starts at the wall clock, so its timer reads 00:00 and not hours (212:14)',async()=>{
 const real=globalThis.performance;
 // A Mac that slept for 3.5 h: performance.timeOrigin+now() stopped meanwhile and runs that far behind the wall clock.
 const asleep=3.5*3600*1000;
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{timeOrigin:Date.now()-asleep,now:()=>0}});
 try{
  const {goAtMs}=await countdownWithPreRoll({countdown:async()=>{},arm:async()=>1,cancel(){}});
  assert.ok(Math.abs(goAtMs-Date.now())<1000,'go is now, not 3.5 h ago');
  const clock=new RecordingClock();clock.start(goAtMs);
  assert.ok(clock.elapsed(Date.now())<2,'the timer starts at zero');
  assert.ok(Math.abs(recordingNow()-Date.now())<5);
 }finally{Object.defineProperty(globalThis,'performance',{configurable:true,value:real});}
});
