import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,type Clip} from '../shared/types';
import {ensureLinks,linkedIds,splitLinked} from './timeline-edit';

export function packageFixture(){
 const p=createProject('Four sources');p.scenes=[{id:'scene',name:'Scene 2',script:'',notes:'',start:0,duration:12}];
 p.media=['camera','mic','screen','system'].map(id=>({id,name:id,path:`/tmp/${id}`,kind:id==='mic'||id==='system'?'audio' as const:'video' as const,duration:20,width:1920,height:1080,hasAudio:id==='mic'||id==='system',...(id==='mic'||id==='system'?{audioRole:id==='mic'?'microphone' as const:'system' as const}:{})}));
 p.clips=p.media.map((m,i)=>({id:m.id,mediaId:m.id,name:m.id,track:(['camera','audio','screen','audio'] as const)[i],audioRole:m.audioRole,start:0,sourceIn:[.03,.033,.05,.05][i],sourceOut:[.03,.033,.05,.05][i]+12,speed:1,gain:1,muted:false,linkId:'take',recordingTakeId:'take',transform:defaultTransform(),effects:defaultEffects()}));
 p.recordedTakes=[{id:'take',sceneId:'scene',createdAt:'2026-11-04',media:structuredClone(p.media),tracks:p.clips.map(c=>c.track),offsets:[0,0,0,0],synchronization:{version:2,startedAtMs:0,originAtMs:0,duration:12,sources:p.clips.map(c=>({mediaId:c.mediaId,firstSampleAtMs:0,offset:0,firstPts:0,decodedDuration:20,sourceIn:c.sourceIn,sourceOut:c.sourceOut}))}}];return p;
}
test('four-source regression: ensureLinks and a blade split never strand the microphone',()=>{
 const p=packageFixture();ensureLinks(p);assert.equal(linkedIds(p.clips,['camera']).size,4);
 assert.equal(splitLinked(p,4.26,new Set(['camera'])),4);
 for(const start of [0,4.26]){const clips=p.clips.filter(c=>Math.abs(c.start-start)<1e-7);assert.equal(clips.length,4);assert.equal(new Set(clips.map(c=>c.linkId)).size,1);}
});

const mic=(p:ReturnType<typeof packageFixture>)=>p.clips.find(c=>c.id==='mic')!;
const {canCombineTake,splitTakeSources,combineTakeSources,takeLinkMembers,takeMoment,takeSyncOffset,linkBackToTake,snapBackToTake,unlinkClips,insertGap,applyClipStarts,remapLinks,rowItems,rowsOverlap}=await import('./timeline-edit');
const {takeClipViews}=await import('./timeline-take-view');
const {cutTimelineRange}=await import('../shared/timeline-edits');
const {copySelection,pasteSelection}=await import('./editing');
const {takePackageActions,takeSourceName,takeSourceState,unlinkTakeAction}=await import('./take-package-actions');

