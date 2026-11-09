import {test} from 'node:test';import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject,defaultEffects,defaultTransform,type Project} from '../shared/types';
// A minimal host for rendering the hook without a browser: the probe component renders nothing.
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const noop=()=>{};(globalThis as {window?:unknown}).window??=globalThis;
const doc:Record<string,unknown>={addEventListener:noop,removeEventListener:noop,nodeType:9,activeElement:null,body:null};doc.defaultView={document:doc,HTMLIFrameElement:class{}};
const container={nodeType:1,tagName:'DIV',nodeName:'DIV',namespaceURI:'http://www.w3.org/1999/xhtml',ownerDocument:doc,addEventListener:noop,removeEventListener:noop,textContent:''};
class FakeSource extends EventTarget{static last:FakeSource|null=null;readyState=1;constructor(readonly url:string){super();FakeSource.last=this;}close(){this.readyState=2;}}
globalThis.EventSource=FakeSource as unknown as typeof EventSource;
type Sent={method:string;path:string;headers:Record<string,string>;body?:string};
function backend(initial:Project,minimal=true){
 let stored:Project=JSON.parse(JSON.stringify(initial)),revision=1;const requests:Sent[]=[],etag=()=>`"rev-${revision}"`;
 const reply=(data:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
 const copies=new Map<string,Project>();
 const fetch=async(url:string,init:RequestInit={})=>{const path=url.replace(/^\/api/,''),method=init.method??'GET',headers=(init.headers??{}) as Record<string,string>,body=init.body as string|undefined;requests.push({method,path,headers,body});
  if(path==='/projects'&&method==='GET')return reply([...copies.values()]);
  if(path==='/projects'&&method==='POST'){const p=createProject(JSON.parse(body!).name);copies.set(p.id,p);return reply(p,200,{ETag:'\"copy\"'});}
  const copy=copies.get(path.split('/')[2]);if(copy){if(method==='PUT'){const next=JSON.parse(body!) as Project;copies.set(copy.id,next);return reply(next,200,{ETag:'\"copy-saved\"'});}return reply(copy,200,{ETag:'\"copy\"'});}
  if(path==='/health')return reply({ffmpeg:true,ffprobe:true,hardwareEncode:false,transcription:{local:false,providers:[]},version:'0.1.0'});
  if(path===`/projects/${initial.id}`&&method==='GET')return reply(stored,200,{ETag:etag()});
  if(path===`/projects/${initial.id}`&&method==='PUT'){if(headers['If-Match']!==etag())return reply({error:'This project changed.'},409);const sent=JSON.parse(body!) as Project,updatedAt=`2026-10-13T12:00:${String(revision).padStart(2,'0')}.000Z`;stored={...sent,updatedAt};revision++;return minimal&&headers.Prefer==='return=minimal'?reply({minimal:true,id:sent.id,updatedAt},200,{ETag:etag()}):reply(stored,200,{ETag:etag()});}
  return reply({error:'Not found'},404);};
 return {fetch,requests,puts:()=>requests.filter(r=>r.method==='PUT'),get stored(){return stored;},external(change:(p:Project)=>void){stored=JSON.parse(JSON.stringify(stored));change(stored);revision++;return etag();}};
}
async function mount(initial:Project,minimal=true){
 const server=backend(initial,minimal);globalThis.fetch=server.fetch as typeof fetch;
 const [{createRoot},{useStudio}]=await Promise.all([import('react-dom/client'),import('./useStudio')]);
 let studio!:ReturnType<typeof useStudio>;function Probe(){studio=useStudio();return null;}
 const root=createRoot(container as unknown as Element);await act(async()=>{root.render(createElement(Probe));});await act(async()=>{await studio.open(initial.id);});
 return {server,get studio(){return studio;},unmount:()=>act(async()=>{root.unmount();})};
}
const wait=(ms:number)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
const project=()=>{const p=createProject('Studio');p.clips=[{id:'clip',mediaId:'media',name:'Clip',track:'screen',start:0,sourceIn:0,sourceOut:5,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}];return p;};

test('autosave serializes once, adopts a minimal reply and keeps nested objects',async()=>{
 const app=await mount(project()),opened=app.studio.project!;
 assert.equal(app.studio.saveState,'Saved locally');assert.equal(app.server.requests.filter(r=>r.method==='GET'&&r.path.startsWith('/projects/')).length,1);
 await act(async()=>{app.studio.change(p=>{p.canvas.padding=10;});});
 const edited=app.studio.project!;assert.equal(app.studio.saveState,'Saving…');assert.equal(edited.clips,opened.clips);assert.notEqual(edited.canvas,opened.canvas);
 await wait(800);
 const [put]=app.server.puts();assert.equal(app.server.puts().length,1);assert.equal(put.headers.Prefer,'return=minimal');assert.equal(put.headers['If-Match'],'"rev-1"');assert.equal(put.body,JSON.stringify(edited));
 const saved=app.studio.project!;assert.equal(saved.clips,edited.clips);assert.equal(saved.updatedAt,app.server.stored.updatedAt);assert.equal(JSON.stringify(saved),JSON.stringify(app.server.stored),'the local copy matches the saved file byte for byte');assert.equal(app.studio.saveState,'Saved locally');
 let flushed:Project|undefined;await act(async()=>{flushed=await app.studio.flush();});assert.equal(flushed,saved);assert.equal(app.server.puts().length,1,'a clean flush sends nothing');
 await act(async()=>{app.studio.change(p=>{p.name='Again';});});await wait(800);assert.equal(app.server.puts()[1].headers['If-Match'],'"rev-2"','the next save uses the returned ETag');
 await app.unmount();
});

test('a gesture is one undo step, and undoing to the saved state needs no save',async()=>{
 const app=await mount(project()),opened=app.studio.project!;
 await act(async()=>{for(const value of [10,20,30])app.studio.change(p=>{p.canvas.padding=value;},{coalesce:'padding'});});
 assert.equal(app.studio.project!.canvas.padding,30);assert.equal(app.studio.canUndo,true);
 await act(async()=>{app.studio.undo();});assert.equal(app.studio.project,opened);assert.equal(app.studio.canUndo,false);assert.equal(app.studio.canRedo,true);assert.equal(app.studio.saveState,'Saved locally');
 await wait(800);assert.equal(app.server.puts().length,0);
 await act(async()=>{app.studio.redo();});assert.equal(app.studio.project!.canvas.padding,30);await act(async()=>{app.studio.change(p=>{p.canvas.padding=40;},{coalesce:'padding'});});
 await act(async()=>{app.studio.undo();});assert.equal(app.studio.project!.canvas.padding,30,'redo closed the gesture');
 await app.unmount();
});

test('a full save reply is adopted as before',async()=>{
 const app=await mount(project(),false);await act(async()=>{app.studio.change(p=>{p.notes='Full reply';});});await wait(800);
 assert.equal(app.studio.project!.notes,'Full reply');assert.notEqual(app.studio.project!.clips,project().clips);assert.deepEqual(app.studio.project,app.server.stored);assert.equal(app.studio.saveState,'Saved locally');
 await app.unmount();
});

test('external saves refresh a clean project and pause autosave for local edits',async()=>{
 const app=await mount(project()),source=FakeSource.last!;
 const send=(revision:string)=>act(async()=>{source.dispatchEvent(new MessageEvent('project',{data:JSON.stringify({id:app.studio.project!.id,revision,action:'saved'})}));});
 await send(app.server.external(p=>{p.name='Changed by the assistant';}));await wait(50);
 assert.equal(app.studio.project!.name,'Changed by the assistant');assert.equal(app.studio.conflicted,false);
 await act(async()=>{app.studio.change(p=>{p.notes='Local edit';});});
 await send(app.server.external(p=>{p.name='Changed again';}));await wait(50);
 assert.equal(app.studio.conflicted,true);assert.equal(app.studio.project!.notes,'Local edit');assert.equal(app.studio.saveState,'Conflict · local edits kept');
 await app.unmount();
});

test('deferred text commits before saves and history steps',async()=>{
 const app=await mount(project()),{registerPendingEdit}=await import('./useStudio');
 let text:string|null='Typed but not committed';const stop=registerPendingEdit(()=>{if(text===null)return;const value=text;text=null;app.studio.change(p=>{p.notes=value;});});
 let flushed:Project|undefined;await act(async()=>{flushed=await app.studio.flush();});
 assert.equal(flushed!.notes,'Typed but not committed');assert.equal(app.server.puts().length,1);assert.equal(JSON.parse(app.server.puts()[0].body!).notes,'Typed but not committed');
 text='More typing';await act(async()=>{app.studio.undo();});assert.equal(app.studio.project!.notes,'Typed but not committed','undo reverts the text that was still pending');
 stop();await app.unmount();
});

test('our own save echo leaves text being typed alone; other changes commit it first',async()=>{
 const app=await mount(project()),source=FakeSource.last!,{registerPendingEdit}=await import('./useStudio');
 await act(async()=>{app.studio.change(p=>{p.notes='Saved';});});await wait(800);assert.equal(app.server.puts().length,1);
 let commits=0,text:string|null='Typed';const stop=registerPendingEdit(()=>{commits++;if(text===null)return;const value=text;text=null;app.studio.change(p=>{p.name=value;});});
 const send=(revision:string)=>act(async()=>{source.dispatchEvent(new MessageEvent('project',{data:JSON.stringify({id:app.studio.project!.id,revision,action:'saved'})}));});
 await send('"rev-2"');await wait(50);assert.equal(commits,0,'the echo of our save does not commit pending text');assert.equal(app.studio.saveState,'Saved locally');
 await send(app.server.external(p=>{p.notes='Changed by the assistant';}));await wait(50);
 assert.ok(commits>0);assert.equal(app.studio.project!.name,'Typed');assert.equal(app.studio.conflicted,true,'pending text counts as an unsaved edit');
 stop();await app.unmount();
});

test('a server change (a companion card) saves pending edits first, becomes one undo step, and its own echo is not a conflict',async()=>{
 const app=await mount(project()),source=FakeSource.last!;
 await act(async()=>{app.studio.change(p=>{p.name='Typed';});});
 let seen='';
 await act(async()=>{await app.studio.commitServer(async revision=>{
  seen=revision;
  // The server saves the card's change; its event arrives before the reply does.
  const echo=app.server.external(p=>{p.clips[0].sourceOut=3;});
  source.dispatchEvent(new MessageEvent('project',{data:JSON.stringify({id:app.studio.project!.id,revision:echo,action:'saved'})}));
  return {project:JSON.parse(JSON.stringify(app.server.stored)) as Project,revision:echo.replaceAll('"','')};
 });});
 await wait(20);
 assert.equal(seen,'rev-2','the pending name was saved first, and the card was sent that revision');
 assert.equal(app.studio.project!.clips[0].sourceOut,3,'the card is on screen');
 assert.equal(app.studio.conflicted,false,'its own save is not taken for someone else\'s');
 assert.equal(app.studio.canUndo,true);
 await act(async()=>{app.studio.undo();});
 assert.equal(app.studio.project!.clips[0].sourceOut,5,'the editor\'s Undo takes the card back');
 assert.equal(app.studio.project!.name,'Typed','and only the card');
 await wait(800);
 assert.equal(app.server.stored.clips[0].sourceOut,5,'saved on the card\'s revision');
 assert.equal(app.studio.conflicted,false);
 await act(async()=>{app.studio.redo();});
 assert.equal(app.studio.project!.clips[0].sourceOut,3);
 await app.unmount();
});

test('an edit made while a server change is applied is replayed onto it: both are kept and saved, each its own undo step',async()=>{
 const app=await mount(project()),source=FakeSource.last!;
 await act(async()=>{await app.studio.commitServer(async()=>{
  const echo=app.server.external(p=>{p.clips[0].sourceOut=3;});
  source.dispatchEvent(new MessageEvent('project',{data:JSON.stringify({id:app.studio.project!.id,revision:echo,action:'saved'})}));
  // The person presses a key while the card is being applied: the edit lands on the version without the card.
  app.studio.change(p=>{p.name='Renamed meanwhile';});
  app.studio.undo();// Undo waits until the card is in.
  return {project:JSON.parse(JSON.stringify(app.server.stored)) as Project,revision:echo.replaceAll('"','')};
 });});
 assert.equal(app.studio.project!.clips[0].sourceOut,3,'the card is kept');
 assert.equal(app.studio.project!.name,'Renamed meanwhile','and so is the edit');
 assert.equal(app.studio.conflicted,false,'saving is not paused');
 await wait(800);
 assert.equal(app.server.stored.name,'Renamed meanwhile','the edit is saved on top of the card');
 assert.equal(app.server.stored.clips[0].sourceOut,3);
 await act(async()=>{app.studio.undo();});
 assert.deepEqual([app.studio.project!.name,app.studio.project!.clips[0].sourceOut],['Studio',3],'Undo takes the edit back first');
 await act(async()=>{app.studio.undo();});
 assert.deepEqual([app.studio.project!.name,app.studio.project!.clips[0].sourceOut],['Studio',5],'then the card');
 // Another window changing the project while there are unsaved edits still pauses saving and says so.
 await act(async()=>{app.studio.change(p=>{p.name='Mine';});});
 const other=app.server.external(p=>{p.name='Theirs';});
 await act(async()=>{source.dispatchEvent(new MessageEvent('project',{data:JSON.stringify({id:app.studio.project!.id,revision:other,action:'saved'})}));});
 await wait(50);
 assert.equal(app.studio.conflicted,true,'a real conflict still shows the banner');
 await app.unmount();
});

const linkedProject=()=>{
 const p=project();p.clips=[];
 for(const track of ['screen','camera','audio'] as const){
  const mediaId=`${track}-media`;
  p.media.push({id:mediaId,name:track,path:`/tmp/${track}.webm`,kind:track==='audio'?'audio':'video',duration:10,width:1920,height:1080,hasAudio:track==='audio'});
  p.clips.push({id:track,mediaId,name:track,track,start:0,sourceIn:0,sourceOut:10,speed:1,gain:1,muted:false,linkId:'take',recordingTakeId:'take',transform:defaultTransform(),effects:defaultEffects()});
 }
 p.scenes[0].duration=10;return p;
};
const generatedCaption=()=>({id:'auto-spoken',text:'before after',start:1,end:9,words:[{text:'before',start:2,end:3},{text:'after',start:7,end:8}]});

test('caption automation merges into an unsaved split and linked reorder, keeping one undo step per gesture',async()=>{
 const {splitLinked,linkedIds,planClipMove,applyClipStarts}=await import('./timeline-edit');
 const app=await mount(linkedProject()),source=FakeSource.last!;
 await act(async()=>{app.studio.change(p=>{splitLinked(p,5,new Set(['audio']));});});
 const right=app.studio.project!.clips.find(c=>c.track==='audio'&&c.start===5)!;
 await act(async()=>{app.studio.change(p=>{
  const ids=linkedIds(p.clips,[right.id]),move=planClipMove(p,ids,-5,0);
  applyClipStarts(p,move.starts);
 });});
 const positions=app.studio.project!.clips.map(c=>[c.id,c.start]);
 const revision=app.server.external(p=>{p.captions=[generatedCaption()];});
 await act(async()=>{source.dispatchEvent(new MessageEvent('project',{data:JSON.stringify({id:app.studio.project!.id,revision,action:'saved',source:'automatic-captions'})}));});
 await wait(50);
 assert.equal(app.studio.conflicted,false);assert.equal(app.studio.error,'');
 assert.deepEqual(app.studio.project!.clips.map(c=>[c.id,c.start]),positions,'automation never replaces local placement');
 const words=app.studio.project!.captions.flatMap(c=>c.words??[]).sort((a,b)=>a.start-b.start);
 assert.deepEqual(words.map(w=>[w.text,w.start,w.end]),[['after',2,3],['before',7,8]],'words follow source audio through the unsaved split and reorder');
 await act(async()=>{app.studio.undo();});
 assert.deepEqual(app.studio.project!.captions.flatMap(c=>c.words??[]).map(w=>[w.text,w.start]),[['before',2],['after',7]],'undo reverses only the drag, retaining generated captions');
 assert.equal(app.studio.project!.clips.length,6,'the split is still present');
 await act(async()=>{app.studio.undo();});
 assert.equal(app.studio.project!.clips.length,3);assert.equal(app.studio.canUndo,false,'automation added no extra undo step');
 assert.equal(app.studio.project!.captions.length,1,'the unsplit state also received the transcript');
 await act(async()=>{app.studio.redo();app.studio.redo();await app.studio.flush();});
 assert.equal(app.studio.conflicted,false);assert.equal(app.server.stored.clips.length,6);assert.equal(app.server.stored.captions.length,2);
 await app.unmount();
});

test('a captions-only write winning autosave before its event is merged and retried without a conflict',async()=>{
 const app=await mount(linkedProject());
 await act(async()=>{app.studio.change(p=>{p.name='My unsaved edit';});});
 app.server.external(p=>{p.captions=[generatedCaption()];});
 await act(async()=>{await app.studio.flush();});
 assert.equal(app.server.puts().length,2,'the stale revision is retried on the caption revision');
 assert.equal(app.studio.conflicted,false);assert.equal(app.studio.error,'');
 assert.equal(app.server.stored.name,'My unsaved edit');assert.equal(app.server.stored.captions[0].text,'before after');
 await act(async()=>{app.studio.undo();});assert.equal(app.studio.project!.name,'Studio');assert.equal(app.studio.project!.captions[0].text,'before after');assert.equal(app.studio.canUndo,false);
 await app.unmount();
});

test('three caption-only races in a row reject flush quietly, then autosave saves the edit',async()=>{
 const app=await mount(linkedProject());const {CaptionSaveRetry}=await import('./useStudio');
 const real=globalThis.fetch;let races=0;
 globalThis.fetch=(async(url:string,init:RequestInit={})=>{if((init.method??'GET')==='PUT'&&races<3){races++;app.server.external(p=>{p.captions=[{...generatedCaption(),text:`take ${races}`}];});}return real(url,init);}) as typeof fetch;
 try{
  await act(async()=>{app.studio.change(p=>{p.name='Edited during transcription';});});
  await act(async()=>{await assert.rejects(app.studio.flush(),(error:unknown)=>error instanceof CaptionSaveRetry);});
  assert.equal(app.studio.error,'');assert.equal(app.studio.conflicted,false);assert.notEqual(app.server.stored.name,'Edited during transcription','not reported as saved');
  await wait(1000);
  assert.equal(app.server.stored.name,'Edited during transcription','autosave retries and saves it');assert.equal(app.studio.error,'');
 }finally{globalThis.fetch=real;await app.unmount();}
});

test('a genuine external edit winning autosave keeps local work and reports a calm conflict',async()=>{
 const app=await mount(project());
 await act(async()=>{app.studio.change(p=>{p.notes='My local notes';});});
 app.server.external(p=>{p.name='Another window';});
 await act(async()=>{await assert.rejects(app.studio.flush(),/Your local edits are kept/);});
 assert.equal(app.studio.conflicted,true);assert.equal(app.studio.project!.notes,'My local notes');assert.equal(app.server.stored.name,'Another window');
 await app.unmount();
});

test('editing continues while a caption conflict is fetched; newer edits survive the retry',async()=>{
 const app=await mount(linkedProject());
 await act(async()=>{app.studio.change(p=>{p.name='First edit';});});
 app.server.external(p=>{p.captions=[generatedCaption()];});
 let release!:()=>void,entered!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;}),fetching=new Promise<void>(resolve=>{entered=resolve;});
 let hold=true;
 globalThis.fetch=(async(url:string,init:RequestInit={})=>{
  const response=await app.server.fetch(url,init);
  if(hold&&url===`/api/projects/${app.studio.project!.id}`&&(init.method??'GET')==='GET'){hold=false;entered();await held;}
  return response;
 }) as typeof fetch;
 let saving!:Promise<Project|undefined>;
 await act(async()=>{saving=app.studio.flush();await fetching;});
 await act(async()=>{app.studio.change(p=>{p.notes='Typed while captions arrived';});release();await saving;});
 assert.equal(app.studio.project!.notes,'Typed while captions arrived');assert.equal(app.studio.conflicted,false);
 assert.equal(app.studio.project!.captions[0].text,'before after');
 await act(async()=>{await app.studio.flush();});
 assert.equal(app.server.stored.notes,'Typed while captions arrived');assert.equal(app.server.stored.name,'First edit');
 await act(async()=>{app.studio.undo();});assert.equal(app.studio.project!.notes,'');assert.equal(app.studio.project!.name,'First edit');assert.equal(app.studio.project!.captions[0].text,'before after');
 await app.unmount();
});

