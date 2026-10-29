import {mountUI} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
import type {ScenesByVideo,Video,VideoScene} from '../../shared/club';
import {installFetch,type FakeCall,type FakeReply} from './test-fakes';
const {VIDEOS_CHANGED}=await import('./api');
const {toProgress,useSceneProgress}=await import('./scenes');

const video=(id:string,stage:Video['stage']):Video=>({id,title:id,stage,order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false}});
const scene=(id:string,kept:boolean[],extra:Partial<VideoScene>={}):VideoScene=>({id,title:id,seconds:30,takes:kept.map((k,i)=>({id:`${id}${i}`,seconds:10,kept:k,retained:false})),status:'x',...extra});
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

test('the dots of a video come from its takes in the order they were recorded, with the seconds cut',()=>{
 assert.deepEqual(toProgress([scene('a',[]),scene('b',[false,true]),scene('c',[true],{cutSeconds:14})]),[
  {takes:[]},{takes:[{n:1,kept:false},{n:2,kept:true}]},{takes:[{n:1,kept:true}],cut:14},
 ]);
 assert.deepEqual(toProgress([]),[],'a video with no scenes');
});

/** Shows what the hook returns, and lets the test change the videos it is given. */
function probe(initial:Video[]){
 const seen:Array<Record<string,unknown>>=[];
 let set:(videos:Video[])=>void=()=>{};
 const Probe=()=>{
  const [videos,setVideos]=useState(initial);set=setVideos;
  seen.push(useSceneProgress(videos));return null;
 };
 return {Probe,seen,change:(videos:Video[])=>act(async()=>{set(videos);}),last:()=>seen.at(-1)!};
}

const requests=(calls:FakeCall[])=>calls.filter(call=>call.path==='/videos/scenes').length;

test('one request for the whole screen, for the videos being made; an unreadable video is unknown, an empty outline is zero scenes',async()=>{
 const videos=[video('plan','planning'),video('rec','recording'),video('empty','editing'),video('bad','publishing'),video('idea','ideas'),video('out','published')];
 const answer:ScenesByVideo={plan:[scene('s1',[]),scene('s2',[])],rec:[scene('s1',[true]),scene('s2',[false,false])],empty:[],idea:[scene('s1',[])]};
 const fake=installFetch(call=>call.path==='/videos/scenes'?{body:answer}:undefined);
 const {Probe,last}=probe(videos);
 const ui=await mountUI(createElement(Probe));
 try{
  await flush();
  assert.equal(requests(fake.calls),1,'one request, not one per video');
  assert.deepEqual(Object.keys(last()).sort(),['empty','plan','rec'],'only videos being made; the unreadable one has no entry');
  assert.deepEqual(last().empty,[],'known to have no scenes');
  assert.equal('bad' in last(),false,'unknown is not zero');
  assert.deepEqual(last().rec,[{takes:[{n:1,kept:true}]},{takes:[{n:1,kept:false},{n:2,kept:false}]}]);
 }finally{await ui.close();fake.restore();}
});

test('a video changing stage does not ask again; a saved change to a video does; a video that arrives and was already covered does not',async()=>{
 const videos=[video('a','planning'),video('b','recording')];
 let answer:ScenesByVideo={a:[scene('s1',[])],b:[scene('s1',[false])],c:[]};
 const fake=installFetch(call=>call.path==='/videos/scenes'?{body:answer}:undefined);
 const {Probe,change,last}=probe(videos);
 const ui=await mountUI(createElement(Probe));
 try{
  await flush();assert.equal(requests(fake.calls),1);
  await change([video('a','recording'),video('b','editing')]);await flush();
  assert.equal(requests(fake.calls),1,'same videos, new stages: no new request');
  assert.deepEqual(Object.keys(last()).sort(),['a','b']);

  answer={a:[scene('s1',[true])],b:[scene('s1',[false])],c:[]};
  await act(async()=>{window.dispatchEvent(new Event(VIDEOS_CHANGED));});await flush();
  assert.equal(requests(fake.calls),2,'a saved change reads the scenes again');
  assert.deepEqual(last().a,[{takes:[{n:1,kept:true}]}]);

  await change([video('a','recording'),video('b','editing'),video('c','planning')]);await flush();
  assert.equal(requests(fake.calls),2,'the last answer already had c');
  assert.deepEqual(last().c,[]);

  await change([video('a','recording'),video('b','editing'),video('c','planning'),video('d','planning')]);await flush();
  assert.equal(requests(fake.calls),3,'a video the answer did not have is asked for');
 }finally{await ui.close();fake.restore();}
});

test('nothing is asked while no video is shown, and a failed read leaves every video unknown until the next try',async()=>{
 let fail=false;
 const fake=installFetch((call):FakeReply=>call.path==='/videos/scenes'?(fail?{status:500,body:{error:'That did not work.'}}:{body:{a:[scene('s1',[])]}}):undefined);
 const {Probe,change,last}=probe([]);
 const ui=await mountUI(createElement(Probe));
 try{
  await flush();
  await act(async()=>{window.dispatchEvent(new Event(VIDEOS_CHANGED));});await flush();
  assert.equal(requests(fake.calls),0,'no videos, no request');
  await change([video('a','planning')]);await flush();
  assert.equal(requests(fake.calls),1);assert.deepEqual(Object.keys(last()),['a']);
  fail=true;
  await act(async()=>{window.dispatchEvent(new Event(VIDEOS_CHANGED));});await flush();
  assert.equal(requests(fake.calls),2);assert.deepEqual(last(),{},'could not read: unknown, not zero');
  fail=false;
  await act(async()=>{window.dispatchEvent(new Event(VIDEOS_CHANGED));});await flush();
  assert.deepEqual(Object.keys(last()),['a'],'and known again');
 }finally{await ui.close();fake.restore();}
});

test('a slow answer that was asked for first never replaces the newer one',async()=>{
 const holds:Array<(value:ScenesByVideo)=>void>=[];
 const fake=installFetch(call=>call.path==='/videos/scenes'?new Promise<FakeReply>(resolve=>holds.push(body=>resolve({body}))):undefined);
 const {Probe,last}=probe([video('a','planning')]);
 const ui=await mountUI(createElement(Probe));
 try{
  await flush();
  await act(async()=>{window.dispatchEvent(new Event(VIDEOS_CHANGED));});
  assert.equal(holds.length,2);
  await act(async()=>{holds[1]({a:[scene('s1',[true])]});});await flush();
  await act(async()=>{holds[0]({a:[]});});await flush();
  assert.deepEqual(last().a,[{takes:[{n:1,kept:true}]}],'the older answer was dropped');
 }finally{await ui.close();fake.restore();}
});
