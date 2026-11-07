import {projectRevision} from '../../api';
import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
import type {Package,Video,VideoScene} from '../../../shared/club';
import type {ExportRecord} from '../../../shared/export-history';
const {Publish}=await import('./Publish');
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
const savedProject={id:'p1',clips:[]};
const savedRevision=(await projectRevision(savedProject as never)).replaceAll('"','');
const exported:ExportRecord={id:'e1',type:'export',status:'complete',progress:1,message:'',outputPath:output,startedAt:'2026-10-28T10:00:00.000Z',completedAt:'2026-10-28T10:01:00.000Z',projectId:'p1',projectName:'Hidden features',projectRevision:savedRevision,snapshotCreatedAt:'',options:{format:'mp4'},updatedAt:'',revision:1,output:{status:'available'},recovery:{status:'available',runtimeChanged:false}};
const settingsAsked:string[]=[];
const props={video,pkg,scenes,onVideo:()=>{},onDescription:()=>{},onTags:()=>{},onGoTo:()=>{},onSettings:()=>{settingsAsked.push('publishing');},onRetry:()=>{}};

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
 FakeEventSource.install();window.sessionStorage.clear();
 const changes:Video[]=[];
 const server=installFetch(async call=>{
  const custom=await options.reply?.(call);if(custom)return custom;
  if(call.path==='/api/projects/p1')return {body:savedProject};
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
  return createElement('div',null,createElement(Publish,{...props,...options.props,video:current,pkg:shown,onTags:(tags:string[])=>setShown(was=>({...(was??pkg),tags})),onVideo:(next:Video)=>{changes.push(next);setCurrent(next);}}),createElement('footer',{id:'ws-publish-action'}));
 };
 const ui=await mountUI(createElement(Harness));
 try{await flush();await flush();await run(ui,server,changes);}finally{await ui.close();server.restore();}
}

test('Publish: the export line, Postiz connected, the form YouTube asks for, and Publish now as the one primary',async()=>{
 await withPublish({},async ui=>{
  const c=ui.container,text=c.textContent??'';
  assert.ok(text.includes('Send your video to YouTube now, or schedule it for later.'));
  assert.ok(text.includes('Exported')&&text.includes('Hidden features-e1.mp4'),'the newest export');
  assert.ok(c.querySelector('aside')?.textContent?.includes('Samin Yasar'),'the channel it goes to is named in the preview');
  assert.deepEqual([...c.querySelectorAll('.pub-section h3')].map(h=>h.textContent),['Export the video','Check the details','Upload to YouTube'],'three sections, in order');
  assert.equal(field(c,'pub-title').value,video.title);
  assert.equal((c.querySelector('#pub-desc') as HTMLTextAreaElement).value,'You never opened this.\n\nMost people use one feature.','no chapters until the timeline is read');
  assert.equal(c.querySelector('#pub-vis')?.textContent,'Public');
  assert.deepEqual([...c.querySelectorAll('input[name=kids]')].map(input=>(input as HTMLInputElement).checked),[false,false],'made for kids has no default');
  assert.deepEqual(primaries(c),[],'a disabled action has neutral styling');
  await click(c.querySelector('input[name=kids][value=no]'));
  assert.deepEqual(primaries(c),['Publish now']);
  assert.ok(c.querySelector('aside[aria-label="How it will look"]')?.textContent?.includes('No thumbnail yet'),'the neutral preview says when no thumbnail exists');
  assert.ok(!c.textContent?.includes('Mark as published'),'pasting a link is behind a link');
  assert.ok(!/Borumi|successfully|please|!/i.test(text));
 });
});