test('a caption event queued during the initial save of a companion edit rebases its session snapshot',async()=>{
 const app=await mount(linkedProject()),source=FakeSource.last!;
 await act(async()=>{app.studio.change(p=>{p.name='My name';});});
 let putEntered!:()=>void,releasePut!:()=>void,getEntered!:()=>void,releaseGet!:()=>void;
 const putStarted=new Promise<void>(r=>{putEntered=r;}),putGate=new Promise<void>(r=>{releasePut=r;});
 const getStarted=new Promise<void>(r=>{getEntered=r;}),getGate=new Promise<void>(r=>{releaseGet=r;});
 let firstPut=true,firstGet=true;
 globalThis.fetch=(async(url:string,init:RequestInit={})=>{
  const response=await app.server.fetch(url,init);
  if(url===`/api/projects/${app.studio.project!.id}`){
   if(firstPut&&init.method==='PUT'){firstPut=false;putEntered();await putGate;}
   else if(firstGet&&(init.method??'GET')==='GET'){firstGet=false;getEntered();await getGate;}
  }
  return response;
 }) as typeof fetch;
 let operation!:Promise<unknown>,seen='';
 await act(async()=>{
  operation=app.studio.commitServer(async revision=>{
   seen=revision;const echo=app.server.external(p=>{p.canvas.padding=20;});
   return {project:structuredClone(app.server.stored),revision:echo.replaceAll('"','')};
  });
  await putStarted;
 });
 await act(async()=>{
  const revision=app.server.external(p=>{p.captions=[generatedCaption()];});
  source.dispatchEvent(new MessageEvent('project',{data:JSON.stringify({id:app.studio.project!.id,revision,action:'saved',source:'automatic-captions'})}));
  // Let the event enqueue behind the held save before the save and companion proceed.
  await Promise.resolve();releasePut();await getStarted;
 });
 await act(async()=>{releaseGet();await operation;});
 assert.equal(seen,'rev-3');assert.equal(app.studio.conflicted,false,'caption enrichment does not look like an untracked edit during the companion operation');
 assert.equal(app.studio.project!.canvas.padding,20);assert.equal(app.studio.project!.name,'My name');assert.equal(app.studio.project!.captions[0].text,'before after');
 await act(async()=>{app.studio.undo();});
 assert.equal(app.studio.project!.canvas.padding,48,'undo reverts the companion card');assert.equal(app.studio.project!.name,'My name');assert.equal(app.studio.project!.captions[0].text,'before after');
 await app.unmount();
});

