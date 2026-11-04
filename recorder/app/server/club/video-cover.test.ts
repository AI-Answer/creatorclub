import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {createProject,type Project} from '../../shared/types.js';
import {coverMediaIds} from './video-cover.js';
const temp=await mkdtemp(path.join(os.tmpdir(),'cc-covers-'));
process.env.CREATORCLUB_DIR=path.join(temp,'club');process.env.CREATORCLUB_SECRETS_DIR=path.join(temp,'secrets');process.env.SCENEFORGE_DATA_DIR=path.join(temp,'data');
const {clubRouter}=await import('./index.js');const store=await import('./store.js');
const app=express();app.use('/api/club',clubRouter());const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
after(async()=>{server.close();await rm(temp,{recursive:true,force:true});});
const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;

test('recording covers prefer the first timeline frame, then first take screen/camera media even without kept clips',()=>{
 const project={...createProject('Covers'),clips:[{track:'camera',start:4,mediaId:'later'},{track:'screen',start:0,mediaId:'first'}],recordedTakes:[{createdAt:'2026-10-02',tracks:['camera'],media:[{id:'new'}]},{createdAt:'2026-10-01',tracks:['camera','mic','screen'],media:[{id:'camera'},{id:'audio'},{id:'screen'}]}]} as Project;
 assert.deepEqual(coverMediaIds(project),['first','later','screen','camera','new']);
 project.clips=[];assert.deepEqual(coverMediaIds(project),['screen','camera','new']);
});

test('the picked thumbnail wins over recording candidates; absent artwork returns 204 for the client placeholder',async()=>{
 const workspace=await store.createWorkspace({name:'Covers',handle:'',channelUrl:'',topics:[],about:'',cta:''});await store.setCurrentWorkspace(workspace.slug);
 const video=await store.createVideo(workspace.slug,{title:'Cover fallback',recorderProjectId:'missing-project'});
 const url=base+`/videos/${video.id}/cover`;assert.equal((await fetch(url)).status,204);
 const png=Buffer.from('89504e470d0a1a0a','hex');await writeFile(path.join(store.videoDir(workspace.slug,video.id),'thumbnail.png'),png);
 const response=await fetch(url);assert.equal(response.status,200);assert.match(response.headers.get('content-type')!,/image\/png/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
});
