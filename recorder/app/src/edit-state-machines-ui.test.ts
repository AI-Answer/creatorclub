import {mountUI,button} from './test-dom';
import test from 'node:test';import assert from 'node:assert/strict';import {act,createElement} from 'react';
import {createProject,defaultEffects,defaultTransform,type Project} from '../shared/types';
const {AIDialog}=await import('./Dialogs'),{BorumiExportDialog}=await import('./BorumiExportDialog'),{StageHandles}=await import('./StageHandles'),{AgentChat}=await import('./AgentChat');
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>resolve=yes);return {promise,resolve};}
async function until(check:()=>boolean){for(let i=0;i<100&&!check();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});assert.ok(check(),'async UI settled');}
function fixture(){const p=createProject('Edit');p.media=[{id:'audio',name:'Audio',kind:'audio',path:'/fixture.wav',duration:10,width:0,height:0,hasAudio:true}];p.clips=[{id:'clip',mediaId:'audio',name:'Audio',track:'audio',start:0,sourceIn:0,sourceOut:10,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}];p.scenes[0].duration=10;return p;}
const pointer=(type:string,target:EventTarget=window)=>target.dispatchEvent(new (window as unknown as {PointerEvent:typeof PointerEvent}).PointerEvent(type,{bubbles:true,button:0,clientX:200,clientY:100,pointerId:1}));
test('AI transcription rejects a result after timeline edits and repeated successful transcription replaces its captions',async()=>{
 let p=fixture();const original=globalThis.fetch,response=deferred<Response>();let changed=0,calls=0;globalThis.fetch=async()=>++calls===1?response.promise:Response.json({captions:[{id:'source',text:'new words',start:1,end:2}],provider:'test'});
 const props=()=>({project:p,kind:'transcribe',flush:async()=>p,change:(fn:(p:Project)=>void)=>{fn(p);changed++;},onClose:()=>{},onError:()=>{}}),ui=await mountUI(createElement(AIDialog,props()));
 try{await act(async()=>button(ui.container,'Generate captions').click());p={...p,clips:p.clips.map(c=>({...c,start:2}))};await ui.render(createElement(AIDialog,props()));await act(async()=>{response.resolve(Response.json({captions:[{id:'old',text:'stale',start:1,end:2}],provider:'test'}));});assert.equal(changed,0);assert.match(ui.container.textContent!,/project changed while processing/i);
  await act(async()=>button(ui.container,'Generate captions').click());assert.equal(p.captions.length,1);await ui.render(createElement(AIDialog,props()));await act(async()=>button(ui.container,'Generate captions').click());assert.equal(p.captions.length,1);assert.equal(p.captions[0].text,'new words');
 }finally{await ui.close();globalThis.fetch=original;}
});
test('Borumi content changes keep the export request alive and retain its completed receipt',async()=>{
 let p=fixture();p.importMetadata={sourceApp:'Borumi',roundtrip:{version:1,snapshotId:'preserved'}};
 const original=globalThis.fetch,{projectRevision}=await import('./api'),revision=(await projectRevision(p)).replaceAll('"',''),response=deferred<Response>();let signal:AbortSignal|undefined,exports=0;
 globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/plan'))return Response.json({revision,plan:{supported:true,blockers:[],warnings:[]}});exports++;signal=init?.signal as AbortSignal;return response.promise;};
 const props=()=>({project:p,flush:async()=>p,onClose:()=>{},onBack:()=>{},onImport:()=>{}}),ui=await mountUI(createElement(BorumiExportDialog,props()));
 try{await act(async()=>button(ui.container,'Preview edits').click());await until(()=>!button(ui.container,'Export copy').disabled);await act(async()=>button(ui.container,'Export copy').click());await until(()=>exports===1);assert.equal(exports,1);p={...p,notes:'edited during copy'};await ui.render(createElement(BorumiExportDialog,props()));assert.equal(signal?.aborted,false);assert.ok(button(ui.container,'Export copy').disabled);
  await act(async()=>response.resolve(Response.json({path:'/fixture/copy.bmprojbundle'})));assert.match(ui.container.textContent!,/copy is ready/i);assert.equal(exports,1);
 }finally{await ui.close();globalThis.fetch=original;}
});
test('stage handles stop changing the project after unmount or capture loss',async()=>{
 for(const cancel of ['unmount','lostpointercapture','blur','Escape']){let changes=0;const ui=await mountUI(createElement('div',null,createElement(StageHandles,{box:{x:0,y:0,width:1,height:1},onChange:()=>changes++})));
  try{await act(async()=>pointer('pointerdown',ui.container.querySelector('.stage-handles')!));if(cancel==='unmount')await ui.render(null);else await act(async()=>{if(cancel==='lostpointercapture')pointer(cancel,ui.container.querySelector('.stage-handles')!);else if(cancel==='blur')window.dispatchEvent(new Event('blur'));else window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));});const before=changes;await act(async()=>{pointer('pointermove');pointer('pointerup');});assert.equal(changes,before,cancel);}
  finally{await ui.close();}
 }
});
test('agent chat filters non-clip and missing selected ids before sending',async()=>{
 const p=fixture(),original=globalThis.fetch;let request:{selectedClipIds:string[]}|undefined;
 globalThis.fetch=async(url,init)=>{if(String(url).startsWith('/api/agent/status'))return Response.json({supported:true,installed:true,authenticated:true});if(init?.method==='POST'){request=JSON.parse(String(init.body));return Response.json({id:'job',projectId:p.id,status:'complete',request,text:'',activity:[],changed:false});}return Response.json({jobs:[]});};
 const ui=await mountUI(createElement(AgentChat,{project:p,selectedIds:new Set(['clip','caption','missing']),range:null,onRange:()=>{},getPlayhead:()=>0,visible:true,onClose:()=>{},onClearSelection:()=>{},flush:async()=>p,onError:()=>{}}));
 try{const input=ui.container.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Tighten this');input.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(button(ui.container,'Send').disabled,false);await act(async()=>button(ui.container,'Send').click());assert.deepEqual(request?.selectedClipIds,['clip']);}
 finally{await ui.close();globalThis.fetch=original;}
});

test('Cutroom discards a pre-action poll, adopts cancellation, and clears a dead saved workspace',async()=>{
 const {CutroomPanel}=await import('./CutroomPanel'),p=fixture(),original=globalThis.fetch,originalInterval=window.setInterval,originalGlobal=globalThis.setInterval,originalClear=globalThis.clearInterval;
 const stale=deferred<Response>();let tick:()=>void=()=>{},gets=0;
 const workspace={id:'workspace',revision:'review',status:'running',log:'',generation:1};localStorage.setItem(`creator-compiler.cutroom.${p.id}`,workspace.id);
 globalThis.setInterval=((callback:()=>void)=>{tick=callback;return 123;}) as unknown as typeof setInterval;globalThis.clearInterval=(()=>{}) as typeof clearInterval;
 globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/status'))return Response.json({available:true});if(init?.method==='DELETE')return Response.json({...workspace,status:'cancelled'});if(++gets===1)return Response.json(workspace);return stale.promise;};
 let ui=await mountUI(createElement(CutroomPanel,{project:p,flush:async()=>p,onClose:()=>{},onChanged:()=>{},onOpen:()=>{}}));
 try{await act(async()=>tick());await act(async()=>button(ui.container,'Cancel operation').click());assert.equal(ui.container.querySelector('.cutroom-status')?.textContent,'cancelled');await act(async()=>stale.resolve(Response.json({...workspace,status:'complete'})));assert.equal(ui.container.querySelector('.cutroom-status')?.textContent,'cancelled');await ui.close();
  globalThis.fetch=async url=>String(url).endsWith('/status')?Response.json({available:true}):Response.json({error:'Not found'},{status:404});ui=await mountUI(createElement(CutroomPanel,{project:p,flush:async()=>p,onClose:()=>{},onChanged:()=>{},onOpen:()=>{}}));assert.equal(localStorage.getItem(`creator-compiler.cutroom.${p.id}`),null);
 }finally{await ui.close();globalThis.fetch=original;globalThis.setInterval=originalGlobal;globalThis.clearInterval=originalClear;window.setInterval=originalInterval;}
});

test('transcription keeps its result through captions, timestamps and unrelated visual edits',async()=>{
 let p=fixture();const original=globalThis.fetch,response=deferred<Response>();let changes=0;globalThis.fetch=async()=>response.promise;
 const props=()=>({project:p,kind:'transcribe',flush:async()=>p,change:(fn:(p:Project)=>void)=>{fn(p);changes++;},onClose:()=>{},onError:()=>{}}),ui=await mountUI(createElement(AIDialog,props()));
 try{await act(async()=>button(ui.container,'Generate captions').click());p={...p,updatedAt:'autosave',notes:'typed',canvas:{...p.canvas,padding:8},captions:[{id:'automatic',text:'background captions',start:4,end:5}]};await ui.render(createElement(AIDialog,props()));await act(async()=>response.resolve(Response.json({captions:[{id:'source',text:'new source words',start:1,end:2}],provider:'test'})));assert.equal(changes,1);assert.ok(p.captions.some(c=>c.text==='new source words'));assert.doesNotMatch(ui.container.textContent!,/project changed while processing/i);
 }finally{await ui.close();globalThis.fetch=original;}
});
test('clamped stage handles continue dragging and drop; replacing the item cancels',async()=>{
 const send=(type:string,x:number,target:EventTarget=window)=>target.dispatchEvent(new (window as unknown as {PointerEvent:typeof PointerEvent}).PointerEvent(type,{bubbles:true,button:0,clientX:x,clientY:100,pointerId:1}));
 for(const replace of [false,true]){let box={x:.4,y:.4,width:.2,height:.2},key='zoom-a',moves=0,ends=0;const render=()=>createElement('div',null,createElement(StageHandles,{box,itemKey:key,onChange:(next:typeof box,phase:'move'|'end')=>{if(phase==='end')ends++;else{moves++;box={...next,x:Math.min(.8,next.x)};}}})),ui=await mountUI(render());
  try{const parent=ui.container.firstElementChild!;parent.getBoundingClientRect=()=>({width:100,height:100,left:0,top:0,right:100,bottom:100,x:0,y:0,toJSON:()=>({})});await act(async()=>send('pointerdown',100,ui.container.querySelector('.stage-handles')!));await act(async()=>send('pointermove',170));assert.equal(moves,1);if(replace)key='zoom-b';await ui.render(render());await act(async()=>{send('pointermove',180);send('pointerup',180);});assert.equal(moves,replace?1:2);assert.equal(ends,replace?0:1);
  }finally{await ui.close();}
 }
});
test('agent chat rejects a non-clip selection and ignores only missing ids',async()=>{
 for(const nonClip of [true,false]){const p=fixture();p.captions=[{id:'caption',text:'words',start:0,end:1}];const original=globalThis.fetch;let sent=0;globalThis.fetch=async(url,init)=>{if(String(url).startsWith('/api/agent/status'))return Response.json({supported:true,installed:true,authenticated:true});if(init?.method==='POST'){sent++;return Response.json({id:'done',status:'complete',request:{selectedClipIds:[]},activity:[],changed:false});}return Response.json({jobs:[]});};
  const ui=await mountUI(createElement(AgentChat,{project:p,selectedIds:new Set(nonClip?['caption','missing']:['missing']),range:null,onRange:()=>{},getPlayhead:()=>0,visible:true,onClose:()=>{},onClearSelection:()=>{},flush:async()=>p,onError:()=>{}}));
  try{const input=ui.container.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Tighten');input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>button(ui.container,'Send').click());assert.equal(sent,nonClip?0:1);if(nonClip)assert.match(ui.container.textContent!,/selection contains no media clips/i);
  }finally{await ui.close();globalThis.fetch=original;}
 }
});
test('agent job starts and polls outside commit, adopting only its final project in the save queue',async()=>{
 const p=fixture(),original=globalThis.fetch,originalTimeout=globalThis.setTimeout,originalSource=globalThis.EventSource,poll=deferred<Response>();let commits=0,inside=false,posts=0,polls=0,locked=false,flushes=0;const request={message:'Tighten',selectedClipIds:[],playhead:0};
 globalThis.EventSource=class extends EventTarget{close(){}} as unknown as typeof EventSource;
 globalThis.setTimeout=((callback:()=>void,ms?:number,...args:unknown[])=>originalTimeout(callback,ms===1500?1:ms,...args)) as typeof setTimeout;
 globalThis.fetch=async(url,init)=>{const path=String(url);if(path.startsWith('/api/agent/status'))return Response.json({supported:true,installed:true,authenticated:true});if(init?.method==='POST'){assert.equal(inside,false);posts++;return Response.json({id:'pending',status:'running',request,activity:[],changed:false});}if(path==='/api/agent-chat/pending'){assert.equal(inside,false);polls++;return poll.promise;}if(path===`/api/projects/${p.id}`){assert.equal(inside,true);return Response.json(p,{headers:{ETag:'"done"'}});}return Response.json({jobs:[]});};
 const commit=(async(run:(revision:string)=>Promise<unknown>)=>{commits++;inside=true;try{return await run('saved');}finally{inside=false;}}) as NonNullable<Parameters<typeof AgentChat>[0]['commit']>;
 const ui=await mountUI(createElement(AgentChat,{project:p,selectedIds:new Set<string>(),range:null,onRange:()=>{},getPlayhead:()=>0,visible:true,onClose:()=>{},onClearSelection:()=>{},flush:async()=>{assert.equal(locked,true,'edits lock before the pre-job flush');flushes++;return p;},commit,setChatEditing:(_id,editing)=>{locked=editing;},onError:()=>{}}));
 try{const input=ui.container.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Tighten');input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>button(ui.container,'Send').click());await until(()=>polls===1);assert.equal(posts,1);assert.equal(commits,0,'a running Claude job holds no save queue');assert.equal(flushes,1);assert.equal(locked,true);await act(async()=>poll.resolve(Response.json({id:'pending',status:'complete',request,activity:[],changed:true})));await until(()=>commits===1);assert.equal(inside,false);assert.equal(locked,false);
 }finally{await ui.close();globalThis.fetch=original;globalThis.setTimeout=originalTimeout;globalThis.EventSource=originalSource;}
});
