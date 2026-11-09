import {mountUI} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {AiStatus} from '../../shared/club';
import {beginAiStatusRequest,forgetAiStatus,lastAiStatus,rememberAiStatus,useAiAvailability,useAiCheck} from './ai-status';
import {useTrending} from './useFeed';
import {FakeEventSource,installFetch,type FakeReply} from './test-fakes';
const off:AiStatus={claude:{installed:false,version:null,signedIn:false},codex:{installed:false,version:null,signedIn:false}};
const on:AiStatus={...off,claude:{installed:true,version:'test',signedIn:true}};
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const deferred=()=>{let resolve!:(reply:FakeReply)=>void;const promise=new Promise<FakeReply>(r=>{resolve=r;});return {promise,resolve};};

test('AI cache rejects older answers once a newer request starts or an explicit status is remembered',()=>{
 forgetAiStatus();const old=beginAiStatusRequest(),fresh=beginAiStatusRequest();
 rememberAiStatus(off,old);assert.equal(lastAiStatus(),null);
 rememberAiStatus(on,fresh);rememberAiStatus(off,old);assert.deepEqual(lastAiStatus(),on);
 const pending=beginAiStatusRequest();rememberAiStatus(on);rememberAiStatus(off,pending);assert.deepEqual(lastAiStatus(),on);
});

for(const screen of ['check','settings'] as const)test(`shared availability and ${screen} dedupe their probe and reject an older answer after connect`,async()=>{
 forgetAiStatus();const first=deferred();let requests=0;
 const fake=installFetch(call=>call.path==='/ai/status'?(++requests===1?first.promise:{body:on}):undefined);
 function Availability(){const {known,available}=useAiAvailability();return createElement('span',null,`${known}:${available}`);}
 function Check(){useAiCheck();return null;}
 const ui=await mountUI(createElement(Availability));
 try{
  assert.equal(ui.container.textContent,'false:true');
  const {SettingsScreen}=await import('./screens/SettingsScreen');
  const check=await mountUI(screen==='check'?createElement(Check):createElement(SettingsScreen,{onSetup(){}}));
  try{await flush();assert.equal(requests,1);await act(async()=>rememberAiStatus(on));assert.equal(ui.container.textContent,'true:true');await act(async()=>first.resolve({body:off}));await flush();assert.equal(ui.container.textContent,'true:true');assert.deepEqual(lastAiStatus(),on);}finally{await check.close();}
 }finally{await ui.close();fake.restore();}
});

for(const failure of ['request','job'] as const)test(`automatic trending seed waits for known access and retries after ${failure} failure and reconnection`,async()=>{
 forgetAiStatus();FakeEventSource.install();const status=deferred();let attempts=0;
 const fake=installFetch(call=>{
  if(call.path==='/ai/status')return status.promise;
  if(call.path==='/trending')return {body:{items:[],updatedAt:null,followed:0}};
  if(call.path==='/trending/refresh'){attempts++;return failure==='request'&&attempts===1?{status:500,body:{error:'No AI'}}:{body:{id:'j1',status:'running'}};}
 });
 function Feed(){useTrending();return null;}
 const ui=await mountUI(createElement(Feed));
 try{
  await flush();assert.equal(attempts,0);
  await act(async()=>status.resolve({body:off}));await flush();assert.equal(attempts,0);
  await act(async()=>rememberAiStatus(on));await flush();assert.equal(attempts,1);
  if(failure==='job'){await act(async()=>FakeEventSource.last().emit('failed',{message:'No AI'}));await flush();}
  await flush();assert.equal(attempts,1,'no immediate retry loop');
  await act(async()=>rememberAiStatus(off));await act(async()=>rememberAiStatus(on));await flush();assert.equal(attempts,2);
 }finally{await ui.close();fake.restore();}
});
