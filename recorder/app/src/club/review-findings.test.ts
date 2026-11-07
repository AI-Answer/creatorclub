import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {AiStatus,OnePager,Package,Video,Workspace} from '../../shared/club';
import {FakeEventSource,installFetch,type FakeReply} from './test-fakes';
import {usePlan} from './usePlan';
import {useJobRun} from './useJobRun';
import {useBoard} from './workspace/useBoard';
import {useCanvas} from './workspace/useCanvas';
import {EMPTY_PACKAGE} from './plan/plan-logic';
import {ToastProvider} from './ui';
import {Kanban} from './production/Kanban';
import type {IdeaActionSet} from './useIdeaActions';
import {clearWelcomeProgress,readWelcomeProgress,restoreWelcomeProgress,saveWelcomeProgress} from './welcome-progress';
import {WelcomeScreen} from './screens/WelcomeScreen';
import {Palette} from './shell/Palette';
import {exportStatus,hasCurrentExport} from './export-status';
import {deferDelete} from './deferred-delete';
import {deleteTileLater} from './workspace/tile-delete';
import {AI_FOCUS_REFRESH_MS,forgetAiStatus,rememberAiStatus,useAiCheck} from './ai-status';
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
const video:Video={id:'v_review',title:'Review',stage:'ideas',order:0,createdAt:'now',updatedAt:'now',stageDates:{},planning:{research:false,package:false,outline:false}};
const pkg:Package={...EMPTY_PACKAGE,angle:'Original'};
const onepager:OnePager={title:'Original',backupTitle:'Backup',logline:'A test video',thumbnail:{headline:'Test',visual:'A frame',closer:'Look'},skeleton:[{label:'Hook',line:'Open'}],whys:['One','Two','Three']};
const off:AiStatus={claude:{installed:false,version:null,signedIn:false},codex:{installed:false,version:null,signedIn:false}};
const workspace:Workspace={slug:'old-channel',name:'Old channel',handle:'',channelUrl:'',topics:[],audience:[],about:'',cta:'',createdAt:''};
const wrap=(child:ReturnType<typeof createElement>)=>createElement(ToastProvider,null,child);

test('plan refresh loads a companion package while an unrelated one-pager is locked, then saves only the new edit',async()=>{
 FakeEventSource.install();let saved=pkg;
 const fake=installFetch(call=>{
  if(call.path.endsWith('/plan'))return {body:{package:saved,outline:null,onepager,running:{},ready:{}}};
  if(call.method==='POST')return {body:{id:'onepager-job',status:'running'}};
  if(call.path.endsWith('/package'))return {body:saved={...saved,...call.body as Partial<Package>}};
 });
 let plan!:ReturnType<typeof usePlan>;function Probe(){plan=usePlan(video,{onVideo(){},onRecord(){}});return null;}
 const ui=await mountUI(createElement(Probe));
 try{
  await act(async()=>plan.writeOnepager());await flush();
  saved={...pkg,hook:{...pkg.hook,spoken:'Companion hook'}};
  await act(async()=>plan.refresh());assert.equal(plan.pkg?.hook.spoken,'Companion hook');assert.deepEqual(plan.onepager,onepager);
  await act(async()=>{plan.editPackage({...plan.pkg!,angle:'Changed'});});await act(async()=>plan.flush());
  assert.deepEqual(fake.calls.find(call=>call.method==='PUT'&&call.path.endsWith('/package'))?.body,{angle:'Changed'});
 }finally{await ui.close();fake.restore();}
});

