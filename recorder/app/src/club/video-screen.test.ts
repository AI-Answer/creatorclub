import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
import type {Outline,Package,Video} from '../../shared/club';
import {createProject,defaultEffects,defaultTransform} from '../../shared/types';
import type {Route,VideoTab} from './routes';
const {Workspace}=await import('./workspace/Workspace');
const {ClubRecorder,OPEN_FAILED,NOT_ON_THIS_COMPUTER}=await import('./ClubRecorder');
const {FakeEventSource,installFetch}=await import('./test-fakes');
const {VIDEOS_CHANGED}=await import('./api');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const primaries=(root:Element)=>[...root.querySelectorAll('button')].filter(b=>b.classList.contains('primary')&&!b.disabled).map(b=>b.textContent?.trim());
const hasText=(root:Element,text:string)=>(root.textContent??'').includes(text);
const back:Route={name:'videos',view:'board'};

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
  if(path==='/videos/v1/research'&&method==='GET')return {body:[]};
  if(path==='/videos/v1/research'&&method==='POST')return {status:201,body:{id:'t_note',kind:'note',text:(b as {text?:string}).text,meta:{},createdAt:''}};
  if(path==='/videos/v1/scenes')return {body:(state.outline?.scenes??[]).map((s,i)=>({id:s.id??`s${i}`,title:s.title,seconds:s.seconds,takes:[],status:'Not recorded'}))};
  if(path==='/videos/v1'&&method==='PUT'){state.video={...state.video,...b} as Video;return {body:state.video};}
  if(path==='/videos/v1/move'){state.video={...state.video,stage:b.stage as Video['stage']};return {body:state.video};}
  if(path==='/videos/v1/package'&&method==='POST')return {status:202,body:{id:'j-pkg',status:'running'}};
  if(path==='/videos/v1/package'&&method==='PUT'){
   // As the server does: only the fields sent change, and a title slot sent as null stays.
   const base:Package=state.pkg??{angle:'',twist:'',titles:['','',''],thumbnailText:'',hook:{visual:'',spoken:'',text:''}};
   const patch=b as Partial<Package>&{titles?:(string|null)[]};
   state.pkg={...base,...patch,titles:(patch.titles?base.titles.map((title,i)=>patch.titles![i]??title):base.titles) as Package['titles'],hook:{...base.hook,...(patch.hook??{})}};
   return {body:state.pkg};
  }
  if(path==='/videos/v1/outline'&&method==='POST'){state.outline=outline;return {status:202,body:{id:'j-outline',status:'running'}};}
  if(path==='/videos/v1/outline'&&method==='PUT'){state.outline=b as unknown as Outline;return {body:state.outline};}
  if(path==='/videos/v1/recorder'){state.video={...state.video,stage:'recording',recorderProjectId:'p1',planning:{...state.video.planning,outline:true}};return {body:state.video};}
 });
}

/** The page as ClubApp holds it: the video in state, and the tab. Record is only noted, so SceneForge is not mounted here. */
function Harness({initial,tabs,start='idea'}:{initial:Video;tabs:VideoTab[];start?:VideoTab}){
 const [video,setVideo]=useState(initial),[tab,setTab]=useState<VideoTab>(start);
 return createElement(Workspace,{video,tab,back,onVideo:setVideo,navigate:route=>{if(route.name==='video'){tabs.push(route.tab!);if(route.tab!=='record')setTab(route.tab!);}}});
}

const edit=async(element:Element|null,value:string)=>{assert.ok(element,'field to edit');await act(async()=>{(element as HTMLElement).innerText=value;element!.dispatchEvent(new Event('focusout',{bubbles:true}));});};
const sceneTitles=(root:Element)=>[...root.querySelectorAll('.bs-row .bs-name')].map(t=>t.textContent);
/** The parts of "Your video": their names, which one is open, and opening one. */
const partNames=(root:Element)=>[...root.querySelectorAll('.doc-part-h')].map(h=>h.textContent);

