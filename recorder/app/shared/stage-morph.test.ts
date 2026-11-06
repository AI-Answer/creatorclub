import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,type Clip} from './types';
import {morphAt,morphNow,MORPH_SECONDS} from './stage-morph';

const tile={x:.8,y:.2,width:.18,height:.57,radius:19},full={x:0,y:0,width:1,height:1,radius:0};

test('the change blurs first, moves while blurred, then sharpens, as screenplay draws it',()=>{
 const at=(u:number)=>morphAt(u,tile,full);
 assert.deepEqual(at(0).box,tile,'it starts where the tile is');
 assert.equal(at(0).blur,0);
 assert.deepEqual(at(.2).box,tile,'it holds still while it blurs up');
 assert.equal(+(at(.25).blur*1920).toFixed(6),18,'blur peaks at 18 px (of 1920)');
 assert.equal(+(at(.6).blur*1920).toFixed(6),14);
 assert.deepEqual(at(.6).box,full,'the move is done by 60%');
 assert.equal(at(1).blur,0,'and it ends sharp');
 assert.ok(at(.4).box.width>tile.width&&at(.4).box.width<1,'between, the box is between');
});

test('a camera clip opens with the change only from the clip that ends where it starts, and only for its first 0.45 s',()=>{
 const p=createProject('Morph');
 const cam=(id:string,start:number,length:number,t:Partial<Clip['transform']>,morph?:number):Clip=>({id,mediaId:'m',name:id,track:'camera',start,sourceIn:start,sourceOut:start+length,speed:1,gain:1,muted:false,transform:{...defaultTransform(),...t},effects:defaultEffects(),...(morph?{morphIn:morph}:{})});
 p.clips.push(cam('a',0,5,{x:.8,y:.2,width:.18,height:.57,borderRadius:19}),cam('b',5,5,{},MORPH_SECONDS),cam('c',20,5,{},MORPH_SECONDS));
 assert.equal(morphNow(p.clips[1],p,4.9),undefined,'not before it starts');
 assert.equal(+morphNow(p.clips[1],p,5)!.box.x.toFixed(3),.8,'from the tile');
 assert.equal(morphNow(p.clips[1],p,5+MORPH_SECONDS),undefined,'over after 0.45 s');
 assert.equal(morphNow(p.clips[2],p,20.1),undefined,'nothing ends where c starts: no change');
});

test('the change runs on through cuts that keep the camera in its new place, and stops at one that moves it',()=>{
 const p=createProject('Cuts');
 const cam=(id:string,start:number,length:number,t:Partial<Clip['transform']>,morph?:number):Clip=>({id,mediaId:'m',name:id,track:'camera',start,sourceIn:start,sourceOut:start+length,speed:1,gain:1,muted:false,transform:{...defaultTransform(),...t},effects:defaultEffects(),...(morph?{morphIn:morph}:{})});
 const tileT={x:.8,y:.2,width:.18,height:.57,borderRadius:19};
 p.clips.push(cam('a',0,5,tileT),cam('b',5,.1,{},MORPH_SECONDS),cam('c',5.1,.1,{}),cam('d',5.2,2,{}),cam('e',7.2,2,tileT));
 const u=(time:number)=>morphNow(p.clips.find(c=>time>=c.start&&time<c.start+c.sourceOut-c.sourceIn)!,p,time);
 assert.ok(u(5.05)&&u(5.15)&&u(5.3),'through the two short pieces after it');
 assert.equal(+(u(5.3)!.blur*1920).toFixed(3),+(morphAt(.3/MORPH_SECONDS,tile,full).blur*1920).toFixed(3),'on the same clock');
 assert.equal(u(5.5),undefined,'over after 0.45 s');
 assert.equal(u(7.25),undefined,'a piece in another place has no change of its own');
});