test('another job finishing cannot release a package lock while its starting flush waits',async()=>{
 FakeEventSource.install();const saving=deferred<FakeReply>();let posts=0;
 const fake=installFetch(call=>{
  if(call.path.endsWith('/plan'))return {body:{package:pkg,outline:null,onepager,running:{},ready:{}}};
  if(call.method==='PUT')return saving.promise;
  if(call.method==='POST')return {body:{id:`job-${++posts}`,status:'running'}};
 });
 let plan!:ReturnType<typeof usePlan>;function Probe(){plan=usePlan(video,{onVideo(){},onRecord(){}});return null;}
 const ui=await mountUI(createElement(Probe));
 try{
  await act(async()=>plan.writePackage());await flush();
  await act(async()=>FakeEventSource.last().emit('done',{value:pkg}));
  await act(async()=>plan.writeOnepager());await flush();const other=FakeEventSource.last();
  await act(async()=>{plan.editPackage({...pkg,angle:'Pending'});plan.writePackage();});await flush();
  await act(async()=>other.emit('done',{value:onepager}));
  await act(async()=>{plan.editPackage({...pkg,angle:'Must stay locked'});plan.writePackage();});
  assert.equal(plan.pkg?.angle,'Pending');
  await act(async()=>saving.resolve({body:{...pkg,angle:'Pending'}}));await flush();
  assert.equal(fake.calls.filter(call=>call.method==='POST'&&call.path.endsWith('/package')).length,2);
  await act(async()=>{for(const source of FakeEventSource.all)source.emit('failed',{message:'Try again'});});
  await act(async()=>plan.editPackage({...pkg,angle:'Unlocked'}));assert.equal(plan.pkg?.angle,'Unlocked');
 }finally{await ui.close();fake.restore();}
});

for(const kind of ['package','onepager'] as const)for(const failed of [false,true])test(`cancelled ${kind} saver settles after an in-flight ${failed?'failure':'success'}`,async()=>{
 const pending=deferred<FakeReply>();const fake=installFetch(call=>{
  if(call.path.endsWith('/plan'))return {body:{package:pkg,outline:null,onepager,running:{},ready:{[kind]:'held'}}};
  if(call.method==='PUT')return pending.promise;
  return {body:{package:pkg,outline:null,onepager}};
 });
 let plan!:ReturnType<typeof usePlan>;function Probe(){plan=usePlan(video,{onVideo(){},onRecord(){}});return null;}
 const ui=await mountUI(createElement(Probe));
 try{
  await act(async()=>{if(kind==='package')plan.editPackage({...pkg,angle:'Typing'});else plan.editOnepager({...onepager,title:'Typing'});void plan.flush().catch(()=>{});});
  assert.equal(kind==='package'?plan.packageSave:plan.onepagerSave,'saving');
  let resolving!:Promise<void>;await act(async()=>{resolving=plan.resolveNotice(kind);});
  await act(async()=>{pending.resolve(failed?{status:500,body:{error:'Save failed'}}:{body:pkg});await resolving;});
  assert.equal(kind==='package'?plan.packageSave:plan.onepagerSave,'idle');assert.equal(plan.saveError,'');
 }finally{await ui.close();fake.restore();}
});

test('board refresh failure leaves loaded tiles mounted, while the first load still reports its error',async()=>{
 let fail=false;const fake=installFetch(()=>fail?{status:500,body:{error:'Offline'}}:{body:[{id:'t1',kind:'note',text:'Draft',createdAt:'now',meta:{}}]});
 let board!:ReturnType<typeof useBoard>;function Probe(){board=useBoard(video.id);return null;}
 let ui=await mountUI(wrap(createElement(Probe)));
 try{
  assert.equal(board.tiles?.length,1);fail=true;await act(async()=>board.refresh());await flush();
  assert.equal(board.loadError,'');assert.equal(board.tiles?.[0].text,'Draft');await ui.close();
  ui=await mountUI(wrap(createElement(Probe)));assert.equal(board.tiles,null);assert.equal(board.loadError,'Offline');
 }finally{await ui.close();fake.restore();}
});

