import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Outline,ResearchTile,Video} from '../../shared/club';
import {FakeEventSource,installFetch,type FakeReply} from './test-fakes';
import {useJobRun,jobRunReducer} from './useJobRun';
import {usePlan} from './usePlan';
import {useCompanion} from './workspace/useCompanion';
import {companionTurn} from './workspace/companion-turn';
import {askClaude,onAskSettled} from './workspace/ask-claude';
import {EMPTY_REFRESH,discoverRefresh} from './discover-refresh';
import {useBoard} from './workspace/useBoard';
import {useCanvas} from './workspace/useCanvas';
import {useNoteSave} from './workspace/useNoteSave';
import {ToastProvider} from './ui';
import {OptimisticMoves} from './production/optimistic-moves';
import {applyMove,undoBeforeId} from './production';
import {hasCurrentExport} from './export-status';
import {deferDelete} from './deferred-delete';
import {forgetAiStatus,rememberChosenAi,useAiCheck} from './ai-status';
import {useAi} from './useAi';
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
const video:Video={id:'v_race',title:'Race',stage:'ideas',order:0,createdAt:'now',updatedAt:'now',stageDates:{},planning:{research:false,package:false,outline:false}};
const outline:Outline={scenes:[{id:'s1',title:'First',talkingPoints:[],show:'',seconds:30},{id:'s2',title:'Second',talkingPoints:[],show:'',seconds:30}]};
const tile:ResearchTile={id:'t1',kind:'note',text:'old',meta:{},createdAt:'now',pos:{x:0,y:0},doc:{root:'video',path:'notes/test.md',hash:'h1'}};
const wrap=(child:ReturnType<typeof createElement>)=>createElement(ToastProvider,null,child);

