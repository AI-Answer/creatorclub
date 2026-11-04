import {mountUI} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Video} from '../../shared/club';
import {installFetch,type FakeReply} from './test-fakes';
import {applyMove} from './production';
import {useProduction} from './useProduction';
import {ToastProvider} from './ui';
const mk=(id:string,stage:Video['stage']):Video=>({id,title:id,stage,order:0,createdAt:'2026-10-01',updatedAt:'2026-10-01',stageDates:{},planning:{research:false,package:false,outline:false}});
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

for(const failed of [false,true])test(`production reload replays pending moves, ${failed?'rolls back failure':'keeps successful saves'} and refetches once after drain`,async()=>{
 let server=[mk('a','recording'),mk('b','ideas')],listReads=0;
 const releases:Array<()=>void>=[];
 const fake=installFetch(async call=>{
  if(call.path==='/videos'){listReads++;return {body:structuredClone(server)};}
  if(call.path==='/recent')return {body:[]};
  const match=call.path.match(/^\/videos\/(.+)\/move$/);
  if(match)return new Promise<FakeReply>(resolve=>{
   releases.push(()=>{
    if(failed&&match[1]==='a'){resolve({status:500,body:{error:'Move refused'}});return;}
    const move=call.body as {stage:Video['stage'];beforeId:string|null};
    server=applyMove(server,match[1],move.stage,move.beforeId,'server-time').map(v=>({...v,title:'Authoritative '+v.id}));
    resolve({body:server.find(v=>v.id===match[1])});
   });
  });
 });
 let production!:ReturnType<typeof useProduction>;
 function Probe(){production=useProduction();return createElement('div',null,production.videos?.map(v=>`${v.id}:${v.stage}`).join(','));}
 const ui=await mountUI(createElement(ToastProvider,null,createElement(Probe)));
 try{
  await flush();let first!:Promise<void>,second!:Promise<void>;
  await act(async()=>{first=production.move('a','ideas',null);});
  assert.equal(production.videos!.find(v=>v.id==='a')!.stage,'ideas');
  await act(async()=>production.reload());await flush();
  assert.equal(production.videos!.find(v=>v.id==='a')!.stage,'ideas','reload must replay the in-flight move over the fresh list');
  await act(async()=>{second=production.move('b','editing',null);});
  assert.equal(releases.length,1,'reload must preserve the same serial save queue');
  await act(async()=>{releases[0]();await first;});
  assert.equal(listReads,2,'no reconciliation until all queued saves finish');
  assert.equal(production.videos!.find(v=>v.id==='a')!.stage,failed?'recording':'ideas');
  assert.equal(production.videos!.find(v=>v.id==='b')!.stage,'editing','later move survives rollback');
  await act(async()=>{releases[1]();await second;});await flush();
  assert.equal(listReads,3,'one authoritative refetch after the queue drains');
  assert.deepEqual(production.videos,server);
 }finally{for(const release of releases)release();await flush();await ui.close();fake.restore();}
});
