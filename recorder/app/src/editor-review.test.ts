import {mountUI,button} from './test-dom';
import test from 'node:test';import assert from 'node:assert/strict';import {act,createElement} from 'react';
import {createProject,defaultEffects,defaultTransform,type Project} from '../shared/types';
import {createPlayhead} from './playhead';import {applyProjectChange} from './project-draft';
import {Timeline} from './Timeline';import {TimelineClub} from './TimelineClub';import type {EditorBridge,EmbeddedRecorder} from './App';
const {default:App}=await import('./App');
const noop=()=>{};
function fixture(){const p=createProject('Review');p.media=[{id:'audio',name:'Audio',kind:'audio',path:'/fixture.wav',duration:120,width:0,height:0,hasAudio:true}];p.clips=[{id:'clip',mediaId:'audio',name:'Audio',track:'audio',start:1,sourceIn:0,sourceOut:2,speed:1,gain:1,muted:false,linkId:'clip',transform:defaultTransform(),effects:defaultEffects()}];p.scenes[0].duration=10;p.settings.snap=false;return p;}
const pointer=(type:string,x:number,y:number,target:EventTarget=window)=>target.dispatchEvent(new (window as unknown as {PointerEvent:typeof PointerEvent}).PointerEvent(type,{bubbles:true,button:0,clientX:x,clientY:y,pointerId:1,altKey:true}));
const bounds={left:0,top:0,width:1200,height:700,right:1200,bottom:700,x:0,y:0,toJSON:()=>({})};
function size(scroll:HTMLElement){scroll.getBoundingClientRect=()=>bounds;Object.defineProperty(scroll,'clientWidth',{configurable:true,value:1200});}
test('standard timeline moves precisely at six pixels even in a wide viewport',async()=>{
 let p=fixture(),edits=0;const ui=await mountUI(createElement(Timeline,{project:p,playhead:createPlayhead(),zoom:100,selected:null,selectedIds:new Set<string>(),onSelect:noop,onSeek:noop,onZoom:noop,change:fn=>{p=applyProjectChange(p,fn);edits++;},onDropMedia:noop,tool:'select',scrubbing:false,onSplit:noop,onSelectMany:noop,selectedRange:null,onRange:noop,showWaveforms:false}));
 try{size(ui.container.querySelector('.timeline-scroll')!);await act(async()=>pointer('pointerdown',200,100,ui.container.querySelector('[data-clip-id="clip"]')!));await act(async()=>pointer('pointermove',195,100));assert.equal(ui.container.querySelector('.clip-drag-preview'),null,'five pixels remains a click');await act(async()=>pointer('pointermove',192,100));await act(async()=>pointer('pointerup',192,100));assert.equal(edits,1);assert.ok(p.clips[0].start<1&&p.clips[0].start>.8,'an eight-pixel move stays precise');}
 finally{await ui.close();}
});
test('club layer drops ignore unrelated overlap but refuse occupied time on the destination row',async()=>{
 for(const occupied of [false,true]){let p=fixture();p.clips[0].track='screen';p.timelineLayers=[{id:'target',kind:'video',name:'Target',order:3}];p.clips.push({...p.clips[0],id:'unrelated-a',track:'camera',start:50,linkId:'a'},{...p.clips[0],id:'unrelated-b',track:'camera',start:51,linkId:'b'},{...p.clips[0],id:'target-clip',layerId:'target',start:occupied?1:40,linkId:'target'});const notices:string[]=[];
  const ui=await mountUI(createElement(TimelineClub,{project:p,playhead:createPlayhead(),scale:50,onScale:noop,selectedIds:new Set<string>(),onSelectMany:noop,onSeek:noop,change:fn=>{p=applyProjectChange(p,fn);},onDropMedia:noop,tool:'select',onSplit:noop,follow:false,showWaveforms:false,onOpen:noop,onNotice:s=>notices.push(s),autoFit:false}));
  try{size(ui.container.querySelector('.timeline-scroll')!);const row=ui.container.querySelector<HTMLElement>('[data-track="target"]')!,y=parseFloat(row.style.top)+parseFloat(row.style.height)/2;assert.ok(y>0);await act(async()=>pointer('pointerdown',200,500,ui.container.querySelector('[data-clip-id="clip"]')!));await act(async()=>pointer('pointermove',200,y));await act(async()=>pointer('pointerup',200,y));assert.equal(p.clips[0].layerId,occupied?undefined:'target');assert.equal(notices.length,occupied?1:0);if(occupied)assert.match(notices[0],/occupied/);}
  finally{await ui.close();}
 }
});
function mockApp(p:Project){const originalFetch=globalThis.fetch,originalSource=globalThis.EventSource;let stored=p;class Source extends EventTarget{static last:Source;constructor(){super();Source.last=this;}close(){}}globalThis.EventSource=Source as unknown as typeof EventSource;
 globalThis.fetch=async(input,init)=>{const url=String(input);if(url==='/api/projects')return Response.json([stored]);if(url===`/api/projects/${p.id}`){if(init?.method==='PUT')stored=JSON.parse(String(init.body));return Response.json(stored,{headers:{ETag:'"test"'}});}if(url==='/api/health')return Response.json({ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'});if(url==='/api/automation/settings')return Response.json({automaticTranscription:false});if(url.includes('/automation')||url.endsWith('/agent-chat'))return Response.json({jobs:[]});return Response.json([]);};
 return {update:async(next:Project)=>{stored=next;await act(async()=>Source.last.dispatchEvent(new MessageEvent('project',{data:JSON.stringify({id:p.id,revision:'new',action:'saved'})})));},restore:()=>{globalThis.fetch=originalFetch;globalThis.EventSource=originalSource;}};
}
test('a preview survives a save timestamp acknowledgment and clears after a content change',async()=>{
 const p=fixture(),server=mockApp(p);let editor:EditorBridge|null=null;const ui=await mountUI(createElement<{embedded?:EmbeddedRecorder}>(App,{embedded:{projectId:p.id,mode:'Edit',onBack:noop,onEditor:e=>{editor=e;}}}));
 try{assert.ok(editor);await act(async()=>{assert.equal(editor!.preview({type:'add_motion_block',template:'title-card',start:1,text:'Title'},'card'),undefined);});assert.ok(ui.container.querySelector('.club-preview-badges'));await server.update({...p,updatedAt:'new save timestamp'});assert.ok(ui.container.querySelector('.club-preview-badges'),'timestamp-only server objects keep the preview');await server.update({...p,name:'Changed',updatedAt:'content update'});assert.equal(ui.container.querySelector('.club-preview-badges'),null);}
 finally{await ui.close();server.restore();}
});
test('switching from Record to Edit does not run the recorder with Edit props',async()=>{
 const p=fixture(),server=mockApp(p);let progress=0,wrongModeEffects=0;const base={projectId:p.id,onBack:noop};const ui=await mountUI(createElement<{embedded?:EmbeddedRecorder}>(App,{embedded:{...base,mode:'Record',onProgress:()=>{progress++;}}}));
 try{assert.ok(progress>0);await ui.render(createElement<{embedded?:EmbeddedRecorder}>(App,{embedded:{...base,mode:'Edit',onProgress:()=>{wrongModeEffects++;}}}));assert.equal(wrongModeEffects,0);assert.ok(ui.container.querySelector('.club-edit'));}
 finally{await ui.close();server.restore();}
});

test('clearing a hover preview after a content update restores the playhead and resets its origin',async()=>{
 const p=fixture(),server=mockApp(p);let editor:EditorBridge|null=null;const ui=await mountUI(createElement<{embedded?:EmbeddedRecorder}>(App,{embedded:{projectId:p.id,mode:'Edit',onBack:noop,onEditor:e=>{editor=e;}}}));
 try{const bridge=editor as EditorBridge|null;assert.ok(bridge);await act(async()=>button(ui.container,'More').click());const graphics=[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item=>item.textContent?.trim()==='Graphics')!;assert.ok(graphics);await act(async()=>graphics.click());const card=ui.container.querySelector('.motion-gallery button')!;
  const hover=()=>card.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:null}));const before=bridge.context().playhead;await act(async()=>hover());assert.ok(bridge.context().playhead>before);await server.update({...p,name:'edited during hover'});assert.equal(bridge.context().playhead,before);assert.equal(ui.container.querySelector('.club-preview-badges'),null);
  await act(async()=>hover());assert.ok(bridge.context().playhead>before);await act(async()=>card.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body})));assert.equal(bridge.context().playhead,before,'a second hover uses its own restored origin');
 }finally{await ui.close();server.restore();}
});

test('App serializes the full review key only while a preview needs it',async()=>{
 const p=fixture(),server=mockApp(p),stringify=JSON.stringify;let keys=0,editor:EditorBridge|null=null;
 JSON.stringify=(value,replacer,space)=>{if(value&&typeof value==='object'&&value.id===p.id&&'captions'in value&&!('updatedAt'in value))keys++;return Reflect.apply(stringify,JSON,[value,replacer,space]);};
 let ui:Awaited<ReturnType<typeof mountUI>>|undefined;
 try{ui=await mountUI(createElement<{embedded?:EmbeddedRecorder}>(App,{embedded:{projectId:p.id,mode:'Edit',onBack:noop,onEditor:e=>{editor=e;}}}));assert.equal(keys,0);await server.update({...p,notes:'Ordinary content edit'});assert.equal(keys,0,'closed previews do not serialize on edit');await act(async()=>{editor!.preview({type:'add_motion_block',template:'title-card',start:1,text:'Title'},'card');});assert.ok(keys>0);assert.ok(ui.container.querySelector('.club-preview-badges'));}finally{if(ui)await ui.close();JSON.stringify=stringify;server.restore();}
});
