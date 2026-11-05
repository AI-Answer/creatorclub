import {mountUI,button} from '../../test-dom';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Media,Project} from '../../../shared/types';
import {createProject} from '../../../shared/types';
import type {SavedTake} from '../../recorded-takes';
import {defaultRecordingSettings,loadRecordingPreferences,saveRecordingPreferences} from '../../recording-presets';
const {TakeReview}=await import('../../TakeReview');
const {Recording}=await import('../../Recording');
const {ClubRecorder}=await import('../ClubRecorder');
const {Workspace}=await import('../workspace/Workspace');

// The take preview starts playing on open with a requestAnimationFrame loop; these tests check its choices, not playback.
const realFrame=globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame=()=>0;
after(()=>{globalThis.requestAnimationFrame=realFrame;});
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const click=(element:Element)=>act(async()=>{element.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
const camera:Media={id:'m1',name:'cam',path:'/tmp/cam.mov',kind:'video',duration:7.4,width:10,height:10};
const screen:Media={id:'m2',name:'screen',path:'/tmp/screen.mov',kind:'video',duration:7.4,width:10,height:10};
const footerLabels=(root:Element)=>[...root.querySelectorAll('.btp-footer button')].map(b=>b.textContent?.trim()).filter(Boolean);
const footerButton=(root:Element,label:string)=>[...root.querySelectorAll('.btp-footer button')].find(b=>b.textContent?.trim()===label)!;
const menuItems=(root:Element)=>[...root.querySelectorAll<HTMLButtonElement>('[role=menu] [role=menuitem]')];
/** A menu item's label, without its hint line. */
const itemLabel=(item:Element)=>(item.querySelector('.btp-option-title')??item).textContent?.trim();
const openGear=(root:Element)=>click(root.querySelector('button[aria-label="Open take settings"]')!);
const openConfirm=(root:Element)=>click(root.querySelector('button[aria-label="More ways to confirm"]')!);

function takeFor(project:Project,overrides:Partial<SavedTake>={}):SavedTake{
 return {id:'t1',createdAt:'2026-10-02T00:00:00.000Z',sceneId:project.scenes[0].id,media:[screen,camera],tracks:['screen','camera'],offsets:[0,0],labels:['Screen (Display)','Camera (FaceTime)'],clipIds:['c1','c2'],...overrides};
}
function mountReview(project:Project,take:SavedTake,calls:string[],extra:Record<string,unknown>={}){
 return mountUI(createElement(TakeReview,{project,take,club:true,onConfirm:(destination:string,mode?:string)=>calls.push(`confirm:${destination}:${mode}`),onRetake:()=>calls.push('retake'),onClose:()=>calls.push('close'),onDelete:()=>calls.push('delete'),onUpdate:async()=>{calls.push('update');},...extra}));
}

test('the take preview is Borumi\'s: PREVIEW, the take\'s name, Delete take, Record another take and Confirm take',async()=>{
 const project=createProject('Demo'),calls:string[]=[];
 const ui=await mountReview(project,takeFor(project),calls);
 try{
  const c=ui.container;
  assert.equal(c.querySelector('.btp-kicker')?.textContent,'Preview');assert.equal(c.querySelector('.btp-title')?.textContent,'Take 1');
  assert.equal(c.querySelector('.btp-confirmed'),null,'only a confirmed take is badged');
  assert.deepEqual(footerLabels(c),['Delete take','Record another take','Confirm take']);
  assert.deepEqual([...c.querySelectorAll('.btp-label')].map(node=>node.textContent),['Screen (Display)','Camera (FaceTime)'],'Borumi labels each source with its device');
  assert.equal(c.querySelector('.btp-main .btp-label')?.textContent,'Screen (Display)','the screen is the main tile, as Borumi');
  assert.equal(c.querySelector('.btp-now')?.textContent,'00:00.0','times are MM:SS.d');
  const css=(await import('node:fs')).readFileSync(new URL('./take-preview.css',import.meta.url),'utf8');
  assert.ok((c.querySelector('.btp-slider') as HTMLElement).style.getPropertyValue('--br-progress'),'the scrubber sets the progress its track draws');assert.match(css,/var\(--br-progress\)/);assert.equal(c.querySelector('.btp-speed')?.textContent,'1X');
  await click(c.querySelector('.btp-side .btp-tile')!);assert.equal(c.querySelector('.btp-main .btp-label')?.textContent,'Camera (FaceTime)','clicking a tile makes it the main one');
  await click(footerButton(c,'Confirm take'));
  assert.deepEqual(calls,['confirm:record:replace-matching'],'Confirm take adds it, replacing matching clips');
  await click(footerButton(c,'Record another take'));assert.equal(calls.at(-1),'retake');
  const asked:string[]=[];const real=window.confirm;window.confirm=(text?:string)=>{asked.push(String(text));return true;};
  try{await click(footerButton(c,'Delete take'));await flush();}finally{window.confirm=real;}
  assert.deepEqual(asked,['Delete take?\n\nAre you sure you want to delete this take?'],'Delete asks with Borumi\'s words');assert.equal(calls.at(-1),'delete');
 }finally{await ui.close();}
});

test('Confirm take\'s menu and the gear hold Borumi\'s items',async()=>{
 const project=createProject('Demo');
 project.media=[camera];project.scenes[0].duration=5;
 project.clips=[{id:'old',mediaId:'m1',name:'cam',track:'camera',start:0,sourceIn:0,sourceOut:5,speed:1,gain:1,muted:false,transform:{x:0,y:0,scale:1,rotation:0,opacity:1} as never,effects:{} as never,recordingTakeId:'earlier'}];
 const calls:string[]=[];
 const ui=await mountReview(project,takeFor(project),calls);
 try{
  await openConfirm(ui.container);
  assert.deepEqual(menuItems(ui.container).map(itemLabel),['Archive take','Confirm without replacing']);
  await click(menuItems(ui.container).find(item=>itemLabel(item)==='Confirm without replacing')!);assert.equal(calls.at(-1),'confirm:record:keep-both');
  await openConfirm(ui.container);await click(menuItems(ui.container).find(item=>itemLabel(item)==='Archive take')!);assert.equal(calls.at(-1),'close','archive keeps the take off the timeline');
  await openGear(ui.container);assert.deepEqual(menuItems(ui.container).map(itemLabel),['Adjust Sync...']);
 }finally{await ui.close();}
 calls.length=0;
 const over=await mountReview(project,takeFor(project,{recordOver:true}),calls);
 try{
  await openConfirm(over.container);assert.deepEqual(menuItems(over.container).map(itemLabel),['Archive take','Confirm and replace']);
  await click(menuItems(over.container).find(item=>itemLabel(item)==='Confirm and replace')!);assert.equal(calls.at(-1),'confirm:record:replace-matching');
  await click(footerButton(over.container,'Confirm take'));assert.equal(calls.at(-1),'confirm:record:record-over','a record-over take keeps its place');
 }finally{await over.close();}
 const confirmed={...project,clips:[...project.clips,{...project.clips[0],id:'c2',recordingTakeId:'t1'}]};
 calls.length=0;
 const done=await mountReview(confirmed,takeFor(confirmed),calls);
 try{
  assert.equal(done.container.querySelector('.btp-confirmed')?.textContent,'Confirmed');
  assert.deepEqual(footerLabels(done.container),['Delete take','Record another take','Continue']);
  await click(footerButton(done.container,'Continue'));assert.deepEqual(calls,['close'],'Continue closes without confirming again');
 }finally{await done.close();}
});



test('standalone SceneForge keeps its own take review',async()=>{
 const project=createProject('Demo'),calls:string[]=[];
 const ui=await mountReview(project,takeFor(project),calls,{club:false});
 try{
  assert.equal(Boolean(ui.container.querySelector('div.btp-footer')),false);
  assert.ok(button(ui.container,'Use this take'));
  assert.ok(ui.container.querySelector('button[aria-label="Open take settings"]'));
 }finally{await ui.close();}
});

test('the warnings card shows low disk as one amber card in place of the readiness line',async()=>{
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
  assert.equal(cards[0].parentElement?.classList.contains('club-record-left'),true,'the card sits at the top of the sources column, as in Borumi');
  assert.equal(cards[0].nextElementSibling?.matches('aside.recording-source-panel'),true,'above the sources');
  assert.ok(asked.includes('/api/club/disk'));
  assert.equal(Boolean(ui.container.querySelector('.recording-ready-hint')),false,'the old ready hint is gone');
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
  assert.equal(Boolean(ui.container.querySelector('.club-record-bar')),false,'standalone keeps its sources column and cards');
  assert.ok(ui.container.querySelector('aside.recording-source-panel'));
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

test('leaving Record for Edit with a take still under review puts the take on the timeline first',async()=>{
 localStorage.clear();
 const server=serveProject(),leave:{guard:(()=>Promise<boolean>)|null}={guard:null};
 const ui=await mountUI(createElement(ClubRecorder,{projectId:server.p.id,mode:'Record',onBack:()=>{},registerLeaveGuard:next=>{leave.guard=next;}}));
 try{
  await flush();await flush();
  assert.deepEqual(footerLabels(ui.container),['Delete take','Record another take','Confirm take'],'the take is still under review');
  assert.ok(leave.guard,'the club can ask before it leaves');
  assert.equal(server.saved(),null,'nothing is on the timeline yet');
  assert.equal(await leave.guard!(),true,'the take was added');
  await flush();
  assert.ok(server.saved()?.clips.some(clip=>clip.recordingTakeId==='t1'),'the take is on the timeline');
  assert.equal(Boolean(ui.container.querySelector('div.btp-footer')),false,'the preview closes');
  assert.equal(await leave.guard!(),true,'asking again with the take already on the timeline changes nothing');
 }finally{server.restore();await ui.close();}
});

test('inside Creator Compiler, Continue confirms the take, selects the next scene and reports progress',async()=>{
 localStorage.clear();
 const server=serveProject(),progress:string[]=[];
 const ui=await mountUI(createElement(ClubRecorder,{projectId:server.p.id,mode:'Record',onBack:()=>{},onProgress:({recorded,total})=>progress.push(`${recorded}/${total}`)}));
 try{
  await flush();await flush();
  const c=ui.container;
  assert.deepEqual(footerLabels(c),['Delete take','Record another take','Confirm take'],'the new take opens in its preview');
  assert.equal(progress.at(-1),'0/2');
  await click(footerButton(c,'Confirm take'));await flush();await flush();
  assert.equal(Boolean(c.querySelector('div.btp-footer')),false,'the preview closes');
  assert.ok(server.saved()?.clips.some(clip=>clip.recordingTakeId==='t1'),'the take is on the timeline');
  assert.equal(c.querySelector('.rsc-scene.is-selected')?.getAttribute('data-scene-id'),'s2','scene 2 is next to record');
  assert.equal(progress.at(-1),'1/2');
  assert.equal(c.querySelector('.rsc-scene[data-scene-id="s2"] .rsc-take-badge'),null,'scene 2 has no take yet');
  assert.ok(c.querySelector(`.rsc-scene[data-scene-id="${server.p.scenes[0].id}"] .rsc-take-badge`),'scene 1 shows its take');
  assert.ok(!c.textContent?.includes('Edit & export'),'the bottom bar, not a second button, leads to editing');
  assert.ok(!c.textContent?.includes('Remove pauses')&&!c.textContent?.includes('Style video'),'the cards have no per-scene editing buttons');
  assert.equal(c.querySelector('.rsc-take-menu-anchor .rsc-gear'),null,'and no gear on a take: its preview holds the choices');
 }finally{server.restore();await ui.close();}
});


test('the bottom bar makes Continue to edit the primary only once every scene has a take',async()=>{
 localStorage.clear();
 const server=serveProject();
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{const url=String(input);if(url.startsWith('/api/club/videos/v1/plan'))return Response.json({package:null,outline:null});if(url==='/api/club/settings')return Response.json({helpSeen:[]});return original(input,init);};
 const video={id:'v1',title:'Hidden features',stage:'recording' as const,order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{},planning:{research:true,package:true,outline:true},recorderProjectId:server.p.id};
 const ui=await mountUI(createElement(Workspace,{video,tab:'record',back:{name:'videos',view:'board'},navigate:()=>{},onVideo:()=>{}}));
 try{
  await flush();await flush();
  assert.equal([...ui.container.querySelectorAll('button')].some(b=>b.textContent?.trim()==='Continue to editing'),false,'no take yet: Borumi shows no Continue');
  await click(footerButton(ui.container,'Confirm take'));await flush();await flush();
  const scene2=ui.container.querySelector('.rsc-scene[data-scene-id="s2"]')!;
  assert.ok(scene2.classList.contains('is-selected'));
  assert.ok(scene2.querySelector('.rsc-record-button'),'scene 2 has its own Record');
 }finally{globalThis.fetch=original;server.restore();await ui.close();}
 // A recording whose every scene has a take: Continue to edit is the primary.
 const all=serveProject();all.p.scenes.pop();
 all.p.clips=[{id:'c1',mediaId:'m1',name:'cam',track:'camera',start:0,sourceIn:0,sourceOut:7.4,speed:1,gain:1,muted:false,transform:{} as never,effects:{} as never,recordingTakeId:'t1'}];all.p.media=[camera];all.p.scenes[0].duration=7.4;
 all.p.recordedTakes![0].confirmedAt='2026-10-02T00:00:01.000Z';
 const original2=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{const url=String(input);if(url.startsWith('/api/club/videos/v1/plan'))return Response.json({package:null,outline:null});if(url==='/api/club/settings')return Response.json({helpSeen:[]});return original2(input,init);};
 const done=await mountUI(createElement(Workspace,{video:{...video,recorderProjectId:all.p.id},tab:'record',back:{name:'videos',view:'board'},navigate:()=>{},onVideo:()=>{}}));
 try{
  await flush();await flush();
  assert.ok(button(done.container,'Continue to editing').classList.contains('primary'),'after the last scene, Continue to edit is the primary');
  assert.equal([...done.container.querySelectorAll('button')].filter(b=>b.classList.contains('primary')).length,1,'and the only one');
 }finally{globalThis.fetch=original2;all.restore();await done.close();}
});

type Selection={camera:boolean;microphone:boolean;screen:boolean;systemAudio:boolean};
const only=(kind:keyof Selection):Selection=>({camera:false,microphone:false,screen:false,systemAudio:false,[kind]:true});
const cardLines=(root:Element)=>[...root.querySelectorAll('.club-recorder-warnings li')].map(li=>({text:li.querySelector('span')?.textContent,button:li.querySelector('button')?.textContent??null}));
/** The club recorder with the given sources switched on and macOS answering `access` for every source. */
async function mountClubRecording(selection:Selection,access:'granted'|'denied',extra:Record<string,unknown>={}){
 localStorage.clear();
 saveRecordingPreferences({...loadRecordingPreferences(),current:{...defaultRecordingSettings(),selection}});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input)=>String(input)==='/api/club/disk'?Response.json({freeBytes:500*1024**3,low:false}):Response.json([]);
 Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:access==='granted'?'granted':'denied'})},configurable:true});
 (window as unknown as {sceneForge?:unknown}).sceneForge={getMediaPermissions:async()=>({platform:'darwin',camera:access,microphone:access,screen:access,systemAudio:'unknown'})};
 const setups:string[]=[];
 const ui=await mountUI(createElement(Recording,{project:createProject(),change:()=>{},onRecorded:()=>{},onError:()=>{},onSetup:()=>setups.push('setup'),club:true,...extra}));
 await flush();await flush();
 return {ui,setups,close:async()=>{await ui.close();globalThis.fetch=originalFetch;delete (window as unknown as {sceneForge?:unknown}).sceneForge;}};
}
const sourceNames={camera:'camera',microphone:'microphone',screen:'screen',systemAudio:'computer audio'} as const;

