import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,stat,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as store from './store.js';
import {videoHumanId,type Video,VIDEO_STAGES} from '../../shared/club.js';

const temp=await mkdtemp(path.join(os.tmpdir(),'cc-video-ids-'));
process.env.CREATORCLUB_DIR=temp;
after(()=>rm(temp,{recursive:true,force:true}));
const legacy=(id:string,date:string):Video=>({id,title:id,stage:'ideas',order:0,createdAt:date,updatedAt:date,stageDates:{ideas:date},planning:{research:false,package:false,outline:false},idea:{note:'Keep my notes'}});

test('read-only legacy numbering follows creation order and never rewrites video files',async()=>{
 const old=legacy('z-old','2026-01-01'),newer=legacy('a-new','2026-02-01');
 await mkdir(store.videoDir('backfill',newer.id),{recursive:true});await mkdir(store.videoDir('backfill',old.id),{recursive:true});
 await store.writeVideo('backfill',newer);await store.writeVideo('backfill',old);
 const original=await readFile(path.join(store.videoDir('backfill',old.id),'video.json'),'utf8');
 const list=await store.listVideos('backfill');assert.equal(await readFile(path.join(store.videoDir('backfill',old.id),'video.json'),'utf8'),original);
 assert.equal(list.find(v=>v.id===old.id)!.number,1);assert.equal(list.find(v=>v.id===newer.id)!.number,2);
 for(const video of list){const {number,...rest}=video;assert.deepEqual(rest,video.id===old.id?old:newer);assert.match(videoHumanId(video),/^CC-[12]$/);}
 const file=path.join(store.videoDir('backfill',old.id),'video.json'),before=(await stat(file)).mtimeMs;
 assert.deepEqual(await store.listVideos('backfill'),list);assert.equal((await stat(file)).mtimeMs,before);
});

test('parallel creates are unique per channel, IDs survive moves/edits, and deleted numbers are never reused',async()=>{
 const videos=await Promise.all(Array.from({length:12},(_,i)=>store.createVideo('creates',{title:`Video ${i}`})));
 assert.deepEqual(videos.map(v=>v.number),Array.from({length:12},(_,i)=>i+1));
 await store.updateVideo('creates',videos[0].id,{title:'Renamed',number:999} as never);
 await store.moveVideo('creates',videos[0].id,'editing');
 assert.equal((await store.readVideo('creates',videos[0].id)).number,1);
 await store.deleteVideo('creates',videos[11].id);
 assert.equal((await store.createVideo('creates',{title:'Next'})).number,13);
 assert.equal((await store.createVideo('another',{title:'First'})).number,1);
});

test('all stages persist manual order, including Ideas and Published',async()=>{
 for(const stage of VIDEO_STAGES){
  const a=await store.createVideo('rank',{title:'First',stage}),b=await store.createVideo('rank',{title:'Second',stage});
  await store.moveVideo('rank',b.id,stage,{beforeId:a.id});
  const ordered=(await store.listVideos('rank')).filter(v=>v.stage===stage);
  assert.deepEqual(ordered.map(v=>v.id),[b.id,a.id]);assert.deepEqual(ordered.map(v=>v.order),[0,1]);
  assert.deepEqual((await store.listVideos('rank')).filter(v=>v.stage===stage),ordered);
 }
});
