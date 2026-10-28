import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Media,Project} from '../../../shared/types';
import {createProject} from '../../../shared/types';
import type {SavedTake} from '../../recorded-takes';
const {TakeReview}=await import('../../TakeReview');
const {Recording}=await import('../../Recording');
const {ClubRecorder}=await import('../ClubRecorder');
const {VideoScreen}=await import('../screens/VideoScreen');

// The take preview starts playing on open with a requestAnimationFrame loop; these tests check its choices, not playback.
globalThis.requestAnimationFrame=()=>0;
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const click=(element:Element)=>act(async()=>{element.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
const camera:Media={id:'m1',name:'cam',path:'/tmp/cam.mov',kind:'video',duration:7.4,width:10,height:10};
const screen:Media={id:'m2',name:'screen',path:'/tmp/screen.mov',kind:'video',duration:7.4,width:10,height:10};
const footerLabels=(root:Element)=>[...root.querySelectorAll('footer.club-take-footer button')].map(b=>b.textContent?.trim());
const footerButton=(root:Element,label:string)=>[...root.querySelectorAll('footer.club-take-footer button')].find(b=>b.textContent?.trim()===label)!;
const menuItems=(root:Element)=>[...root.querySelectorAll<HTMLButtonElement>('[role=menu][aria-label="Take options"] [role=menuitem]')];
/** A menu item's label, without its hint line. */
const itemLabel=(item:Element)=>item.firstChild?.textContent?.trim();
const openGear=(root:Element)=>click(root.querySelector('button[aria-label="Take options"]')!);

function takeFor(project:Project,overrides:Partial<SavedTake>={}):SavedTake{
 return {id:'t1',createdAt:'2026-10-02T00:00:00.000Z',sceneId:project.scenes[0].id,media:[screen,camera],tracks:['screen','camera'],offsets:[0,0],labels:['Screen (Display)','Camera (FaceTime)'],clipIds:['c1','c2'],...overrides};
}
function mountReview(project:Project,take:SavedTake,calls:string[],extra:Record<string,unknown>={}){
 return mountUI(createElement(TakeReview,{project,take,club:true,onConfirm:(destination:string,mode?:string)=>calls.push(`confirm:${destination}:${mode}`),onRetake:()=>calls.push('retake'),onClose:()=>calls.push('close'),onDelete:()=>calls.push('delete'),onUpdate:async()=>{calls.push('update');},...extra}));
}

test('the take preview shows the take name, a status badge and exactly three choices',async()=>{
 const project=createProject('Demo'),calls:string[]=[];
 const ui=await mountReview(project,takeFor(project),calls);
 try{
  const header=ui.container.querySelector('header.club-take-header')!;
  assert.equal(header.querySelector('h1')?.textContent,'Take 1');
  assert.ok(header.textContent?.includes('New take'),'an unused take is badged as new');
  assert.deepEqual(footerLabels(ui.container),['Delete take','Record another take','Continue']);
  assert.ok(footerButton(ui.container,'Continue').className.includes('bg-primary'),'Continue is the primary');
  assert.equal(ui.container.querySelectorAll('.take-source-select').length,0,'no hidden "Show in main preview" buttons on the sources');
  assert.ok(!ui.container.textContent?.includes('Use this take'),'the old confirm button is gone');
  await click(footerButton(ui.container,'Continue'));
  assert.deepEqual(calls,['confirm:record:replace-matching'],'Continue confirms the take the same way as before');
  await click(footerButton(ui.container,'Record another take'));
  assert.equal(calls.at(-1),'retake');
  await click(footerButton(ui.container,'Delete take'));
  assert.equal(calls.at(-1),'retake','Delete asks once more before acting');
  assert.equal(footerButton(ui.container,'Click again to delete')?.textContent,'Click again to delete');
  await click(footerButton(ui.container,'Click again to delete'));
  assert.equal(calls.at(-1),'delete');
 }finally{await ui.close();}
});

test('the gear holds archive, keep both, use and edit, the sources and sync, running the same actions',async()=>{
 const project=createProject('Demo');
 // An earlier clip in the scene makes this a take that matches earlier footage, so Keep both takes is offered.
 project.media=[camera];project.scenes[0].duration=5;
 project.clips=[{id:'old',mediaId:'m1',name:'cam',track:'camera',start:0,sourceIn:0,sourceOut:5,speed:1,gain:1,muted:false,transform:{x:0,y:0,scale:1,rotation:0,opacity:1} as never,effects:{} as never,recordingTakeId:'earlier'}];
 const calls:string[]=[];
 const ui=await mountReview(project,takeFor(project),calls);
 try{
  assert.equal(Boolean(ui.container.querySelector('[role=menu]')),false,'the gear menu starts closed');
  await openGear(ui.container);
  assert.deepEqual(menuItems(ui.container).map(itemLabel),['Archive take','Keep both takes','Replace and edit','Show Camera (FaceTime) in main preview','Rename and adjust sync']);
  const pick=async(label:string)=>{await openGear(ui.container);if(!menuItems(ui.container).length)await openGear(ui.container);await click(menuItems(ui.container).find(item=>itemLabel(item)===label)!);};
  await pick('Keep both takes');assert.equal(calls.at(-1),'confirm:record:keep-both');
  await pick('Replace and edit');assert.equal(calls.at(-1),'confirm:edit:replace-matching');
  await pick('Archive take');assert.equal(calls.at(-1),'close','archive keeps the take off the timeline, as before');
  await pick('Show Camera (FaceTime) in main preview');
  assert.equal(ui.container.querySelector('.take-main-source [aria-label="Camera (FaceTime)"]')?.tagName,'SECTION','the camera moves to the main preview');
  await pick('Rename and adjust sync');
  assert.ok(ui.container.querySelector('form.take-settings'),'the existing take settings open');
  assert.ok(button(ui.container,'Reset sync'));
  assert.deepEqual(footerLabels(ui.container),['Delete take','Record another take','Continue'],'the bottom still has only the three choices');
 }finally{await ui.close();}
});

test('a take recorded over earlier footage offers Replace earlier take in the gear; a confirmed take only Continue closes',async()=>{
 const project=createProject('Demo');
 project.media=[camera];project.scenes[0].duration=5;
 project.clips=[{id:'old',mediaId:'m1',name:'cam',track:'camera',start:0,sourceIn:0,sourceOut:5,speed:1,gain:1,muted:false,transform:{} as never,effects:{} as never,recordingTakeId:'earlier'}];
 const calls:string[]=[];
 const over=await mountReview(project,takeFor(project,{recordOver:true}),calls);
 try{
  await openGear(over.container);
  assert.ok(menuItems(over.container).map(itemLabel).includes('Replace earlier take'));
  await click(menuItems(over.container).find(item=>itemLabel(item)==='Replace earlier take')!);
  assert.equal(calls.at(-1),'confirm:record:replace-matching');
  await click(footerButton(over.container,'Continue'));
  assert.equal(calls.at(-1),'confirm:record:record-over','Continue keeps the record-over mode');
 }finally{await over.close();}
 const confirmed={...project,clips:[...project.clips,{...project.clips[0],id:'c2',recordingTakeId:'t1'}]};
 calls.length=0;
 const done=await mountReview(confirmed,takeFor(confirmed),calls);
 try{
  assert.ok(done.container.querySelector('header.club-take-header')!.textContent?.includes('Confirmed'));
  await openGear(done.container);
  assert.deepEqual(menuItems(done.container).map(itemLabel),['Show Camera (FaceTime) in main preview','Rename and adjust sync'],'nothing to confirm on a confirmed take');
  await click(footerButton(done.container,'Continue'));
  assert.deepEqual(calls,['close']);
 }finally{await done.close();}
});

test('standalone SceneForge keeps its own take review',async()=>{
 const project=createProject('Demo'),calls:string[]=[];
 const ui=await mountReview(project,takeFor(project),calls,{club:false});
 try{
  assert.equal(Boolean(ui.container.querySelector('footer.club-take-footer')),false);
  assert.ok(button(ui.container,'Use this take'));
  assert.ok(ui.container.querySelector('button[aria-label="Open take settings"]'));
 }finally{await ui.close();}
});

test('the warnings card shows low disk as one amber card, and the pre-flight line names the sources not ready',async()=>{
 localStorage.clear();const originalFetch=globalThis.fetch;const asked:string[]=[];
 globalThis.fetch=async(input)=>{const url=String(input);asked.push(url);return url==='/api/club/disk'?Response.json({freeBytes:2*1024**3,low:true}):Response.json([]);};
 Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'prompt'})},configurable:true});
 const ui=await mountUI(createElement(Recording,{project:createProject(),change:()=>{},onRecorded:()=>{},onError:()=>{},club:true}));
 try{
  await flush();
  const cards=ui.container.querySelectorAll('.club-recorder-warnings');
  assert.equal(cards.length,1,'one card, not one per problem');
  assert.equal(cards[0].getAttribute('data-tone'),'warning');
  assert.equal(cards[0].textContent,'Your disk is almost full: free up at least 8 GB before recording.');
  assert.equal(cards[0].parentElement?.getAttribute('aria-label'),'Recording sources','the card sits in the sources column');
  assert.equal(cards[0].parentElement?.firstElementChild===cards[0],true,'at the top of it');
  assert.ok(asked.includes('/api/club/disk'));
  assert.equal(ui.container.querySelector('.club-recorder-preflight')?.textContent,'Fix the camera and microphone above before recording');
  assert.equal(Boolean(ui.container.querySelector('.recording-ready-hint')),false,'the old ready hint is replaced by the pre-flight line');
 }finally{globalThis.fetch=originalFetch;await ui.close();}
});

