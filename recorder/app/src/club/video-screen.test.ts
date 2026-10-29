import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
import type {Outline,Package,Video} from '../../shared/club';
import {createProject,defaultEffects,defaultTransform} from '../../shared/types';
import type {Route,VideoTab} from './routes';
const {Workspace}=await import('./workspace/Workspace');
const {ClubRecorder,OPEN_FAILED}=await import('./ClubRecorder');
const {FakeEventSource,installFetch}=await import('./test-fakes');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const type=async(input:Element,value:string,proto:object=HTMLInputElement.prototype)=>act(async()=>{Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const primaries=(root:Element)=>[...root.querySelectorAll('button')].filter(b=>b.classList.contains('primary')&&!b.disabled).map(b=>b.textContent?.trim());
const hasText=(root:Element,text:string)=>(root.textContent??'').includes(text);
const back:Route={name:'production',view:'board'};

const planned:Video={id:'v1',title:'Hidden features in Claude Code',stage:'planning',order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{ideas:'2026-10-01T00:00:00.000Z'},planning:{research:true,package:false,outline:false}};
const pkg:Package={demand:{level:'high',note:'Asked a lot'},gap:{level:'mid',note:'Few show it'},show:{level:'high',note:'Screen only'},angle:'Angle',twist:'Twist',titles:['Claude Code features you missed','Seven hidden Claude Code tricks','Stop using Claude Code wrong'],thumbnailText:'Hidden features',hook:{visual:'A menu',spoken:'You never opened this.',text:'HIDDEN'}};
const outline:Outline={scenes:[{title:'Opening',talkingPoints:['Show the result','Make the claim'],show:'The finished thing',seconds:60},{title:'Level 1',talkingPoints:['First feature'],show:'Settings',seconds:120},{title:'Where this falls short',talkingPoints:['Costs'],show:'Usage page',seconds:60},{title:'Ending',talkingPoints:['Next video'],show:'End card',seconds:30}]};

type Server={video:Video;pkg:Package|null;outline:Outline|null;help:string[]};

function serve(state:Server){
 return installFetch(({method,path,body})=>{
  const b=body as Record<string,unknown>;
  if(path==='/settings')return {body:{defaultAi:'claude',welcomed:true,geminiKey:null,helpSeen:state.help}};
  if(path.startsWith('/settings/help/')){state.help.push(path.split('/').pop()!);return {body:{helpSeen:state.help}};}
  if(path==='/videos/v1/plan')return {body:{package:state.pkg,outline:state.outline}};
  if(path==='/videos/v1/scenes')return {body:[]};
  if(path==='/videos/v1'&&method==='PUT'){state.video={...state.video,...b} as Video;return {body:state.video};}
  if(path==='/videos/v1/move'){state.video={...state.video,stage:b.stage as Video['stage']};return {body:state.video};}
  if(path==='/videos/v1/package'&&method==='POST')return {status:202,body:{id:'j-pkg',status:'running'}};
  if(path==='/videos/v1/package'&&method==='PUT'){state.pkg=b as unknown as Package;return {body:state.pkg};}
  if(path==='/videos/v1/outline'&&method==='POST')return {status:202,body:{id:'j-outline',status:'running'}};
  if(path==='/videos/v1/outline'&&method==='PUT'){state.outline=b as unknown as Outline;return {body:state.outline};}
  if(path==='/videos/v1/recorder'){state.video={...state.video,stage:'recording',recorderProjectId:'p1',planning:{...state.video.planning,outline:true}};return {body:state.video};}
 });
}

/** The page as ClubApp holds it: the video in state, and the tab. Record is only noted, so SceneForge is not mounted here. */
function Harness({initial,tabs,start='plan'}:{initial:Video;tabs:VideoTab[];start?:VideoTab}){
 const [video,setVideo]=useState(initial),[tab,setTab]=useState<VideoTab>(start);
 return createElement(Workspace,{video,tab,back,onVideo:setVideo,navigate:route=>{if(route.name==='video'){tabs.push(route.tab!);if(route.tab!=='record')setTab(route.tab!);}}});
}

test('a video walks from Package through Create outline into recording',async()=>{
 FakeEventSource.install();
 const state:Server={video:planned,pkg:null,outline:null,help:['research']},server=serve(state),tabs:VideoTab[]=[];
 const ui=await mountUI(createElement(Harness,{initial:planned,tabs}));
 try{
  await flush();
  const c=ui.container;
  assert.ok(hasText(c,'Decide why this video gets clicked.'));
  assert.deepEqual(primaries(c),['Package it']);
  await act(async()=>button(c,'Package it').click());await flush();
  await act(async()=>FakeEventSource.last().emit('progress',{message:'Writing the package…'}));
  assert.ok(hasText(c,'Writing the package…'),'progress streams in');
  await act(async()=>FakeEventSource.last().emit('done',{value:pkg}));
  const firstTitle=c.querySelector<HTMLInputElement>('input[value="Claude Code features you missed"]');
  assert.ok(firstTitle,'the package fills editable fields');
  await type(firstTitle!,'Claude Code features nobody uses');
  assert.deepEqual(primaries(c),['Continue to outline']);
  await act(async()=>button(c,'Continue to outline').click());await flush();
  assert.equal(state.pkg?.titles[0],'Claude Code features nobody uses','edits are saved before moving on');
  assert.equal(state.video.planning.package,true);

  assert.ok(hasText(c,"Turn this into scenes. You'll talk through each one when you record."));
  assert.deepEqual(primaries(c),['Create outline']);
  await act(async()=>button(c,'Create outline').click());await flush();
  await act(async()=>FakeEventSource.last().emit('done',{value:outline}));
  assert.equal(c.querySelectorAll('ol[aria-label="Scenes"] > li').length,4,'four scene cards in the outline');
  assert.ok(button(c,'Write full script instead'));
  await type(c.querySelector('input[aria-label="Scene 2 title"]')!,'Level 1: settings');
  assert.deepEqual(primaries(c),['Continue to record']);
  await act(async()=>button(c,'Continue to record').click());await flush();
  assert.equal(state.outline?.scenes[1].title,'Level 1: settings');
  assert.deepEqual(tabs,['record'],'Record opens');
  assert.equal(state.video.stage,'recording');
  assert.equal(state.video.recorderProjectId,'p1');
 }finally{await ui.close();server.restore();}
});

test('an AI step can be stopped, a page opened mid-run follows it, and a replaced outline can be undone',async()=>{
 FakeEventSource.install();
 const planned2:Video={...planned,planning:{research:true,package:true,outline:false}};
 const edited:Outline={scenes:outline.scenes.map((s,i)=>({...s,id:`s_0000000${i}`,...(i===0?{title:'My own opening'}:{})}))};
 const state={outline:edited as Outline|null,undone:0};
 const server=installFetch(({method,path,body})=>{
  if(path==='/videos/v1/plan')return {body:{package:pkg,outline:state.outline,running:{outline:'j-running'},ready:{}}};
  if(path==='/videos/v1/scenes')return {body:[]};
  if(path==='/settings')return {body:{helpSeen:['research','package','outline']}};
  if(path==='/jobs/j-running'&&method==='DELETE')return {body:{id:'j-running',status:'cancelled'}};
  if(path==='/videos/v1/outline'&&method==='POST')return {status:202,body:{id:'j-again',status:'running'}};
  if(path==='/videos/v1/outline/undo'){state.undone++;assert.deepEqual(body,{token:'2026-10-29T10-00-00-000Z'});return {body:{package:pkg,outline:edited}};}
 });
 const ui=await mountUI(createElement(Harness,{initial:planned2,tabs:[]}));
 try{
  await flush();
  const c=ui.container;
  assert.ok(FakeEventSource.all.some(source=>source.url.includes('/jobs/j-running/events')),'the page follows the run already going');
  assert.ok(hasText(c,'Starting…'));assert.ok(c.querySelector('fieldset[disabled]'),'the scenes are locked while it runs');
  await act(async()=>button(c,'Stop').click());await flush();
  assert.ok(server.calls.some(call=>call.method==='DELETE'&&call.path==='/jobs/j-running'),'Stop cancels the job on the server');
  await act(async()=>FakeEventSource.last().emit('cancelled',{}));
  assert.ok(!hasText(c,'Starting…'));
  assert.equal(c.querySelector<HTMLInputElement>('input[aria-label="Scene 1 title"]')!.value,'My own opening');

  await act(async()=>button(c,'Create outline').click());await flush();
  const replaced={scenes:outline.scenes.map((s,i)=>({...s,id:`s_0000000${i}`}))};
  await act(async()=>FakeEventSource.last().emit('done',{value:replaced,replaced:'2026-10-29T10-00-00-000Z'}));
  assert.equal(c.querySelector<HTMLInputElement>('input[aria-label="Scene 1 title"]')!.value,'Opening');
  assert.ok(hasText(c,'Replaced the outline'));
  await act(async()=>button(c,'Undo').click());await flush();
  assert.equal(state.undone,1);
  assert.equal(c.querySelector<HTMLInputElement>('input[aria-label="Scene 1 title"]')!.value,'My own opening','Undo brings the edits back');
  assert.ok(!hasText(c,'Replaced the outline'));
 }finally{await ui.close();server.restore();}
});

test('a result that finished after the step was edited is offered, not written',async()=>{
 FakeEventSource.install();
 const planned2:Video={...planned,planning:{research:true,package:true,outline:false}};
 const mine:Outline={scenes:outline.scenes.map((s,i)=>({...s,id:`s_1000000${i}`,...(i===0?{title:'Mine'}:{})}))};
 const theirs:Outline={scenes:outline.scenes.map((s,i)=>({...s,id:`s_1000000${i}`}))};
 const server=installFetch(({path,body})=>{
  if(path==='/videos/v1/plan')return {body:{package:pkg,outline:mine,running:{},ready:{outline:'2026-10-29T11-00-00-000Z'}}};
  if(path==='/videos/v1/scenes')return {body:[]};
  if(path==='/settings')return {body:{helpSeen:['research','package','outline']}};
  if(path==='/videos/v1/outline/use'){assert.deepEqual(body,{token:'2026-10-29T11-00-00-000Z'});return {body:{package:pkg,outline:theirs}};}
 });
 const ui=await mountUI(createElement(Harness,{initial:planned2,tabs:[]}));
 try{
  await flush();
  const c=ui.container;
  assert.ok(hasText(c,'New outline ready'));
  assert.equal(c.querySelector<HTMLInputElement>('input[aria-label="Scene 1 title"]')!.value,'Mine','the edited outline stays until Use it');
  await act(async()=>button(c,'Use it').click());await flush();
  assert.equal(c.querySelector<HTMLInputElement>('input[aria-label="Scene 1 title"]')!.value,'Opening');
  assert.ok(!hasText(c,'New outline ready'));
 }finally{await ui.close();server.restore();}
});

test('help lines stay hidden once a step was completed in the channel, and a changed outline is flagged',async()=>{
 FakeEventSource.install();
 const recording:Video={...planned,stage:'recording',planning:{research:true,package:true,outline:true},recorderProjectId:'p1'};
 const state:Server={video:recording,pkg,outline,help:['research','package','outline']};
 const server=installFetch(call=>{
  if(call.path==='/videos/v1/plan')return {body:{package:pkg,outline,changedScene:3}};
  if(call.path==='/videos/v1/scenes')return {body:[]};
  if(call.path==='/settings')return {body:{helpSeen:state.help}};
  return undefined;
 });
 const ui=await mountUI(createElement(Harness,{initial:recording,tabs:[],start:'plan'}));
 try{
  await flush();
  const c=ui.container;
  assert.ok(hasText(c,'Your outline changed after you recorded scene 3.'));
  assert.ok(!hasText(c,"Turn this into scenes."),'no help line');
  assert.deepEqual([...c.querySelectorAll('.tabs a.on')].map(a=>a.textContent),['Plan'],'Plan is the open tab');
 }finally{await ui.close();server.restore();}
});

test('Record and Edit without a recording project lead back to Plan and offer no Continue',async()=>{
 const editing:Video={...planned,stage:'editing',planning:{research:true,package:true,outline:false}};
 const server=installFetch(call=>{
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:null}};
  if(call.path==='/videos/v1/scenes')return {body:[]};
  if(call.path==='/settings')return {body:{helpSeen:[]}};
 });
 const seen:VideoTab[]=[];
 const ui=await mountUI(createElement(Workspace,{video:editing,tab:'record',back,navigate:route=>{if(route.name==='video')seen.push(route.tab!);},onVideo:()=>{}}));
 try{
  await flush();
  const c=ui.container;
  for(const tab of ['record','edit'] as const){
   await ui.render(createElement(Workspace,{video:editing,tab,back,navigate:route=>{if(route.name==='video')seen.push(route.tab!);},onVideo:()=>{}}));await flush();
   assert.ok(hasText(c,'Plan this video first'),`${tab} explains what is missing`);
   assert.deepEqual(primaries(c),['Back to plan'],`${tab} has one primary, Back to plan`);
   assert.ok(![...c.querySelectorAll('button,a')].some(b=>b.textContent?.trim().startsWith('Continue to')),`${tab} offers no Continue`);
   const plan=[...c.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Back to plan'&&b.classList.contains('primary'))!;
   await act(async()=>plan.click());
  }
  assert.deepEqual(seen,['plan','plan']);
  assert.ok(!server.calls.some(call=>call.path==='/videos/v1/move'),'the card is never moved');
 }finally{await ui.close();server.restore();}
});

test('Continue on Record moves the card to Editing, and never moves it back',async()=>{
 const recording:Video={...planned,stage:'recording',planning:{research:true,package:true,outline:true},recorderProjectId:'p1'};
 const moves:unknown[]=[];
 localStorage.clear();
 class Source extends EventTarget{close(){}}Object.assign(globalThis,{EventSource:Source});
 const server=installFetch(call=>{
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:null}};
  if(call.path==='/videos/v1/scenes')return {body:[]};
  if(call.path==='/settings')return {body:{helpSeen:[]}};
  if(call.path==='/videos/v1/move'){moves.push(call.body);return {body:{...recording,stage:(call.body as {stage:string}).stage}};}
 });
 const seen:VideoTab[]=[];
 const ui=await mountUI(createElement(Workspace,{video:recording,tab:'record',back,navigate:route=>{if(route.name==='video')seen.push(route.tab!);},onVideo:()=>{}}));
 try{
  await flush();
  await act(async()=>button(ui.container,'Continue to edit').click());await flush();
  assert.deepEqual(moves,[{stage:'editing'}]);assert.deepEqual(seen,['edit']);
  await ui.render(createElement(Workspace,{video:{...recording,stage:'published'},tab:'edit',back,navigate:route=>{if(route.name==='video')seen.push(route.tab!);},onVideo:()=>{}}));
  await act(async()=>button(ui.container,'Continue to publish').click());await flush();
  assert.equal(moves.length,1,'a published video is not moved back');assert.deepEqual(seen,['edit','publish']);
 }finally{await ui.close();server.restore();}
});