test('held group focus runs only when the open group changes',async()=>{
 const later={...video,id:'later',hidden:'later' as const},skipped={...video,id:'skipped',hidden:'skipped' as const};
 const props={scenes:{},onOpen(){},onMove(){},onAdd:async()=>{}};
 const render=(videos:Video[],openGroup:'later'|'skipped')=>createElement(Kanban,{...props,videos,ideas:{openGroup,actions:{} as IdeaActionSet}});
 const ui=await mountUI(render([later,skipped],'later'));
 try{
  const card=(id:string)=>ui.container.querySelector<HTMLElement>(`[data-card-id="${id}"]`)!;
  assert.equal(document.activeElement,card('later'));
  const input=document.createElement('input');ui.container.append(input);input.focus();
  await ui.render(render([{...later,title:'Renamed'},skipped],'later'));assert.equal(document.activeElement,input);
  await ui.render(render([later,skipped],'skipped'));assert.equal(document.activeElement,card('skipped'));
 }finally{await ui.close();}
});

test('idle and terminal jobs ignore Stop, including a click in the same turn as completion',async()=>{
 FakeEventSource.install();const fake=installFetch(()=>({body:{}}));let job!:ReturnType<typeof useJobRun>;
 function Probe(){job=useJobRun();return null;}const ui=await mountUI(createElement(Probe));
 try{
  await act(async()=>job.cancel());assert.equal(job.state.phase,'idle');
  for(const phase of ['done','failed','cancelled'] as const){
   await act(async()=>job.attach(phase));
   await act(async()=>{FakeEventSource.last().emit(phase,{message:'Finished'});await job.cancel();});
   assert.equal(job.state.phase,phase);
  }
  assert.equal(fake.calls.filter(call=>call.method==='DELETE').length,0);
 }finally{await ui.close();fake.restore();}
});

test('failed frame drop rolls back to the confirmed position after multiple drag previews',async()=>{
 const frame={id:'f1',title:'Frame',x:0,y:0,w:200,h:100};let fail=true;
 const fake=installFetch(call=>call.method==='GET'?{body:{links:[],frames:[frame]}}:fail?{status:500,body:{error:'Move refused'}}:{body:{}});
 let canvas!:ReturnType<typeof useCanvas>;function Probe(){canvas=useCanvas(video.id);return null;}const ui=await mountUI(wrap(createElement(Probe)));
 try{
  await act(async()=>{void canvas.changeFrame('f1',{x:25},false);void canvas.changeFrame('f1',{x:50},false);});
  await act(async()=>canvas.changeFrame('f1',{x:50}));assert.equal(canvas.canvas.frames[0].x,0);
  fail=false;await act(async()=>canvas.changeFrame('f1',{x:80}));assert.equal(canvas.canvas.frames[0].x,80);
  fail=true;await act(async()=>{void canvas.changeFrame('f1',{x:100},false);});
  await act(async()=>canvas.changeFrame('f1',{x:100}));assert.equal(canvas.canvas.frames[0].x,80);
 }finally{await ui.close();fake.restore();}
});

test('export status distinguishes unavailable revision from a known stale export',()=>{
 assert.equal(exportStatus(null,'r'),'missing');assert.equal(exportStatus({},'r'),'unknown');
 assert.equal(exportStatus({projectRevision:'r'},null),'unknown');assert.equal(hasCurrentExport({},'r'),true);
 assert.equal(hasCurrentExport({projectRevision:'r'},undefined),true);
 assert.equal(exportStatus({projectRevision:'"r"'},'r'),'current');assert.equal(exportStatus({projectRevision:'r'},'next'),'stale');
});

test('deferred deletes and tile deletes use a useful fallback for network errors',async()=>{
 const errors:string[]=[];deferDelete({delay:0,send:async()=>{throw new TypeError('Failed to fetch');},fallback:"Couldn't remove that frame.",onUndo(){},onFailed:message=>errors.push(message)});
 await flush();assert.deepEqual(errors,["Couldn't remove that frame."]);
 const fake=installFetch(async()=>{throw new TypeError('Failed to fetch');});
 try{deleteTileLater(video.id,'t-review',message=>errors.push(message),0);await flush();await flush();assert.equal(errors.at(-1),"Couldn't remove that tile.");}finally{fake.restore();}
});