test('standalone SceneForge shows no warnings card and does not check disk space',async()=>{
 localStorage.clear();const originalFetch=globalThis.fetch;const asked:string[]=[];
 globalThis.fetch=async(input)=>{asked.push(String(input));return Response.json([]);};
 Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'prompt'})},configurable:true});
 const ui=await mountUI(createElement(Recording,{project:createProject(),change:()=>{},onRecorded:()=>{},onError:()=>{}}));
 try{
  await flush();
  assert.equal(Boolean(ui.container.querySelector('.club-recorder-warnings')),false);
  assert.equal(Boolean(ui.container.querySelector('.club-recorder-preflight')),false);
  assert.ok(ui.container.querySelector('.recording-ready-hint'));
  assert.equal(asked.some(url=>url.includes('/api/club/disk')),false);
 }finally{globalThis.fetch=originalFetch;await ui.close();}
});

/** A two-scene recording with one unconfirmed take on scene 1, served like SceneForge's API. */
function serveProject(){
 const p=createProject('Hidden features');
 p.scenes.push({id:'s2',name:'Level 1',script:'Second scene.',notes:'',start:0,duration:0});
 p.recordedTakes=[{id:'t1',createdAt:'2026-10-02T00:00:00.000Z',sceneId:p.scenes[0].id,media:[camera],tracks:['camera'],offsets:[0],clipIds:['c1']}];
 const originalFetch=globalThis.fetch;let saved:Project|null=null;
 class Source extends EventTarget{close(){}}Object.assign(globalThis,{EventSource:Source});
 Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'prompt'})},configurable:true});
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url==='/api/projects')return Response.json([p]);
  if(url===`/api/projects/${p.id}`&&init?.method==='PUT'){const body=JSON.parse(String(init.body)) as Project;saved=body;return Response.json({minimal:true,id:body.id,updatedAt:body.updatedAt},{headers:{ETag:'"t2"','Preference-Applied':'return=minimal'}});}
  if(url===`/api/projects/${p.id}`)return Response.json(p,{headers:{ETag:'"t"'}});
  if(url==='/api/health')return Response.json({ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'});
  if(url==='/api/automation/settings')return Response.json({automaticTranscription:false});
  if(url==='/api/club/disk')return Response.json({freeBytes:500*1024**3,low:false});
  if(url.endsWith('/agent-chat')||url.includes('/automation'))return Response.json({jobs:[]});
  return Response.json([]);
 };
 return {p,saved:()=>saved,restore:()=>{globalThis.fetch=originalFetch;}};
}

