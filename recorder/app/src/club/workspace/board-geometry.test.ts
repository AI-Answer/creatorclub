import test from 'node:test';
import assert from 'node:assert/strict';
import {groupDelta,sectionBox,selectCard,inFrame,inRect,rectBetween,frameAround,type Box} from './board-layout';
import {centreView,minimapLayout,minimapPoint,viewportBox,wheelPan} from './board-view';

test('Shift-click toggles membership; a press on a selected card keeps the group for dragging',()=>{
 assert.deepEqual(selectCard(['a','b'],'c',true),['a','b','c']);
 assert.deepEqual(selectCard(['a','b'],'a',true),['b']);
 assert.deepEqual(selectCard(['a','b'],'a',false),['a','b']);
 assert.deepEqual(selectCard(['a','b'],'c',false),['c']);
});
test('group movement stops at the edge as a unit at any zoom',()=>{
 assert.deepEqual(groupDelta([{x:20,y:30},{x:100,y:80}],-90,-100,2),{dx:-20,dy:-30});
 assert.deepEqual(groupDelta([{x:20,y:30}],31,41,2),{dx:16,dy:21});
});
test('marquee can be drawn backwards; sections retain the server membership rule',()=>{
 const tiles=[{id:'a',kind:'note' as const,pos:{x:100,y:100,w:200}},{id:'b',kind:'note' as const,pos:{x:400,y:180,w:200}}];
 assert.deepEqual(inRect(rectBetween({x:650,y:300},{x:80,y:80}),tiles),['a','b']);
 assert.deepEqual(inRect({x:300,y:0,w:10,h:90},tiles),[]);
 const box=frameAround(tiles.map(tile=>({...tile.pos,h:200})));
 assert.deepEqual(inFrame(box,tiles),['a','b']);
 assert.deepEqual(inFrame({x:100,y:100,w:199,h:100},tiles),[]);
});
test('viewport, minimap and click navigation share board coordinates, even at negative offsets',()=>{
 const view={x:120,y:-240,z:0.5};
 assert.deepEqual(viewportBox(view,1000,600),{x:-240,y:480,w:2000,h:1200});
 const boxes:Box[]=[{x:3000,y:2000,w:300,h:500}];
 const map=minimapLayout(boxes,view,1000,600);
 const point={x:3100,y:2200};
 const back=minimapPoint(map,map.ox+(point.x-map.x)*map.scale,map.oy+(point.y-map.y)*map.scale);
 assert.ok(Math.abs(back.x-point.x)<1e-8&&Math.abs(back.y-point.y)<1e-8);
 const next=centreView(view,back,1000,600),visible=viewportBox(next,1000,600);
 assert.equal(next.z,view.z);assert.ok(Math.abs(visible.x+visible.w/2-point.x)<1e-8);
 for(const box of [...boxes,map.viewport]){assert.ok(map.ox+(box.x-map.x)*map.scale>=0);assert.ok(map.oy+(box.y-map.y)*map.scale>=0);assert.ok(map.ox+(box.x+box.w-map.x)*map.scale<=180);assert.ok(map.oy+(box.y+box.h-map.y)*map.scale<=112);}
});
test('empty minimaps are finite; wheel line/page units and Shift map to screen pixels',()=>{
 const map=minimapLayout([],{x:0,y:0,z:2},0,0);assert.ok(Number.isFinite(map.scale)&&map.scale>0);
 const event={ctrlKey:false,deltaMode:1,deltaX:2,deltaY:3};
 assert.deepEqual(wheelPan(event),{dx:-80,dy:-120});
 assert.deepEqual(wheelPan({...event,deltaMode:2,deltaX:0,deltaY:1},600),{dx:0,dy:-600});
 assert.deepEqual(wheelPan({...event,deltaMode:0,deltaX:0,deltaY:30,shiftKey:true}),{dx:-30,dy:0});
});

test('sections drawn in the panned margin clamp to valid storage coordinates',()=>{
 assert.deepEqual(sectionBox({x:-145.4,y:-12,w:400.2,h:300.7}),{x:0,y:0,w:400,h:301});
 assert.deepEqual(sectionBox({x:21.6,y:30.2,w:0,h:4}),{x:22,y:30,w:120,h:100});
});