test('an empty Idea is Borumi\'s empty Script step: nothing is written until asked, then Write the scenes with Claude drafts them',async()=>{
 FakeEventSource.install();
 const idea:Video={...planned,idea:{why:'People keep asking how'}};
 const state:Server={video:idea,pkg:null,outline:null,help:['research','board']},server=serve(state);
 const ui=await mountUI(createElement(Harness,{initial:idea,tabs:[]}));
 try{
  await flush();await flush();
  const c=ui.container;
  assert.equal(button(c,'Sketch').getAttribute('aria-pressed'),'true','an empty video opens on its sketch');
  assert.equal(server.calls.filter(call=>call.method==='POST').length,0,'the sketch waits for Suggest');
  await act(async()=>button(c,'Script').click());await flush();
  assert.deepEqual(partNames(c),[],'one part, the script, with no headings over it');
  assert.ok(hasText(c,'Start writing your amazing video...'));
  assert.ok(hasText(c,'You can also paste your script from Notion, Google Docs, or your favorite editor, or Start Recording right away.'));
  assert.ok(!hasText(c,'One-pager')&&!hasText(c,'Thumbnail')&&!hasText(c,'Fill the empty parts'),'no one-pager, thumbnail or Fill on the Idea page');
  assert.equal(server.calls.filter(call=>call.method==='POST').length,0,'nothing runs on your AI account until you ask');
  await act(async()=>button(c,'Write the scenes with Claude').click());await flush();
  assert.equal(server.calls.filter(call=>call.method==='POST'&&call.path==='/videos/v1/outline').length,1,'one press drafts the scenes');
 }finally{await ui.close();server.restore();}
});

test('every "with …" names the AI the person connected: ChatGPT here, not Claude',async()=>{
 FakeEventSource.install();
 const state:Server={video:planned,pkg:null,outline:null,help:['research','board']};
 const server=installFetch(call=>{
  if(call.path==='/settings')return {body:{defaultAi:'codex',welcomed:true,helpSeen:state.help}};
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:null}};
  if(call.path==='/videos/v1/research')return {body:[]};
  if(call.path==='/videos/v1/scenes')return {body:[]};
 });
 const ui=await mountUI(createElement(Harness,{initial:planned,tabs:[]}));
 try{
  await flush();await flush();
  assert.ok(button(ui.container,'Suggest a sketch'));
  assert.ok(hasText(ui.container,'ChatGPT sketches the title'),'the sketch names the AI the person connected');
  await act(async()=>button(ui.container,'Script').click());await flush();
  assert.ok(button(ui.container,'Write the scenes with ChatGPT'));
  assert.ok(!hasText(ui.container,'with Claude'));
 }finally{await ui.close();server.restore();}
});

test('a drafted Idea: every scene is open in one column, a scene is renamed in its gutter, then Continue',async()=>{
 FakeEventSource.install();
 const state:Server={video:planned,pkg,outline,help:['research','board']},server=serve(state),tabs:VideoTab[]=[];
 const ui=await mountUI(createElement(Harness,{initial:planned,tabs}));
 try{
  await flush();
  const c=ui.container;
  assert.deepEqual(sceneTitles(c),outline.scenes.map(scene=>scene.title),'the scene names sit in the gutter, every scene open');
  await act(async()=>button(c,'Level 1').click());
  const input=c.querySelector<HTMLInputElement>('input[aria-label="Scene name"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Level 1: settings');input.dispatchEvent(new Event('input',{bubbles:true}));input.blur();});await flush();
  assert.ok(primaries(c).includes('Continue to recording'),'Continue is solid once scenes exist');
  await act(async()=>button(c,'Continue to recording').click());await flush();
  assert.equal(state.outline?.scenes[1].title,'Level 1: settings');
  assert.deepEqual(tabs,['record'],'Record opens');
 }finally{await ui.close();server.restore();}
});

