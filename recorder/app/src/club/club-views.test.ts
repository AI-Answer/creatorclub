import {mountUI} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {SignalEntry,TrendingEntry,Video} from '../../shared/club';
import type {SceneProgress} from './scene-status';
import {installFetch,type FakeCall} from './test-fakes';
const {ideaGroups,ideaGroupOf,ideaScore,openIdeas,ideaWhy,ideaSourceVideoId,videoThumbId,breakdownUrl}=await import('./ideas');
const {discoverFeed,discoverCounts,interleave,sortFor,sortsFor,latestRead,feedKey}=await import('./discover');
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

const rate=(level:'high'|'mid'|'low')=>({level,note:''});

test('ideas: four groups on Videos, each idea in exactly one, in the order of its group',()=>{
 const videos=[
  video('t-old','ideas',{createdAt:'2026-10-02T00:00:00.000Z',idea:{lane:'timely'}}),video('t-new','ideas',{createdAt:'2026-10-05T00:00:00.000Z',idea:{lane:'both'}}),
  video('e-best','ideas',{createdAt:'2026-10-01T00:00:00.000Z',idea:{lane:'evergreen',demand:rate('high'),gap:rate('high'),show:rate('high')}}),
  video('e-mid','ideas',{createdAt:'2026-10-06T00:00:00.000Z',idea:{demand:rate('mid'),gap:rate('mid')}}),
  video('e-none','ideas',{createdAt:'2026-10-07T00:00:00.000Z'}),
  video('held','ideas',{hidden:'later',idea:{lane:'timely'}}),video('skip','ideas',{hidden:'skipped'}),video('p','planning',{idea:{lane:'timely'}}),
 ];
 const groups=ideaGroups(videos);
 assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([key,list])=>[key,list.map(v=>v.id)])),{
  timely:['t-new','t-old'],evergreen:['e-best','e-mid','e-none'],later:['held'],skipped:['skip'],
 },'timely newest first, evergreen by score, a held idea only in its held group even when it is timely');
 assert.deepEqual(ideaGroups(videos,'e-none').evergreen.map(v=>v.id),['e-none','e-best','e-mid'],'the idea just added leads its group');
 assert.equal(ideaGroupOf(videos[5]),'later');assert.equal(ideaGroupOf(videos[1]),'timely');assert.equal(ideaGroupOf(videos[3]),'evergreen');
 assert.equal(ideaScore(videos[2]),9);assert.equal(ideaScore(videos[3]),4);assert.equal(ideaScore(videos[4]),0);
 assert.deepEqual(openIdeas(videos).map(v=>v.id),['t-old','t-new','e-best','e-mid','e-none']);
 const all=Object.values(groups).flat().map(v=>v.id);
 assert.equal(new Set(all).size,all.length,'no idea in two groups');
});

test('ideas: what a card shows',()=>{
 assert.equal(ideaWhy(video('x','ideas',{idea:{hook:'Hello',why:'Because',angle:'A'}})),'Because','the reason comes before the hook');
 assert.equal(ideaWhy(video('x','ideas',{idea:{angle:'A',hook:'Hello'}})),'A');
 assert.equal(ideaWhy(video('x','ideas',{idea:{note:'From a post'}})),'From a post');
 assert.equal(ideaWhy(video('x','ideas',{idea:{hook:'Hello'}})),'Hello');
 assert.equal(ideaWhy(video('x','ideas')),'');
 assert.equal(ideaSourceVideoId(video('x','ideas',{idea:{sources:[{label:'v',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}]}})),'dQw4w9WgXcQ');
 assert.equal(ideaSourceVideoId(video('x','ideas',{idea:{sources:[{label:'r',url:'https://www.reddit.com/r/x/1'}]}})),undefined);
});

test('Discover: two ranked lists become one, each card where its rank sits in its own list',()=>{
 const v=(id:string)=>({kind:'video' as const,item:trend(id)}),p=(id:string)=>({kind:'post' as const,item:post(id)});
 assert.deepEqual(interleave([v('a'),v('b')],[p('1'),p('2'),p('3'),p('4')]).map(feedKey),['v:a','p:1','p:2','v:b','p:3','p:4'],'a video first on a tie, then at its share of the list');
 assert.deepEqual(interleave([],[p('1')]).map(feedKey),['p:1']);assert.deepEqual(interleave([v('a')],[]).map(feedKey),['v:a']);
});