test('inside CreatorClub, Continue confirms the take, selects the next scene and reports progress',async()=>{
 localStorage.clear();
 const server=serveProject(),progress:string[]=[];
 const ui=await mountUI(createElement(ClubRecorder,{projectId:server.p.id,mode:'Record',onBack:()=>{},onProgress:({recorded,total})=>progress.push(`${recorded}/${total}`)}));
 try{
  await flush();await flush();
  const c=ui.container;
  assert.deepEqual(footerLabels(c),['Delete take','Record another take','Continue'],'the new take opens in its preview');
  assert.equal(progress.at(-1),'0/2');
  await click(footerButton(c,'Continue'));await flush();await flush();
  assert.equal(Boolean(c.querySelector('footer.club-take-footer')),false,'the preview closes');
  assert.ok(server.saved()?.clips.some(clip=>clip.recordingTakeId==='t1'),'the take is on the timeline');
  assert.equal(c.querySelector('.rsc-scene.is-selected')?.getAttribute('data-scene-id'),'s2','scene 2 is next to record');
  assert.equal(progress.at(-1),'1/2');
  assert.ok(c.querySelector('.rsc-take-badge')?.textContent==='Take 1 (00:07)','the take shows as a thumbnail');
  assert.ok(!c.textContent?.includes('Edit & export'),'the bottom bar, not a second button, leads to editing');
  assert.ok(!c.textContent?.includes('Style video')&&!c.textContent?.includes('Remove pauses'),'no scene quick actions in the club');
 }finally{server.restore();await ui.close();}
});