test('split and combine only change presentation, retain four source links and reject unequal edges or custom layers',()=>{
 const p=packageFixture(),before=structuredClone(p);assert.equal(takeClipViews(p).length,1);assert.equal(canCombineTake(p,'mic'),true);
 assert.equal(splitTakeSources(p,'mic'),true);assert.ok(p.clips.every(c=>c.split));assert.equal(takeClipViews(p).length,4);assert.equal(new Set(takeClipViews(p).map(v=>v.row)).size,4);
 assert.equal(takeLinkMembers(p,'mic').length,4);assert.equal(combineTakeSources(p,'mic'),true);assert.deepEqual(p,before);
 splitTakeSources(p,'mic');mic(p).sourceOut-=.2;const changed=structuredClone(p);assert.equal(combineTakeSources(p,'mic'),false);assert.deepEqual(p,changed);
 p.timelineLayers=[{id:'layer',name:'Layer',kind:'audio',order:3}];mic(p).layerId='layer';assert.equal(canCombineTake(p,'mic'),false);assert.equal(splitTakeSources(p,'missing'),false);
});
test('four-source recovery: split, unlink microphone, move it, then snap and relink source ranges in one group',()=>{
 const p=packageFixture();splitTakeSources(p,'mic');splitLinked(p,4.26,new Set(['camera']));
 const before=structuredClone(mic(p));unlinkClips(p,['mic']);applyClipStarts(p,new Map([['mic',7.5]]));
 assert.equal(takeSourceState(p,mic(p)),'out of sync');assert.equal(takeSyncOffset(p,'mic'),7.5);assert.equal(linkBackToTake(p,'mic'),false);
 assert.deepEqual(snapBackToTake(p,'mic'),{ok:true,message:'Back in sync and linked to its take.',delta:-7.5});
 const restored=mic(p),group=takeLinkMembers(p,'mic');assert.equal(group.length,4);assert.equal(restored.recordingTakeId,'take');assert.equal(restored.sourceIn,before.sourceIn);assert.equal(restored.sourceOut,before.sourceOut);assert.ok(group.every(c=>c.start===0&&c.split&&Math.abs(takeMoment(p,c)!)<1e-7));assert.equal(rowsOverlap(rowItems(p)),false);assert.equal(takeSyncOffset(p,'mic'),0);
});
test('link back joins aligned overlapping siblings and carries split state, but never an adjacent slice or another take',()=>{
 const p=packageFixture();splitTakeSources(p,'camera');splitLinked(p,4.26,new Set(['camera']));unlinkClips(p,['mic']);
 assert.equal(linkBackToTake(p,'mic'),true);assert.equal(takeLinkMembers(p,'mic').length,4);assert.ok(takeLinkMembers(p,'mic').every(c=>c.split));assert.equal(linkBackToTake(p,'mic'),false);
 const c=mic(p);c.recordingTakeId='different';assert.equal(linkBackToTake(p,'mic'),false);assert.equal(takeSyncOffset(p,'mic'),undefined);assert.equal(takeMoment(p,c),undefined);
});
test('snap uses recording offsets, trimmed source origins and speed, moves linked companions and captions together',()=>{
 const p=packageFixture();for(const c of p.clips){c.start=2;c.speed=2;c.sourceIn+=2;c.sourceOut-=2;}
 // The camera entered one recording second late, so its synchronized timeline edge is half a second later.
 p.recordedTakes![0].offsets[0]=1;p.clips[0].start+=.5;
 unlinkClips(p,['mic']);p.clips[0].linkId=p.clips[2].linkId=p.clips[3].linkId='picture';mic(p).start+=3;
 p.captions=[{id:'words',text:'Speech',start:5,end:6,words:[{text:'Speech',start:5,end:6}]}];
 assert.equal(takeSyncOffset(p,'mic'),3);assert.equal(snapBackToTake(p,'mic').ok,true);assert.equal(mic(p).start,2);assert.equal(takeLinkMembers(p,'mic').length,4);assert.equal(p.captions[0].start,2);assert.equal(p.captions[0].words![0].start,2);
 // Two sources can already be linked to each other while detached from the picture.
 const q=packageFixture();unlinkClips(q,['mic']);q.clips[1].linkId=q.clips[3].linkId='sound';q.clips[0].linkId=q.clips[2].linkId='picture';applyClipStarts(q,new Map([['mic',3]]));
 assert.equal(snapBackToTake(q,'mic').ok,true);assert.ok(q.clips.every(c=>c.start===0));assert.equal(new Set(q.clips.map(c=>c.linkId)).size,1);
});
test('snap refuses occupied lanes, negative starts, unavailable timing and incompatible linked clocks without any mutation',()=>{
 for(const scenario of ['collision','negative','missing','rate','broken-group'] as const){
  const p=packageFixture();unlinkClips(p,['mic']);p.clips[0].linkId=p.clips[2].linkId=p.clips[3].linkId='picture';mic(p).start=3;
  if(scenario==='collision')p.clips.push({...structuredClone(mic(p)),id:'blocker',start:0,sourceOut:mic(p).sourceIn+1,recordingTakeId:undefined,linkId:'blocker'});
  if(scenario==='negative'){mic(p).sourceIn-=.02;}
  if(scenario==='missing')p.recordedTakes=[];
  if(scenario==='rate')mic(p).speed=2;
  if(scenario==='broken-group'){p.clips[3].linkId=mic(p).linkId;p.clips[3].start=4;}
  const before=structuredClone(p),result=snapBackToTake(p,'mic');assert.equal(result.ok,false,scenario);assert.deepEqual(p,before,scenario);
 }
});
test('no badge for distant or unknown take siblings; offset is signed and only meaningful during an overlap',()=>{
 const p=packageFixture();unlinkClips(p,['mic']);mic(p).start=20;assert.equal(takeSyncOffset(p,'mic'),undefined);
 mic(p).start=2;assert.equal(takeSyncOffset(p,'mic'),2);mic(p).start=0;mic(p).sourceIn+=2;assert.equal(takeSyncOffset(p,'mic'),-2);assert.equal(takeSyncOffset(p,'missing'),undefined);
});
test('row inserts, ripple cuts and copy/paste carry split flags and keep both audio sources in each slice',()=>{
 const p=packageFixture();splitTakeSources(p,'mic');insertGap(p,4,2,new Set(['role:screen']));
 for(const start of [0,6]){const slice=p.clips.filter(c=>c.start===start);assert.equal(slice.length,4);assert.equal(new Set(slice.map(c=>c.linkId)).size,1);assert.ok(slice.every(c=>c.split));}
 const q=packageFixture();splitTakeSources(q,'mic');cutTimelineRange(q,4,5);ensureLinks(q);
 for(const start of [0,4]){const slice=q.clips.filter(c=>c.start===start);assert.equal(slice.length,4);assert.equal(new Set(slice.map(c=>c.linkId)).size,1);assert.ok(slice.every(c=>c.split));}
 const copy=copySelection(q,linkedIds(q.clips,['mic']))!;const ids=pasteSelection(q,copy,20);remapLinks(q,new Set(ids));assert.equal(ids.length,4);assert.ok(q.clips.filter(c=>ids.includes(c.id)).every(c=>c.split&&!c.recordingTakeId));assert.equal(linkedIds(q.clips,ids).size,4);
});
test('shared commands offer only eligible split/combine actions and plain notices for failed recovery',()=>{
 const p=packageFixture();assert.equal(takeSourceName(p,mic(p)),'Mic');assert.equal(takeSourceName(p,p.clips[3]),'System audio');assert.equal(takeSourceState(p,mic(p)),'linked');
 let actions=takePackageActions(p,'mic');assert.deepEqual(actions.map(a=>a.label),['Split audio and video']);assert.equal(actions[0].run(p).ok,true);assert.equal(takeSourceState(p,mic(p)),'split, linked');
 actions=takePackageActions(p,'mic');assert.deepEqual(actions.map(a=>a.label),['Combine into one block']);assert.equal(actions[0].run(p).ok,true);
 assert.equal(unlinkTakeAction('mic').run(p).ok,true);assert.equal(takeSourceState(p,mic(p)),'not linked to the camera');assert.ok(takePackageActions(p,'mic').some(a=>a.label==='Link back to its take'));
 mic(p).start=2;assert.match(takePackageActions(p,'mic').find(a=>a.label==='Link back to its take')!.run(p).message,/Snap it back/);assert.equal(takePackageActions(p,'missing').length,0);
});

