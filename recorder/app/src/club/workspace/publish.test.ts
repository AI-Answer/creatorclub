import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
import type {Package,Video,VideoScene} from '../../../shared/club';
import type {ExportRecord} from '../../../shared/export-history';
const {Publish,PUBLISH_LINE}=await import('./Publish');
const {Teleprompter}=await import('./Teleprompter');
const {installFetch,FakeEventSource}=await import('../test-fakes');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const type=async(input:Element,value:string,proto:typeof HTMLInputElement|typeof HTMLTextAreaElement=HTMLInputElement)=>act(async()=>{Object.getOwnPropertyDescriptor(proto.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const byLabel=(root:Element,label:string)=>root.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
const primaries=(root:Element)=>[...root.querySelectorAll('button')].filter(b=>b.classList.contains('primary')).map(b=>b.textContent?.trim());

const video:Video={id:'v1',title:'Seven hidden Claude Code tricks',stage:'publishing',order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{publishing:'2026-10-28T00:00:00.000Z'},planning:{research:true,package:true,outline:true},recorderProjectId:'p1'};
const pkg:Package={angle:'Most people use one feature.',twist:'',titles:['A','B','C'],thumbnailText:'Hidden features',hook:{visual:'A menu',spoken:'You never opened this.',text:'HIDDEN'}};
const scenes:VideoScene[]=[{id:'a',title:'Opening',seconds:60,takes:[{id:'t',seconds:60,kept:true,retained:false}],status:'Kept take 1'},{id:'b',title:'Level 1',seconds:90,takes:[],status:'Not recorded'}];
const output='/Users/me/SceneForge/exports/Hidden features-e1.mp4';
const exported:ExportRecord={id:'e1',type:'export',status:'complete',progress:1,message:'',outputPath:output,startedAt:'2026-10-28T10:00:00.000Z',completedAt:'2026-10-28T10:01:00.000Z',projectId:'p1',projectName:'Hidden features',projectRevision:'r',snapshotCreatedAt:'',options:{format:'mp4'},updatedAt:'',revision:1,output:{status:'available'},recovery:{status:'available',runtimeChanged:false}};
const props={video,pkg,scenes,onVideo:()=>{},onDescription:()=>{},onTags:()=>{},onGoTo:()=>{},onRetry:()=>{}};

const connected={postiz:{connected:true,address:null,channel:{id:'int_yt1',name:'Samin Yasar'}},defaultVisibility:'public'};
const notConnected={postiz:{connected:false,address:null,channel:null},defaultVisibility:'public'};
const jobStarted={status:202,body:{id:'j1',kind:'publish',status:'running',createdAt:''}};
const sent={postId:'p_1',title:video.title,visibility:'unlisted',sentAt:'2026-10-29T12:00:00.000Z',state:'published',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',postizUrl:'https://platform.postiz.com/launches'};
const key=(input:Element,keyName:string)=>act(async()=>{input.dispatchEvent(new KeyboardEvent('keydown',{key:keyName,bubbles:true,cancelable:true}));});
const choose=(select:Element,value:string)=>act(async()=>{(select as HTMLSelectElement).value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
const click=(element:Element|null)=>act(async()=>(element as HTMLElement).click());
const like=(root:Element,pattern:RegExp)=>[...root.querySelectorAll('button')].find(b=>pattern.test(b.textContent??''))!;
const field=(root:Element,id:string)=>root.querySelector(`#${id}`) as HTMLInputElement;
const posts=(calls:{method:string;path:string;body:unknown}[])=>calls.filter(call=>call.method==='POST'&&call.path==='/videos/v1/postiz');

/** A Publish screen with Postiz answering as given; `reply` adds to or overrides the defaults. */
async function withPublish(options:{state?:object;record?:object|null;reply?:Parameters<typeof installFetch>[0];props?:object},run:(ui:Awaited<ReturnType<typeof mountUI>>,server:ReturnType<typeof installFetch>,changes:Video[])=>Promise<void>){
 FakeEventSource.install();
 const changes:Video[]=[];
 const server=installFetch(async call=>{
  const custom=await options.reply?.(call);if(custom)return custom;
  if(call.path.startsWith('/api/exports?projectId=p1'))return {body:{jobs:[exported],nextOffset:null}};
  if(call.path==='/publishing')return {body:options.state??connected};
  if(call.path==='/publishing/postiz/channels')return {body:{channels:[{id:'int_yt1',name:'Samin Yasar'}]}};
  if(call.path==='/videos/v1/postiz'&&call.method==='GET')return {body:options.record??null};
  if(call.path==='/videos/v1/postiz'&&call.method==='POST')return jobStarted;
  if(call.path==='/videos/v1/thumbnail')return {status:204};
  if(call.path==='/videos/v1'&&call.method==='GET')return {body:{...video,stage:'published',youtubeUrl:sent.url,publishedAt:'2026-10-29T12:00:00.000Z'}};
 });
 // The app keeps the video and the package and hands the new ones down when they change, as the workspace does.
 const Harness=()=>{
  const given=options.props as {video?:Video;pkg?:Package|null}|undefined;
  const [current,setCurrent]=useState<Video>(given?.video??video);
  const [shown,setShown]=useState<Package|null>(given&&'pkg' in given?given.pkg??null:pkg);
  return createElement(Publish,{...props,...options.props,video:current,pkg:shown,onTags:(tags:string[])=>setShown(was=>({...(was??pkg),tags})),onVideo:(next:Video)=>{changes.push(next);setCurrent(next);}});
 };
 const ui=await mountUI(createElement(Harness));
 try{await flush();await run(ui,server,changes);}finally{await ui.close();server.restore();}
}

test('Publish: the export line, Postiz connected, the form YouTube asks for, and Publish now as the one primary',async()=>{
 await withPublish({},async ui=>{
  const c=ui.container,text=c.textContent??'';
  assert.ok(text.includes(PUBLISH_LINE));
  assert.ok(text.includes('Video exported')&&text.includes('Hidden features-e1.mp4'),'the newest export');
  assert.ok(text.includes('Postiz connected.')&&text.includes('Posts to Samin Yasar on YouTube.'));
  assert.equal(field(c,'pub-title').value,video.title);
  assert.equal((c.querySelector('#pub-desc') as HTMLTextAreaElement).value,'You never opened this.\n\nMost people use one feature.','no chapters until the timeline is read');
  assert.equal((c.querySelector('#pub-vis') as HTMLSelectElement).value,'public');
  assert.deepEqual([...c.querySelectorAll('input[name=kids]')].map(input=>(input as HTMLInputElement).checked),[false,false],'made for kids has no default');
  assert.deepEqual(primaries(c),['Publish now']);
  assert.ok(c.querySelector('aside[aria-label="How it will look"]')?.textContent?.includes('Hidden features'),'the package summary shows the thumbnail text and title');
  assert.ok(!c.textContent?.includes('Mark as published'),'pasting a link is behind a link');
  assert.ok(!/Borumi|successfully|please|!/i.test(text));
 });
});

test('Publish now needs the made-for-kids answer; then it sends the form and follows the job to the link',async()=>{
 await withPublish({},async(ui,server,changes)=>{
  const c=ui.container;
  assert.equal(button(c,'Publish now').disabled,true,'it cannot be pressed without the answer');
  assert.equal(c.querySelector('#pub-why')?.textContent,"Choose whether it's made for kids, which YouTube requires.",'and says why beside it');
  await click(button(c,'Publish now'));
  assert.equal(posts(server.calls).length,0,'nothing is sent without the answer');
  await type(c.querySelector('#pub-tags')!,'claude');await key(c.querySelector('#pub-tags')!,'Enter');
  await type(c.querySelector('#pub-tags')!,'ai agents, mods');await key(c.querySelector('#pub-tags')!,'Enter');
  assert.deepEqual([...c.querySelectorAll('.tagsbox .chip')].map(chip=>chip.textContent),['claude','ai agents','mods']);
  await choose(c.querySelector('#pub-vis')!,'unlisted');
  await click(c.querySelector('input[name=kids][value=no]'));
  await type(field(c,'pub-title'),'A better title');
  await click(button(c,'Publish now'));await flush();
  assert.deepEqual(posts(server.calls)[0].body,{exportId:'e1',title:'A better title',description:'You never opened this.\n\nMost people use one feature.',tags:['claude','ai agents','mods'],visibility:'unlisted',madeForKids:false});
  assert.equal(FakeEventSource.last().url,'/api/club/jobs/j1/events');
  assert.ok(c.textContent?.includes('Exported the video')&&!c.querySelector('#pub-title'),'the form gives way to the progress');
  await act(async()=>{FakeEventSource.last().emit('progress',{step:'upload',message:'x',percent:42});});
  assert.ok(c.textContent?.includes('Sending the video to Postiz, 42%'));
  assert.equal(c.querySelector('.pbar i')?.getAttribute('style')?.includes('42%'),true);
  await act(async()=>{FakeEventSource.last().emit('progress',{step:'wait',message:'Postiz is uploading it to YouTube.'});});
  assert.ok(c.textContent?.includes('Sent the video to Postiz')&&c.textContent.includes('Postiz is putting it on YouTube'));
  await act(async()=>{FakeEventSource.last().emit('done',sent);});await flush();
  assert.ok(c.textContent?.includes("It's on YouTube")&&c.textContent.includes('youtube.com/watch?v=dQw4w9WgXcQ'));
  assert.equal(changes.at(-1)?.stage,'published','the video is read again so the app shows it Published');
  assert.equal((c.querySelector('a[href^="https://platform.postiz.com"]') as HTMLAnchorElement).textContent?.includes('Open in Postiz'),true);
 });
});

test('a failed publish shows one sentence and Try again, which sends it again',async()=>{
 await withPublish({reply:({method,path})=>path==='/videos/v1'&&method==='GET'?{body:video}:undefined},async(ui,server)=>{
  const c=ui.container;
  await click(c.querySelector('input[name=kids][value=yes]'));
  await click(button(c,'Publish now'));await flush();
  await act(async()=>{FakeEventSource.last().emit('progress',{step:'upload',message:'x',percent:63});});
  await act(async()=>{FakeEventSource.last().emit('failed',{message:'Postiz allows 90 posts an hour and that is used up. Try again in 25 minutes.'});});
  assert.ok(c.textContent?.includes('Postiz allows 90 posts an hour and that is used up. Try again in 25 minutes.'));
  assert.equal(c.querySelector('.pstep2.fail')?.textContent?.includes('Sending the video to Postiz'),true,'the stopped row is marked');
  await click(button(c,'Try again'));await flush();
  assert.equal(posts(server.calls).length,2);
  assert.equal((posts(server.calls)[1].body as {madeForKids:boolean}).madeForKids,true);
  await act(async()=>{FakeEventSource.last().emit('done',{...sent,state:'queued',url:undefined});});await flush();
  assert.ok(c.textContent?.includes('Postiz has it')&&c.textContent.includes('Check again'));
 });
});

test('Schedule for later asks for a time, refuses one that has passed, and sends an ISO time',async()=>{
 await withPublish({reply:({method,path})=>path==='/videos/v1'&&method==='GET'?{body:video}:undefined},async(ui,server)=>{
  const c=ui.container;
  assert.equal(c.querySelector('#pub-at'),null);
  await choose(c.querySelector('#pub-when')!,'schedule');
  const at=field(c,'pub-at');
  assert.match(at.value,/^\d{4}-\d\d-\d\dT15:00$/,'tomorrow at 15:00');
  assert.match(like(c,/^Schedule for/).textContent!,/^Schedule for \w{3} \d+ \w{3}, 15:00$/);
  await click(c.querySelector('input[name=kids][value=no]'));
  await type(at,'2020-01-01T10:00');
  assert.equal(like(c,/^Schedule for/).disabled,true);
  await click(like(c,/^Schedule for/));
  assert.ok(c.textContent?.includes('Pick a time in the future.'));
  assert.equal(posts(server.calls).length,0);
  const later=new Date(Date.now()+3*86_400_000);later.setSeconds(0,0);
  const pad=(n:number)=>String(n).padStart(2,'0');
  await type(at,`${later.getFullYear()}-${pad(later.getMonth()+1)}-${pad(later.getDate())}T${pad(later.getHours())}:${pad(later.getMinutes())}`);
  await click(like(c,/^Schedule for/));await flush();
  assert.equal((posts(server.calls)[0].body as {scheduledFor:string}).scheduledFor,later.toISOString());
  await act(async()=>{FakeEventSource.last().emit('progress',{step:'post',message:'Scheduling it in Postiz'});});
  assert.ok(c.textContent?.includes('Scheduling it in Postiz'));
  await act(async()=>{FakeEventSource.last().emit('done',{...sent,state:'queued',url:undefined,scheduledFor:later.toISOString()});});await flush();
  assert.ok(c.textContent?.includes("It's scheduled")&&c.textContent.includes('Your laptop can be closed.'));
 });
});

test('without Postiz connected Publish says so and the key is entered once, right there',async()=>{
 let state:object=notConnected;
 await withPublish({reply:({method,path,body})=>{
  if(path==='/publishing')return {body:state};
  if(method==='PUT'&&path==='/publishing/postiz'){
   if((body as {key:string}).key==='wrong')return {status:400,body:{error:"Postiz didn't accept that key. Copy it again from Postiz, Settings, Public API."}};
   state=connected;return {body:{state:connected,channels:[{id:'int_yt1',name:'Samin Yasar'}]}};
  }
 }},async(ui,server)=>{
  const c=ui.container;
  await click(c.querySelector('input[name=kids][value=no]'));
  assert.equal(button(c,'Publish now').disabled,true,'Publish now looks and is unavailable until Postiz is connected');
  assert.equal(c.querySelector('#pub-why')?.textContent,'Connect Postiz first.');
  assert.equal(button(c,'Publish now').getAttribute('aria-describedby'),'pub-why');
  await click(button(c,'Publish now'));
  assert.equal(posts(server.calls).length,0);
  const input=field(c,'postiz-key');
  assert.equal(input.type,'password');
  await click(button(c,'Connect'));
  assert.ok(c.textContent?.includes('Paste your key first.'));
  await type(input,'wrong');await click(button(c,'Connect'));await flush();
  assert.ok(c.textContent?.includes("Postiz didn't accept that key."));
  await type(input,'walkthrough-postiz-key-123');await click(button(c,'Connect'));await flush();
  assert.deepEqual(server.calls.filter(call=>call.method==='PUT').at(-1)?.body,{key:'walkthrough-postiz-key-123'});
  assert.ok(c.textContent?.includes('Postiz connected.'));
  assert.ok(!c.querySelector('#postiz-key')&&!c.textContent?.includes('walkthrough-postiz-key'),'the key is not shown again');
 });
});

test('a video already sent shows where it is: Postiz has it, Check again finds it on YouTube',async()=>{
 let record:object={...sent,state:'queued',url:undefined};
 await withPublish({reply:({method,path})=>path==='/videos/v1/postiz'&&method==='GET'?{body:record}:undefined},async(ui,server,changes)=>{
  const c=ui.container;
  assert.ok(c.textContent?.includes('Postiz has it')&&c.textContent.includes('Postiz is sending it to YouTube.'));
  assert.ok(!c.querySelector('#pub-title'),'the form is not shown again');
  record={...sent};
  await click(button(c,'Check again'));await flush();
  assert.ok(c.textContent?.includes("It's on YouTube"));
  assert.equal(changes.at(-1)?.stage,'published');
 });
});

test('a post Postiz did not confirm shows Check again and Open in Postiz, and never Try again or a second send',async()=>{
 const unconfirmed={...sent,postId:'',unconfirmed:true,state:'queued',url:undefined,message:"Postiz didn't confirm the post, so it may or may not be there."};
 let record:object|null=null;
 await withPublish({reply:({method,path})=>path==='/videos/v1/postiz'&&method==='GET'?{body:record}:undefined},async(ui,server)=>{
  const c=ui.container;
  await click(c.querySelector('input[name=kids][value=no]'));
  await click(button(c,'Publish now'));await flush();
  record=unconfirmed;
  await act(async()=>{FakeEventSource.last().emit('failed',{message:"Postiz didn't confirm the post, so it may or may not be there."});});await flush();
  assert.ok(c.textContent?.includes("Postiz didn't confirm it"));
  assert.ok(c.textContent?.includes('Not confirmed'));
  assert.ok(button(c,'Check again'));
  assert.ok(c.querySelector('a[href^="https://platform.postiz.com"]'),'Open in Postiz');
  assert.equal([...c.querySelectorAll('button')].some(b=>b.textContent==='Try again'),false,'no Try again');
  assert.equal(c.querySelector('#pub-title'),null,'no form to send it again');
  await click(button(c,'I uploaded it myself'));
  assert.ok(c.textContent?.includes('Add the link so CreatorClub can mark it Published.'),'a quiet way out for an unconfirmed post');
  assert.equal(posts(server.calls).length,1);
  record={...sent,state:'queued',url:undefined};
  await click(button(c,'Check again'));await flush();
  assert.ok(c.textContent?.includes('Postiz has it')&&!c.textContent.includes("didn't confirm"));
 });
});

test("I checked Postiz, it isn't there: Allow sending again lets a queued or unconfirmed post go, and the form comes back",async()=>{
 const unconfirmed={...sent,postId:'',unconfirmed:true,state:'queued',url:undefined};
 await withPublish({record:unconfirmed,reply:({method,path})=>path==='/videos/v1/postiz/forget'&&method==='POST'?{body:{...unconfirmed,unconfirmed:undefined,state:'failed',message:'You said it is not in Postiz, so this video can be sent again.'}}:undefined},async(ui,server)=>{
  const c=ui.container;
  assert.ok(c.textContent?.includes("Postiz didn't confirm it"));
  assert.equal(c.querySelector('#pub-title'),null);
  const forget=like(c,/^I checked Postiz, it isn't there\. Allow sending again$/);
  assert.ok(!forget.classList.contains('primary'),'a secondary button');
  await click(forget);await flush();
  assert.equal(server.calls.filter(call=>call.method==='POST'&&call.path==='/videos/v1/postiz/forget').length,1);
  assert.ok(c.querySelector('#pub-title'),'the form is back, so it can be sent again');
  assert.equal(posts(server.calls).length,0,'forgetting sends nothing');
 });
});

test('a published video has no way to forget; a queued one has',async()=>{
 await withPublish({record:{...sent,state:'queued',url:undefined}},async ui=>{assert.ok(like(ui.container,/Allow sending again/));});
 await withPublish({props:{video:{...video,stage:'published',youtubeUrl:sent.url}},record:sent},async ui=>{assert.equal([...ui.container.querySelectorAll('button')].some(b=>/Allow sending again/.test(b.textContent??'')),false);});
});

test('the first-publish reminder shows until it is dismissed or a Postiz publish has gone through, not on every card',async()=>{
 localStorage.clear();
 const reminder='Open the video on YouTube once and check that the made-for-kids answer and the thumbnail are as you set them.';
 await withPublish({record:{...sent,state:'queued',url:undefined}},async ui=>{
  const c=ui.container;
  assert.ok(c.textContent?.includes(reminder));
  await click(button(c,'Got it'));
  assert.ok(!c.textContent?.includes(reminder));
 });
 await withPublish({record:{...sent,state:'queued',url:undefined}},async ui=>assert.ok(!ui.container.textContent?.includes(reminder),'dismissed for good'));
 localStorage.clear();
 await withPublish({props:{video:{...video,stage:'published',youtubeUrl:sent.url}},record:sent},async ui=>assert.ok(ui.container.textContent?.includes(reminder),'shown on the first published card'));
 await withPublish({record:{...sent,state:'queued',url:undefined}},async ui=>assert.ok(!ui.container.textContent?.includes(reminder),'and not after a Postiz publish has gone through'));
 localStorage.clear();
});

test('Postiz saying published is not "on YouTube" until the video really is Published; until then the paste-the-link form is there',async()=>{
 localStorage.clear();
 await withPublish({record:{...sent,state:'published'},reply:({method,path})=>path==='/videos/v1'&&method==='GET'?{body:video}:undefined},async ui=>{
  const c=ui.container;
  assert.ok(!c.textContent?.includes("It's on YouTube"),'no green claim');
  assert.ok(c.textContent?.includes('Postiz has it'));
  assert.ok(button(c,'Mark as published'),'a way out, open at once');
  assert.ok(c.textContent?.includes("Postiz says it's published, but the YouTube link didn't come back. Add the link so CreatorClub can mark it Published."),'labelled plainly');
  assert.ok(c.textContent?.includes('Open the video on YouTube once and check that the made-for-kids answer and the thumbnail are as you set them.'),'the first-publish reminder');
 });
});

test('with Postiz connected and working, the form never offers adding a link by hand',async()=>{
 await withPublish({},async ui=>{
  assert.equal([...ui.container.querySelectorAll('button')].some(b=>/uploaded it myself|Paste the link/i.test(b.textContent??'')),false);
 });
});

test('without Postiz, a video uploaded outside CreatorClub can still be marked Published with its link',async()=>{
 await withPublish({state:notConnected,reply:({method,path,body})=>{
  if(method==='POST'&&path==='/videos/v1/publish'){
   if(!(body as {youtubeUrl:string}).youtubeUrl.includes('youtu'))return {status:400,body:{error:'Paste the YouTube link of the uploaded video.'}};
   return {body:{...video,stage:'published',youtubeUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',publishedAt:'2026-10-29T12:00:00.000Z'}};
  }
 }},async(ui,server,changes)=>{
  const c=ui.container;
  await click(button(c,'I uploaded it myself'));
  assert.ok(c.textContent?.includes('Add the link so CreatorClub can mark it Published.'));
  assert.equal(button(c,'Mark as published').disabled,true,'needs a link first');
  const link=field(c,'club-youtube-link');
  await type(link,'https://vimeo.com/1');await click(button(c,'Mark as published'));await flush();
  assert.ok(c.textContent?.includes('Paste the YouTube link of the uploaded video.'));
  assert.equal(link.getAttribute('aria-invalid'),'true');
  await type(link,'https://youtu.be/dQw4w9WgXcQ');await click(button(c,'Mark as published'));await flush();
  assert.equal(changes.at(-1)?.stage,'published');
  assert.deepEqual(server.calls.filter(call=>call.path==='/videos/v1/publish').at(-1)?.body,{youtubeUrl:'https://youtu.be/dQw4w9WgXcQ'});
 });
});

test('a published video shows its link and views; Change link opens the link field',async()=>{
 const published:Video={...video,stage:'published',youtubeUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',publishedAt:'2026-10-29T12:00:00.000Z',views:1234};
 await withPublish({props:{video:published,pkg:null}},async ui=>{
  const c=ui.container,text=c.textContent??'';
  assert.ok(text.includes('1,234')&&text.includes('views since'));
  assert.ok(text.includes('youtube.com/watch?v=dQw4w9WgXcQ'));
  assert.ok(!c.querySelector('#pub-title'),'a published video shows its result, not the form');
  await click(button(c,'Change link'));
  assert.equal(field(c,'club-youtube-link').value,published.youtubeUrl);
 });
});

test('no exported video yet says where to export it',async()=>{
 const goes:string[]=[];
 await withPublish({reply:({path})=>path.startsWith('/api/exports')?{body:{jobs:[],nextOffset:null}}:undefined,props:{onGoTo:(tab:string)=>goes.push(tab)}},async ui=>{
  const c=ui.container;
  assert.ok(c.textContent?.includes('No exported video yet.'));
  await click(button(c,'Export it in Edit'));
  assert.deepEqual(goes,['edit']);
  await click(c.querySelector('input[name=kids][value=no]'));await click(button(c,'Publish now'));
  assert.ok(c.textContent?.includes('Export the video first.'));
 });
});

test('your own thumbnail is uploaded with the video and can be removed',async()=>{
 await withPublish({},async(ui,server)=>{
  const c=ui.container;
  assert.ok(c.textContent?.includes('YouTube picks a frame unless you add one.'));
  const input=c.querySelector('input[type=file]') as HTMLInputElement;
  assert.equal(input.accept,'image/png,image/jpeg');
  Object.defineProperty(input,'files',{configurable:true,value:[new File([new Uint8Array([1,2,3])],'mine.png',{type:'image/png'})]});
  await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));});await flush();
  assert.equal(server.calls.filter(call=>call.method==='POST'&&call.path==='/videos/v1/thumbnail').length,1);
  assert.ok(c.textContent?.includes('Your own image.'));
  await click(button(c,'Remove image'));await flush();
  assert.equal(server.calls.filter(call=>call.method==='DELETE'&&call.path==='/videos/v1/thumbnail').length,1);
  assert.ok(c.textContent?.includes('YouTube picks a frame'));
 });
});

test('Publish before anything is recorded leads back to Record, or to Plan without scenes',async()=>{
 const server=installFetch(()=>undefined);
 const goes:string[]=[];
 const empty=[{...scenes[1]}];
 let ui=await mountUI(createElement(Publish,{...props,scenes:empty,onGoTo:(tab:string)=>goes.push(tab)}));
 try{
  await flush();
  assert.ok(ui.container.textContent?.includes('Nothing to publish yet'));
  assert.ok(ui.container.textContent?.includes('1 scene waiting to be recorded'));
  await act(async()=>button(ui.container,'Open record').click());
 }finally{await ui.close();}
 ui=await mountUI(createElement(Publish,{...props,scenes:[],onGoTo:(tab:string)=>goes.push(tab)}));
 try{await flush();await act(async()=>button(ui.container,'Open plan').click());}finally{await ui.close();server.restore();}
 assert.deepEqual(goes,['record','plan']);
});

test('with the timeline read, the chapters are where the scenes are cut, and unrecorded scenes are named before it goes out',async()=>{
 const {projectRevision}=await import('../../api');
 // Planned 1:00 and 1:30, but the cut has the opening at 0:00 only: Level 1 is not recorded.
 const project={id:'p1',clips:[{id:'c1',start:0.5,recordingTakeId:'t'},{id:'c2',start:0.5,recordingTakeId:'t'}]};
 const revision=(await projectRevision(project as never)).replaceAll('"','');
 await withPublish({reply:({path})=>path==='/api/projects/p1'?{body:project}:path.startsWith('/api/exports?projectId=p1')?{body:{jobs:[{...exported,projectRevision:revision}],nextOffset:null}}:undefined},async(ui,server)=>{
  const c=ui.container;await flush();
  assert.equal((c.querySelector('#pub-desc') as HTMLTextAreaElement).value,'You never opened this.\n\nMost people use one feature.\n\nChapters\n0:00 Opening');
  assert.equal(c.querySelector('.pubx-warn[role=status]')?.textContent,"1 of 2 scenes isn't recorded yet, so it isn't in the video.");
  await click(c.querySelector('input[name=kids][value=no]'));
  assert.equal(button(c,'Publish now').disabled,false,'a warning, not a block');
  await click(button(c,'Publish now'));await flush();
  assert.equal((posts(server.calls)[0].body as {description:string}).description,'You never opened this.\n\nMost people use one feature.\n\nChapters\n0:00 Opening');
 });
});

test('the teleprompter shows the scene\'s talking points, steps through them and sizes the text',async()=>{
 const ui=await mountUI(createElement(Teleprompter,{index:1,scene:{id:'b',title:'Level 1',talkingPoints:['First','Second'],show:'Settings',seconds:90,script:'The words.'}}));
 try{
  const c=ui.container;
  assert.ok(c.textContent?.includes('Level 1')&&c.textContent.includes('about 1:30')&&c.textContent.includes('Show: Settings'));
  const points=()=>[...c.querySelectorAll('.tp')];
  assert.deepEqual(points().map(p=>p.className),['tp cur','tp']);
  await act(async()=>(points()[1] as HTMLElement).click());
  assert.deepEqual(points().map(p=>p.className),['tp done','tp cur']);
  const before=(points()[0] as HTMLElement).style.fontSize;
  await act(async()=>byLabel(c,'Bigger text').click());
  assert.notEqual((points()[0] as HTMLElement).style.fontSize,before);
  assert.ok(c.textContent?.includes('Full script for this scene'));
 }finally{await ui.close();}
 const none=await mountUI(createElement(Teleprompter,{index:0,scene:{title:'Empty',talkingPoints:[],show:'',seconds:0}}));
 try{assert.ok(none.container.textContent?.includes('This scene has no talking points. Add them in Plan.'));}finally{await none.close();}
});

test('a failed description save says so with Try again, and the description is saved on the package when edited',async()=>{
 const saved:string[]=[],retries:number[]=[];
 await withPublish({props:{saveError:'raw',onRetry:()=>retries.push(1),onDescription:(text:string)=>saved.push(text)}},async ui=>{
  const c=ui.container;
  assert.ok(c.textContent?.includes("Couldn't save the description."));
  await click(button(c,'Try again'));
  assert.deepEqual(retries,[1]);
  const description=c.querySelector('#pub-desc') as HTMLTextAreaElement;
  await type(description,'My own words',HTMLTextAreaElement);
  await act(async()=>{description.dispatchEvent(new Event('focusout',{bubbles:true}));});
  assert.deepEqual(saved,['My own words']);
 });
});