test('a flush captured during a companion operation saves the replayed edit, never its superseded snapshot',async()=>{
 const app=await mount(linkedProject());let queued!:Promise<Project|undefined>;
 await act(async()=>{await app.studio.commitServer(async()=>{
  const revision=app.server.external(p=>{p.canvas.padding=20;});
  const next=structuredClone(app.server.stored);
  app.studio.change(p=>{p.notes='Typed during companion edit';});
  queued=app.studio.flush();
  return {project:next,revision:revision.replaceAll('"','')};
 });await queued;});
 assert.equal(app.server.puts().length,1);
 assert.equal(app.server.stored.canvas.padding,20,'the captured old timeline cannot replace the companion change');
 assert.equal(app.server.stored.notes,'Typed during companion edit');assert.equal(app.studio.conflicted,false);
 await act(async()=>{app.studio.undo();});assert.equal(app.studio.project!.notes,'');assert.equal(app.studio.project!.canvas.padding,20);
 await act(async()=>{app.studio.undo();});assert.equal(app.studio.project!.canvas.padding,48);assert.equal(app.studio.canUndo,false);
 await app.unmount();
});

test('rejected edits create no history or save; toast undo cannot undo a newer change',async()=>{
 const app=await mount(project()),before=app.studio.project;
 try{await act(async()=>app.studio.change(()=>{}));assert.equal(app.studio.project,before);assert.equal(app.studio.canUndo,false);
  let undo!:()=>void;await act(async()=>{app.studio.change(p=>{p.notes='cut';});undo=app.studio.undoLatest();app.studio.change(p=>{p.name='newer';});undo();});assert.equal(app.studio.project!.name,'newer');assert.equal(app.studio.project!.notes,'cut');
 }finally{await app.unmount();}
});
test('server operation disables undo while pending and replays each edit as its own undo step',async()=>{
 const app=await mount(project());let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let pending!:Promise<unknown>;
 try{await act(async()=>{pending=app.studio.commitServer(async()=>{await gate;const revision=app.server.external(p=>{p.notes='server';});return {project:structuredClone(app.server.stored),revision};});});
  await act(async()=>{app.studio.change(p=>{p.name='first';});app.studio.change(p=>{p.canvas.padding=12;});});assert.equal(app.studio.canUndo,false);
  await act(async()=>{release();await pending;});assert.equal(app.studio.canUndo,true);
  await act(async()=>app.studio.undo());assert.equal(app.studio.project!.canvas.padding,48);assert.equal(app.studio.project!.name,'first');
  await act(async()=>app.studio.undo());assert.equal(app.studio.project!.name,'Studio');assert.equal(app.studio.project!.notes,'server');
  await act(async()=>app.studio.undo());assert.equal(app.studio.project!.notes,'');
 }finally{await app.unmount();}
});
test('conflicted flushes refuse; only explicit repeated copy actions make one copy and preserve the video attachment',async()=>{
 const app=await mount(project()),id=app.studio.project!.id;
 try{await act(async()=>app.studio.change(p=>{p.notes='local';}));const revision=app.server.external(p=>{p.name='other window';});
  await act(async()=>FakeSource.last!.dispatchEvent(new MessageEvent('project',{data:JSON.stringify({id,revision,action:'saved'})})));await wait(20);
  await act(async()=>app.studio.change(p=>{p.notes='newer local';}));assert.equal(app.studio.saveState,'Conflict · local edits kept');
  await act(async()=>{for(let i=0;i<3;i++)await assert.rejects(app.studio.flush(),/Keep my edits as a copy/);});assert.equal(app.server.requests.filter(r=>r.method==='POST').length,0);
  await act(async()=>Promise.all([app.studio.keepAsCopy(),app.studio.keepAsCopy()]));assert.equal(app.studio.project!.id,id);assert.equal(app.studio.project!.notes,'');assert.equal(app.studio.conflicted,false);const copy=app.server.puts().find(r=>r.path!==`/projects/${id}`);assert.equal(JSON.parse(copy!.body!).notes,'newer local');
  assert.equal(app.server.stored.name,'other window');assert.equal(app.server.stored.notes,'');assert.equal(app.server.requests.filter(r=>r.path==='/projects'&&r.method==='POST').length,1);assert.match(app.studio.error,/recovered project copy/);
  await act(async()=>app.studio.close());assert.equal(app.studio.project,null);
 }finally{await app.unmount();}
});
test('a transient autosave failure retries without another edit',async()=>{
 const app=await mount(project()),fetch=globalThis.fetch;let failures=1;
 globalThis.fetch=(async(url,init)=>{if(init?.method==='PUT'&&failures-->0)throw new TypeError('temporarily offline');return fetch(url,init);}) as typeof fetch;
 try{await act(async()=>app.studio.change(p=>{p.notes='retry me';}));await wait(800);assert.equal(app.studio.saveState,'Save failed');await wait(1150);assert.equal(app.studio.saveState,'Saved locally');assert.equal(app.server.stored.notes,'retry me');}
 finally{globalThis.fetch=fetch;await app.unmount();}
});
test('load freezes legacy links before the first edit, including solitary legacy slices',async()=>{
 const legacy=linkedProject();for(const c of legacy.clips)delete c.linkId;legacy.clips.push({...legacy.clips[0],id:'single',start:10,sourceIn:0,sourceOut:2});
 const app=await mount(legacy);
 try{assert.equal(app.studio.saveState,'Saved locally');await wait(800);assert.equal(app.server.puts().length,0,'normalization on open never saves');await act(async()=>{await app.studio.flush();});assert.equal(app.server.puts().length,0,'clean flush never persists normalization');const links=app.studio.project!.clips.map(c=>c.linkId);assert.ok(links.every(Boolean));assert.equal(links[0],links[1]);assert.notEqual(links[0],links[3]);await act(async()=>app.studio.change(p=>{p.clips[3].start=5;}));assert.deepEqual(app.studio.project!.clips.map(c=>c.linkId),links);}
 finally{await app.unmount();}
});
test('failed exit save journals the latest project and reopening recovers it without replacing the server',async()=>{
 const originalStorage=globalThis.localStorage,values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
 const initial=project();let app=await mount(initial);const fetch=globalThis.fetch;
 try{await act(async()=>app.studio.change(p=>{p.notes='survive exit';}));globalThis.fetch=(async(url,init)=>{if(init?.method==='PUT')throw Error('offline');return fetch(url,init);}) as typeof fetch;
  await act(async()=>{await assert.rejects(app.studio.flush(),/offline/);assert.equal(app.studio.keepRecovery(),true);});await app.unmount();app=await mount(initial);assert.equal(app.studio.project!.notes,'survive exit');assert.equal(app.studio.conflicted,false);assert.equal(app.server.stored.notes,'');assert.equal(app.studio.saveState,'Saving…');await wait(800);assert.equal(app.server.stored.notes,'survive exit');
 }finally{await app.unmount();globalThis.fetch=fetch;Object.defineProperty(globalThis,'localStorage',{configurable:true,value:originalStorage});}
});

