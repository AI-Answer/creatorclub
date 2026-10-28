import test from 'node:test';
import assert from 'node:assert/strict';
import type {Video} from '../../shared/club';
import {applyMove,inBoardOrder,dayKey,dropIndex,groupByStage,hiddenCounts,isSamePlace,monthGrid,monthTitle,nextInStage,recentVideos,shiftMonth,statusLine,stepForStage,thumbnailUrl,unscheduled,videoDayKey,videosByDay,visibleVideos,youtubeId} from './board';

let n=0;
const video=(over:Partial<Video>={}):Video=>({id:`v${++n}`,title:`Video ${n}`,stage:'ideas',order:0,createdAt:`2026-10-${String(10+n).padStart(2,'0')}T00:00:00.000Z`,updatedAt:'2026-10-20T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false},...over});
const ids=(videos:Video[])=>videos.map(v=>v.id);

test('groupByStage gives every stage a list, sorted by order and then by creation time',()=>{
 const a=video({id:'a',order:2}),b=video({id:'b',order:0}),c=video({id:'c',order:2,createdAt:'2026-01-01T00:00:00.000Z'}),d=video({id:'d',stage:'recording'});
 const groups=groupByStage([a,b,c,d]);
 assert.deepEqual(ids(groups.ideas),['b','c','a']);assert.deepEqual(ids(groups.recording),['d']);
 assert.deepEqual(Object.keys(groups),['ideas','planning','recording','editing','publishing','published']);assert.deepEqual(groups.published,[]);
});

test('inBoardOrder lists stage by stage, each in board order',()=>{
 const a=video({id:'a',stage:'editing'}),b=video({id:'b',order:1}),c=video({id:'c',order:0}),d=video({id:'d',stage:'planning'});
 assert.deepEqual(ids(inBoardOrder([a,b,c,d])),['c','b','d','a']);
});

test('Later and Skipped videos stay out until their toggle is on',()=>{
 const shown=video({id:'s'}),later=video({id:'l',hidden:'later'}),skipped=video({id:'k',hidden:'skipped'}),all=[shown,later,skipped];
 assert.deepEqual(ids(visibleVideos(all,{later:false,skipped:false})),['s']);
 assert.deepEqual(ids(visibleVideos(all,{later:true,skipped:false})),['s','l']);
 assert.deepEqual(ids(visibleVideos(all,{later:true,skipped:true})),['s','l','k']);
 assert.deepEqual(hiddenCounts(all),{later:1,skipped:1});
});

test('status lines name the stage and only count what is known',()=>{
 assert.equal(statusLine(video()),'Idea');
 assert.equal(statusLine(video({stage:'planning',planning:{research:true,package:true,outline:false}})),'Planning · 2 of 3');
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

test('thumbnails come from the recording, else from the published YouTube link, else nothing',()=>{
 assert.equal(thumbnailUrl(video(),{scenes:1,recorded:0,thumbnailMediaId:'m 1'}),'/api/media/m%201/thumbnail');
 assert.equal(thumbnailUrl(video({youtubeUrl:'https://youtu.be/dQw4w9WgXcQ?t=3'})),'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
 assert.equal(thumbnailUrl(video()),undefined);
 assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x'),'dQw4w9WgXcQ');
 assert.equal(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),'dQw4w9WgXcQ');
 assert.equal(youtubeId('https://m.youtube.com/live/dQw4w9WgXcQ'),'dQw4w9WgXcQ');
 assert.equal(youtubeId('https://example.com/watch?v=dQw4w9WgXcQ'),undefined);
 assert.equal(youtubeId('not a link'),undefined);assert.equal(youtubeId('https://youtu.be/short'),undefined);
});

test('recent videos follow the opened order, skip deleted ones and stop at four',()=>{
 const all=['a','b','c','d','e'].map(id=>video({id}));
 assert.deepEqual(ids(recentVideos(all,['c','gone','a','b','d','e'])),['c','a','b','d']);
 assert.deepEqual(recentVideos(all,[]),[]);
});

test('dropIndex finds the first card below the pointer',()=>{
 assert.equal(dropIndex([50,150,250],10),0);assert.equal(dropIndex([50,150,250],100),1);assert.equal(dropIndex([50,150,250],260),3);assert.equal(dropIndex([],5),0);
});

test('applyMove numbers the target stage, records the date and mirrors the server',()=>{
 const a=video({id:'a',order:0}),b=video({id:'b',order:1}),c=video({id:'c',order:2}),r=video({id:'r',stage:'recording',order:0}),r2=video({id:'r2',stage:'recording',order:1});
 const all=[a,b,c,r,r2];
 const into=applyMove(all,'b','recording','r2','2026-11-01T00:00:00.000Z');
 const moved=into.find(v=>v.id==='b')!;
 assert.equal(moved.stage,'recording');assert.equal(moved.stageDates.recording,'2026-11-01T00:00:00.000Z');
 assert.deepEqual(ids(groupByStage(into).recording),['r','b','r2']);assert.deepEqual(ids(groupByStage(into).ideas),['a','c']);
 assert.equal(into.find(v=>v.id==='r2')!.order,2);
 assert.deepEqual(ids(groupByStage(applyMove(all,'a','ideas',null,'x')).ideas),['b','c','a'],'no neighbour means last');
 assert.deepEqual(ids(groupByStage(applyMove(all,'c','ideas','a','x')).ideas),['c','a','b']);
 assert.equal(applyMove(all,'c','ideas','a','x').find(v=>v.id==='c')!.stageDates.ideas,undefined,'a move inside a stage keeps its dates');
 const undone=applyMove(into,'b','ideas','c','x',{ideas:'old'});
 assert.deepEqual(undone.find(v=>v.id==='b')!.stageDates,{ideas:'old'});
 assert.equal(all[1].stage,'ideas','the input is not changed');
});

test('isSamePlace spots moves that change nothing; nextInStage names the card to put a video back before',()=>{
 const a=video({id:'a',order:0}),b=video({id:'b',order:1}),c=video({id:'c',order:2}),all=[a,b,c];
 assert.equal(isSamePlace(all,'b','ideas','c'),true);assert.equal(isSamePlace(all,'c','ideas',null),true);
 assert.equal(isSamePlace(all,'a','ideas','c'),false);assert.equal(isSamePlace(all,'a','planning',null),false);
 assert.equal(nextInStage(all,'a'),'b');assert.equal(nextInStage(all,'c'),null);assert.equal(nextInStage(all,'nope'),null);
});

test('calendar days come from the published day first, then the planned day, in local time',()=>{
 assert.equal(videoDayKey({publishDate:'2026-11-03'}),'2026-11-03');
 assert.equal(videoDayKey({publishDate:'2026-11-03',publishedAt:new Date(2026,10,5,14).toISOString()}),'2026-11-05');
 assert.equal(videoDayKey({publishDate:'garbage'}),undefined);assert.equal(videoDayKey({}),undefined);
 const a=video({id:'a',publishDate:'2026-11-03'}),b=video({id:'b',stage:'published',publishedAt:new Date(2026,10,3,23,30).toISOString()}),c=video({id:'c'});
 const days=videosByDay([a,b,c]);
 assert.deepEqual([...days.keys()],['2026-11-03']);assert.deepEqual(ids(days.get('2026-11-03')!),['a','b']);
});

test('the month grid is whole weeks starting on Monday',()=>{
 const oct=monthGrid({year:2026,month:9});
 assert.equal(oct.length,5);assert.ok(oct.every(week=>week.length===7));
 assert.equal(oct[0][0].key,'2026-09-28','October 2026 starts on a Thursday');assert.equal(oct[0][0].inMonth,false);
 assert.equal(oct[0][3].key,'2026-10-01');assert.equal(oct[0][3].inMonth,true);
 assert.equal(oct[4][6].key,'2026-11-01');
 const feb=monthGrid({year:2027,month:1});
 assert.equal(feb.length,4,'a 28-day month starting on Monday fits four weeks');assert.equal(feb[0][0].key,'2027-02-01');
 assert.equal(monthGrid({year:2026,month:7}).length,6,'August 2026 needs six weeks');
 assert.equal(monthTitle({year:2026,month:9}),'October 2026');
 assert.deepEqual(shiftMonth({year:2026,month:11},1),{year:2027,month:0});assert.deepEqual(shiftMonth({year:2026,month:0},-1),{year:2025,month:11});
 assert.equal(dayKey(new Date(2026,0,5)),'2026-01-05');
});

test('unscheduled lists videos past the idea stage with no day, furthest along first',()=>{
 const idea=video({id:'i'}),editing=video({id:'e',stage:'editing'}),planning=video({id:'g',stage:'planning'}),dated=video({id:'d',stage:'planning',publishDate:'2026-11-03'}),done=video({id:'p',stage:'published'});
 assert.deepEqual(ids(unscheduled([idea,editing,dated,done,planning])),['e','g']);
});