test('an AI step can be stopped, a page opened mid-run follows it, and a replaced outline can be undone',async()=>{
 FakeEventSource.install();
 const planned2:Video={...planned,planning:{research:true,package:true,outline:false}};
 const state={outline:null as Outline|null,undone:0};
 const server=installFetch(({method,path,body})=>{
  if(path==='/videos/v1/plan')return {body:{package:pkg,outline:state.outline,running:{outline:'j-running'},ready:{}}};
  if(path==='/videos/v1/scenes')return {body:[]};
  if(path==='/settings')return {body:{helpSeen:['research','package','outline']}};
  if(path==='/jobs/j-running'&&method==='DELETE')return {body:{id:'j-running',status:'cancelled'}};
  if(path==='/videos/v1/outline'&&method==='POST')return {status:202,body:{id:'j-again',status:'running'}};
  if(path==='/videos/v1/outline/undo'){state.undone++;assert.deepEqual(body,{token:'2026-10-29T10-00-00-000Z'});return {body:{package:pkg,outline:null}};}
 });
 const ui=await mountUI(createElement(Harness,{initial:planned2,tabs:[]}));
 try{
  await flush();
  const c=ui.container;
  assert.ok(FakeEventSource.all.some(source=>source.url.includes('/jobs/j-running/events')),'the page follows the run already going');
  assert.ok(hasText(c,'Writing the scenes…'));
  await act(async()=>button(c,'Stop').click());await flush();
  assert.ok(server.calls.some(call=>call.method==='DELETE'&&call.path==='/jobs/j-running'),'Stop cancels the job on the server');
  await act(async()=>FakeEventSource.last().emit('cancelled',{}));
  assert.ok(!hasText(c,'Writing the scenes…'));

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
  assert.ok(hasText(c,'New scenes ready'));
  assert.equal(sceneTitles(c)[0],'Mine','the edited outline stays until Use it');
  await act(async()=>button(c,'Use it').click());await flush();
  assert.equal(sceneTitles(c)[0],'Opening');
  assert.ok(!hasText(c,'New scenes ready'));
 }finally{await ui.close();server.restore();}
});

test('a changed outline is flagged',async()=>{
 FakeEventSource.install();
 const recording:Video={...planned,stage:'recording',planning:{research:true,package:true,outline:true},recorderProjectId:'p1'};
 const state:Server={video:recording,pkg,outline,help:['research','package','outline']};
 const server=installFetch(call=>{
  if(call.path==='/videos/v1/plan')return {body:{package:pkg,outline,changedScene:3}};
  if(call.path==='/videos/v1/scenes')return {body:[]};
  if(call.path==='/settings')return {body:{helpSeen:state.help}};
  return undefined;
 });
 const ui=await mountUI(createElement(Harness,{initial:recording,tabs:[],start:'idea'}));
 try{
  await flush();
  const c=ui.container;
  assert.ok(hasText(c,'Your outline changed after you recorded scene 3.'));
  assert.equal(c.querySelector('.idea-changed')?.textContent,'Your outline changed after you recorded scene 3.','one quiet line on the Script view');
  assert.deepEqual([...c.querySelectorAll('.ws-steps a.on')].map(a=>a.textContent),['Idea'],'Idea is the open tab');
 }finally{await ui.close();server.restore();}
});

test('no step is locked: each one opens, and a step with nothing to work on yet says what to do there instead of sending you away',async()=>{
 const editing:Video={...planned,stage:'editing',planning:{research:true,package:true,outline:false}};
 const server=installFetch(call=>{
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:null}};
  if(call.path==='/videos/v1/scenes')return {body:[]};
  if(call.path==='/videos/v1/research')return {body:[]};
  if(call.path==='/settings')return {body:{helpSeen:[]}};
 });
 const {ToastProvider}=await import('./ui');
 const seen:Array<[VideoTab,boolean]>=[];
 const page=(tab:VideoTab)=>createElement(ToastProvider,null,createElement(Workspace,{video:editing,tab,back,navigate:(route,options)=>{if(route.name==='video')seen.push([route.tab!,!!options?.replace]);},onVideo:()=>{}}));
 const ui=await mountUI(page('idea'));
 try{
  await flush();await flush();
  const c=ui.container;
  const step=(name:string)=>[...c.querySelectorAll<HTMLAnchorElement>('.ws-step')].find(a=>a.textContent===name)!;
  for(const name of ['Record','Edit','Publish']){
   assert.equal(step(name).getAttribute('aria-disabled'),null,`${name} is not locked`);
   assert.equal(step(name).querySelector('.lk'),null,'and shows no lock');
  }
  const next=button(c,'Continue to recording');
  assert.equal(next.disabled,false,'Continue works without a plan');assert.equal(next.classList.contains('primary'),false);
  await act(async()=>step('Edit').click());await flush();
  assert.deepEqual(seen,[['edit',false]],'choosing a step opens it');
  // Opened directly, each step stays and says what to do there.
  seen.length=0;
  await ui.render(page('record'));await flush();await flush();
  assert.ok(hasText(c,'Start with one scene'));assert.equal(button(c,'Record without a plan').disabled,false);assert.ok(button(c,'Plan the scenes'));
  await ui.render(page('edit'));await flush();await flush();
  assert.ok(hasText(c,'Nothing recorded yet'));assert.ok(button(c,'Record a scene'));
  await ui.render(page('publish'));await flush();await flush();
  assert.ok(c.querySelector('.pubx'),'the publishing form opens');
  assert.deepEqual(seen,[],'nothing sends you to another step on its own');
  assert.ok(!server.calls.some(call=>call.path==='/videos/v1/move'),'the card is never moved');
 }finally{await ui.close();server.restore();}
});