test('Publish now needs the made-for-kids answer; then it sends the form and follows the job to the link',async()=>{
 await withPublish({},async(ui,server,changes)=>{
  const c=ui.container;
  assert.equal(button(c,'Publish now').disabled,true,'it cannot be pressed without the answer');
  assert.ok(c.querySelector('#ws-publish-action')?.contains(button(c,'Publish now')),'the action is in the persistent footer');
  assert.equal(c.querySelector('.pubx')?.contains(button(c,'Publish now')),false,'there is no competing inline publish action');
  assert.equal(c.querySelector('#ws-publish-why')?.textContent,"Choose whether it's made for kids, which YouTube requires.",'and says why beside it');
  await click(button(c,'Publish now'));
  assert.equal(posts(server.calls).length,0,'nothing is sent without the answer');
  await type(c.querySelector('#pub-tags')!,'claude');await key(c.querySelector('#pub-tags')!,'Enter');
  await type(c.querySelector('#pub-tags')!,'ai agents, mods');await key(c.querySelector('#pub-tags')!,'Enter');
  assert.deepEqual([...c.querySelectorAll('.tagsbox .chip')].map(chip=>chip.textContent),['claude','ai agents','mods']);
  await click(c.querySelector('#pub-vis'));await click(button(document.body,'Unlisted: only people with the link'));
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
  assert.equal(button(c,'Schedule').textContent,'Schedule');
  await click(c.querySelector('input[name=kids][value=no]'));
  await type(at,'2020-01-01T10:00');
  assert.equal(button(c,'Schedule').disabled,true);
  await click(button(c,'Schedule'));
  assert.ok(c.textContent?.includes('Pick a time in the future.'));
  assert.equal(posts(server.calls).length,0);
  const later=new Date(Date.now()+3*86_400_000);later.setSeconds(0,0);
  const pad=(n:number)=>String(n).padStart(2,'0');
  await type(at,`${later.getFullYear()}-${pad(later.getMonth()+1)}-${pad(later.getDate())}T${pad(later.getHours())}:${pad(later.getMinutes())}`);
  await click(button(c,'Schedule'));await flush();
  assert.equal((posts(server.calls)[0].body as {scheduledFor:string}).scheduledFor,later.toISOString());
  await act(async()=>{FakeEventSource.last().emit('progress',{step:'post',message:'Scheduling it in Postiz'});});
  assert.ok(c.textContent?.includes('Scheduling it in Postiz'));
  await act(async()=>{FakeEventSource.last().emit('done',{...sent,state:'queued',url:undefined,scheduledFor:later.toISOString()});});await flush();
  assert.ok(c.textContent?.includes("It's scheduled")&&c.textContent.includes('Your laptop can be closed.'));
 });
});

test('without Postiz connected Publish says so and sends you to Settings: the key is never asked for here',async()=>{
 settingsAsked.length=0;
 await withPublish({state:notConnected},async(ui,server)=>{
  const c=ui.container;
  await click(c.querySelector('input[name=kids][value=no]'));
  assert.equal(c.querySelector('button[aria-label="Publish now"]'),null);
  assert.equal(c.querySelector('#ws-publish-action a')?.textContent?.trim(),'Open YouTube');
  assert.ok(c.textContent?.includes('These details are saved here for you to paste into YouTube.'));
  assert.equal(posts(server.calls).length,0);
  assert.ok(!c.textContent?.includes("Postiz is optional"));
  assert.equal(c.querySelector('#postiz-key'),null,'no key field on Publish: it lives in Settings');
  await click(button(c,'Open Settings'));
  assert.deepEqual(settingsAsked,['publishing'],'the button opens Settings at Publishing');
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
  await click(button(c,'Upload it yourself'));
  assert.ok(c.textContent?.includes('Add the link so Creator Compiler can mark it Published.'),'a quiet way out for an unconfirmed post');
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
  await click(button(c,'Close'));
  assert.ok(!c.textContent?.includes(reminder));
 });
 await withPublish({record:{...sent,state:'queued',url:undefined}},async ui=>assert.ok(!ui.container.textContent?.includes(reminder),'dismissed for good'));
 localStorage.clear();
 await withPublish({props:{video:{...video,stage:'published',youtubeUrl:sent.url}},record:sent},async ui=>assert.ok(ui.container.textContent?.includes(reminder),'shown on the first published card'));
 await withPublish({record:{...sent,state:'queued',url:undefined}},async ui=>assert.ok(!ui.container.textContent?.includes(reminder),'and not after a Postiz publish has gone through'));
 localStorage.clear();
});

test('a published Postiz record waits for the video to move before showing YouTube success',async()=>{
 localStorage.clear();
 await withPublish({record:{...sent,state:'published'},reply:({method,path})=>path==='/videos/v1'&&method==='GET'?{body:video}:undefined},async ui=>{
  const c=ui.container;
  assert.ok(!c.textContent?.includes("It's on YouTube"));assert.ok(c.textContent?.includes("Postiz has it"));
  assert.ok(button(c,'Mark as published'),'a way out, open at once');
  assert.ok(c.textContent?.includes("Postiz says it's published, but the YouTube link didn't come back. Add the link so Creator Compiler can mark it Published."),'labelled plainly');
  assert.ok(c.textContent?.includes('Open the video on YouTube once and check that the made-for-kids answer and the thumbnail are as you set them.'),'the first-publish reminder');
 });
});

test('with Postiz connected and working, the form also offers adding a link by hand',async()=>{
 await withPublish({},async ui=>{
  assert.equal([...ui.container.querySelectorAll('button')].some(b=>/Upload it yourself|Paste the link/i.test(b.textContent??'')),true);
 });
});