import {mountUI} from './test-dom';
import {act,createElement} from 'react';
import {applyProjectChange} from './project-draft';
import {EditHistory} from './edit-history';
import {createPlayhead} from './playhead';
const {TimelineClub}=await import('./TimelineClub');
const {ClubClipPanel}=await import('./ClubClipPanel');
const {timelineContextItems,timelineMoreItems}=await import('./edit-menus');
test('render: same-take solid/dashed outlines, split chain, signed badge and one undo for click recovery',async()=>{
 let p=packageFixture();splitTakeSources(p,'mic');unlinkClips(p,['mic']);for(const c of p.clips)if(c.id!=='mic')c.linkId='picture';mic(p).start=2;
 const history=new EditHistory<ReturnType<typeof packageFixture>>(),notices:string[]=[];let changes=0;
 const element=(selectedIds=new Set(['camera']))=>createElement(TimelineClub,{project:p,playhead:createPlayhead(0),scale:50,onScale:()=>{},selectedIds,onSelectMany:()=>{},onSeek:()=>{},change:fn=>{history.record(p,()=>80);p=applyProjectChange(p,fn);changes++;},onDropMedia:()=>{},tool:'select',onSplit:()=>{},follow:false,showWaveforms:false,onOpen:()=>{},onNotice:m=>notices.push(m)});
 const ui=await mountUI(element());
 try{
  assert.ok(ui.container.querySelector('[data-clip-id="screen"].take-related-linked'));
  assert.ok(ui.container.querySelector('[data-clip-id="mic"].take-related-take'));
  assert.equal(ui.container.querySelectorAll('.club-take-chain').length,3);
  const badge=ui.container.querySelector<HTMLButtonElement>('.club-sync-badge')!;assert.match(badge.textContent!,/\+2.0 s/);assert.match(badge.getAttribute('aria-label')!,/Snap back in sync/);
  await act(async()=>badge.click());assert.equal(changes,1);assert.equal(history.past.length,1);assert.equal(mic(p).start,0);assert.equal(takeLinkMembers(p,'mic').length,4);assert.equal(notices[0],'Back in sync and linked to its take.');
  await ui.render(element(new Set()));assert.equal(ui.container.querySelector('.club-sync-badge'),null);assert.equal(ui.container.querySelector('.take-related'),null);
  const screen=ui.container.querySelector('[data-clip-id="screen"]')!;
  await act(async()=>screen.dispatchEvent(new (window as unknown as {PointerEvent:typeof PointerEvent}).PointerEvent('pointerover',{bubbles:true})));
  assert.equal(ui.container.querySelectorAll('.take-related-linked').length,4);
 }finally{await ui.close();}
});
test('render: inspector names the scene, all four sources and shared package controls',async()=>{
 let p=packageFixture();const ui=await mountUI(createElement(ClubClipPanel,{project:p,clip:mic(p),change:fn=>{p=applyProjectChange(p,fn);}}));
 try{assert.match(ui.container.textContent!,/Scene 2 take/);for(const label of ['Camera','Screen','Mic','System audio'])assert.match(ui.container.querySelector('.club-take-info')!.textContent!,new RegExp(label));
  const split=[...ui.container.querySelectorAll('button')].find(b=>b.textContent==='Split audio and video')!;await act(async()=>split.click());assert.ok(p.clips.every(c=>c.split));assert.equal(takeLinkMembers(p,'mic').length,4);
 }finally{await ui.close();}
});
test('menus share package commands and omit combine while source edges differ',()=>{
 const p=packageFixture(),none=()=>{},actions={split:none,deleteClose:none,deleteKeepGap:none,duplicate:none,copy:none,paste:none,selectAll:none,addMarker:none,previousCut:none,nextCut:none,toggleLink:none,linked:true,blade:false,toggleBlade:none,waveforms:true,toggleWaveforms:none,addVideoLayer:none,addAudioLayer:none,takeItems:takePackageActions(p,'mic').map(a=>({label:a.label,fn:none}))};
 for(const menu of [timelineMoreItems(actions),timelineContextItems(actions)])assert.ok(menu.some(i=>typeof i==='object'&&'label' in i&&i.label==='Split audio and video'));
 splitTakeSources(p,'mic');mic(p).sourceOut-=1;assert.ok(!takePackageActions(p,'mic').some(a=>a.label==='Combine into one block'));
});