test('a recording that cannot be opened shows one sentence and Try again',async()=>{
 const p=createProject('Hidden features'),originalFetch=globalThis.fetch;let fail=true,opened=0;
 localStorage.clear();
 class Source extends EventTarget{close(){}}Object.assign(globalThis,{EventSource:Source});
 globalThis.fetch=async(input)=>{
  const url=String(input);if(url==='/api/projects')return Response.json([p]);
  if(url===`/api/projects/${p.id}`){opened++;return fail?Response.json({error:'ENOENT: no such file /Users/x/projects/p.json'},{status:404}):Response.json(p,{headers:{ETag:'"t"'}});}
  if(url==='/api/health')return Response.json({ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'});
  if(url==='/api/automation/settings')return Response.json({automaticTranscription:false});
  if(url.endsWith('/agent-chat')||url.includes('/automation'))return Response.json({jobs:[]});return Response.json([]);
 };
 const ui=await mountUI(createElement(ClubRecorder,{projectId:p.id,mode:'Edit',onBack:()=>{}}));
 try{
  await flush();await flush();
  assert.ok(hasText(ui.container,OPEN_FAILED));
  assert.ok(!hasText(ui.container,'ENOENT'),'the raw error is not shown');
  fail=false;
  await act(async()=>button(ui.container,'Try again').click());await flush();await flush();
  assert.equal(opened,2);
  assert.ok(ui.container.querySelector('.edit-workspace'),'the editor opens on the second try');
 }finally{globalThis.fetch=originalFetch;await ui.close();}
});

test("SceneForge's own move to the editor goes through the club",async()=>{
 // Inside the club the "Edit & export" banner is gone (the bottom bar leads to editing); the take preview's "Use and edit" is SceneForge's own move.
 const p=createProject('Hidden features'),originalFetch=globalThis.fetch,originalFrame=globalThis.requestAnimationFrame,modes:string[]=[];
 const media={id:'m1',name:'cam',path:'/tmp/cam.mov',kind:'video' as const,duration:3,width:10,height:10};
 p.recordedTakes=[{id:'take1',createdAt:'2026-10-02T00:00:00.000Z',sceneId:p.scenes[0].id,media:[media],tracks:['camera'],offsets:[0],clipIds:['c1']}];
 localStorage.clear();
 class Source extends EventTarget{close(){}}Object.assign(globalThis,{EventSource:Source});
 Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'prompt'})},configurable:true});
 // The take preview plays on open; its animation frames are not needed here.
 globalThis.requestAnimationFrame=()=>0;
 globalThis.fetch=async(input,init)=>{
  const url=String(input);if(url==='/api/projects')return Response.json([p]);
  if(url===`/api/projects/${p.id}`&&init?.method==='PUT'){const body=JSON.parse(String(init.body));return Response.json({minimal:true,id:body.id,updatedAt:body.updatedAt},{headers:{ETag:'"t2"','Preference-Applied':'return=minimal'}});}
  if(url===`/api/projects/${p.id}`)return Response.json(p,{headers:{ETag:'"t"'}});
  if(url==='/api/health')return Response.json({ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'});
  if(url==='/api/automation/settings')return Response.json({automaticTranscription:false});
  if(url.endsWith('/agent-chat')||url.includes('/automation'))return Response.json({jobs:[]});return Response.json([]);
 };
 const ui=await mountUI(createElement(ClubRecorder,{projectId:p.id,mode:'Record',onBack:()=>{},onMode:mode=>modes.push(mode)}));
 try{
  await flush();
  assert.ok(ui.container.querySelector('#recording-presets-slot'),'Record mode');
  assert.ok(!hasText(ui.container,'Edit & export'),'no second way to editing beside the bottom bar');
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('button[aria-label="Take options"]')!.click());
  await act(async()=>[...ui.container.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(item=>item.textContent?.startsWith('Use and edit'))!.click());
  await flush();await flush();
  assert.deepEqual(modes,['Edit'],'the move to the editor is handed to the club');
  assert.ok(ui.container.querySelector('#recording-presets-slot'),'the embed stays in Record until the club changes the step');
  await ui.render(createElement(ClubRecorder,{projectId:p.id,mode:'Edit',onBack:()=>{},onMode:mode=>modes.push(mode)}));
  assert.ok(ui.container.querySelector('.edit-workspace'),'the club changes the step, and the editor opens');
 }finally{await ui.close();globalThis.fetch=originalFetch;globalThis.requestAnimationFrame=originalFrame;}
});
