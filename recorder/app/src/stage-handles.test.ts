import test from 'node:test';
import assert from 'node:assert/strict';
import {dragBox} from './StageHandles';

const box={x:.5,y:.5,width:.25,height:.3};
const near=(a:number,b:number)=>Math.abs(a-b)<1e-9;

test('dragging inside moves the box, and it snaps to the edges and centre of the picture',()=>{
 assert.deepEqual(dragBox(box,'move',.1,-.1),{...box,x:.6,y:.4});
 const centred=dragBox(box,'move',-.13,0);
 assert.ok(near(centred.x,.5-box.width/2),'within 2% of the centre, it snaps to it');
 assert.equal(dragBox(box,'move',-.49,0).x,0,'and to the left edge');
});

test('dragging a corner resizes from the opposite corner and keeps the shape',()=>{
 const bigger=dragBox(box,'se',.1,0);
 assert.ok(near(bigger.width,.35)&&near(bigger.height,.35*1.2)&&bigger.x===box.x&&bigger.y===box.y);
 const fromTopLeft=dragBox(box,'nw',-.05,0);
 assert.ok(near(fromTopLeft.x+fromTopLeft.width,box.x+box.width)&&near(fromTopLeft.y+fromTopLeft.height,box.y+box.height),'the far corner stays put');
 assert.ok(dragBox(box,'se',-1,0).width>=.06,'it never shrinks to nothing');
});
