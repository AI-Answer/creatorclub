import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,rm} from 'node:fs/promises';
import type {AddressInfo} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {defaultEffects,defaultTransform,type RecordedTake} from '../../shared/types.js';

const temp=await mkdtemp(path.join(os.tmpdir(),'creator-compiler-quick-'));
process.env.CREATORCLUB_DIR=path.join(temp,'channels');
process.env.CREATORCLUB_SECRETS_DIR=path.join(temp,'settings');
process.env.SCENEFORGE_DATA_DIR=path.join(temp,'studio');
const {clubRouter}=await import('./index.js');
const storage=await import('../storage.js');
await storage.initStorage();
const app=express();
let aiCalls=0;
app.use('/api/club',clubRouter({runAI:async()=>{aiCalls++;throw new Error('No AI connected');}}));
const server=app.listen(0,'127.0.0.1');
await new Promise<void>(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(temp,{recursive:true,force:true});});
async function call(method:string,url:string,body?:unknown){
 const response=await fetch(base+url,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,body:await response.json()};
}
await call('POST','/workspaces',{name:'Quick tests',topics:[]});

test('quick recording creates exactly one unscripted recorder scene without writing or completing a plan',async()=>{
 for(const stage of ['ideas','planning']){
  const {body:video}=await call('POST','/videos',{title:`Quick ${stage}`,stage});
  assert.equal((await call('POST',`/videos/${video.id}/recorder`)).status,400,'the planned path still requires scenes');
  const results=await Promise.all([1,2].map(()=>call('POST',`/videos/${video.id}/recorder`,{quick:true})));
  for(const result of results){assert.equal(result.status,200);assert.equal(result.body.stage,'recording');assert.equal(result.body.quickRecording,true);assert.deepEqual(result.body.planning,video.planning);}
  assert.equal(results[0].body.recorderProjectId,results[1].body.recorderProjectId,'concurrent calls reuse one project');
  const project=await storage.readProject(results[0].body.recorderProjectId);
  assert.equal(project.name,video.title);
  assert.equal(project.scenes.length,1);
  assert.equal(project.scenes[0].script,'');
  assert.equal(project.scenes[0].notes,'');
  assert.equal(project.canvas.padding,0);
  const plan=await call('GET',`/videos/${video.id}/plan`);
  assert.equal(plan.body.outline,null);
  assert.equal(plan.body.package,null);
  assert.equal((await call('GET',`/videos/${video.id}/scenes`)).body.length,1);
 }
});

test('quick recordings expose real takes to Edit, scene batches and move facts; repeated setup preserves the recording',async()=>{
 const {body:video}=await call('POST','/videos',{title:'Unplanned take'});
 const {body:ready}=await call('POST',`/videos/${video.id}/recorder`,{quick:true});
 const project=await storage.readProject(ready.recorderProjectId);
 const take:RecordedTake={id:'take1',sceneId:project.scenes[0].id,createdAt:new Date().toISOString(),media:[{id:'media1',name:'Camera',path:'/tmp/quick-test.mov',kind:'video',duration:12,width:1920,height:1080}],tracks:['camera'],offsets:[0]};
 project.recordedTakes=[take];project.media=take.media;
 project.clips=[{id:'clip1',mediaId:'media1',name:'Camera',track:'camera',start:0,sourceIn:0,sourceOut:12,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects(),recordingTakeId:take.id}];
 project.scenes[0].duration=12;
 await storage.saveProject(project);
 const before=await storage.readProject(project.id);
 const again=await call('POST',`/videos/${video.id}/recorder`,{quick:true});
 assert.equal(again.body.recorderProjectId,project.id);
 assert.deepEqual(await storage.readProject(project.id),before,'no scenes, takes or timeline edits are rewritten');
 const scenes=(await call('GET',`/videos/${video.id}/scenes`)).body;
 assert.equal(scenes.length,1);assert.equal(scenes[0].takes[0].kept,true);assert.equal(scenes[0].takes[0].seconds,12);
 assert.deepEqual((await call('GET','/videos/scenes')).body[video.id],scenes);
 assert.equal((await call('GET','/videos/move-facts')).body[video.id].takes,1);
 assert.equal((await call('POST',`/videos/${video.id}/move`,{stage:'editing'})).status,200);
 assert.equal((await call('PUT',`/videos/${video.id}`,{title:'Renamed recording'})).body.title,'Renamed recording');
 assert.equal((await call('GET',`/videos/${video.id}/plan`)).body.outline,null);
 await call('PUT',`/videos/${video.id}/outline`,{scenes:[{title:'Later plan',seconds:10,talkingPoints:[],show:''}]});
 await call('POST',`/videos/${video.id}/recorder`);
 const afterPlan=(await call('GET',`/videos/${video.id}/scenes`)).body;
 assert.equal(afterPlan.length,2);
 assert.equal(afterPlan[0].takes[0].id,take.id,'adding a plan later never hides the quick recording');
});

test('quick setup keeps an existing outline and recorder project; missing videos and invalid options are rejected',async()=>{
 const {body:video}=await call('POST','/videos',{title:'Planned video'});
 await call('PUT',`/videos/${video.id}/outline`,{scenes:[{title:'Opening',seconds:30,talkingPoints:['Hello'],show:'Camera'}]});
 const {body:ready}=await call('POST',`/videos/${video.id}/recorder`,{quick:true});
 const project=await storage.readProject(ready.recorderProjectId);
 assert.equal(project.scenes[0].name,'Opening');assert.equal(project.scenes[0].script,'Hello');
 assert.equal(ready.quickRecording,undefined);
 assert.equal((await call('POST','/videos/missing/recorder',{quick:true})).status,404);
 assert.equal((await call('POST',`/videos/${video.id}/recorder`,{quick:'yes'})).status,400);
});


test('manual plan, package, scripts, reorder and deleting the last scene never call AI',async()=>{
 const {body:video}=await call('POST','/videos',{title:'A handmade video'});
 const base=`/videos/${video.id}`;
 const first={id:'manual1',title:'Introduction',talkingPoints:['Explain the demo'],show:'Screen',seconds:30};
 const second={id:'manual2',title:'Demo',talkingPoints:['Show it working'],show:'Camera',seconds:60};
 assert.equal((await call('PUT',`${base}/outline`,{scenes:[first]})).status,200);
 assert.equal((await call('PUT',`${base}/script/scene/manual1`,{text:'Here is my demo.'})).status,200);
 assert.equal((await call('PUT',`${base}/package`,{titles:['My title','',''],thumbnailText:'MY DEMO',hook:{spoken:'Watch this.',visual:'',text:''},angle:'',twist:''})).status,200);
 assert.equal((await call('PUT',`${base}/outline`,{scenes:[second,first]})).status,200);
 let plan=(await call('GET',`${base}/plan`)).body;
 assert.deepEqual(plan.outline.scenes.map((s:{id:string})=>s.id),['manual2','manual1']);
 assert.equal(plan.outline.scenes[1].script,'Here is my demo.');
 assert.equal(plan.package.thumbnailText,'MY DEMO');
 assert.equal((await call('POST',`${base}/recorder`)).status,200);
 assert.equal((await call('PUT',`${base}/outline`,{scenes:[]})).status,200);
 plan=(await call('GET',`${base}/plan`)).body;
 assert.equal(plan.outline,null);
 assert.equal((await call('GET',base)).body.planning.outline,false);
 assert.equal(aiCalls,0);
});
