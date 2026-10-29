import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Breakdown,Video} from '../../shared/club';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from './test-fakes';
const {formatAge,formatCount,isVideoFile,looksLikeVideoLink}=await import('./breakdown');
const {BoardScreen}=await import('./screens/BoardScreen');

const ws={slug:'samin',name:'Samin Yasar',handle:'@samin',channelUrl:'',topics:[],about:'',cta:'',createdAt:'2026-01-01T00:00:00.000Z'};
const rated=(level:'high'|'mid'|'low',note:string)=>({level,note});
const breakdown=(over:Partial<Breakdown>={}):Breakdown=>({
 id:'bd_aaaaaaaaaaaa',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',platform:'youtube',createdAt:'2026-10-28T00:00:00.000Z',
 video:{title:'How I built it',channel:'Source Channel',views:7_600_000,likes:140_000,comments:12_000,ageDays:3,thumbnail:'',multiplier:2.84},
 whyItWorked:{titlePackaging:'A bold claim.',hookSpeed:'Within ten seconds.',structure:['Claim','Demo','Payoff'],retention:'Open loops.',payoff:'A working thing.',short:['Clear claim','Fast demo']},
 reusableOutline:['Claim: the outcome','Demo: the how','Payoff: the result'],
 viewerQuestions:[{question:'Does it work on a free plan?',likes:90},{question:'What about Windows?',likes:0}],
 concepts:[1,2,3].map(n=>({title:`Concept ${n}`,angle:`Angle ${n}`,twist:`Twist ${n}`,hook:`Hook ${n}`,demand:rated('high','Asked in comments.'),gap:rated('mid','not checked'),show:rated('low','Needs setup.'),why:`Why ${n}`})),
 ...over,
});

