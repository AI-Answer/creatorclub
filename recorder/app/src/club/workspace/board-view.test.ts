import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_VIEW,clampNoteSize,dotGrid,fitView,loadView,panBy,resizeNote,saveView,wheelIntent,wheelZoom,zoomAt} from './board-view';

test('zooming keeps the canvas point under the cursor where it was',()=>{
 const view={x:100,y:50,z:1};
 const at={x:400,y:300};
 const point=(v:typeof view)=>({x:(at.x-v.x)/v.z,y:(at.y-v.y)/v.z});
 const before=point(view);
 for(const z of [0.5,1.7,2]){const after=point(zoomAt(view,z,at.x,at.y));assert.ok(Math.abs(after.x-before.x)<1e-9&&Math.abs(after.y-before.y)<1e-9,`z=${z}`);}
});
test('zoom stays between 25% and 200%',()=>{
 assert.equal(zoomAt(DEFAULT_VIEW,10,0,0).z,2);
 assert.equal(zoomAt(DEFAULT_VIEW,0.01,0,0).z,0.25);
 const full={x:5,y:5,z:2};assert.equal(zoomAt(full,3,10,10),full,'no change at the limit');
});
test('wheel: scrolling and pinching zoom, Shift + scroll and sideways swipes pan',()=>{
 assert.equal(wheelIntent({ctrlKey:true,deltaMode:0,deltaX:0,deltaY:3.5}),'zoom');
 assert.equal(wheelIntent({ctrlKey:false,deltaMode:0,deltaX:0,deltaY:100}),'zoom');
 assert.equal(wheelIntent({ctrlKey:false,deltaMode:1,deltaX:0,deltaY:3}),'zoom');
 assert.equal(wheelIntent({ctrlKey:false,deltaMode:0,deltaX:4,deltaY:12.5}),'zoom','two fingers scrolling mostly up or down zoom');
 assert.equal(wheelIntent({ctrlKey:false,deltaMode:0,deltaX:20,deltaY:6}),'pan','a sideways swipe pans');
 assert.equal(wheelIntent({ctrlKey:false,shiftKey:true,deltaMode:0,deltaX:0,deltaY:40}),'pan','Shift + scroll pans');
 assert.ok(wheelZoom(1,3,1)<0.9&&wheelZoom(1,3,1)>0.85,'three lines is about one notch');
 assert.equal(wheelZoom(1,2000),wheelZoom(1,120),'a flick is capped per event');
 assert.ok(wheelZoom(1,-100)>1.1&&wheelZoom(1,-100)<1.14&&wheelZoom(1,100)<1);
 assert.ok(wheelZoom(1,-3,0,true)>1.02&&wheelZoom(1,-3,0,true)<1.04);
});
test('panning moves the view by the scroll',()=>{assert.deepEqual(panBy({x:10,y:10,z:1},-5,20),{x:5,y:30,z:1});});
test('fit shows the whole content centred and never zooms in past 100%',()=>{
 const small=fitView({x:0,y:0,w:100,h:100},1000,800);assert.equal(small.z,1);
 const big=fitView({x:0,y:0,w:4000,h:2000},1000,800);assert.equal(big.z,0.25);
 const v=fitView({x:200,y:100,w:800,h:400},1000,800);assert.ok(Math.abs((v.x+(200+400)*v.z)-500)<1&&Math.abs((v.y+(100+200)*v.z)-400)<1);
});
test('the dotted background keeps its spacing readable and follows the pan',()=>{
 assert.equal(dotGrid({x:0,y:0,z:1}).size,22);
 assert.ok(dotGrid({x:0,y:0,z:0.25}).size>=14);
 assert.deepEqual(dotGrid({x:-5,y:30,z:1}),{size:22,x:17,y:8});
});
test('the view is remembered per board, and a bad saved view is ignored',()=>{
 const mem=new Map<string,string>();const store={getItem:(k:string)=>mem.get(k)??null,setItem:(k:string,v:string)=>void mem.set(k,v)};
 assert.equal(loadView('a',store),undefined);
 saveView('a',{x:12.4,y:-3.6,z:1.2345},store);
 assert.deepEqual(loadView('a',store),{x:12,y:-4,z:1.235});
 assert.equal(loadView('b',store),undefined);
 mem.set('cc.board.view.a','{"x":1,"y":2,"z":9}');assert.equal(loadView('a',store),undefined);
 mem.set('cc.board.view.a','nope');assert.equal(loadView('a',store),undefined);
 assert.doesNotThrow(()=>saveView('a',DEFAULT_VIEW,{setItem(){throw new Error('blocked');}}));
 assert.equal(loadView('a',{getItem(){throw new Error('blocked');}}),undefined);
});
test('a note resized from its corner follows the pointer at any zoom and keeps a usable size',()=>{
 assert.deepEqual(resizeNote({w:280,h:120},60,40,1),{w:340,h:160});
 assert.deepEqual(resizeNote({w:280,h:120},60,40,2),{w:310,h:140});
 assert.deepEqual(resizeNote({w:280,h:120},-500,-500,1),{w:160,h:90});
 assert.deepEqual(clampNoteSize(5000,9000),{w:1200,h:2400});
});