test('a permission problem on any source shows its sentence and one Open Mac setup button, which opens the recording setup',async()=>{
 for(const kind of ['camera','microphone','screen','systemAudio'] as const){
  const {ui,setups,close}=await mountClubRecording(only(kind),'denied');
  try{
   assert.deepEqual(cardLines(ui.container),[{text:`macOS isn't allowing the ${sourceNames[kind]}: open Mac setup to allow it.`,button:'Open Mac setup'}],kind);
   assert.equal(ui.container.querySelector('.club-recorder-warnings')?.getAttribute('data-tone'),'danger');
   await click(button(ui.container,'Open Mac setup'));
   assert.deepEqual(setups,['setup'],`${kind}: the button opens the existing recording-access setup`);
  }finally{await close();}
 }
});

test('several blocked sources keep one sentence each and a single Open Mac setup button',async()=>{
 const {ui,close}=await mountClubRecording({camera:true,microphone:true,screen:true,systemAudio:true},'denied');
 try{
  assert.deepEqual(cardLines(ui.container).map(line=>line.text),['camera','microphone','screen','computer audio'].map(name=>`macOS isn't allowing the ${name}: open Mac setup to allow it.`));
  assert.equal(ui.container.querySelectorAll('.club-recorder-warnings[role=alert]').length,1,'all simultaneous problems share a single banner');
  assert.equal([...ui.container.querySelectorAll('.club-recorder-warnings button')].length,1);
 }finally{await close();}
});

