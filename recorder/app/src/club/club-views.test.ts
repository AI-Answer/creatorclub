import {mountUI} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {SignalEntry,TrendingEntry,Video} from '../../shared/club';
import type {SceneProgress} from './scene-status';
import {installFetch,type FakeCall} from './test-fakes';
const {ideaCounts,ideasIn,ideaWhy,showSourceThumbs,ideaSourceVideoId,videoThumbId,breakdownUrl,tabOf}=await import('./ideas');
const {greeting,standing,isFresh,overviewLede,resumeVideos,progressText,nextAction,firstName}=await import('./overview');
const {trendList,trendCounts,offTopic,growthPerDay,isNew}=await import('./trending-view');
const {signalList,signalCounts}=await import('./signals-view');
const {breakdownStep,commentsRead,BREAKDOWN_STEPS}=await import('./breakdown');
const {creatorName}=await import('./format');
const {deleteLater,usePendingDeletes}=await import('./pending-delete');
const {useVideos}=await import('./useVideos');
const {ideaFromSource,trendingUrl}=await import('./useIdeaFrom');
const {savedBreakdown}=await import('./useBreakdowns');

const video=(id:string,stage:Video['stage'],extra:Partial<Video>={}):Video=>({id,title:id,stage,order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false},...extra});

/** `scenes` scenes of which `recorded` are done, as dots: the first ones filled. */
const sceneProgress=(scenes:number,recorded:number):SceneProgress[]=>Array.from({length:scenes},(_,index)=>({takes:index<recorded?[{n:1,kept:true}]:[]}));
const trend=(videoId:string,extra:Partial<TrendingEntry>={}):TrendingEntry=>({videoId,title:videoId,channel:'Ch',kind:'followed',views:1000,likes:1,comments:1,published:'2026-10-20',ageDays:3,vpd:300,mult:2,history:[],firstSeen:'2026-10-20',fit:true,reason:'Because you picked Claude',...extra});
const post=(id:string,extra:Partial<SignalEntry>={}):SignalEntry=>({id,source:'x',author:'A',handle:'a',text:'t',url:`https://x.com/${id}`,likes:10,replies:1,media:null,createdAt:'2026-10-28T00:00:00.000Z',ageHours:5,fit:true,reason:'Because you picked Claude',...extra});

test('ideas: counts per list, the list in order with the new one first, and what a card shows',()=>{
 const videos=[
  video('a','ideas',{createdAt:'2026-10-02T00:00:00.000Z'}),video('b','ideas',{createdAt:'2026-10-05T00:00:00.000Z'}),video('c','ideas',{hidden:'later'}),video('d','ideas',{hidden:'skipped'}),video('e','planning'),
 ];
 assert.deepEqual(ideaCounts(videos),{new:2,later:1,skipped:1});
 assert.deepEqual(ideasIn(videos,'new').map(v=>v.id),['b','a'],'newest first');
 assert.deepEqual(ideasIn(videos,'new','a').map(v=>v.id),['a','b'],'the idea just added first');
 assert.deepEqual(ideasIn(videos,'later').map(v=>v.id),['c']);assert.deepEqual(ideasIn(videos,'skipped').map(v=>v.id),['d']);
 assert.equal(tabOf(undefined),'new');assert.equal(tabOf('later'),'later');
 assert.equal(ideaWhy(video('x','ideas',{idea:{hook:'Hello',why:'Because',angle:'A'}})),'Because','the reason comes before the hook');
 assert.equal(ideaWhy(video('x','ideas',{idea:{angle:'A',hook:'Hello'}})),'A');
 assert.equal(ideaWhy(video('x','ideas',{idea:{note:'From a post'}})),'From a post');
 assert.equal(ideaWhy(video('x','ideas',{idea:{hook:'Hello'}})),'Hello');
 assert.equal(ideaWhy(video('x','ideas')),'');
 assert.equal(ideaSourceVideoId(video('x','ideas',{idea:{sources:[{label:'v',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}]}})),'dQw4w9WgXcQ');
 assert.equal(ideaSourceVideoId(video('x','ideas',{idea:{sources:[{label:'r',url:'https://www.reddit.com/r/x/1'}]}})),undefined);
});

