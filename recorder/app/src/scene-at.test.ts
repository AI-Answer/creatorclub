import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sceneAt} from './scene-at';

const scenes=[{id:'a',start:0,duration:10},{id:'b',start:10,duration:20},{id:'empty',start:30,duration:0},{id:'c',start:35,duration:5}];

test('the scene chip follows the scene whose range holds the playhead',()=>{
 assert.equal(sceneAt(scenes,0),'a');
 assert.equal(sceneAt(scenes,9.99),'a');
 assert.equal(sceneAt(scenes,10),'b','a boundary belongs to the scene that starts there');
 assert.equal(sceneAt(scenes,35),'c');
});

test('a scene with no footage never holds the playhead, a gap keeps the earlier scene, and the end keeps the last',()=>{
 assert.equal(sceneAt(scenes,31),'b');
 assert.equal(sceneAt(scenes,40),'c');
 assert.equal(sceneAt(scenes,99),'c');
});

test('before the first scene the first one holds it, and an empty timeline names none',()=>{
 assert.equal(sceneAt([{id:'x',start:5,duration:5}],0),'x');
 assert.equal(sceneAt([{id:'x',start:0,duration:0}],0),undefined);
 assert.equal(sceneAt([],3),undefined);
});

test('scenes out of order are read by their start time',()=>{
 assert.equal(sceneAt([{id:'late',start:10,duration:5},{id:'early',start:0,duration:10}],4),'early');
});