test('Welcome restores a created channel on any route and the palette explicitly clears the previous flow',async()=>{
 clearWelcomeProgress();saveWelcomeProgress({path:'channel',created:workspace});
 assert.equal(restoreWelcomeProgress().created?.slug,workspace.slug);assert.equal(restoreWelcomeProgress(1).created?.slug,workspace.slug);
 assert.equal(restoreWelcomeProgress(2).created?.slug,workspace.slug);
 const routes:unknown[]=[];const ui=await mountUI(createElement(Palette,{videos:[],onClose(){},onOpen:route=>{assert.deepEqual(readWelcomeProgress(),{});routes.push(route);},onNewVideo(){},onHelp(){}}));
 try{
  const option=[...ui.container.querySelectorAll<HTMLElement>('[role=option]')].find(item=>item.textContent?.includes('Add a channel'))!;
  await act(async()=>option.click());assert.deepEqual(routes,[{name:'welcome'}]);
 }finally{await ui.close();clearWelcomeProgress();}
});

test('Welcome without a step resumes its created channel; failed completion retains progress until retry',async()=>{
 clearWelcomeProgress();saveWelcomeProgress({path:'channel',created:workspace});rememberAiStatus(off);let fail=true;
 const fake=installFetch(call=>call.path==='/ai/status'?{body:off}:call.path==='/workspaces'?{body:{workspaces:[workspace]}}:call.path.endsWith('/current')?{body:{current:workspace.slug}}:call.path==='/settings/welcomed'?(fail?{status:500,body:{error:'Try again'}}:{body:{}}):undefined);
 const ui=await mountUI(createElement(WelcomeScreen,{navigate(){}}));
 try{
  assert.equal(fake.calls.some(call=>call.path.includes('/current')),true);
  await act(async()=>button(ui.container,'Skip setup').click());await flush();assert.notDeepEqual(readWelcomeProgress(),{});
  fail=false;await act(async()=>button(ui.container,'Skip setup').click());await flush();assert.deepEqual(readWelcomeProgress(),{});
 }finally{await ui.close();fake.restore();clearWelcomeProgress();forgetAiStatus();}
});

test('focus AI probes are throttled for a minute and preserve the previous answer during a background request',async()=>{
 forgetAiStatus();rememberAiStatus(off);const pending=deferred<FakeReply>(),realNow=Date.now;let now=realNow();Date.now=()=>now;
 const fake=installFetch(call=>call.path==='/ai/status'?pending.promise:{body:{}});let check!:ReturnType<typeof useAiCheck>;
 function Probe(){check=useAiCheck();return null;}const ui=await mountUI(createElement(Probe));
 try{
  const focus=()=>window.dispatchEvent(new Event('focus'));
  await act(async()=>{focus();focus();});assert.equal(fake.calls.filter(call=>call.path==='/ai/status').length,1);assert.equal(check.check.phase,'ready');
  await act(async()=>pending.resolve({body:off}));now+=AI_FOCUS_REFRESH_MS-1;
  await act(async()=>focus());assert.equal(fake.calls.filter(call=>call.path==='/ai/status').length,1);
  now+=1;await act(async()=>focus());assert.equal(fake.calls.filter(call=>call.path==='/ai/status').length,2);assert.equal(check.check.phase,'ready');
 }finally{Date.now=realNow;await ui.close();fake.restore();forgetAiStatus();}
});