test('ideas show the source picture once for a run of ideas from the same video, and none for a source that is not on YouTube',()=>{
 const from=(id:string,url?:string)=>video(id,'ideas',{idea:{sources:url?[{label:'s',url}]:[]}});
 const a='https://www.youtube.com/watch?v=dQw4w9WgXcQ',b='https://www.youtube.com/watch?v=aaaaaaaaaaa';
 assert.deepEqual(showSourceThumbs([from('1',a),from('2',a),from('3',a),from('4',b),from('5',b),from('6',a)]),[true,false,false,true,false,true],'a picture again when the video differs from the row above');
 assert.deepEqual(showSourceThumbs([from('1'),from('2','https://www.reddit.com/r/x/1'),from('3',a)]),[false,false,true]);
 assert.deepEqual(showSourceThumbs([from('1',a),from('2'),from('3',a)]),[true,false,true],'a row between breaks the run');
 assert.deepEqual(showSourceThumbs([]),[]);
});

test('only ideas and published videos show a picture from YouTube; videos in production show a draft',()=>{
 const idea={sources:[{label:'v',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}]};
 assert.equal(videoThumbId(video('a','ideas',{idea})),'dQw4w9WgXcQ');
 assert.equal(videoThumbId(video('a','planning',{idea})),undefined);
 assert.equal(videoThumbId(video('a','published',{idea,youtubeUrl:'https://youtu.be/aaaaaaaaaaa'})),'aaaaaaaaaaa');
 assert.equal(videoThumbId(video('a','published')),undefined);
});