test('a source that fails for another reason says so in plain words, with no raw error, and offers its one fix',async()=>{
 // Allowed by macOS, but there is no capture device here, so the camera fails when it opens.
 const camera=await mountClubRecording(only('camera'),'granted');
 try{
  assert.deepEqual(cardLines(camera.ui.container),[{text:"The camera can't start: check that it's connected and not in use by another app.",button:'Try again'}]);
  await click(button(camera.ui.container,'Try again'));await flush();
  assert.equal(cardLines(camera.ui.container).length,1,'still one line after trying again');
 }finally{await camera.close();}
 // Computer audio alone (Screen off): choosing where the sound comes from fails. It used to show only buttons, with no card.
 const audio=await mountClubRecording(only('systemAudio'),'granted');
 try{
  assert.deepEqual(cardLines(audio.ui.container),[],'nothing chosen yet is not an error');
  await click(button(audio.ui.container,'No source selected'));await flush();
  assert.deepEqual(cardLines(audio.ui.container),[{text:"The computer audio can't be captured: choose the screen or window again.",button:'Choose source'}]);
  assert.equal(Boolean(audio.ui.container.querySelector('.capture-source-error')),false,'no unexplained buttons under the source');
 }finally{await audio.close();}
 // Screen on: a failed choice names the screen and, if computer audio is on too, computer audio, with one Choose source button.
 const screen=await mountClubRecording({camera:false,microphone:false,screen:true,systemAudio:true},'granted');
 try{
  await click(button(screen.ui.container,'Choose a screen'));await flush();
  assert.deepEqual(cardLines(screen.ui.container),[{text:"The screen can't be captured: choose the screen or window again.",button:'Choose source'},{text:"The computer audio can't be captured: choose the screen or window again.",button:null}]);
 }finally{await screen.close();}
});