test('a toast for a rejected edit cannot undo the previous edit; a successful edit stays undoable after its save acknowledgement',async()=>{
 const app=await mount(project());try{let undo!:()=>void;await act(async()=>{app.studio.change(p=>{p.notes='prior';});});await act(async()=>{const before=app.studio.project;app.studio.change(()=>{});undo=app.studio.undoLatest(before);undo();});assert.equal(app.studio.project!.notes,'prior');
  await act(async()=>{const before=app.studio.project;app.studio.change(p=>{p.notes='cut';});undo=app.studio.undoLatest(before);await app.studio.flush();undo();});assert.equal(app.studio.project!.notes,'prior');
 }finally{await app.unmount();}
});

function journalStorage(){const original=globalThis.localStorage,values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});return {values,restore:()=>Object.defineProperty(globalThis,'localStorage',{configurable:true,value:original})};}
test('conflict reload confirms discard, never writes a copy, and leaving preserves the original base revision',async()=>{
 const storage=journalStorage(),app=await mount(project()),id=app.studio.project!.id,originalConfirm=window.confirm;let confirms=0;
 try{await act(async()=>app.studio.change(p=>{p.notes='local';}));app.server.external(p=>{p.name='server';});await act(async()=>assert.rejects(app.studio.flush(),/updates from another window/));
  await act(async()=>app.studio.close());assert.equal(app.studio.project,null);assert.equal(app.server.requests.filter(r=>r.method==='POST').length,0);
  await act(async()=>app.studio.open(id));assert.equal(app.studio.conflicted,true);assert.equal(app.studio.project!.notes,'local');await act(async()=>app.studio.close());await act(async()=>app.studio.open(id));assert.equal(app.studio.conflicted,true,'leaving twice cannot turn a real conflict into an autosave');
  window.confirm=()=>{confirms++;return false;};await act(async()=>app.studio.reload());assert.equal(app.studio.project!.notes,'local');assert.equal(app.studio.conflicted,true);
  window.confirm=()=>{confirms++;return true;};await act(async()=>app.studio.reload());assert.equal(confirms,2);assert.equal(app.studio.project!.name,'server');assert.equal(app.studio.project!.notes,'');assert.equal(app.studio.conflicted,false);assert.equal(storage.values.size,0);assert.equal(app.server.requests.filter(r=>r.method==='POST').length,0);
 }finally{window.confirm=originalConfirm;await app.unmount();storage.restore();}
});
test('healthy flushes do not journal; undo to saved clears a failed save journal',async()=>{
 const storage=journalStorage(),app=await mount(project()),real=globalThis.fetch;
 try{await act(async()=>app.studio.change(p=>{p.notes='healthy';}));await act(async()=>app.studio.flush());assert.equal(storage.values.size,0);await act(async()=>app.studio.change(p=>{p.notes='failed';}));globalThis.fetch=async()=>{throw Error('offline');};await act(async()=>assert.rejects(app.studio.flush(),/offline/));assert.equal(storage.values.size,1);await act(async()=>app.studio.undo());await act(async()=>app.studio.flush());assert.equal(storage.values.size,0);
 }finally{globalThis.fetch=real;await app.unmount();storage.restore();}
});
test('successful PUT resets retry even if another edit arrived while saving',async()=>{
 const app=await mount(project()),real=globalThis.fetch;let failures=4,hold=false,release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),entered=new Promise<void>(resolve=>started=resolve);
 globalThis.fetch=(async(url,init)=>{if(init?.method==='PUT'){if(failures-->0)throw Error('offline');if(hold){hold=false;started();await gate;}}return real(url,init);}) as typeof fetch;
 try{await act(async()=>app.studio.change(p=>{p.notes='first';}));for(let i=0;i<4;i++)await act(async()=>assert.rejects(app.studio.flush(),/offline/));hold=true;let saving!:Promise<unknown>;await act(async()=>{saving=app.studio.flush();await entered;});await act(async()=>{app.studio.change(p=>{p.notes='newer';});release();await saving;});await wait(800);assert.equal(app.server.stored.notes,'newer','no old 8-second retry after success');assert.equal(app.studio.saveState,'Saved locally');
 }finally{globalThis.fetch=real;await app.unmount();}
});
test('copy retries reuse the created project after a failed PUT',async()=>{
 const storage=journalStorage(),app=await mount(project()),id=app.studio.project!.id,real=globalThis.fetch;let fail=true;
 try{await act(async()=>app.studio.change(p=>{p.notes='copy me';}));app.server.external(p=>{p.name='remote';});await act(async()=>assert.rejects(app.studio.flush()));globalThis.fetch=(async(url,init)=>{if(init?.method==='PUT'&&String(url)!==`/api/projects/${id}`&&fail){fail=false;throw Error('offline copy');}return real(url,init);}) as typeof fetch;
  await act(async()=>assert.rejects(app.studio.keepAsCopy(),/offline copy/));await act(async()=>app.studio.keepAsCopy());assert.equal(app.server.requests.filter(r=>r.method==='POST').length,1);assert.equal(app.studio.project!.id,id);assert.equal(app.studio.conflicted,false);
 }finally{globalThis.fetch=real;await app.unmount();storage.restore();}
});