test('a ?bd= value is a YouTube id or a link; either becomes the link to break down',()=>{
 assert.equal(breakdownUrl('dQw4w9WgXcQ'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assert.equal(breakdownUrl('https://www.instagram.com/reel/C8aBcD_eFgH/'),'https://www.instagram.com/reel/C8aBcD_eFgH/');
});

test('overview: greeting, what is in production, fresh channels, the lede and what to pick up',()=>{
 assert.deepEqual([6,12,17,18,23].map(hour=>greeting(new Date(2026,9,29,hour))),['Good morning','Good afternoon','Good afternoon','Good evening','Good evening']);
 assert.equal(firstName('Samin Yasar'),'Samin');assert.equal(firstName('Ana'),'Ana');
 const videos=[
  video('i1','ideas',{order:1}),video('i2','ideas',{order:0}),video('i3','ideas',{hidden:'later'}),
  video('p1','planning',{updatedAt:'2026-10-05T00:00:00.000Z'}),video('r1','recording',{updatedAt:'2026-10-07T00:00:00.000Z'}),video('e1','editing',{updatedAt:'2026-10-06T00:00:00.000Z'}),video('d1','published',{publishedAt:'2026-10-02'}),
 ];
 const now=standing(videos);
 assert.deepEqual(now.active.map(v=>v.id),['r1','e1','p1']);assert.deepEqual(now.ideas.map(v=>v.id),['i2','i1'],'ideas on hold are not waiting');assert.deepEqual(now.published.map(v=>v.id),['d1']);
 assert.equal(isFresh(now),false);
 assert.equal(overviewLede(now),'3 videos in production · 2 ideas waiting · 1 published');
 assert.equal(overviewLede(standing([video('p','planning'),video('i','ideas'),video('d','published')])),'1 video in production · 1 idea waiting · 1 published','one of each is singular');
 assert.equal(isFresh(standing([])),true);assert.equal(overviewLede(standing([])),"Let's find your first video. Start with what's already working in your space.");
 assert.equal(overviewLede(standing([video('i','ideas')])),'You have 1 idea. Open one and start planning.');
 assert.equal(isFresh(standing([video('i','ideas'),video('i2','ideas')])),true,'ideas alone are still the first-video checklist');
 // The video opened last comes first, then the other videos in production by when they were touched.
 assert.deepEqual(resumeVideos(videos,['p1','gone','d1','i1']).map(v=>v.id),['p1','r1','e1'],'published and ideas are not picked up; unknown ids are skipped');
 assert.deepEqual(resumeVideos(videos,[],2).map(v=>v.id),['r1','e1']);
 assert.deepEqual(resumeVideos(videos,[],standing(videos).active.length).map(v=>v.id),['r1','e1','p1'],'every video in production when the limit is the count');
});

test('overview: progress words and the next action come from the scenes that are known',()=>{
 const none=sceneProgress(0,0),three=sceneProgress(3,1),all=sceneProgress(2,2);
 assert.equal(progressText(video('a','planning'),none),'Planning · no scenes yet');
 assert.equal(progressText(video('a','planning'),three),'Planning · 3 scenes drafted');
 assert.equal(progressText(video('a','planning'),sceneProgress(1,0)),'Planning · 1 scene drafted');
 assert.equal(progressText(video('a','recording'),three),'Recording · 1 of 3 scenes');
 assert.equal(progressText(video('a','editing'),all),'Editing · 2 scenes recorded');
 assert.equal(progressText(video('a','publishing'),all),'Publishing · ready to upload');
 assert.equal(progressText(video('a','published',{publishedAt:'2026-10-02'}),none),'Published Oct 2');
 assert.equal(progressText(video('a','ideas'),none),'Idea');
 assert.deepEqual(nextAction(video('a','ideas'),none),{label:'Start planning',tab:'board',icon:'next'});
 assert.equal(nextAction(video('a','planning'),none).label,'Draft scenes from board');assert.equal(nextAction(video('a','planning'),three).label,'Continue to recording');
 assert.deepEqual([nextAction(video('a','recording'),three).label,nextAction(video('a','recording'),three).tab],['Record scene 2','record']);
 assert.equal(nextAction(video('a','recording'),all).label,'Continue to editing');
 assert.equal(nextAction(video('a','editing'),all).tab,'edit');assert.equal(nextAction(video('a','publishing'),all).tab,'publish');
 assert.equal(nextAction(video('a','published',{views:12400}),none).label,'12K views');
 assert.deepEqual(sceneProgress(3,1).map(scene=>scene.takes.some(take=>take.kept)),[true,false,false]);
});

test('unknown scenes are not zero scenes: only the stage is said until they are known, and a known empty outline says so',()=>{
 for(const stage of ['planning','recording','editing'] as const)assert.equal(progressText(video('a',stage),undefined),{planning:'Planning',recording:'Recording',editing:'Editing'}[stage]);
 assert.deepEqual(nextAction(video('a','planning'),undefined),{label:'Continue planning',tab:'plan',icon:'next'});
 assert.deepEqual(nextAction(video('a','recording'),undefined),{label:'Continue recording',tab:'record',icon:'microphone'});
 assert.equal(nextAction(video('a','recording'),undefined).label.includes('editing'),false,'no claim that the scenes are all recorded');
 assert.equal(nextAction(video('a','editing'),undefined).label,'Keep editing');assert.equal(nextAction(video('a','ideas'),undefined).label,'Start planning');
 assert.equal(nextAction(video('a','published',{views:5}),undefined).label,'5 views');
 const empty=sceneProgress(0,0);
 assert.equal(nextAction(video('a','planning'),empty).label,'Draft scenes from board');
 assert.equal(nextAction(video('a','recording'),empty).label,'Draft scenes from board','a known empty outline has nothing to record');
 assert.equal(progressText(video('a','planning'),empty),'Planning · no scenes yet');
});

test('Working now lists a video the feed has twice once, and the counts say the same as the cards',()=>{
 const first=trend('a',{vpd:1000}),again=trend('a',{vpd:900,kind:'creator'}),other=trend('b',{vpd:500});
 const items=[first,again,other];
 assert.deepEqual(trendList(items,'all','vpd'),[first,other],'the first copy is kept');
 assert.deepEqual(trendCounts(items),{fit:2,followed:2,all:2},'"All 2", not 3');
 assert.equal(offTopic(items),0);
 // The copy that qualifies is the one a list keeps, so a list never loses a video to a copy that does not belong in it.
 const off=trend('c',{fit:false,reason:null,vpd:800}),on=trend('c',{vpd:700});
 assert.deepEqual(trendList([off,on],'fit','vpd'),[on]);assert.deepEqual(trendList([off,on],'all','vpd'),[off]);
 assert.deepEqual(trendCounts([off,on]),{fit:1,followed:1,all:1});
});

test('Working now: For you, Followed and All, three sorts, growth per day and New',()=>{
 const items=[
  trend('a',{mult:2,vpd:1000,views:5000,history:[{d:'2026-10-26',v:3000},{d:'2026-10-28',v:5000}]}),
  trend('b',{mult:6.4,vpd:500,views:90000,kind:'creator',history:[{d:'2026-10-27',v:80000},{d:'2026-10-28',v:90000}]}),
  trend('c',{vpd:900,views:100,fit:false,reason:null,history:[{d:'2026-10-28',v:100}]}),
  trend('d',{mult:null,vpd:200,views:7000,history:[{d:'2026-10-20',v:100},{d:'2026-10-27',v:6000}]}),
 ];
 const ids=(show:'fit'|'followed'|'all',sort:'vpd'|'views'|'outlier')=>trendList(items,show,sort).map(i=>i.videoId);
 assert.deepEqual(ids('fit','vpd'),['a','b','d']);assert.deepEqual(ids('followed','vpd'),['a','c','d']);assert.deepEqual(ids('all','vpd'),['a','c','b','d']);
 assert.deepEqual(ids('all','views'),['b','d','a','c']);
 assert.deepEqual(ids('fit','outlier'),['b','a','d'],'by how far each beats its creator\'s usual; no usual comes last');
 assert.deepEqual(trendCounts(items),{fit:3,followed:3,all:4});assert.equal(offTopic(items),1);
 assert.equal(growthPerDay(items[0]),1000);assert.equal(growthPerDay(items[1]),10000);assert.equal(growthPerDay(items[2]),0,'one reading is no growth');
 assert.equal(Math.round(growthPerDay(items[3])),843);assert.equal(growthPerDay(trend('x',{history:[{d:'2026-10-28',v:50},{d:'2026-10-28',v:80}]})),30,'two readings the same day count as one day');
 assert.equal(isNew(trend('n',{firstSeen:'2026-10-28',ageDays:1.2}),'2026-10-28T09:00:00.000Z'),true);
 assert.equal(isNew(trend('n',{firstSeen:'2026-10-28',ageDays:4}),'2026-10-28T09:00:00.000Z'),false);
 assert.equal(isNew(trend('n',{firstSeen:'2026-10-20',ageDays:1}),'2026-10-28T09:00:00.000Z'),false);
 assert.equal(isNew(trend('n',{firstSeen:'2026-10-28',ageDays:1}),null),false);
});

test('Signals: by source, most liked or newest, topics first, the rest only on request',()=>{
 const items=[post('p1',{likes:50,ageHours:30}),post('p2',{source:'reddit',likes:90,ageHours:2}),post('p3',{likes:5,ageHours:1,fit:false,reason:null}),post('p4',{source:'reddit',likes:20,ageHours:9,fit:false,reason:null})];
 const ids=(source:'all'|'x'|'reddit',sort:'top'|'new',everything:boolean)=>signalList(items,source,sort,everything).shown.map(i=>i.id);
 assert.deepEqual(ids('all','top',false),['p2','p1']);assert.deepEqual(ids('all','new',false),['p2','p1']);
 assert.deepEqual(ids('all','top',true),['p2','p1','p4','p3'],'topics first, then the others');
 assert.deepEqual(ids('x','top',true),['p1','p3']);assert.deepEqual(ids('reddit','new',false),['p2']);
 assert.equal(signalList(items,'all','top',false).off,2);assert.equal(signalList(items,'x','top',false).off,1);
 assert.deepEqual(signalCounts(items),{all:2,x:1,reddit:1});
});

test('breakdown progress lines move the four steps forward and set-up lines do not',()=>{
 assert.deepEqual(BREAKDOWN_STEPS,['Reading the video','Reading the transcript','Reading the comments','Writing concepts']);
 const lines=['Reading the video details…','Reading the transcript…','Reading the caption…','Reading 40 comments…','Reading 1 comment…','Finding what made it work…','Checking how it did against the channel…','Setting up yt-dlp…'];
 assert.deepEqual(lines.map(breakdownStep),[0,1,1,2,2,3,-1,-1]);
 assert.deepEqual(['Reading 40 comments…','Reading 1 comment…','Reading the transcript…'].map(commentsRead),[40,1,undefined]);
});

test('a creator is the channel title before the bar',()=>{
 assert.equal(creatorName('Duncan Rogoff | AI Automation'),'Duncan Rogoff');assert.equal(creatorName('Metics Media'),'Metics Media');assert.equal(creatorName(null),'');
});

test('an idea made from a post or video is found by its link, unless it was skipped',()=>{
 const url=trendingUrl('dQw4w9WgXcQ');
 const made=video('m','ideas',{idea:{sources:[{label:'x',url}]}});
 assert.equal(ideaFromSource([made],url)?.id,'m');assert.equal(ideaFromSource([made],'https://x.com/other'),undefined);
 assert.equal(ideaFromSource([{...made,hidden:'skipped'}],url),undefined);assert.equal(ideaFromSource([{...made,hidden:'later'}],url)?.id,'m');
 const list=[{id:'bd_1',url:'https://youtu.be/dQw4w9WgXcQ',platform:'youtube',createdAt:'',title:'t',channel:'c'},{id:'bd_2',url:'',platform:'file',createdAt:'',title:'f',channel:''}];
 assert.equal(savedBreakdown(list,'dQw4w9WgXcQ')?.id,'bd_1');assert.equal(savedBreakdown(list,'aaaaaaaaaaa'),undefined);
});

/** Waits inside act until something the code does later has happened. */
const eventually=(done:()=>boolean)=>act(async()=>{for(let waited=0;!done()&&waited<3000;waited+=10)await new Promise(resolve=>setTimeout(resolve,10));});

test('deleting an idea waits so Undo can take it back; nothing is sent when it is undone',async()=>{
 const calls:FakeCall[]=[];
 const fake=installFetch(call=>{calls.push(call);return {status:204};});
 const seen:string[][]=[];
 const Probe=()=>{seen.push([...usePendingDeletes()]);return null;};
 const ui=await mountUI(createElement(Probe));
 try{
  const failures:string[]=[];
  let undo=()=>{};
  await act(async()=>{undo=deleteLater('v1',message=>failures.push(message),400);});
  assert.deepEqual(seen.at(-1),['v1'],'hidden at once');assert.equal(calls.length,0,'nothing sent yet');
  await act(async()=>{undo();});
  assert.deepEqual(seen.at(-1),[],'Undo brings it back');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,500));});
  assert.equal(calls.length,0,'and it is never deleted');

  await act(async()=>{deleteLater('v2',message=>failures.push(message),20);});
  await eventually(()=>calls.length===1);
  assert.deepEqual(calls.map(c=>`${c.method} ${c.path}`),['DELETE /videos/v2'],'sent once the time is up');
  assert.deepEqual(seen.at(-1),['v2'],'and it stays hidden');assert.deepEqual(failures,[]);
 }finally{await ui.close();fake.restore();}
});