test('the video\'s one menu moves it to a stage or deletes it, asking first; the stage beside the title is not a second menu',async()=>{
 const server=installFetch(call=>{
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:null}};
  if(call.path==='/videos/v1/scenes')return {body:[]};
  if(call.path==='/settings')return {body:{helpSeen:[]}};
  if(call.path==='/videos/v1/move')return {body:{...planned,stage:(call.body as {stage:Video['stage']}).stage}};
 });
 const {ToastProvider}=await import('./ui');
 const routes:Route[]=[];
 const ui=await mountUI(createElement(ToastProvider,null,createElement(Workspace,{video:planned,tab:'idea',back,navigate:route=>{routes.push(route);},onVideo:()=>{}})));
 try{
  await flush();
  const c=ui.container,doc=c.ownerDocument;
  assert.equal(c.querySelector('[aria-label="Change stage"]'),null);
  assert.equal(c.querySelectorAll('.ws-top [aria-label="More for this video"]').length,1);
  const items=async()=>{await act(async()=>(c.querySelector('[aria-label="More for this video"]') as HTMLElement).click());await flush();return [...doc.querySelectorAll(`[role^="menuitem"]`)] as HTMLElement[];};
  const labels=(await items()).map(item=>item.textContent?.trim());
  assert.equal(labels.length,8,'the six stages, the prompt for your AI agent, then Delete video');assert.deepEqual(labels.slice(-2),['Copy prompt for your AI agent','Delete video']);
  assert.ok(!labels.some(label=>/Copy link/.test(label!)),'no link to a page that only opens on this computer');
  await act(async()=>[...doc.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item=>item.textContent?.trim()==='Delete video')?.click());await flush();
  assert.match(doc.querySelector('[role="dialog"]')!.textContent!,/Delete this video\?/);
  await act(async()=>button(doc.body,'Cancel').click());await flush();
  assert.equal(routes.length,0,'kept: nothing happens');
  await act(async()=>[...(await items())].find(item=>item.textContent?.trim()==='Delete video')!.click());await flush();
  await act(async()=>button(doc.querySelector('[role="dialog"]')!,'Delete video').click());await flush();
  assert.deepEqual(routes.at(-1),back,'back where it was opened from');
  assert.ok(doc.body.textContent!.includes('Deleted “Hidden features in Claude Code”'));
  assert.equal(server.calls.some(call=>call.method==='DELETE'),false,'not before the Undo has had its time');
  await act(async()=>button(doc.body,'Undo').click());
 }finally{await ui.close();server.restore();}
});

test('Record with scenes but no recording project says it is ready, and its one button does what Continue to recording does',async()=>{
 const planning:Video={...planned,planning:{research:true,package:true,outline:true}};
 const twoScenes={scenes:[{id:'a',title:'Opening',talkingPoints:['x'],show:'',seconds:60},{id:'b',title:'End',talkingPoints:['y'],show:'',seconds:60}]};
 const server=installFetch(call=>{
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:twoScenes}};
  if(call.path==='/videos/v1/scenes')return {body:twoScenes.scenes.map(s=>({id:s.id,title:s.title,seconds:60,takes:[],status:'Not recorded'}))};
  if(call.path==='/settings')return {body:{helpSeen:[]}};
  if(call.path==='/videos/v1/recorder')return {body:{...planning,stage:'recording',recorderProjectId:'p1'}};
 });
 const seen:VideoTab[]=[];
 const ui=await mountUI(createElement(Workspace,{video:planning,tab:'record',back,navigate:route=>{if(route.name==='video')seen.push(route.tab!);},onVideo:()=>{}}));
 try{
  await flush();await flush();
  const c=ui.container;
  assert.ok(hasText(c,'Ready to record'));
  assert.ok(!hasText(c,'Plan the scenes first')&&!hasText(c,'Create the outline first'));
  assert.deepEqual(primaries(c),['Start recording']);
  await act(async()=>button(c,'Start recording').click());await flush();
  assert.ok(server.calls.some(call=>call.method==='POST'&&call.path==='/videos/v1/recorder'),'the recording project is made');
  assert.deepEqual(seen,['record']);
 }finally{await ui.close();server.restore();}
});

