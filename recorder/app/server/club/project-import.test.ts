import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,rm} from 'node:fs/promises';
import type {AddressInfo} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {createProject} from '../../shared/types.js';

const temp=await mkdtemp(path.join(os.tmpdir(),'creator-compiler-import-'));
process.env.CREATORCLUB_DIR=path.join(temp,'channels');
process.env.CREATORCLUB_SECRETS_DIR=path.join(temp,'settings');
process.env.SCENEFORGE_DATA_DIR=path.join(temp,'studio');
const {clubRouter}=await import('./index.js');
const storage=await import('../storage.js');
await storage.initStorage();
const app=express();
app.use('/api/club',clubRouter());
const server=app.listen(0,'127.0.0.1');
await new Promise<void>(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(temp,{recursive:true,force:true});});
async function call(method:string,url:string,body?:unknown){
 const response=await fetch(base+url,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,body:await response.json()};
}
await call('POST','/workspaces',{name:'Integration test',topics:[]});

test('a Cutroom render opens as a separate editing video and repeated imports keep one card',async()=>{
 const source=await storage.saveProject(createProject('Original recording'));
 const original=await call('POST','/videos',{title:source.name,stage:'editing'});
 await call('PUT',`/videos/${original.body.id}`,{recorderProjectId:source.id});
 const rendered=await storage.saveProject(createProject('Original recording — Cutroom'));
 const before=await storage.readProject(source.id);
 const imported=await call('POST','/videos/from-project',{projectId:rendered.id});
 assert.equal(imported.status,201);
 assert.equal(imported.body.stage,'editing');
 assert.equal(imported.body.title,rendered.name);
 assert.equal(imported.body.recorderProjectId,rendered.id);
 assert.notEqual(imported.body.id,original.body.id);
 const repeated=await Promise.all([1,2].map(()=>call('POST','/videos/from-project',{projectId:rendered.id})));
 for(const result of repeated){assert.equal(result.status,200);assert.equal(result.body.id,imported.body.id);}
 assert.equal((await call('GET','/videos')).body.length,2);
 assert.equal((await call('GET',`/videos/${original.body.id}`)).body.recorderProjectId,source.id);
 assert.deepEqual(await storage.readProject(source.id),before);
});

test('project imports reject missing recordings and paths outside the project store',async()=>{
 assert.equal((await call('POST','/videos/from-project',{projectId:'missing'})).status,404);
 assert.equal((await call('POST','/videos/from-project',{projectId:'../outside'})).status,400);
 assert.equal((await call('GET','/videos')).body.length,2);
});