test('Discover: chips, one sort per chip, the topics filter and Show everything; For you holds every followed video',()=>{
 const videos=[trend('fit1',{vpd:900,ageDays:2}),trend('fit2',{vpd:100,ageDays:1,kind:'creator',mult:null}),trend('under',{mult:0.5,vpd:5000}),trend('off',{fit:false,kind:'creator',vpd:4000})];
 const posts=[post('x1',{likes:50,ageHours:30}),post('x2',{likes:5,ageHours:1}),post('r1',{source:'reddit',likes:20,ageHours:10}),post('xoff',{fit:false,likes:999})];
 const keys=(show:Parameters<typeof discoverFeed>[2],sort:Parameters<typeof discoverFeed>[3],everything=false)=>{const {shown,off}=discoverFeed(videos,posts,show,sort,everything);return {keys:shown.map(feedKey),off};};
 assert.deepEqual(keys('fit','top'),{keys:['v:fit1','p:x1','v:fit2','p:r1','v:under','p:x2'],off:2},'For you mixes both, ranked: about your topics, and every video of a channel you follow');
 assert.deepEqual(keys('fit','new'),{keys:['p:x2','p:r1','v:fit2','p:x1','v:fit1','v:under'],off:2},'Newest puts videos and posts in one order of age');
 assert.deepEqual(keys('fit','top',true).keys,['v:fit1','p:x1','v:fit2','p:r1','v:under','p:x2','v:off','p:xoff'],'Show everything adds the rest after');
 assert.deepEqual(keys('youtube','vpd'),{keys:['v:fit1','v:fit2','v:under'],off:1});
 assert.deepEqual(keys('youtube','views').keys,['v:fit1','v:fit2','v:under']);
 assert.deepEqual(keys('followed','vpd'),{keys:['v:under','v:fit1'],off:0},'Followed lists every video from the channels you follow');
 assert.deepEqual(keys('x','top'),{keys:['p:x1','p:x2'],off:1});assert.deepEqual(keys('x','new').keys,['p:x2','p:x1']);
 assert.deepEqual(keys('reddit','top'),{keys:['p:r1'],off:0});
 assert.deepEqual(discoverCounts(videos,posts),{fit:6,followed:2,youtube:3,x:2,reddit:1});
 // The walk's numbers: 115 followed videos, most of them off your topics or under their usual, never more than For you.
 const many=[...Array.from({length:115},(_,i)=>trend(`f${i}`,{fit:i<20,mult:i%2?0.9:1.5})),trend('search',{kind:'creator'})];
 const counted=discoverCounts(many,[]);
 assert.equal(counted.followed,115);assert.ok(counted.fit>=counted.followed,`For you ${counted.fit} holds Followed ${counted.followed}`);
 for(const show of ['fit','followed','youtube','x','reddit'] as const)assert.equal(discoverCounts(videos,posts)[show],discoverFeed(videos,posts,show,'top',false).shown.length,`${show}: the count is the list`);
 assert.deepEqual(sortsFor('fit').map(([key])=>key),['top','new']);assert.deepEqual(sortsFor('youtube').map(([key])=>key),['vpd','views','outlier','new']);assert.deepEqual(sortsFor('reddit').map(([key])=>key),['top','new']);
 assert.equal(sortFor('youtube','top'),'vpd','a sort the chip does not offer falls back to its first');assert.equal(sortFor('fit','views'),'top');assert.equal(sortFor('x','new'),'new');
 assert.equal(latestRead(null,'2026-10-26T19:00:00.000Z','2026-10-26T22:00:00.000Z'),'2026-10-26T22:00:00.000Z');assert.equal(latestRead(null,undefined),null);
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
 assert.equal(progressText(video('a','editing'),all),'Editing · 2 of 2 scenes recorded');
 assert.equal(progressText(video('a','publishing'),all),'Publishing · ready to upload');
 assert.equal(progressText(video('a','published',{publishedAt:'2026-10-02'}),none),'Published Oct 2');
 assert.equal(progressText(video('a','ideas'),none),'Idea');
 assert.deepEqual(nextAction(video('a','ideas'),none),{label:'Start planning',tab:'idea',icon:'next'});
 assert.equal(nextAction(video('a','planning'),none).label,'Draft the scenes');assert.equal(nextAction(video('a','planning'),three).label,'Continue to recording');
 assert.deepEqual([nextAction(video('a','recording'),three).label,nextAction(video('a','recording'),three).tab],['Record scene 2','record']);
 assert.equal(nextAction(video('a','recording'),all).label,'Continue to editing');
 assert.equal(nextAction(video('a','editing'),all).tab,'edit');assert.equal(nextAction(video('a','publishing'),all).tab,'publish');
 assert.equal(nextAction(video('a','published',{views:12400}),none).label,'12K views');
 assert.deepEqual(sceneProgress(3,1).map(scene=>scene.takes.some(take=>take.kept)),[true,false,false]);
});