test('reload invalidates an old local snapshot captured by a queued flush',async()=>{
 const storage=journalStorage(),app=await mount(project()),real=globalThis.fetch,confirm=window.confirm;let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),entered=new Promise<void>(resolve=>started=resolve);
 try{await act(async()=>app.studio.change(p=>{p.notes='discard';}));app.server.external(p=>{p.name='server';});await act(async()=>assert.rejects(app.studio.flush()));window.confirm=()=>true;
  globalThis.fetch=(async(url,init)=>{const response=await real(url,init);if((init?.method??'GET')==='GET'&&String(url)===`/api/projects/${app.studio.project!.id}`){started();await gate;}return response;}) as typeof fetch;
  let reloading!:Promise<void>,queued!:Promise<unknown>;await act(async()=>{reloading=app.studio.reload();await entered;queued=app.studio.flush();});await act(async()=>{release();await reloading;await queued;});assert.equal(app.studio.project!.notes,'');assert.equal(app.server.stored.notes,'');assert.equal(app.server.puts().length,1,'only the initial rejected stale PUT');
 }finally{window.confirm=confirm;globalThis.fetch=real;await app.unmount();storage.restore();}
});
test('a save completing after unmount preserves newer unsaved edits with the acknowledged base',async()=>{
 const storage=journalStorage(),app=await mount(project()),real=globalThis.fetch;let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),entered=new Promise<void>(resolve=>started=resolve);
 globalThis.fetch=(async(url,init)=>{if(init?.method==='PUT'){started();await gate;}return real(url,init);}) as typeof fetch;
 try{await act(async()=>app.studio.change(p=>{p.notes='sent';}));let saving!:Promise<unknown>;await act(async()=>{saving=app.studio.flush();await entered;});await act(async()=>app.studio.change(p=>{p.notes='newer at exit';}));await app.unmount();assert.equal(storage.values.size,1);release();await saving;const journal=JSON.parse([...storage.values.values()][0]);assert.equal(journal.project.notes,'newer at exit');assert.equal(journal.baseRevision,'"rev-2"');assert.equal(app.server.stored.notes,'sent');
 }finally{globalThis.fetch=real;storage.restore();}
});