test('Continue on Record moves the card to Editing, and never moves it back',async()=>{
 const recording:Video={...planned,stage:'recording',planning:{research:true,package:true,outline:true},recorderProjectId:'p1'};
 const moves:unknown[]=[];
 localStorage.clear();
 class Source extends EventTarget{close(){}}Object.assign(globalThis,{EventSource:Source});
 const server=installFetch(call=>{
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:null}};
  if(call.path==='/videos/v1/scenes')return {body:[{id:'s1',title:'Opening',seconds:30,takes:[{id:'t1',seconds:20,kept:true}],status:'Kept take 1'}]};
  if(call.path==='/settings')return {body:{helpSeen:[]}};
  if(call.path==='/videos/v1/move'){moves.push(call.body);return {body:{...recording,stage:(call.body as {stage:string}).stage}};}
 });
 const seen:VideoTab[]=[];
 const ui=await mountUI(createElement(Workspace,{video:recording,tab:'record',back,navigate:route=>{if(route.name==='video')seen.push(route.tab!);},onVideo:()=>{}}));
 try{
  await flush();
  await act(async()=>button(ui.container,'Continue to editing').click());await flush();
  assert.deepEqual(moves,[{stage:'editing'}]);assert.deepEqual(seen,['edit']);
  await ui.render(createElement(Workspace,{video:{...recording,stage:'published'},tab:'edit',back,navigate:route=>{if(route.name==='video')seen.push(route.tab!);},onVideo:()=>{}}));
  await act(async()=>button(ui.container,'Continue to publishing').click());await flush();
  assert.equal(button(ui.container,'Continue to publishing').disabled,true,'a stage alone does not prove a current export');
  assert.equal(moves.length,1,'a published video is not moved back');assert.deepEqual(seen,['edit']);
 }finally{await ui.close();server.restore();}
});

test('a recording that cannot be opened shows one sentence and Try again',async()=>{
 const p=createProject('Hidden features'),originalFetch=globalThis.fetch;let fail=true,opened=0;
 localStorage.clear();
 class Source extends EventTarget{close(){}}Object.assign(globalThis,{EventSource:Source});
 globalThis.fetch=async(input)=>{
  const url=String(input);if(url==='/api/projects')return Response.json([p]);
  if(url===`/api/projects/${p.id}`){opened++;return fail?Response.json({error:'ENOENT: no such file /Users/x/projects/p.json'},{status:500}):Response.json(p,{headers:{ETag:'"t"'}});}
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
  assert.equal(opened,3,'the first open, the check of why it failed, and the open again');
  assert.ok(ui.container.querySelector('.edit-empty'),'the empty editor opens on the second try');
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
  // Borumi's take preview has no "Use and edit": Confirm take adds the take and stays in Record, and the bottom bar leads to editing.
  assert.equal([...ui.container.querySelectorAll('button')].some(b=>b.textContent?.includes('Use and edit')),false);
  await act(async()=>[...ui.container.querySelectorAll<HTMLButtonElement>('.btp-footer button')].find(b=>b.textContent?.trim()==='Confirm take')!.click());
  await flush();await flush();
  assert.equal(modes.length,0,'confirming stays in Record');
  assert.ok(ui.container.querySelector('#recording-presets-slot'),'the embed stays in Record until the club changes the step');
  await ui.render(createElement(ClubRecorder,{projectId:p.id,mode:'Edit',onBack:()=>{},onMode:mode=>modes.push(mode)}));
  assert.ok(ui.container.querySelector('.edit-workspace'),'the club changes the step, and the editor opens');
 }finally{await ui.close();globalThis.fetch=originalFetch;globalThis.requestAnimationFrame=originalFrame;}
});