test('job generations reject stale transitions and terminal cancellation is distinct',()=>{
 const current={generation:2,run:{phase:'running' as const}};
 assert.equal(jobRunReducer(current,{generation:1,run:{phase:'done'}}),current);
 assert.equal(jobRunReducer(current,{generation:2,run:{phase:'cancelled'}}).run.phase,'cancelled');
});
test('latest POST owns the watcher; cancelling a pending POST cancels its eventual job',async()=>{
 FakeEventSource.install();const older=deferred<unknown>(),newer=deferred<unknown>();
 const fake=installFetch(()=>({body:{}}));let job!:ReturnType<typeof useJobRun>,done=0;
 function Probe(){job=useJobRun();return null;}
 const ui=await mountUI(createElement(Probe));
 try{
  await act(async()=>{void job.run(()=>older.promise,()=>done++);void job.run(()=>newer.promise,()=>done++);});
  assert.equal(job.state.phase,'starting');
  await act(async()=>{await job.cancel();newer.resolve({id:'new',status:'running'});});await flush();
  assert.ok(fake.calls.some(call=>call.method==='DELETE'&&call.path==='/jobs/new'));
  await act(async()=>older.resolve({id:'old',status:'running'}));
  assert.equal(FakeEventSource.all.length,1);
  await act(async()=>FakeEventSource.last().emit('cancelled',{}));assert.equal(job.state.phase,'cancelled');assert.equal(done,0);
  await act(async()=>{void job.attach('third');});const watcher=FakeEventSource.last();
  await act(async()=>{void job.attach('fourth');});assert.equal(watcher.closed,true);
 }finally{await ui.close();fake.restore();}
});
test('a non-job POST resolving after unmount cannot call onDone or start a watcher',async()=>{
 const pending=deferred<unknown>();let job!:ReturnType<typeof useJobRun>,done=0;
 function Probe(){job=useJobRun();return null;}
 const ui=await mountUI(createElement(Probe));await act(async()=>{void job.run(()=>pending.promise,()=>done++);});await ui.close();
 await act(async()=>pending.resolve({ok:true}));assert.equal(done,0);
});
test('plan script edits share a serial saver, and a second script job cannot replace the first scene',async()=>{
 FakeEventSource.install();const fake=installFetch(call=>{
  if(call.path.endsWith('/plan'))return {body:{package:null,outline,onepager:null,running:{},ready:{}}};
  if(call.path.endsWith('/script')&&call.method==='POST')return {body:{id:'script-job',status:'running'}};
  return {body:{outline}};
 });let plan!:ReturnType<typeof usePlan>;
 function Probe(){plan=usePlan(video,{onVideo(){},onRecord(){}});return null;}
 const ui=await mountUI(createElement(Probe));
 try{
  await act(async()=>{plan.saveSceneScript('s1','a');plan.saveSceneScript('s2','b');plan.saveSceneScript('s1','latest');});
  await act(async()=>{await plan.flush();});
  assert.deepEqual(fake.calls.filter(call=>call.path.includes('/script/scene/')).map(call=>[call.path,call.body]),[['/videos/v_race/script/scene/s1',{text:'latest'}],['/videos/v_race/script/scene/s2',{text:'b'}]]);
  await act(async()=>{plan.writeScript('s1');plan.writeScript('s2');});await flush();
  assert.equal(fake.calls.filter(call=>call.path.endsWith('/script')&&call.method==='POST').length,1);assert.equal(plan.scriptScene,'s1');
  await act(async()=>plan.saveSceneScript('s1','stale manual overwrite'));
  const result={...outline,scenes:outline.scenes.map(scene=>({...scene,script:'AI result'}))};
  await act(async()=>FakeEventSource.last().emit('done',{value:result}));await act(async()=>plan.flush());
  assert.equal(fake.calls.some(call=>(call.body as {text?:string})?.text==='stale manual overwrite'),false);
 }finally{await ui.close();fake.restore();}
});
test('companion reserves sending before context flush and every rejected/failed request settles by id',async()=>{
 FakeEventSource.install();const context=deferred<{tab:'idea';screen:string}>();let posts=0;
 const fake=installFetch(call=>{if(call.method==='POST'){posts++;return {status:500,body:{error:'No answer'}};}return {body:{messages:[]}};});
 let chat!:ReturnType<typeof useCompanion>;const settled:string[]=[];const stop=onAskSettled(detail=>settled.push(detail.requestId));
 function Probe(){chat=useCompanion(video.id,{onChanged(){}});return null;}
 const ui=await mountUI(createElement(Probe));
 try{
  let first!:Promise<boolean>;
  await act(async()=>{first=chat.send('one',()=>context.promise,undefined,undefined,'first');await chat.send('two',{tab:'idea',screen:'Idea'},undefined,undefined,'second');});
  assert.equal(chat.phase,'sending');assert.equal(posts,0);assert.ok(settled.includes('second'));
  await act(async()=>{context.resolve({tab:'idea',screen:'Idea'});await first;});assert.equal(posts,1);assert.equal(chat.phase,'failed');assert.ok(settled.includes('first'));
  const id=askClaude('no panel mounted');assert.ok(settled.includes(id));
 }finally{await ui.close();stop();fake.restore();}
});
test('recover cannot attach a stream after its companion unmounts',async()=>{
 FakeEventSource.install();const read=deferred<FakeReply>();
 const fake=installFetch(call=>call.path.startsWith('/jobs/')?read.promise:call.method==='POST'?{body:{message:{id:'q',role:'user',text:'hi',context:{tab:'idea',screen:'Idea'}},jobId:'recover'}}:{body:{messages:[]}});
 let chat!:ReturnType<typeof useCompanion>;function Probe(){chat=useCompanion(video.id,{onChanged(){}});return null;}
 const ui=await mountUI(createElement(Probe));
 try{
  await act(async()=>{await chat.send('hi',{tab:'idea',screen:'Idea'});});const count=FakeEventSource.all.length;
  await act(async()=>{const source=FakeEventSource.last();source.readyState=2;source.emit('error');});await ui.close();
  await act(async()=>read.resolve({body:{id:'recover',status:'running'}}));assert.equal(FakeEventSource.all.length,count);
 }finally{fake.restore();}
});
test('turn reducer refuses a second sending turn and stale completion',()=>{
 const active={phase:'sending' as const,requestId:'a'};
 assert.equal(companionTurn(active,{phase:'sending',requestId:'b'}),active);
 assert.equal(companionTurn(active,{phase:'done',requestId:'b'}),active);
 assert.equal(companionTurn(active,{phase:'failed',requestId:'a'}).phase,'failed');
});
test('Discover refresh sessions drop previous wait lists and ignore late completions',()=>{
 const first=discoverRefresh(EMPTY_REFRESH,{type:'start',generation:1,kinds:['videos','posts']});
 const next=discoverRefresh(first,{type:'start',generation:2,kinds:['videos']});
 assert.equal(discoverRefresh(next,{type:'settle',generation:1,kind:'posts',found:9}),next);
 const done=discoverRefresh(next,{type:'settle',generation:2,kind:'videos'});assert.equal(done.phase,'done');assert.equal(done.posts,0);
});
test('a failed board position save cannot undo a newer move and reload merges queued positions',async()=>{
 FakeEventSource.install();const first=deferred<FakeReply>();let patches=0;
 const fake=installFetch(call=>call.method==='PATCH'?(++patches===1?first.promise:{body:{}}):{body:[tile]});
 let board!:ReturnType<typeof useBoard>;function Probe(){board=useBoard(video.id);return null;}
 const ui=await mountUI(wrap(createElement(Probe)));
 try{
  await act(async()=>{board.place('t1',{x:10,y:10},'now');board.place('t1',{x:20,y:20},'now');board.reload();});await flush();assert.equal(patches,1);assert.equal(board.tiles![0].pos!.x,20);
  await act(async()=>first.resolve({status:500,body:{error:'Failed first move'}}));await flush();assert.equal(patches,2);assert.equal(board.tiles![0].pos!.x,20);
 }finally{await ui.close();fake.restore();}
});
test('failed canvas edit rolls back only its object and leaves unrelated edits intact',async()=>{
 const patch=deferred<FakeReply>(),other=deferred<FakeReply>();
 const frames=[{id:'f1',title:'One',x:0,y:0,w:200,h:100},{id:'f2',title:'Two',x:200,y:0,w:200,h:100}];
 const fake=installFetch(call=>call.method==='GET'?{body:{links:[],frames}}:call.path.endsWith('f1')?patch.promise:other.promise);
 let canvas!:ReturnType<typeof useCanvas>;function Probe(){canvas=useCanvas(video.id);return null;}
 const ui=await mountUI(wrap(createElement(Probe)));
 try{
  await act(async()=>{void canvas.changeFrame('f1',{x:10});void canvas.changeFrame('f2',{x:300});});
  await act(async()=>patch.resolve({status:500,body:{error:'Failed frame'}}));await flush();assert.equal(canvas.canvas.frames.find(f=>f.id==='f1')!.x,0);assert.equal(canvas.canvas.frames.find(f=>f.id==='f2')!.x,300);
  await act(async()=>other.resolve({body:{}}));
 }finally{await ui.close();fake.restore();}
});
test('note autosave drains typing made during an in-flight save',async()=>{
 const first=deferred<{tile:ResearchTile}>(),texts:string[]=[];let note!:ReturnType<typeof useNoteSave>;
 function Probe(){note=useNoteSave(tile,async text=>{texts.push(text);return texts.length===1?first.promise:{tile:{...tile,text,doc:{...tile.doc!,hash:'h3'}}};});return null;}
 const ui=await mountUI(wrap(createElement(Probe)));
 try{
  let pending!:Promise<boolean>;await act(async()=>{note.change('first');pending=note.flush();});
  await act(async()=>note.change('second'));await act(async()=>{first.resolve({tile:{...tile,text:'first',doc:{...tile.doc!,hash:'h2'}}});await pending;});
  assert.deepEqual(texts,['first','second']);assert.equal(note.status,'saved');
 }finally{await ui.close();}
});
test('date changes share the move queue and a failed date cannot erase a queued move',async()=>{
 const date=deferred<Video>();let drawn:Video[]=[];const moves:string[]=[];
 const queue=new OptimisticMoves([video],next=>drawn=next,async move=>{moves.push(move.stage);return {...video,stage:move.stage};},()=>{},()=>date.promise);
 const scheduled=queue.date(video.id,'2026-12-01').catch(()=>{}),moved=queue.place(video.id,'editing',null);
 assert.equal(drawn[0].publishDate,'2026-12-01');assert.equal(drawn[0].stage,'editing');date.reject(new Error('Failed date'));await scheduled;await moved;assert.deepEqual(moves,['editing']);assert.equal(drawn[0].stage,'editing');
});
test('moving a held idea clears hidden; Undo finds a follower still in the original stage',()=>{
 const moved=applyMove([{...video,hidden:'later'}],video.id,'planning',null,'now');assert.equal(moved[0].hidden,undefined);
 assert.equal(undoBeforeId([{...video,id:'gone',stage:'editing'},{...video,id:'stays'}],'ideas',['gone','stays']),'stays');
});
test('Undo after dispatch reports that it could not undo',async()=>{
 const sent=deferred<unknown>(),errors:string[]=[];
 const undo=deferDelete({delay:0,send:()=>sent.promise,onUndo(){},onFailed:message=>errors.push(message)});
 await new Promise(resolve=>setTimeout(resolve,5));undo();assert.match(errors[0],/Couldn't undo/);sent.resolve({});
});
test('shared AI probes dedupe and mounted AI labels react to a default change',async()=>{
 forgetAiStatus();const pending=deferred<FakeReply>();const fake=installFetch(call=>call.path==='/ai/status'?pending.promise:{body:{defaultAi:'claude'}});
 function Probe(){useAiCheck();const ai=useAi();return createElement('span',null,ai.name);}
 const ui=await mountUI(createElement('div',null,createElement(Probe),createElement(Probe)));
 try{
  assert.equal(fake.calls.filter(call=>call.path==='/ai/status').length,1);
  await act(async()=>rememberChosenAi('codex'));assert.equal(ui.container.textContent,'ChatGPTChatGPT');
  await act(async()=>pending.resolve({body:{claude:{signedIn:false},codex:{signedIn:true}}}));
 }finally{await ui.close();fake.restore();forgetAiStatus();}
});
test('unknown revision remains usable and a known changed revision is not Exported',()=>{
 assert.equal(hasCurrentExport({projectRevision:'r'},''),true);assert.equal(hasCurrentExport({projectRevision:'r'},'next'),false);assert.equal(hasCurrentExport({projectRevision:'"r"'},'r'),true);
});

test('breakdown availability changes do not abort or restart an active attempt, and retry resets progress',async()=>{
 const {useBreakdownRun}=await import('./useBreakdownRun');const {rememberAiStatus}=await import('./ai-status');
 const on={claude:{installed:true,version:null,signedIn:true},codex:{installed:false,version:null,signedIn:false}};
 rememberAiStatus(on);FakeEventSource.install();
 const fake=installFetch(call=>call.path==='/breakdowns'?{body:{id:'bd-job',status:'running'}}:{body:{}});
 let run!:ReturnType<typeof useBreakdownRun>;function Probe(){run=useBreakdownRun({kind:'link',url:'https://youtube.com/watch?v=test'});return null;}
 const ui=await mountUI(createElement(Probe));
 try{
  await flush();const source=FakeEventSource.last();
  await act(async()=>source.emit('progress',{message:'Writing the breakdown'}));
  await act(async()=>rememberAiStatus({...on,claude:{...on.claude,signedIn:false}}));await flush();
  assert.equal(source.closed,false);assert.equal(fake.calls.filter(call=>call.method==='DELETE').length,0);
  assert.equal(fake.calls.filter(call=>call.path==='/breakdowns').length,1);
  await act(async()=>source.emit('failed',{message:'Stopped here'}));
  await act(async()=>run.retry());await flush();assert.equal(run.step,0);assert.equal(run.state.phase,'failed');
 }finally{await ui.close();fake.restore();forgetAiStatus();}
});

test('a cancelled YouTube seed settles and never spins or automatically starts a second search',async()=>{
 const {useTrending}=await import('./useFeed');const {rememberAiStatus}=await import('./ai-status');
 rememberAiStatus({claude:{installed:true,version:null,signedIn:true},codex:{installed:false,version:null,signedIn:false}});FakeEventSource.install();
 const fake=installFetch(call=>call.path==='/trending/refresh'?{body:{id:'seed-job',status:'running'}}:{body:{items:[],followed:0,updatedAt:null}});
 let feed!:ReturnType<typeof useTrending>;function Probe(){feed=useTrending();return null;}
 const ui=await mountUI(createElement(Probe));
 try{
  await flush();assert.equal(feed.seeding,true);
  await act(async()=>FakeEventSource.last().emit('cancelled',{}));await flush();
  assert.equal(feed.job.phase,'cancelled');assert.equal(feed.seeding,false);
  assert.equal(fake.calls.filter(call=>call.path==='/trending/refresh').length,1);
 }finally{await ui.close();fake.restore();forgetAiStatus();}
});

test('queued frame edits replay from the confirmed frame when an earlier edit fails',async()=>{
 const first=deferred<FakeReply>(),second=deferred<FakeReply>();let patches=0;
 const frame={id:'f1',title:'Original',x:0,y:0,w:200,h:100};
 const fake=installFetch(call=>call.method==='GET'?{body:{links:[],frames:[frame]}}:++patches===1?first.promise:second.promise);
 let canvas!:ReturnType<typeof useCanvas>;function Probe(){canvas=useCanvas(video.id);return null;}
 const ui=await mountUI(wrap(createElement(Probe)));
 try{
  await act(async()=>{void canvas.changeFrame('f1',{x:50});void canvas.changeFrame('f1',{title:'New title'});});
  await act(async()=>first.resolve({status:500,body:{error:'Move refused'}}));await flush();
  assert.equal(canvas.canvas.frames[0].x,0);assert.equal(canvas.canvas.frames[0].title,'New title');
  await act(async()=>second.resolve({body:{}}));assert.equal(canvas.canvas.frames[0].x,0);
 }finally{await ui.close();fake.restore();}
});

test('double Skip setup shares creation and a successful completion clears persisted progress',async()=>{
 const {WelcomeScreen}=await import('./screens/WelcomeScreen');const {clearWelcomeProgress,readWelcomeProgress}=await import('./welcome-progress');
 const {rememberAiStatus}=await import('./ai-status');clearWelcomeProgress();
 rememberAiStatus({claude:{installed:false,version:null,signedIn:false},codex:{installed:false,version:null,signedIn:false}});
 const made={slug:'created-once',name:'My channel',handle:'',channelUrl:'',topics:[],audience:[],about:'',cta:'',createdAt:''};
 const pending=deferred<FakeReply>();const fake=installFetch(call=>call.path==='/workspaces'?{body:{current:null,workspaces:[]}}:call.path==='/workspaces/fresh'?pending.promise:call.path==='/ai/status'?{body:{claude:{installed:false,version:null,signedIn:false},codex:{installed:false,version:null,signedIn:false}}}:call.path==='/trending'?{body:{items:[],followed:0,updatedAt:null}}:['/videos','/recent','/breakdowns'].includes(call.path)?{body:[]}:{body:{}});
 let ui=await mountUI(createElement(WelcomeScreen,{navigate(){}}));
 try{
  await act(async()=>{button(ui.container,'Skip setup').click();button(ui.container,'Skip setup').click();});await flush();
  assert.equal(fake.calls.filter(call=>call.path==='/workspaces/fresh').length,1);
  await act(async()=>pending.resolve({body:made}));await flush();await ui.close();
  assert.deepEqual(readWelcomeProgress(),{});ui=await mountUI(createElement(WelcomeScreen,{navigate(){}}));
  assert.equal(fake.calls.filter(call=>call.path==='/workspaces/fresh').length,1);
 }finally{await ui.close();fake.restore();clearWelcomeProgress();forgetAiStatus();}
});

test('all video lists keep an authoritative move that arrives during their initial read',async()=>{
 const {useVideos}=await import('./useVideos');const {useShellVideos}=await import('./useShellVideos');const {notifyVideoUpdated}=await import('./api');
 const pending=deferred<FakeReply>(),fake=installFetch(call=>call.path==='/videos'?pending.promise:{body:[]});
 let videos!:ReturnType<typeof useVideos>,shell!:Video[];
 function Probe(){videos=useVideos();shell=useShellVideos('channel');return null;}
 const ui=await mountUI(createElement(Probe));
 try{
  await act(async()=>notifyVideoUpdated({...video,stage:'editing'}));
  await act(async()=>pending.resolve({body:[video]}));await flush();
  assert.equal(videos.state.status,'ready');if(videos.state.status==='ready')assert.equal(videos.state.videos[0].stage,'editing');
  assert.equal(shell[0].stage,'editing');
 }finally{await ui.close();fake.restore();}
});

test('cancel keeps a job in Stopping until the server settles; a completed job can still win',async()=>{
 FakeEventSource.install();const fake=installFetch(()=>({body:{status:'running'}}));let job!:ReturnType<typeof useJobRun>,done=0;
 function Probe(){job=useJobRun();return null;}const ui=await mountUI(createElement(Probe));
 try{
  await act(async()=>{await job.attach('stopping',()=>done++);await job.cancel();});
  assert.equal(job.state.phase,'running');if(job.state.phase==='running')assert.equal(job.state.stopping,true);
  assert.equal(FakeEventSource.last().closed,false);
  await act(async()=>FakeEventSource.last().emit('reset',{id:'stopping',kind:'test',createdAt:'',status:'running'}));
  if(job.state.phase==='running')assert.equal(job.state.line,'Stopping…');
  await act(async()=>FakeEventSource.last().emit('done',{result:'finished first'}));assert.equal(job.state.phase,'done');assert.equal(done,1);
 }finally{await ui.close();fake.restore();}
});

test('failed companion placeholders offer Retry and running placeholders share one live reply',async()=>{
 const {Companion}=await import('./workspace/Companion');const {rememberAiStatus}=await import('./ai-status');
 rememberAiStatus({claude:{installed:true,version:null,signedIn:true},codex:{installed:false,version:null,signedIn:false}});FakeEventSource.install();
 const question={id:'placeholder-q',role:'user',text:'Please help',context:{tab:'idea',screen:'Idea'}},reply={id:'placeholder-r',role:'assistant',text:'',tab:'idea',cards:[],status:'failed'};
 let posts=0;const fake=installFetch(call=>call.path.endsWith('/companion')?call.method==='POST'?(posts++,{body:{message:question,jobId:'placeholder-job'}}):{body:{messages:[question,reply]}}:call.path.endsWith('/research')?{body:[]}:{body:{defaultAi:'claude'}});
 const ui=await mountUI(createElement(Companion,{videoId:video.id,tab:'idea',screen:'Idea',pkg:null,outline:null,onChanged(){}}));
 try{
  if(ui.container.querySelector('.cmp-rail'))await act(async()=>ui.container.querySelector<HTMLButtonElement>('.cmp-rail')!.click());await flush();
  assert.match(ui.container.textContent??'',/Couldn't finish that reply/);
  await act(async()=>button(ui.container,'Try again').click());await flush();
  assert.equal(posts,1);assert.equal(ui.container.querySelectorAll('.cmp-reply.live').length,1);
  assert.equal(ui.container.querySelector('.cmp-reply.failed'),null);
  await act(async()=>FakeEventSource.last().emit('cancelled',{}));
 }finally{await ui.close();fake.restore();forgetAiStatus();}
});

test('media service restart refetches the screen and shell video lists',async()=>{
 const {useVideos}=await import('./useVideos'),{useShellVideos}=await import('./useShellVideos');let current=video;const fake=installFetch(call=>call.path==='/videos'?{body:[current]}:{body:[]});let videos!:ReturnType<typeof useVideos>,shell!:Video[];function Probe(){videos=useVideos();shell=useShellVideos('channel');return null;}const ui=await mountUI(createElement(Probe));
 try{await flush();current={...video,title:'After media restart'};await act(async()=>window.dispatchEvent(new Event('sceneforge-media-service-ready')));await flush();assert.equal(videos.state.status,'ready');if(videos.state.status==='ready')assert.equal(videos.state.videos[0].title,current.title);assert.equal(shell[0].title,current.title);}finally{await ui.close();fake.restore();}
});