test('an unfinished Welcome remount reuses its created channel until completion succeeds',async()=>{
 clearWelcomeProgress();rememberAiStatus(off);
 saveWelcomeProgress({path:'fresh',created:workspace,fresh:{name:'Samin',channelName:'Old channel',topics:['AI'],audience:['Creators']}});
 let fail=true;const fake=installFetch(call=>{
  if(call.path==='/settings/welcomed')return fail?{status:500,body:{error:'Try again'}}:{body:{}};
  if(call.path==='/ai/status')return {body:off};
  if(call.path==='/trending')return {body:{items:[],followed:0,updatedAt:null}};
  return {body:[]};
 });
 let ui=await mountUI(createElement(WelcomeScreen,{initialStep:3,navigate(){}}));
 try{
  await act(async()=>button(ui.container,'Skip setup').click());await flush();
  assert.equal(readWelcomeProgress().created?.slug,workspace.slug);await ui.close();
  fail=false;ui=await mountUI(createElement(WelcomeScreen,{initialStep:3,navigate(){}}));
  await act(async()=>button(ui.container,'Skip setup').click());await flush();
  assert.deepEqual(readWelcomeProgress(),{});assert.equal(fake.calls.some(call=>call.path==='/workspaces/fresh'),false);
 }finally{await ui.close();fake.restore();clearWelcomeProgress();forgetAiStatus();}
});

test('adopt and note replacement update the board ref before a same-turn preview',async()=>{
 const note={id:'ref-note',kind:'note' as const,text:'Old',createdAt:'now',meta:{},pos:{x:0,y:0}},fresh={...note,id:'adopted'};
 const fake=installFetch(call=>call.method==='PATCH'?{body:{...note,text:'Saved text'}}:{body:[note]});let board!:ReturnType<typeof useBoard>;function Probe(){board=useBoard(video.id);return null;}const ui=await mountUI(wrap(createElement(Probe)));
 try{await act(async()=>{board.adopt([fresh]);board.preview(fresh.id,{x:20,y:30});});assert.equal(board.tiles?.find(tile=>tile.id===fresh.id)?.pos?.x,20);
  await act(async()=>{await board.saveNote(note.id,'Saved text');board.preview(note.id,{x:40,y:50});});assert.equal(board.tiles?.find(tile=>tile.id===note.id)?.text,'Saved text');assert.equal(board.tiles?.find(tile=>tile.id===note.id)?.pos?.x,40);
 }finally{await ui.close();fake.restore();}
});
test('a missing confirmed frame triggers a reload after rollback instead of replacing it with a partial frame',async()=>{
 const frame={id:'missing-confirmed',title:'Full frame',x:0,y:0,w:200,h:100};let reads=0,missing=false;
 const fake=installFetch(call=>{if(call.method==='GET'){reads++;missing=false;return {body:{links:[],frames:[frame]}};}return {status:500,body:{error:'Move refused'}};});let canvas!:ReturnType<typeof useCanvas>;function Probe(){canvas=useCanvas(video.id);return null;}const ui=await mountUI(wrap(createElement(Probe))),get=Map.prototype.get;
 Map.prototype.get=function(key:unknown){const value=get.call(this,key);return missing&&key===frame.id&&value?.id===frame.id?undefined:value;};
 try{missing=true;await act(async()=>canvas.changeFrame(frame.id,{x:80}));await flush();assert.equal(reads,2);assert.deepEqual(canvas.canvas.frames[0],frame);}finally{Map.prototype.get=get;await ui.close();fake.restore();}
});
test('Welcome without a route step resumes a created fresh channel and never creates another workspace',async()=>{
 clearWelcomeProgress();saveWelcomeProgress({path:'fresh',created:workspace,fresh:{name:'Existing',channelName:'Existing',topics:['AI'],audience:['Creators']}});rememberAiStatus(off);const fake=installFetch(call=>call.path==='/ai/status'?{body:off}:call.path==='/settings/welcomed'?{body:{}}:call.path.includes('/trending')?{body:{items:[],channels:[],updatedAt:'now'}}:undefined),ui=await mountUI(createElement(WelcomeScreen,{navigate(){}}));
 try{assert.match(ui.container.textContent??'',/How you talk/);assert.equal(fake.calls.some(call=>call.path==='/workspaces/fresh'),false);assert.equal(readWelcomeProgress().created?.slug,workspace.slug);}finally{await ui.close();fake.restore();clearWelcomeProgress();forgetAiStatus();}
});
