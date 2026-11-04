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
test('zoom stays between 2% and 200%',()=>{
 assert.equal(zoomAt(DEFAULT_VIEW,10,0,0).z,2);
 assert.equal(zoomAt(DEFAULT_VIEW,0.01,0,0).z,0.02);
 const full={x:5,y:5,z:2};assert.equal(zoomAt(full,3,10,10),full,'no change at the limit');
});
test('wheel: trackpad scrolling pans and pinch or Command-wheel zooms',()=>{
 assert.equal(wheelIntent({ctrlKey:true,deltaMode:0,deltaX:0,deltaY:3.5}),'zoom');
 assert.equal(wheelIntent({ctrlKey:false,metaKey:true,deltaMode:0,deltaX:0,deltaY:100}),'zoom');
 for(const [deltaX,deltaY,deltaMode] of [[0,100,0],[0,3,1],[4,12.5,0],[20,6,0]])assert.equal(wheelIntent({ctrlKey:false,deltaMode,deltaX,deltaY}),'pan');
 assert.equal(wheelIntent({ctrlKey:false,shiftKey:true,deltaMode:0,deltaX:0,deltaY:40}),'pan');
 assert.ok(wheelZoom(1,3,1)<0.9&&wheelZoom(1,3,1)>0.85);
 assert.equal(wheelZoom(1,2000),wheelZoom(1,120));
 assert.ok(wheelZoom(1,-3,0,true)>1.02&&wheelZoom(1,-3,0,true)<1.04);
});
test('panning moves the view by the scroll',()=>{assert.deepEqual(panBy({x:10,y:10,z:1},-5,20),{x:5,y:30,z:1});});
test('fit shows the whole content centred and never zooms in past 100%',()=>{
 const small=fitView({x:0,y:0,w:100,h:100},1000,800);assert.equal(small.z,1);
 const big=fitView({x:0,y:0,w:4000,h:2000},1000,800);assert.equal(big.z,0.21);
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

test('pinch zoom can leave the desktop minimum smoothly and fit can show 200 spread-out cards',()=>{
 const minimum={x:40,y:60,z:0.02};
 assert.ok(zoomAt(minimum,wheelZoom(minimum.z,-3,0,true),300,200).z>minimum.z);
 const fitted=fitView({x:100,y:100,w:7200,h:3400},1200,900);
 assert.ok(fitted.z<0.25&&fitted.z>=0.02);
 assert.ok(fitted.x+7300*fitted.z<=1200-79);
 assert.ok(fitted.y+3500*fitted.z<=900-79);
});