test('the bottom bar makes Continue to editing the primary only once every scene has a take',async()=>{
 localStorage.clear();
 const server=serveProject();
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{const url=String(input);if(url.startsWith('/api/club/videos/v1/plan'))return Response.json({package:null,outline:null});if(url==='/api/club/settings')return Response.json({helpSeen:[]});return original(input,init);};
 const video={id:'v1',title:'Hidden features',stage:'recording' as const,order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{},planning:{research:true,package:true,outline:true},recorderProjectId:server.p.id};
 const ui=await mountUI(createElement(VideoScreen,{video,step:'record',onStep:()=>{},onBoard:()=>{},onVideo:()=>{}}));
 const bar=()=>button(ui.container,'Continue to editing');
 try{
  await flush();await flush();
  assert.ok(!bar().className.includes('bg-primary'),'while scenes are left, the scene\'s Record is the primary');
  await click(footerButton(ui.container,'Continue'));await flush();await flush();
  assert.ok(!bar().className.includes('bg-primary'),'one of two scenes recorded');
  const scene2=ui.container.querySelector('.rsc-scene[data-scene-id="s2"]')!;
  assert.ok(scene2.classList.contains('is-selected'));
  assert.ok(scene2.querySelector('.rsc-record-button'),'scene 2 shows its Record button');
 }finally{globalThis.fetch=original;server.restore();await ui.close();}
 // A recording whose every scene has a take: Continue to editing is the primary.
 const all=serveProject();all.p.scenes.pop();
 all.p.clips=[{id:'c1',mediaId:'m1',name:'cam',track:'camera',start:0,sourceIn:0,sourceOut:7.4,speed:1,gain:1,muted:false,transform:{} as never,effects:{} as never,recordingTakeId:'t1'}];all.p.media=[camera];all.p.scenes[0].duration=7.4;
 all.p.recordedTakes![0].confirmedAt='2026-10-02T00:00:01.000Z';
 const original2=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{const url=String(input);if(url.startsWith('/api/club/videos/v1/plan'))return Response.json({package:null,outline:null});if(url==='/api/club/settings')return Response.json({helpSeen:[]});return original2(input,init);};
 const done=await mountUI(createElement(VideoScreen,{video:{...video,recorderProjectId:all.p.id},step:'record',onStep:()=>{},onBoard:()=>{},onVideo:()=>{}}));
 try{
  await flush();await flush();
  assert.ok(button(done.container,'Continue to editing').className.includes('bg-primary'),'after the last scene, Continue to editing is the primary');
  assert.equal([...done.container.querySelectorAll('button')].filter(b=>b.className.includes('bg-primary')).length,1,'and the only one');
 }finally{globalThis.fetch=original2;all.restore();await done.close();}
});