test('a deleted idea stays hidden when a list that was read before the delete lands after it',async()=>{
 const stale:Video[]=[video('v9','ideas'),video('v8','ideas')];
 const fake=installFetch(call=>{
  if(call.method==='DELETE')return {status:204};
  if(call.path==='/videos')return {body:stale};// the list still has it: it was read before the delete finished
  if(call.path==='/recent')return {body:[]};
 });
 const shown:string[][]=[];
 const Probe=()=>{const {state}=useVideos();shown.push(state.status==='ready'?state.videos.map(v=>v.id):[]);return null;};
 const ui=await mountUI(createElement(Probe));
 try{
  await eventually(()=>shown.at(-1)!.length===2);
  let undo=()=>{};
  await act(async()=>{undo=deleteLater('v9',()=>{},10);});
  await eventually(()=>fake.calls.some(c=>c.method==='DELETE'));
  await eventually(()=>fake.calls.filter(c=>c.path==='/videos').length>=2);
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,50));});
  assert.deepEqual(shown.at(-1),['v8'],'the reload that follows the delete does not bring it back');
  assert.equal(shown.some((ids,index)=>index>0&&shown[index-1].length===1&&ids.includes('v9')),false,'not even for a moment');
  undo();
 }finally{await ui.close();fake.restore();}
});

test('a delete the server refuses brings the idea back and says why in one sentence',async()=>{
 const fake=installFetch(()=>({status:409,body:{error:'That video is being recorded.'}}));
 const seen:string[][]=[];
 const ui=await mountUI(createElement(()=>{seen.push([...usePendingDeletes()]);return null;}));
 try{
  const failures:string[]=[];
  let undo=()=>{};
  await act(async()=>{undo=deleteLater('v3',message=>failures.push(message),10);});
  await eventually(()=>failures.length===1&&seen.at(-1)!.length===0);
  assert.deepEqual(failures,['That video is being recorded.']);assert.equal(seen.at(-1)!.includes('v3'),false,'it is back');
  undo();
 }finally{await ui.close();fake.restore();}
});
