import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,type Media} from '../shared/types';
import {recordingApi,recordingFetch,saveRecordingTake,RECORDING_SAVE_TIMEOUT} from './recording-save';
import type {SavedTake} from './recorded-takes';
const media:Media={id:'m',name:'Screen',path:'/screen.mp4',kind:'video',duration:2,width:1280,height:720};
const take:SavedTake={id:'take',createdAt:'2026-11-06',sceneId:'scene',media:[media],tracks:['screen'],offsets:[0]};
test('a live save checks draft identity and falls back to a fresh conditional save if the project changed',async()=>{
 const original=fetch,project=createProject('Recorded'),other=createProject('Other'),requests:any[]=[];project.scenes[0].id=take.sceneId;
 globalThis.fetch=async(url,options)=>{requests.push({url,options});return options?.method==='PUT'?Response.json({}):Response.json(project,{headers:{ETag:'"rev"'}});};
 try{await saveRecordingTake(project.id,take,async fn=>fn(other));assert.equal(other.recordedTakes?.length??0,0);assert.equal(requests.length,2);assert.equal(requests[1].options.headers['If-Match'],'"rev"');assert.equal(JSON.parse(requests[1].options.body).recordedTakes[0].id,'take');}finally{globalThis.fetch=original;}
});
test('a detached take rebases a revision conflict on the original project without dropping newer edits',async()=>{
 const original=fetch,project=createProject('Recorded');project.scenes[0].id=take.sceneId;let reads=0,writes=0;globalThis.fetch=async(url,options)=>{assert.equal(url,`/api/projects/${project.id}`);if(options?.method==='PUT'){writes++;if(writes===1)return Response.json({error:'stale'},{status:409});const saved=JSON.parse(String(options.body));assert.equal(saved.notes,'New server edit');assert.equal(options.headers&&new Headers(options.headers).get('If-Match'),'"rev2"');assert.equal(saved.recordedTakes[0].id,'take');return Response.json(saved);}reads++;return Response.json({...project,notes:reads===2?'New server edit':''},{headers:{ETag:`"rev${reads}"`}});};
 try{await saveRecordingTake(project.id,take);assert.equal(reads,2);assert.equal(writes,2);}finally{globalThis.fetch=original;}
});
test('storage API and chunk writes carry a finite timeout signal',async()=>{
 const original=fetch,timeout=AbortSignal.timeout,deadlines:number[]=[],signals:AbortSignal[]=[];AbortSignal.timeout=ms=>{deadlines.push(ms);return new AbortController().signal;};globalThis.fetch=async(_url,options)=>{signals.push(options!.signal!);return Response.json({});};
 try{for(const path of ['/recordings/a/finish','/recordings/synchronize','/media/import'])await recordingApi(path,{});await recordingFetch('/api/recordings/a/chunks?index=-2',{method:'PUT'});assert.deepEqual(deadlines,Array(4).fill(RECORDING_SAVE_TIMEOUT));assert.equal(signals.length,4);assert.ok(signals.every(signal=>signal instanceof AbortSignal));}finally{globalThis.fetch=original;AbortSignal.timeout=timeout;}
});
test('closing the project before the studio callback runs falls back to the recorded project API',async()=>{
 const original=fetch,project=createProject('Recorded');project.scenes[0].id=take.sceneId;let writes=0;globalThis.fetch=async(url,options)=>{assert.equal(url,`/api/projects/${project.id}`);if(options?.method==='PUT'){writes++;assert.equal(JSON.parse(String(options.body)).recordedTakes[0].id,take.id);return Response.json({});}return Response.json(project,{headers:{ETag:'"rev"'}});};
 try{await saveRecordingTake(project.id,take,async()=>{throw Error('Open the recording project first.');});assert.equal(writes,1);}finally{globalThis.fetch=original;}
});