test('without Postiz, a video uploaded outside Creator Compiler can still be marked Published with its link',async()=>{
 await withPublish({state:notConnected,reply:({method,path,body})=>{
  if(method==='POST'&&path==='/videos/v1/publish'){
   if(!(body as {youtubeUrl:string}).youtubeUrl.includes('youtu'))return {status:400,body:{error:'Paste the YouTube link of the uploaded video.'}};
   return {body:{...video,stage:'published',youtubeUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',publishedAt:'2026-10-29T12:00:00.000Z'}};
  }
 }},async(ui,server,changes)=>{
  const c=ui.container;
  await click(button(c,'Upload it yourself'));
  assert.ok(c.textContent?.includes('Add the link so Creator Compiler can mark it Published.'));
  assert.equal(button(c,'Mark as published').disabled,true,'needs a link first');
  const link=field(c,'club-youtube-link');
  await type(link,'https://vimeo.com/1');await click(button(c,'Mark as published'));await flush();
  assert.equal(button(c,'Mark as published').disabled,true);
  assert.equal(button(c.querySelector('#ws-publish-action')!,'Done').disabled,true);
  assert.equal(server.calls.filter(call=>call.path==='/videos/v1/publish').length,0,'invalid link never reaches the API');
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
  assert.ok(c.textContent?.includes('No exported video yet'));
  await click(button(c,'Export it in Edit'));
  assert.deepEqual(goes,['edit']);
  await click(c.querySelector('input[name=kids][value=no]'));await click(button(c,'Publish now'));
  assert.ok(c.textContent?.includes('Export the video first'));
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
  await click(button(c,'Remove'));await flush();
  assert.equal(server.calls.filter(call=>call.method==='DELETE'&&call.path==='/videos/v1/thumbnail').length,1);
  assert.ok(c.textContent?.includes('YouTube picks a frame'));
 });
});

test('Publish opens its form before recording, including when there is no plan',async()=>{
 for(const scenes of [[{...props.scenes![1]}],[]]){
  await withPublish({props:{scenes}},async ui=>{
   assert.ok(ui.container.querySelector('.pubx'));
   assert.ok(ui.container.textContent?.includes('Publish now'));
   assert.ok(!ui.container.textContent?.includes('Draft the scenes first'));
  });
 }
});

test('with the timeline read, the chapters are where the scenes are cut, and unrecorded scenes are named before it goes out',async()=>{
 const {projectRevision}=await import('../../api');
 // Planned 1:00 and 1:30, but the cut has the opening at 0:00 only: Level 1 is not recorded.
 const project={id:'p1',clips:[{id:'c1',start:0.5,recordingTakeId:'t'},{id:'c2',start:0.5,recordingTakeId:'t'}]};
 const revision=(await projectRevision(project as never)).replaceAll('"','');
 await withPublish({reply:({path})=>path==='/api/projects/p1'?{body:project}:path.startsWith('/api/exports?projectId=p1')?{body:{jobs:[{...exported,projectRevision:revision}],nextOffset:null}}:undefined},async(ui,server)=>{
  const c=ui.container;await flush();
  assert.equal((c.querySelector('#pub-desc') as HTMLTextAreaElement).value,'You never opened this.\n\nMost people use one feature.\n\nChapters\n0:00 Opening');
  assert.equal(c.querySelector('.pub-note[role=status]')?.textContent,"1 of 2 scenes isn't recorded yet, so it isn't in the video.");
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


test('manual publishing footer follows export, upload and adding the link, without an automatic send',async()=>{
 const tabs:string[]=[];
 await withPublish({state:notConnected,props:{onGoTo:(tab:string)=>tabs.push(tab)},reply:call=>call.path.startsWith('/api/exports?')?{body:{jobs:[],nextOffset:null}}:undefined},async(ui,server)=>{
  const c=ui.container;
  assert.ok(c.textContent?.includes('These details are saved here for you to paste into YouTube.'));
  await click(button(c,'Export in Edit'));
  assert.deepEqual(tabs,['edit']);
  assert.equal(posts(server.calls).length,0);
  assert.equal([...c.querySelectorAll('button')].some(b=>b.textContent==='Publish now'),false);
 });
 await withPublish({state:notConnected},async(ui,server)=>{
  const c=ui.container,open=c.querySelector('#ws-publish-action a')!;
  assert.equal(open.getAttribute('href'),'https://www.youtube.com/upload');
  await click(button(c,'Upload it yourself'));await flush();
  assert.equal(button(c.querySelector('#ws-publish-action')!,'Done').disabled,true);
  assert.ok(field(c,'club-youtube-link'));
  assert.equal([...c.querySelectorAll('button')].filter(b=>b.textContent==='Mark as published').length,1,'only the action beside the input has this label');
  assert.equal(posts(server.calls).length,0);
 });
});


test('manual footer submits the shared link form even without a local export',async()=>{
 await withPublish({state:notConnected,reply:call=>call.path.startsWith('/api/exports?')?{body:{jobs:[],nextOffset:null}}:call.path==='/videos/v1/publish'&&call.method==='POST'?{body:{...video,stage:'published',youtubeUrl:sent.url}}:undefined},async(ui,server,changes)=>{
  const c=ui.container;assert.ok(button(c,'Export it in Edit'));
  await click(button(c,'Upload it yourself'));await flush();
  const footer=button(c.querySelector('#ws-publish-action')!,'Done');
  assert.equal(footer.type,'submit');assert.equal(footer.form,c.querySelector('.self-upload form'));
  assert.equal(footer.disabled,true);
  await type(field(c,'club-youtube-link'),sent.url);await flush();assert.equal(footer.disabled,false);
  await click(footer);await flush();
  assert.equal(server.calls.filter(call=>call.path==='/videos/v1/publish'&&call.method==='POST').length,1);
  assert.equal(changes.at(-1)?.stage,'published');
 });
});

test('readable export names retain the title and extension without a machine suffix',async()=>{
 const {readableExportName}=await import('./Publish');
 assert.equal(readableExportName('The agent experiment-47df4d22-4f98-4707-9baa-d4e806d1af32.mp4','Video'),'The agent experiment.mp4');
 assert.equal(readableExportName('47df4d22-4f98-4707-9baa-d4e806d1af32.mp4','My video'),'My video.mp4');
});


test('Copy details copies the current title and description beside Open YouTube',async()=>{
 const previous=Object.getOwnPropertyDescriptor(navigator,'clipboard'),copied:string[]=[];
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{copied.push(value);}}});
 try{await withPublish({state:notConnected},async ui=>{
  const c=ui.container;await type(field(c,'pub-title'),'My edited title');await type(field(c,'pub-desc'),'My edited description',HTMLTextAreaElement);
  const copy=button(c,'Copy details');assert.equal(copy.parentElement?.id,'ws-publish-action');
  await click(copy);assert.deepEqual(copied,['My edited title\n\nMy edited description']);
  assert.ok(c.textContent?.includes('Details copied'));
  assert.equal(c.querySelector('.doc-sub')?.textContent,'Prepare your details and finish on YouTube.');
  await click(c.querySelector('input[name=kids][value=no]'));assert.ok(c.querySelector('.ws-kids-segment .is-selected svg'),'the selected answer retains its check');
 });}finally{if(previous)Object.defineProperty(navigator,'clipboard',previous);else Reflect.deleteProperty(navigator,'clipboard');}
});

test('Publish reattaches to the server running job after remount and cannot submit twice',async()=>{
 await withPublish({record:{...sent,state:'posting',runningJobId:'server-running'}},async(ui,server)=>{
  assert.equal(FakeEventSource.last().url,'/api/club/jobs/server-running/events');
  assert.equal([...ui.container.querySelectorAll('button')].some(b=>b.textContent==='Publish now'),false);
  assert.equal(posts(server.calls).length,0);
 });
});

for(const state of ['queued','posting'] as const)test(`a Published video takes precedence over a stale ${state} Postiz record`,async()=>{
 await withPublish({props:{video:{...video,stage:'published',youtubeUrl:sent.url}},record:{...sent,state,url:undefined}},async ui=>{
  assert.ok(ui.container.textContent?.includes("It's on YouTube"));assert.ok(!ui.container.textContent?.includes('Postiz has it'));
 });
});

for(const unknown of ['failed read','legacy export'] as const)test(`Publish keeps a completed export usable with ${unknown}`,async()=>{
 const statuses:boolean[]=[];
 await withPublish({props:{onExported:(done:boolean)=>statuses.push(done)},reply:({path})=>{
  if(unknown==='failed read'&&path==='/api/projects/p1')return {status:500,body:{error:'Unavailable'}};
  if(unknown==='legacy export'&&path.startsWith('/api/exports?')){const {projectRevision:_old,...legacy}=exported;return {body:{jobs:[legacy]}};}
 }},async ui=>{
  assert.ok(ui.container.textContent?.includes('Exported'));assert.ok(!ui.container.textContent?.includes('No exported video yet'));
  await click(ui.container.querySelector('input[name=kids][value=no]'));assert.equal(button(ui.container,'Publish now').disabled,false);
  assert.ok(statuses.length);assert.ok(statuses.every(Boolean),'no false completion while the export or revision is loading');
 });
});