test('Home, the board cards, the table and the strip count "scenes recorded" with one rule, over the real shapes',async()=>{
 const {recordedCount,recordedLine,sceneStatus,isSceneRecorded}=await import('./scene-status');
 const {scenesLine}=await import('./production');
 const {toProgress}=await import('./scenes');
 const {allScenesKept}=await import('./workspace/rules');
 // As GET /videos/scenes sends them: recorded but not kept (set aside, or waiting), kept, none.
 const scene=(id:string,takes:{kept:boolean;retained?:boolean}[])=>({id,title:id,seconds:60,status:'',takes:takes.map((take,i)=>({id:`${id}${i}`,seconds:20,retained:false,...take}))});
 const hidden=[scene('a',[{kept:false,retained:true},{kept:true}]),scene('b',[{kept:false}]),scene('c',[]),scene('d',[])];
 const progress=toProgress(hidden);
 assert.deepEqual(progress.map(item=>isSceneRecorded(item)),[true,false,false,false],'a take that was recorded but not kept is not a recorded scene');
 assert.deepEqual(progress.map(item=>sceneStatus(item).label),['Kept take 2','1 take','Not recorded','Not recorded'],'the strip');
 assert.equal(recordedCount(hidden),1);assert.equal(recordedCount(progress),1,'the same count from the server shape and the dots');
 assert.equal(progressText(video('h','editing'),progress),'Editing · 1 of 4 scenes recorded','Home');
 assert.equal(scenesLine(recordedCount(progress),progress.length),'1 of 4 scenes','the board card and the table');
 assert.equal(recordedLine(progress),'1 of 4 scenes recorded');
 assert.equal(allScenesKept(hidden),false);
 // Nothing on the timeline: Home and the board say 0, and the next step is Record, not Keep editing.
 const still=[scene('a',[{kept:false}]),scene('b',[]),scene('c',[])];
 assert.equal(progressText(video('s','editing'),toProgress(still)),'Editing · 0 of 3 scenes recorded');
 assert.deepEqual(nextAction(video('s','editing'),toProgress(still)),{label:'Record scene 1',tab:'record',icon:'microphone'});
 assert.equal(nextAction(video('s','editing'),toProgress([])).label,'Draft the scenes');
 assert.equal(nextAction(video('s','editing'),progress).label,'Keep editing','one scene on the timeline is something to edit');
 // Scenes added to the outline after recording: they count as not recorded, so the total grows and the count stays.
 const grown=[...hidden,scene('e',[])];
 assert.equal(progressText(video('h','editing'),toProgress(grown)),'Editing · 1 of 5 scenes recorded');
 assert.equal(allScenesKept([scene('a',[{kept:true}])]),true);
});

test('unknown scenes are not zero scenes: only the stage is said until they are known, and a known empty outline says so',()=>{
 for(const stage of ['planning','recording','editing'] as const)assert.equal(progressText(video('a',stage),undefined),{planning:'Planning',recording:'Recording',editing:'Editing'}[stage]);
 assert.deepEqual(nextAction(video('a','planning'),undefined),{label:'Continue planning',tab:'idea',icon:'next'});
 assert.deepEqual(nextAction(video('a','recording'),undefined),{label:'Continue recording',tab:'record',icon:'microphone'});
 assert.equal(nextAction(video('a','recording'),undefined).label.includes('editing'),false,'no claim that the scenes are all recorded');
 assert.equal(nextAction(video('a','editing'),undefined).label,'Keep editing');assert.equal(nextAction(video('a','ideas'),undefined).label,'Start planning');
 assert.equal(nextAction(video('a','published',{views:5}),undefined).label,'5 views');
 const empty=sceneProgress(0,0);
 assert.equal(nextAction(video('a','planning'),empty).label,'Draft the scenes');
 assert.equal(nextAction(video('a','recording'),empty).label,'Draft the scenes','a known empty outline has nothing to record');
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
  assert.deepEqual(seen.at(-1),['v1'],'hidden at once');assert.equal(calls.filter(call=>call.method==='DELETE').length,0,'nothing deleted yet');
  await act(async()=>{undo();});
  assert.deepEqual(seen.at(-1),[],'Undo brings it back');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,500));});
  assert.equal(calls.filter(call=>call.method==='DELETE').length,0,'and it is never deleted');

  await act(async()=>{deleteLater('v2',message=>failures.push(message),20);});
  await eventually(()=>calls.some(call=>call.method==='DELETE'));
  assert.deepEqual(calls.filter(call=>call.method==='DELETE').map(c=>`${c.method} ${c.path}`),['DELETE /videos/v2'],'sent once the time is up');
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
