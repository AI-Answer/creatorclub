import test from 'node:test';
import assert from 'node:assert/strict';
import type {Video} from '../../shared/club';
import {statusLine,stepForStage,toDayKey,videoDayKey,youtubeId} from './board';

let n=0;
const video=(over:Partial<Video>={}):Video=>({id:`v${++n}`,title:`Video ${n}`,stage:'ideas',order:0,createdAt:`2026-10-${String(10+n).padStart(2,'0')}T00:00:00.000Z`,updatedAt:'2026-10-20T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false},...over});

test('status lines name the stage and only count what is known',()=>{
 assert.equal(statusLine(video()),'Idea');
 assert.equal(statusLine(video({stage:'planning',planning:{research:true,package:true,outline:false}})),'Planning · 1 of 2');
 assert.equal(statusLine(video({stage:'recording'})),'Recording');
 assert.equal(statusLine(video({stage:'recording'}),{scenes:5,recorded:2}),'Recording · 2 of 5 scenes');
 assert.equal(statusLine(video({stage:'recording'}),{scenes:1,recorded:0}),'Recording · 0 of 1 scene');
 assert.equal(statusLine(video({stage:'recording'}),{scenes:0,recorded:0}),'Recording');
 assert.equal(statusLine(video({stage:'editing'})),'Editing');
 assert.equal(statusLine(video({stage:'publishing'})),'Publishing');
 assert.equal(statusLine(video({stage:'published'})),'Published');
 assert.equal(statusLine(video({stage:'published',publishedAt:'2026-10-26'})),'Published · Oct 26');
});

test('a video opens on the step that matches its stage',()=>{
 assert.deepEqual(['ideas','planning','recording','editing','publishing','published'].map(s=>stepForStage(s as Video['stage'])),['plan','plan','record','edit','publish','publish']);
});

test('YouTube ids come from watch, short, live and embed links only',()=>{
 assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x'),'dQw4w9WgXcQ');
 assert.equal(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),'dQw4w9WgXcQ');
 assert.equal(youtubeId('https://m.youtube.com/live/dQw4w9WgXcQ'),'dQw4w9WgXcQ');
 assert.equal(youtubeId('https://example.com/watch?v=dQw4w9WgXcQ'),undefined);
 assert.equal(youtubeId('not a link'),undefined);assert.equal(youtubeId('https://youtu.be/short'),undefined);
});

test('a video\'s day is the published day first, then the planned day, in local time',()=>{
 assert.equal(videoDayKey({publishDate:'2026-11-03'}),'2026-11-03');
 assert.equal(videoDayKey({publishDate:'2026-11-03',publishedAt:new Date(2026,10,5,14).toISOString()}),'2026-11-05');
 assert.equal(videoDayKey({publishDate:'garbage'}),undefined);assert.equal(videoDayKey({}),undefined);
 assert.equal(toDayKey(new Date(2026,10,3,23,30).toISOString()),'2026-11-03');assert.equal(toDayKey('2026-11-03'),'2026-11-03');assert.equal(toDayKey(undefined),undefined);
});
