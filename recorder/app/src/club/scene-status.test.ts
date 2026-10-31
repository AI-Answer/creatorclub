import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedCount,sceneStatus} from './scene-status';

test('a scene reads Not recorded, then 1 take, 2 takes, Kept take n and Cut Ns',()=>{
 assert.deepEqual(sceneStatus({takes:[]}),{k:'none',label:'Not recorded'});
 assert.deepEqual(sceneStatus({takes:[{n:1}]}),{k:'takes',label:'1 take'});
 assert.deepEqual(sceneStatus({takes:[{n:1},{n:2}]}),{k:'takes',label:'2 takes'});
 assert.deepEqual(sceneStatus({takes:[{n:1},{n:2,kept:true}]}),{k:'kept',label:'Kept take 2'});
 assert.deepEqual(sceneStatus({takes:[{n:1,kept:true}],cut:3}),{k:'kept',label:'Kept take 1'},'a cut only shows once the pauses are removed');
 assert.deepEqual(sceneStatus({takes:[{n:1,kept:true}],cut:3},true),{k:'cut',label:'Cut 3s'});
 assert.deepEqual(sceneStatus({takes:[{n:1,kept:true}]},true),{k:'kept',label:'Kept take 1'},'nothing was cut from this scene');
 assert.deepEqual(sceneStatus({takes:[{n:1}],cut:3},true),{k:'takes',label:'1 take'},'no kept take, nothing to cut');
});

test('recordedCount counts scenes with a kept take',()=>{
 assert.equal(recordedCount([]),0);
 assert.equal(recordedCount([{takes:[{n:1,kept:true}]},{takes:[{n:1}]},{takes:[]},{takes:[{n:1},{n:2,kept:true}]}]),2);
});
