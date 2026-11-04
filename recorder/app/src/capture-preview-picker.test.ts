import {mountUI,button} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject} from '../shared/types';
const {CaptureSourcePicker,PICKER_REFRESH_MS}=await import('./capture-preview-picker');
import {defaultCaptureSource} from './capture-preview-sources';
import {defaultRecordingSettings,loadRecordingPreferences,saveRecordingPreferences} from './recording-presets';
import {SAVED_SCREEN_SOURCE_KEY} from './screen-preview-resume';
import type {DesktopCaptureSource,DesktopCaptureSelection,SceneForgeDesktopBridge} from './desktop';
const {Recording}=await import('./Recording');
const image='data:image/png;base64,aGVsbG8=';
const sources:DesktopCaptureSource[]=[{id:'window:5:0',kind:'window',label:'Notes — Outline',thumbnail:image,appIcon:image},{id:'screen:2:0',kind:'display',displayId:'2',label:'Studio display',pixelSize:{width:5120,height:2160},thumbnail:image},{id:'screen:1:0',kind:'display',displayId:'1',label:'Main display',primary:true,pixelSize:{width:3024,height:1964},thumbnail:image}];
const selection=(source:DesktopCaptureSource,kind:'display'|'window'|'region'=source.kind):DesktopCaptureSelection=>({token:'one-use',sourceId:source.id,kind,label:source.label,...(source.kind==='display'?{displayId:source.displayId,displayBounds:{x:0,y:0,width:1512,height:982},scaleFactor:2}:{}),...(kind==='region'?{crop:{normalized:{x:0,y:0,width:.5,height:.5},dip:{x:0,y:0,width:756,height:491},pixels:{x:0,y:0,width:1512,height:982},sourcePixelSize:{width:3024,height:1964}}}:{})});
const flush=()=>act(async()=>{await new Promise(resolve=>setImmediate(resolve));});
class Track extends EventTarget {kind='video';readyState='live';label='Fixture';id=crypto.randomUUID();stop(){this.readyState='ended';}}
const stream=()=>{const track=new Track();const value=new (window as any).MediaStream([track]);value.getTracks=()=>[track];return value as MediaStream;};

test('default source uses primary display, never the first window; fallback is a display',()=>{
 assert.equal(defaultCaptureSource(sources)?.id,'screen:1:0');assert.equal(defaultCaptureSource(sources.slice(0,2))?.id,'screen:2:0');assert.equal(defaultCaptureSource(sources.slice(0,1)),null);
});
test('picker renders displays before windows, resolution, icons, selection and one-click choice',async()=>{
 let chosen='';const ui=await mountUI(createElement(CaptureSourcePicker,{load:async()=>({sources}),selectedId:'screen:1:0',onClose:()=>{},onSelect:source=>chosen=source.id}));
 try{
  const headings=[...ui.container.querySelectorAll('h3')].map(el=>el.textContent);assert.deepEqual(headings,['Displays','Windows']);
  assert.match(ui.container.textContent!,/3024 × 1964 · Main display/);assert.equal(ui.container.querySelectorAll('.capture-picker-name img').length,1);
  const tiles=[...ui.container.querySelectorAll<HTMLButtonElement>('.capture-picker-tile')];assert.equal(tiles[0].textContent?.startsWith('Studio display'),true);assert.equal(tiles[1].getAttribute('aria-pressed'),'true');
  await act(async()=>tiles[2].click());assert.equal(chosen,'window:5:0');
 }finally{await ui.close();}
});
test('picker refreshes only while mounted and discards late results after close',async()=>{
 const intervals:Function[]=[];const original=globalThis.setTimeout,clear=globalThis.clearTimeout;let loads=0,resolve!: (value:{sources:DesktopCaptureSource[]})=>void;
 globalThis.setTimeout=((fn:Function,ms?:number)=>ms===PICKER_REFRESH_MS?(intervals.push(fn),123):original(fn as ()=>void,ms)) as typeof setTimeout;
 globalThis.clearTimeout=((id:any)=>{if(id!==123)clear(id);}) as typeof clearTimeout;
 const ui=await mountUI(createElement(CaptureSourcePicker,{load:async()=>{loads++;if(loads===1)return {sources};return new Promise<{sources:DesktopCaptureSource[]}>(r=>{resolve=r;});},onClose:()=>{},onSelect:()=>{}}));
 try{
  assert.equal(loads,1);await act(async()=>{intervals.shift()!();});assert.equal(loads,2);
  await ui.close();await act(async()=>resolve({sources}));assert.equal(intervals.length,0);assert.equal(ui.container.querySelector('img'),null);
 }finally{globalThis.setTimeout=original;globalThis.clearTimeout=clear;}
});