test('legacy normalization is deterministic on repeated adoption and persists only with a real edit',async()=>{
 const legacy=linkedProject();for(const clip of legacy.clips)delete clip.linkId;const app=await mount(legacy);
 try{const links=app.studio.project!.clips.map(c=>c.linkId);await act(async()=>app.studio.select(structuredClone(legacy),'"rev-1"'));assert.deepEqual(app.studio.project!.clips.map(c=>c.linkId),links);assert.equal(app.studio.saveState,'Saved locally');await wait(800);assert.equal(app.server.puts().length,0);
  await act(async()=>app.studio.change(p=>{p.notes='Real edit';}));await act(async()=>{await app.studio.flush();});assert.equal(app.server.puts().length,1);assert.deepEqual(app.server.stored.clips.map(c=>c.linkId),links);
 }finally{await app.unmount();}
});
test('Claude edit lock commits pending text, refuses changes and history, and leaves save, export flush and close free',async()=>{
 const app=await mount(project()),{registerPendingEdit}=await import('./useStudio');let pending=true;const stop=registerPendingEdit(()=>{if(pending){pending=false;app.studio.change(p=>{p.notes='Before Claude';});}});
 try{await act(async()=>app.studio.setChatEditing(app.studio.project!.id,true));await act(async()=>{app.studio.change(p=>{p.name='Refused';});app.studio.undo();});assert.equal(app.studio.project!.notes,'Before Claude');assert.equal(app.studio.project!.name,'Studio');assert.match(app.studio.error,/Claude is editing this project/);
  await act(async()=>{await app.studio.flush();});assert.equal(app.server.stored.notes,'Before Claude');assert.equal(app.server.puts().length,1);await act(async()=>{await app.studio.flush();});assert.equal(app.server.puts().length,1);
  await act(async()=>app.studio.setChatEditing(app.studio.project!.id,false));await act(async()=>app.studio.change(p=>{p.name='Allowed';}));assert.equal(app.studio.project!.name,'Allowed');await act(async()=>app.studio.setChatEditing(app.studio.project!.id,true));await act(async()=>app.studio.close());assert.equal(app.studio.project,null);assert.equal(app.server.stored.name,'Allowed');
 }finally{stop();await app.unmount();}
});
test('save retries are restricted to network failures, 5xx, 408 and 429',async()=>{
 const {retryableSaveError}=await import('./useStudio'),{APIError}=await import('./api');for(const status of [408,429,500,503,599])assert.equal(retryableSaveError(new APIError('retry',status)),true);for(const status of [400,401,403,404,409,422,600])assert.equal(retryableSaveError(new APIError('stop',status)),false);assert.equal(retryableSaveError(new TypeError('Failed to fetch')),true);assert.equal(retryableSaveError(new Error('Bad save response')),false);
 const app=await mount(project()),fetch=globalThis.fetch;let attempts=0;globalThis.fetch=async(url,init)=>{if(init?.method==='PUT'){attempts++;return Response.json({error:'Project was trashed'},{status:404});}return fetch(url,init);};
 try{await act(async()=>app.studio.change(p=>{p.notes='Kept';}));await wait(800);assert.equal(app.studio.saveState,'Save failed');await wait(1200);assert.equal(attempts,1);assert.equal(app.studio.conflicted,false);assert.equal(app.studio.project!.notes,'Kept');}finally{globalThis.fetch=fetch;await app.unmount();}
});
test('a detached take for the open project goes through studio history and its save queue',async()=>{
 const app=await mount(project()),{saveRecordingTake}=await import('./recording-save');const p=app.studio.project!,take={id:'detached',createdAt:'2026-11-07',sceneId:p.scenes[0].id,media:[{id:'detached-media',path:'/take.mp4',name:'Take',kind:'video',duration:2,width:1280,height:720}],tracks:['screen'],offsets:[0]} as import('./recorded-takes').SavedTake;
 try{await act(async()=>app.studio.change(p=>{p.notes='Latest local edit';}));await act(async()=>saveRecordingTake(p.id,take));assert.equal(app.server.puts().length,1);assert.equal(app.server.stored.notes,'Latest local edit');assert.equal(app.studio.project!.recordedTakes?.[0].id,'detached');assert.equal(app.studio.conflicted,false);assert.equal(app.studio.canUndo,true);await act(async()=>app.studio.undo());assert.equal(app.studio.project!.recordedTakes?.length??0,0);}finally{await app.unmount();}
});