test('a source that is switched off never shows in the card, even after it failed',async()=>{
 const {ui,close}=await mountClubRecording(only('systemAudio'),'granted');
 try{
  await click(button(ui.container,'No source selected'));await flush();
  assert.equal(cardLines(ui.container).length,1);
  await click(ui.container.querySelector('[role="switch"][aria-label="System Sound"]')!);await flush();
  assert.equal(Boolean(ui.container.querySelector('.club-recorder-warnings')),false,'switching the source off clears its warning');
 }finally{await close();}
});

test('Record shows the saved Edit completion check only while its export matches this revision',async()=>{
 const {projectRevision}=await import('../../api');
 for(const matches of [true,false]){
  localStorage.clear();const server=serveProject();server.p.recordedTakes=[];
  const revision=await projectRevision(server.p),original=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
   const url=String(input);
   if(url.startsWith('/api/exports?'))return Response.json({jobs:[{id:'exported',status:'complete',options:{format:'mp4'},output:{status:'available'},outputPath:'/tmp/export.mp4',projectRevision:matches?revision:'older-edit',startedAt:'2026-11-05T00:00:00Z'}]});
   if(url.startsWith('/api/club/videos/v1/plan'))return Response.json({package:null,outline:null});
   if(url==='/api/club/settings')return Response.json({helpSeen:[]});
   return original(input,init);
  };
  const video={id:'v1',title:'Demo',stage:'recording' as const,order:0,createdAt:'',updatedAt:'',stageDates:{},planning:{research:false,package:false,outline:false},recorderProjectId:server.p.id};
  const ui=await mountUI(createElement(Workspace,{video,tab:'record',back:{name:'home'},navigate(){},onVideo(){}}));
  try{
   for(let i=0;i<6;i++)await flush();
   assert.equal(ui.container.querySelector('a[href$="/edit"]')?.classList.contains('done'),matches);
  }finally{await ui.close();globalThis.fetch=original;server.restore();}
 }
});

test('camera preview names its loading state and offers Try again after failure',async()=>{
 const {VideoPreview}=await import('../../Recording');let retried=0;
 const source={stream:null,status:'loading' as const,key:'',error:''};
 const props={source,label:'Camera',onEnable:()=>retried++};
 const ui=await mountUI(createElement(VideoPreview,props));
 try{
  assert.ok(ui.container.textContent?.includes('Starting the camera…'));
  assert.ok(ui.container.querySelector('.spin'));
  await ui.render(createElement(VideoPreview,{...props,source:{...source,status:'error',error:'Camera unavailable'}}));
  await click(button(ui.container,'Try again'));assert.equal(retried,1);
 }finally{await ui.close();}
});