async function recordingFixture(permission='granted',saved?:DesktopCaptureSelection){
 const fetchBefore=globalThis.fetch,bridgeBefore=window.sceneForge,devicesBefore=Object.getOwnPropertyDescriptor(navigator,'mediaDevices');
 localStorage.clear();saveRecordingPreferences({...loadRecordingPreferences(),current:{...defaultRecordingSettings(),selection:{camera:true,microphone:false,screen:true,systemAudio:false}}});
 if(saved){const {token,...metadata}=saved;localStorage.setItem(SAVED_SCREEN_SOURCE_KEY,JSON.stringify(metadata));}
 const calls={lists:[] as any[],chosen:[] as string[],restored:[] as string[],screen:0,camera:0,settings:[] as string[],recordings:0};let screenPermission=permission;
 globalThis.fetch=async()=>Response.json([]);
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{enumerateDevices:async()=>[],addEventListener:()=>{},removeEventListener:()=>{},getUserMedia:async()=>{calls.camera++;return stream();},getDisplayMedia:async()=>{calls.screen++;return stream();}}});
 window.sceneForge={platform:'darwin',getMediaPermissions:async()=>({platform:'darwin',screen:screenPermission,camera:screenPermission,microphone:'denied',systemAudio:'unknown'}),
  listCaptureSources:async(options:any)=>{calls.lists.push(options);return {sources,displays:[]};},chooseCaptureSource:async(options:any)=>{calls.chosen.push(options.sourceId);return selection(sources.find(source=>source.id===options.sourceId)!,options.mode);},restoreCaptureSource:async(value:any)=>{calls.restored.push(value.sourceId);return {...value,token:'fresh-token'};},cancelCaptureSelection:async()=>{},openPrivacySettings:async(kind:string)=>{calls.settings.push(kind);},startNativeRecording:async()=>{calls.recordings++;throw Error('Preview must not record');},
 } as unknown as SceneForgeDesktopBridge;
 const ui=await mountUI(createElement(Recording,{project:createProject('Picker check'),change:()=>{},onRecorded:()=>{},onError:()=>{}}));await flush();
 return {ui,calls,grant:async()=>{screenPermission='granted';await act(async()=>window.dispatchEvent(new Event('sceneforge-media-permissions')));await flush();},close:async()=>{await ui.close();window.sceneForge=bridgeBefore;globalThis.fetch=fetchBefore;if(devicesBefore)Object.defineProperty(navigator,'mediaDevices',devicesBefore);else delete (navigator as any).mediaDevices;}};
}
test('granted screen and camera auto-preview with main display, persist metadata only and never record',async()=>{
 const f=await recordingFixture();try{
  assert.equal(f.calls.camera,1);assert.equal(f.calls.screen,1);assert.deepEqual(f.calls.chosen,['screen:1:0']);assert.deepEqual(f.calls.lists,[undefined]);assert.equal(f.calls.recordings,0);assert.equal(Boolean(f.ui.container.querySelector<HTMLVideoElement>('[aria-label="Screen live preview"]')?.srcObject),true);
  const saved=JSON.parse(localStorage.getItem(SAVED_SCREEN_SOURCE_KEY)!);assert.equal(saved.sourceId,'screen:1:0');assert.equal('token' in saved,false);assert.equal('thumbnail' in saved,false);
  assert.equal(f.ui.container.querySelector('[role=dialog]'),null);assert.doesNotMatch(f.ui.container.textContent!,/Enable (screen|camera) preview/);
 }finally{await f.close();}
});
test('last source resumes without picker, fresh list or source change',async()=>{
 const saved=selection(sources[1]),f=await recordingFixture('granted',saved);try{assert.deepEqual(f.calls.restored,[saved.sourceId]);await act(async()=>button(f.ui.container,'Entire display').click());await flush();assert.deepEqual(f.calls.chosen,[]);assert.deepEqual(f.calls.lists,[]);assert.equal(f.calls.screen,1);}finally{await f.close();}
});
test('missing permission has one screen allow button, invokes drag-helper bridge and auto-previews after grant',async()=>{
 const f=await recordingFixture('denied');try{
  const screen=f.ui.container.querySelector('[aria-label=Screen]')!.closest('section')!;
  const actions=[...screen.querySelectorAll('.capture-preview-empty button')];assert.deepEqual(actions.map(el=>el.textContent),['Allow screen recording']);
  assert.equal(f.calls.screen,0);assert.equal(f.calls.camera,0);assert.equal(f.calls.lists.length,0);
  await act(async()=>button(screen,'Allow screen recording').click());assert.deepEqual(f.calls.settings,['screen']);assert.equal(f.calls.screen,0);
  await f.grant();assert.equal(f.calls.screen,1);assert.equal(f.calls.camera,1);
 }finally{await f.close();}
});
test('one-click window selection starts preview, persists the window and closes thumbnails',async()=>{
 const f=await recordingFixture();try{
  await act(async()=>f.ui.container.querySelector<HTMLButtonElement>('[aria-label="Choose screen source"]')!.click());
  assert.deepEqual(f.calls.lists.at(-1),{thumbnails:true});
  await act(async()=>{[...f.ui.container.querySelectorAll<HTMLButtonElement>('.capture-picker-tile')].find(el=>el.textContent?.includes('Notes — Outline'))!.click();});await flush();
  assert.equal(f.calls.chosen.at(-1),'window:5:0');assert.equal(f.calls.screen,2);assert.equal(f.ui.container.querySelector('[role=dialog]'),null);assert.equal(f.ui.container.querySelector('.capture-picker-image'),null);
  const saved=JSON.parse(localStorage.getItem(SAVED_SCREEN_SOURCE_KEY)!);assert.equal(saved.kind,'window');assert.equal('thumbnail' in saved,false);assert.equal(f.calls.recordings,0);
 }finally{await f.close();}
});