test('a recording project that is not on this computer says so and offers to start it again from the plan',async()=>{
 const originalFetch=globalThis.fetch;let restarted=0;
 localStorage.clear();
 class Source extends EventTarget{close(){}}Object.assign(globalThis,{EventSource:Source});
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url==='/api/projects')return Response.json([]);
  if(url.startsWith('/api/projects/'))return Response.json({error:'ENOENT: no such file'},{status:404});
  if(url==='/api/health')return Response.json({ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'});
  if(url==='/api/automation/settings')return Response.json({automaticTranscription:false});
  return Response.json([]);
 };
 const ui=await mountUI(createElement(ClubRecorder,{projectId:'gone',mode:'Record',onBack:()=>{},onRestart:()=>{restarted++;}}));
 try{
  await flush();await flush();
  assert.ok(hasText(ui.container,NOT_ON_THIS_COMPUTER));
  assert.ok(!hasText(ui.container,'ENOENT'));
  assert.ok(![...ui.container.querySelectorAll('button')].some(b=>b.textContent==='Try again'),'trying again cannot help');
  await act(async()=>button(ui.container,'Start the recording again from the plan').click());
  assert.equal(restarted,1);
 }finally{globalThis.fetch=originalFetch;await ui.close();}
});

test('Publish tags are saved on the package: they are still there after switching step and after reopening the video',async()=>{
 FakeEventSource.install();
 const publishing:Video={...planned,stage:'publishing',recorderProjectId:'p1',planning:{research:true,package:true,outline:true}};
 const scenes=[{id:'a',title:'Opening',seconds:60,takes:[{id:'t1',seconds:30,kept:true,retained:false}],status:'Kept take 1'}];
 let saved:Package={...pkg};
 const server=installFetch(({method,path,body})=>{
  if(path==='/settings')return {body:{helpSeen:[]}};
  if(path==='/videos/v1/plan')return {body:{running:{},ready:{},package:saved,outline:{scenes:[{id:'a',title:'Opening',talkingPoints:['x'],show:'',seconds:60}]}}};
  // The server keeps only the fields sent, as PUT /package does.
  if(path==='/videos/v1/package'&&method==='PUT'){saved={...saved,...(body as Partial<Package>)};return {body:saved};}
  if(path==='/videos/v1/scenes')return {body:scenes};
  if(path==='/publishing')return {body:{postiz:{connected:false,address:null,channel:null},defaultVisibility:'public'}};
  if(path==='/videos/v1/postiz')return {body:null};
  if(path.startsWith('/api/exports'))return {body:{jobs:[],nextOffset:null}};
 });
 const tags=(root:Element)=>[...root.querySelectorAll('.tagsbox .chip')].map(chip=>chip.textContent);
 const tabs:VideoTab[]=[];
 let ui=await mountUI(createElement(Harness,{initial:publishing,tabs,start:'publish'}));
 try{
  await flush();
  const c=ui.container;
  const input=c.querySelector('#pub-tags') as HTMLInputElement;
  assert.ok(input,'the Publish form');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'claude code, ai');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>{input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});await flush();
  assert.deepEqual(tags(c),['claude code','ai']);
  assert.deepEqual(saved.tags,['claude code','ai'],'saved at once, not only when the page is left');
  assert.deepEqual(server.calls.filter(call=>call.method==='PUT'&&call.path==='/videos/v1/package').at(-1)?.body,{tags:['claude code','ai']},'only the tags are sent');
  // Switch step and come back.
  await act(async()=>[...c.querySelectorAll<HTMLElement>('.ws-step')].find(tab=>tab.textContent?.trim().endsWith('Idea'))!.click());await flush();
  assert.equal(tabs.at(-1),'idea');
  assert.equal(c.querySelector('#pub-tags'),null,'Plan is open');
  await act(async()=>[...c.querySelectorAll<HTMLElement>('.ws-step')].find(tab=>tab.textContent?.trim().endsWith('Publish'))!.click());await flush();
  assert.deepEqual(tags(c),['claude code','ai'],'after switching step');
  // Remove one: that is saved too.
  await act(async()=>(c.querySelector('button[aria-label="Remove ai"]') as HTMLElement).click());await flush();
  assert.deepEqual(saved.tags,['claude code']);
 }finally{await ui.close();}
 // Reopen: a new page reads the package from the server.
 ui=await mountUI(createElement(Harness,{initial:publishing,tabs,start:'publish'}));
 try{await flush();assert.deepEqual(tags(ui.container),['claude code'],'after reopening');}
 finally{await ui.close();server.restore();}
});