test('validation retains the optional true-only presentation flag in live and archived clips',async()=>{
 const {validateProject}=await import('../server/storage');const p=packageFixture();splitTakeSources(p,'mic');assert.doesNotThrow(()=>validateProject(p));
 (mic(p) as unknown as {split:boolean}).split=false;assert.throws(()=>validateProject(p),/split flag/);
});
test('saved take swaps retain split presentation and all four source links',async()=>{
 const {activateSceneTake}=await import('./scene-takes');const p=packageFixture();splitTakeSources(p,'mic');
 p.recordedTakes![0].timeline={start:0,duration:12,clips:structuredClone(p.clips),captions:[]};p.recordedTakes![0].confirmedAt='2026-11-04';
 activateSceneTake(p,'scene','take');ensureLinks(p);assert.equal(takeLinkMembers(p,'mic').length,4);assert.ok(p.clips.every(c=>c.split));
});

test('Borumi export treats source presentation as editor metadata and explains its native limit',async()=>{
 const {planNewBorumiProject}=await import('../server/borumi-new-project');const p=packageFixture();delete p.recordedTakes;delete p.canvas.backgroundPattern;p.canvas.padding=0;p.canvas.radius=0;splitTakeSources(p,'mic');
 const plan=planNewBorumiProject(p);assert.equal(plan.supported,true,plan.blockers.join('; '));assert.ok(plan.warnings.some(w=>w.includes('Split source presentation')));
});
test('inspector timing moves and trims all linked sources instead of separating the microphone',async()=>{
 let p=packageFixture();splitTakeSources(p,'mic');const ui=await mountUI(createElement(ClubClipPanel,{project:p,clip:mic(p),change:fn=>{p=applyProjectChange(p,fn);}}));
 try{
  assert.equal([...ui.container.querySelectorAll('button')].find(b=>b.textContent==='Timing')!.getAttribute('aria-expanded'),'true');
  assert.ok(ui.container.querySelector('[aria-label="Trim in"]'),'in and out fields are visible on opening');
  const input=ui.container.querySelector<HTMLInputElement>('[aria-label="Start"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'2');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.ok(p.clips.every(c=>c.start===2));assert.equal(takeLinkMembers(p,'mic').length,4);
 }finally{await ui.close();}
});

test('different source speeds show drift and refuse a move that cannot restore synchronization',()=>{
 const p=packageFixture();unlinkClips(p,['mic']);mic(p).speed=2;assert.notEqual(takeSyncOffset(p,'mic'),0);assert.match(snapBackToTake(p,'mic').message,/playback speeds/);
 const q=packageFixture();mic(q).sourceIn+=.5;mic(q).sourceOut+=.5;assert.equal(canCombineTake(q,'mic'),false);assert.equal(takeClipViews(q).length,4);
});
test('link back takes one slice per lane, so a source cut on its own never stacks two pieces in one group',()=>{
 const p=packageFixture();unlinkClips(p,['mic']);splitLinked(p,6,new Set(),'mic');
 const right=p.clips.find(c=>c.mediaId==='mic'&&c.start===6)!;unlinkClips(p,['camera']);
 // The camera overlaps both mic slices; linking it back must take the slice it shares most time with, not both.
 assert.equal(linkBackToTake(p,'camera'),true);const group=takeLinkMembers(p,'camera');
 assert.equal(group.filter(c=>c.mediaId==='mic').length,1);assert.ok(!group.some(c=>c.id===right.id)||!group.some(c=>c.id==='mic'));assert.equal(new Set(group.map(c=>c.track+':'+(c.audioRole??''))).size,group.length);
});
test('a snap moves only the clips it touches and the scene follows its take',()=>{
 const p=packageFixture();unlinkClips(p,['mic']);p.clips[0].linkId=p.clips[2].linkId=p.clips[3].linkId='picture';
 for(const c of p.clips)c.start+=2;p.scenes[0].start=2;applyClipStarts(p,new Map([['mic',5]]));const camera=p.clips[0];
 assert.equal(snapBackToTake(p,'mic').ok,true);assert.equal(p.clips[0],camera);assert.equal(mic(p).start,2);assert.equal(p.scenes[0].start,2);assert.equal(p.scenes[0].duration,12);
});
test('removing a custom audio layer sends system audio back to its own lane, not the mic lane',async()=>{
 const {removeTimelineLayer,clipLayerRowId}=await import('../shared/timeline-layers');
 const p=packageFixture();p.timelineLayers=[{id:'layer',name:'Layer',kind:'audio',order:3}];const system=p.clips.find(c=>c.id==='system')!;system.layerId='layer';
 assert.equal(removeTimelineLayer(p,'layer'),true);assert.equal(clipLayerRowId(system,p),'role:system-audio');assert.notEqual(clipLayerRowId(system,p),clipLayerRowId(mic(p),p));
});
