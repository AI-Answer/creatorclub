import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayhead} from './playhead';

test('playhead notifies subscribers only for real time changes and stops after unsubscribe',()=>{
 const playhead=createPlayhead(2);let calls=0;const stop=playhead.subscribe(()=>{calls++;});
 assert.equal(playhead.get(),2);
 playhead.set(2);playhead.set(Number.NaN);assert.equal(calls,0);
 playhead.set(3.5);assert.equal(playhead.get(),3.5);assert.equal(calls,1);
 stop();playhead.set(4);assert.equal(calls,1);assert.equal(playhead.get(),4);
});

test('a listener that unsubscribes during notification does not skip the others',()=>{
 const playhead=createPlayhead();const seen:string[]=[];
 const stopA=playhead.subscribe(()=>{seen.push('a');stopA();});playhead.subscribe(()=>{seen.push('b');});
 playhead.set(1);playhead.set(2);
 assert.deepEqual(seen,['a','b','b']);
});

test('Task 14: after a delete or trim the playhead sits on the last frame of the shorter video, never past its end',async()=>{
 const {clampToEnd}=await import('./playhead');
 assert.equal(clampToEnd(9.9,9.9,30),9.9-1/30,'at the very end the preview would be black');
 assert.equal(clampToEnd(12,9,30),9-1/30);
 assert.equal(clampToEnd(4,9,30),4,'inside the video it stays');
 assert.equal(clampToEnd(3,0,30),0,'an empty video goes to 0');
});