test('media service restart refreshes a clean project and retries a dirty save',async()=>{
 const events=new EventTarget(),add=window.addEventListener,remove=window.removeEventListener;window.addEventListener=events.addEventListener.bind(events);window.removeEventListener=events.removeEventListener.bind(events);const app=await mount(project()),fetch=globalThis.fetch;let fail=false;
 globalThis.fetch=async(url,init)=>fail&&init?.method==='PUT'?Response.json({error:'Service restarting'},{status:503}):fetch(url,init);
 try{app.server.external(p=>{p.name='Recovered service';});await act(async()=>events.dispatchEvent(new Event('sceneforge-media-service-ready')));await wait(20);assert.equal(app.studio.project!.name,'Recovered service');assert.equal(app.server.puts().length,0);
  fail=true;await act(async()=>app.studio.change(p=>{p.notes='Dirty before restart';}));await act(async()=>{await assert.rejects(app.studio.flush());});assert.equal(app.studio.saveState,'Save failed');fail=false;await act(async()=>events.dispatchEvent(new Event('sceneforge-media-service-ready')));await wait(20);assert.equal(app.server.stored.notes,'Dirty before restart');assert.equal(app.studio.saveState,'Saved locally');assert.equal(app.studio.conflicted,false);
 }finally{globalThis.fetch=fetch;await app.unmount();window.addEventListener=add;window.removeEventListener=remove;}
});

test('a permanent failure from an explicit flush also disables an already scheduled autosave',async()=>{
 const app=await mount(project()),fetch=globalThis.fetch;let attempts=0;globalThis.fetch=async(url,init)=>{if(init?.method==='PUT'){attempts++;return Response.json({error:'Invalid project'},{status:400});}return fetch(url,init);};
 try{await act(async()=>app.studio.change(p=>{p.notes='Keep locally';}));await act(async()=>assert.rejects(app.studio.flush()));await wait(800);assert.equal(attempts,1);assert.equal(app.studio.saveState,'Save failed');}finally{globalThis.fetch=fetch;await app.unmount();}
});