test('numbers, ages, links and files',()=>{
 assert.equal(formatCount(7_600_000),'7.6M');assert.equal(formatCount(140_000),'140K');assert.equal(formatCount(12_000),'12K');assert.equal(formatCount(950),'950');
 assert.deepEqual([0,1,3,29,30,59,60,364,365,800].map(formatAge),['today','yesterday','3 days ago','29 days ago','1 month ago','1 month ago','2 months ago','12 months ago','1 year ago','2 years ago']);
 for(const good of ['https://youtu.be/dQw4w9WgXcQ','youtube.com/watch?v=dQw4w9WgXcQ','https://www.instagram.com/reel/C8aBcD_eFgH/'])assert.equal(looksLikeVideoLink(good),true,good);
 for(const bad of ['','samin','two words','https://evil.com/watch?v=x','ftp://youtube.com/x','https://youtube.com.evil.com/x'])assert.equal(looksLikeVideoLink(bad),false,bad);
 assert.equal(isVideoFile({name:'Clip.MOV'}),true);assert.equal(isVideoFile({name:'notes.txt'}),false);
});

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const press=async(element:Element)=>{await act(async()=>(element as HTMLElement).click());await flush();};
const type=async(input:Element,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const text=(el:Element)=>(el.textContent??'').replace(/\s+/g,' ');
const emit=(type:string,data?:unknown)=>act(async()=>{FakeEventSource.last().emit(type,data);});
const dropOn=async(el:Element,file:File)=>act(async()=>{el.dispatchEvent(Object.assign(new Event('drop',{bubbles:true,cancelable:true}),{dataTransfer:{types:['Files'],files:[file]}}));});

type Posted={path:string;form?:FormData;body?:unknown;signal?:AbortSignal|null};
let hold:Promise<void>|null=null;
async function withBoard(run:(ui:Awaited<ReturnType<typeof mountUI>>,posted:Posted[],calls:FakeCall[])=>Promise<void>){
 FakeEventSource.install();
 const videos:Video[]=[],posted:Posted[]=[];
 let jobs=0;
 const fake=installFetch(async(call):Promise<FakeReply>=>{
  if(call.path==='/workspaces')return {body:{current:'samin',workspaces:[ws]}};
  if(call.path==='/videos')return {body:videos};
  if(call.path==='/recent')return {body:[]};
  if(call.path==='/api/projects')return {body:[]};
  if(call.path==='/breakdowns'&&call.method==='POST'){if(hold)await hold;return {status:202,body:{id:`j${++jobs}`,status:'running'}};}
  const add=call.path.match(/^\/breakdowns\/bd_aaaaaaaaaaaa\/concepts\/(\d)\/add$/);
  if(add){
   if(add[1]==='2')return {status:409,body:{error:'That concept is already on the board.'}};
   const video:Video={id:`new${add[1]}`,title:`Concept ${Number(add[1])+1}`,stage:'ideas',order:Number(add[1]),createdAt:'2026-10-28T00:00:00.000Z',updatedAt:'2026-10-28T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false},source:{kind:'breakdown',breakdownId:'bd_aaaaaaaaaaaa'}};
   videos.push(video);return {status:201,body:video};
  }
  if(call.method==='DELETE'&&call.path.startsWith('/jobs/'))return {body:{status:'cancelled'}};
 });
 // The fake keeps no uploads, so they are noted here.
 const inner=globalThis.fetch;
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{if(String(input)==='/api/club/breakdowns')posted.push({path:'/breakdowns',form:init?.body instanceof FormData?init.body:undefined,signal:init?.signal});return inner(input,init);}) as typeof fetch;
 const ui=await mountUI(createElement(BoardScreen,{onOpenVideo:()=>{}}));
 try{await flush();await run(ui,posted,fake.calls);}finally{await ui.close();globalThis.fetch=inner;fake.restore();}
}
const uploads=(posted:Posted[])=>posted.filter(entry=>entry.form);
const dialog=(c:Element)=>c.querySelector('[role="dialog"]');
const link=(c:Element)=>c.querySelector<HTMLInputElement>('input[aria-label="Paste a YouTube or Instagram link"]')!;

test('Break down: a pasted link runs a job, streams progress and shows the stat row, the sections and three concepts; nothing is added by itself',async()=>{
 await withBoard(async(ui,_posted,calls)=>{
  const c=ui.container;
  await type(link(c),'https://youtu.be/dQw4w9WgXcQ?si=x');
  await press(button(c,'Break down'));
  assert.deepEqual(calls.filter(call=>call.path==='/breakdowns').map(call=>call.body),[{url:'https://youtu.be/dQw4w9WgXcQ?si=x'}]);
  assert.equal(link(c).value,'','the box is clear for the next one');
  assert.ok(dialog(c),'the dialog opens');
  assert.match(text(dialog(c)!),/Getting ready/);
  assert.equal(FakeEventSource.last().url,'/api/club/jobs/j1/events');
  await emit('progress',{message:'Reading the transcript…'});
  assert.match(text(dialog(c)!),/Reading the transcript…/);
  await emit('progress',{message:'Reading 40 comments…'});
  await emit('progress',{message:'Finding what made it work…'});
  assert.match(text(dialog(c)!),/Finding what made it work…/);
  assert.ok(button(dialog(c)!,'Cancel'));

  await emit('done',breakdown());
  const d=dialog(c)!;
  const stats=d.querySelector('[aria-label="Video stats"]')!;
  assert.equal(text(stats.querySelector('[data-band]')!),'2.84×usual views','the outlier chip carries its label');
  assert.equal(stats.querySelector('[data-band]')!.getAttribute('data-band'),'blue');
  assert.match(text(stats),/7\.6M views.*140K likes.*12K comments.*3 days ago/);
  assert.deepEqual([...d.querySelectorAll('section > h3')].map(h=>text(h)),['Why it worked','Reusable outline','What viewers asked','3 concepts with your twist']);
  assert.match(text(d.querySelector('section[aria-label="Why it worked"]')!),/Clear claim.*Title and packaging.*A bold claim.*How fast the opening hooks.*Structure.*What keeps people watching.*Payoff/);
  assert.deepEqual([...d.querySelectorAll('section[aria-label="Reusable outline"] li')].map(li=>text(li)),['Claim: the outcome','Demo: the how','Payoff: the result']);
  assert.match(text(d.querySelector('section[aria-label="What viewers asked"]')!),/Does it work on a free plan\?90 likesWhat about Windows\?$/);
  assert.equal(text(d).includes('Watched with Gemini'),false);
  const adds=[...d.querySelectorAll('button')].filter(b=>b.textContent==='Add to board');
  assert.equal(adds.length,3);
  assert.match(text(d.querySelector('section[aria-label="3 concepts with your twist"]')!),/Concept 1.*Angle 1.*Your twist.*Twist 1.*Hook.*Hook 1.*Demand.*High.*Asked in comments\..*Gap.*Mid.*not checked.*Easy to show.*Low.*Needs setup\./);
  assert.equal(calls.filter(call=>call.path.startsWith('/videos')&&call.method==='POST').length,0,'nothing was added automatically');
  assert.equal(c.querySelectorAll('[data-column="ideas"] [data-card]').length,0);

  // Add to board creates the video through the server and shows it in Ideas; the button gives way to a label.
  await press(adds[1]);
  assert.deepEqual(calls.filter(call=>call.path.includes('/concepts/')).map(call=>call.path),['/breakdowns/bd_aaaaaaaaaaaa/concepts/1/add']);
  assert.deepEqual([...c.querySelectorAll('[data-column="ideas"] [data-card]')].map(el=>text(el).slice(0,9)),['Concept 2']);
  assert.equal([...dialog(c)!.querySelectorAll('button')].filter(b=>b.textContent==='Add to board').length,2);
  assert.match(text(dialog(c)!),/On the board/);
  // A concept that is already on the board counts as added, with no error.
  await press([...dialog(c)!.querySelectorAll('button')].filter(b=>b.textContent==='Add to board')[1]);
  assert.equal(dialog(c)!.querySelectorAll('[role="alert"]').length,0);
  assert.equal(c.querySelectorAll('[data-column="ideas"] [data-card]').length,1);
 });
});

test('Break down: a Gemini result says so, and a file or Instagram breakdown shows only what it knows',async()=>{
 await withBoard(async(ui)=>{
  const c=ui.container;
  await type(link(c),'https://www.instagram.com/reel/C8aBcD_eFgH/');
  await press(button(c,'Break down'));
  await emit('done',breakdown({platform:'instagram',watchedWith:'gemini',video:{title:'A reel',channel:'maker',views:0,likes:321,comments:0,ageDays:0,thumbnail:''}}));
  const d=dialog(c)!;
  assert.match(text(d),/Watched with Gemini/);
  assert.match(text(d),/maker · Instagram/);
  const stats=text(d.querySelector('[aria-label="Video stats"]')!);
  assert.equal(stats,'321 likestoday');
  assert.equal(d.querySelector('[data-band]'),null,'no multiplier, no chip');
 });
 await withBoard(async(ui)=>{
  const c=ui.container;
  await dropOn(c.querySelector('[data-dropzone]')!,new File(['x'],'clip.mp4',{type:'video/mp4'}));
  await emit('done',breakdown({platform:'file',url:'',video:{title:'clip',channel:'',views:0,likes:0,comments:0,ageDays:0,thumbnail:''}}));
  const d=dialog(c)!;
  assert.equal(d.querySelector('[aria-label="Video stats"]'),null,'a dropped file has no stats');
  assert.match(text(d.querySelector('header')!),/Video file/);
 });
});

test('Break down: Cancel stops the job; a link that is not a video never starts one',async()=>{
 await withBoard(async(ui,_posted,calls)=>{
  const c=ui.container;
  await type(link(c),'https://example.com/video');
  await press(button(c,'Break down'));
  assert.equal(calls.filter(call=>call.path==='/breakdowns').length,0);
  assert.equal(dialog(c),null);
  assert.match(text(c),/Paste a YouTube or Instagram link, or drop a video file\./);
  await type(link(c),'https://youtu.be/dQw4w9WgXcQ');
  assert.equal(text(c).includes('Paste a YouTube or Instagram link, or drop a video file.'),false,'the sentence goes when the link changes');
  await press(button(c,'Break down'));
  await emit('progress',{message:'Getting the video…'});
  await press(button(dialog(c)!,'Cancel'));
  assert.equal(dialog(c),null);
  assert.deepEqual(calls.filter(call=>call.method==='DELETE').map(call=>call.path),['/jobs/j1']);
 });
});

test('Break down: a failure is one sentence and Try again; after it a video file can be dropped, which starts a new job',async()=>{
 await withBoard(async(ui,posted,calls)=>{
  const c=ui.container;
  await type(link(c),'https://www.instagram.com/reel/C8aBcD_eFgH/');
  await press(button(c,'Break down'));
  await emit('failed',{message:'Instagram blocked the download. Drop the video file here instead.'});
  const d=dialog(c)!;
  assert.equal(text(d.querySelector('[role="alert"]')!),'Instagram blocked the download. Drop the video file here instead.Try again');
  assert.match(text(d),/Drop a video file here/);
  assert.equal(calls.filter(call=>call.method==='DELETE').length,0,'a failed job is not cancelled');

  await dropOn(d.querySelector('[role="alert"]')!,new File(['x'],'notes.txt'));
  assert.match(text(d.querySelector('[role="alert"]')!),/Drop a video file, like an mp4 or a mov\./);
  assert.equal(uploads(posted).length,0);

  const clip=new File(['video bytes'],'reel.mp4',{type:'video/mp4'});
  await dropOn(d.querySelector('[role="alert"]')!,clip);
  assert.equal(uploads(posted).length,1);
  assert.equal(uploads(posted)[0].path,'/breakdowns');
  assert.equal((uploads(posted)[0].form!.get('file') as File).name,'reel.mp4');
  assert.match(text(dialog(c)!),/Getting ready/);
  assert.equal(FakeEventSource.last().url,'/api/club/jobs/j2/events');

  await emit('failed',{message:'That did not work.'});
  await press(button(dialog(c)!,'Try again'));
  assert.equal(uploads(posted).length,2,'Try again sends the dropped file again');
  assert.equal(FakeEventSource.last().url,'/api/club/jobs/j3/events');
 });
});

test('Break down: dropping a video file on the box starts a breakdown; other files are refused in one sentence',async()=>{
 await withBoard(async(ui,posted)=>{
  const c=ui.container,box=c.querySelector('[data-dropzone]')!;
  await dropOn(box,new File(['x'],'notes.txt'));
  assert.equal(dialog(c),null);
  assert.match(text(box),/Drop a video file, like an mp4 or a mov\./);
  await dropOn(box,new File(['video'],'My clip.mov',{type:'video/quicktime'}));
  assert.ok(dialog(c));
  assert.equal(uploads(posted).length,1);
  assert.equal((uploads(posted)[0].form!.get('file') as File).name,'My clip.mov');
  await press(dialog(c)!.querySelector('button[aria-label="Close"]')!);
  assert.equal(dialog(c),null);
 });
});

test('Break down: closing the dialog before the job id arrives aborts the request and stops the job when its id does arrive',async()=>{
 await withBoard(async(ui,posted,calls)=>{
  const c=ui.container;
  let release=()=>{};hold=new Promise<void>(resolve=>{release=resolve;});
  try{
   await dropOn(c.querySelector('[data-dropzone]')!,new File(['video bytes'],'clip.mp4',{type:'video/mp4'}));
   assert.equal(posted.length,1);
   assert.equal(posted[0].signal?.aborted,false,'the upload is under way');
   await press(dialog(c)!.querySelector('button[aria-label="Close"]')!);
   assert.equal(dialog(c),null);
   assert.equal(posted[0].signal?.aborted,true,'closing aborts the request');
   assert.equal(calls.filter(call=>call.method==='DELETE').length,0,'there is no job to stop yet');
   release();await flush();await flush();
   assert.deepEqual(calls.filter(call=>call.method==='DELETE').map(call=>call.path),['/jobs/j1'],'the job that was started is stopped');
   assert.equal(FakeEventSource.all.length,0,'nothing follows it');
  }finally{release();hold=null;}
 });
});

test('Break down: a request that fails outright shows one sentence, and Try again sends it again',async()=>{
 await withBoard(async(ui,posted)=>{
  const c=ui.container;
  await type(link(c),'https://youtu.be/dQw4w9WgXcQ');
  await press(button(c,'Break down'));
  assert.equal(posted.length,1);
  assert.equal(posted[0].signal?.aborted,false);
  await emit('failed',{message:"Couldn't read that video from YouTube."});
  assert.equal(text(dialog(c)!.querySelector('[role="alert"]')!),"Couldn't read that video from YouTube.Try again");
  await press(button(dialog(c)!,'Try again'));
  assert.equal(posted.length,2);
  assert.equal(posted[0].signal?.aborted,true,'the earlier attempt is left behind');
 });
});
