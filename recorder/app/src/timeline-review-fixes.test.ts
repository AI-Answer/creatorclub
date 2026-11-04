import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,projectDuration,type Project,type RecordedTake} from '../shared/types';
import {layoutsProblem,retimeLayouts} from '../shared/layouts';
import {freeDelta,moveEffects,resizeEffect,rowItems,insertGap} from './timeline-edit';
import {clipboardEnd,cutSelection,copySelection,pasteSelection} from './editing';
import {confirmTake,archiveSceneTake,activateSceneTake,updateSceneTake,moveSceneTake,deleteSceneTake} from './recorded-takes';

const layout=(id:string,start:number,duration:number)=>({id,start,duration,preset:'Creator' as const});
function fixture(){
 const p=createProject('Layout regression');p.scenes=[{id:'one',name:'One',script:'',notes:'',start:0,duration:5},{id:'two',name:'Two',script:'',notes:'',start:5,duration:5}];
 p.media=[{id:'screen',name:'screen',path:'/tmp/screen.mov',kind:'video',duration:100,width:1920,height:1080,hasAudio:false}];
 p.clips=[0,5].map((start,i)=>({id:`clip${i}`,mediaId:'screen',name:'screen',track:'screen' as const,start,sourceIn:0,sourceOut:5,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}));
 p.layouts=[layout('inside',1,2),layout('crossing',4,2),layout('later',7,2)];return p;
}
const take=(id='new',duration=8):RecordedTake=>({id,sceneId:'one',createdAt:'2026-11-03',media:[{id,name:id,path:`/tmp/${id}.mov`,kind:'video',duration,width:1920,height:1080,hasAudio:false}],tracks:['screen'],offsets:[0]});
const spans=(p:Project)=>p.layouts?.map(l=>[l.id,l.start,l.duration]);
test('P1 frame nudge clamps to the actual layout boundary and remains savable',()=>{
 const p=fixture();p.layouts=[layout('a',0,1),layout('b',1.033,1)];const items=rowItems(p),moving=items.filter(i=>i.id==='a');
 const delta=freeDelta(moving,1/30,items);moveEffects(p,new Set(['a']),delta);
 assert.ok(p.layouts[0].start+p.layouts[0].duration<=p.layouts[1].start,'no overlap, including sub-millisecond overlaps');assert.equal(layoutsProblem(p.layouts),null);
 // Even a smaller overlap than validation's tolerance must land exactly at the boundary.
 const tiny=freeDelta(moving,.03305,items);assert.ok(tiny<=.033+1e-12);
});
test('P1 resizing an existing short layout at a neighbour never forces it longer',()=>{
 const p=fixture();p.layouts=[layout('a',1,.05),layout('b',1.05,1)];const before=structuredClone(p.layouts);
 for(const delta of [0,.2,-.2]){resizeEffect(p,'a','right',delta);assert.deepEqual(p.layouts,before);assert.equal(layoutsProblem(p.layouts),null);}
 resizeEffect(p,'a','left',.2);assert.deepEqual(p.layouts,before);
});
for(const mode of ['keep-both','replace-matching','record-over'] as const)test(`P2 durable ${mode} retimes later and crossing layout intervals`,()=>{
 const p=fixture();confirmTake(p,{...take(),mode});const delta=p.scenes[0].duration-5;
 assert.equal(p.layouts!.find(l=>l.id==='later')!.start,7+delta);assert.deepEqual(spans(p)?.find(l=>l[0]==='inside'),['inside',1,2]);
 assert.equal(layoutsProblem(p.layouts),null);assert.equal(p.layouts!.find(l=>l.id==='crossing')!.duration,2+delta);
});
test('P2 archive, restore, sync, move and delete retime layout intervals',()=>{
 for(const action of ['archive','restore','sync','move','delete'] as const){
  const p=fixture(),t=take();confirmTake(p,{...t,mode:'keep-both'});
  // Isolate each operation from confirmation so an omitted remap fails this test too.
  p.layouts=[layout('later',p.scenes[1].start+2,2),layout('crossing',p.scenes[1].start-1,2)];const previous=p.scenes[1].start;
  if(action==='restore'){archiveSceneTake(p,t.id);p.layouts=[layout('later',p.scenes[1].start+2,2)];activateSceneTake(p,'one',t.id,'keep-both');}
  else if(action==='archive')archiveSceneTake(p,t.id);
  else if(action==='sync')updateSceneTake(p,t.id,{offsets:[2]});
  else if(action==='move')moveSceneTake(p,t.id,'two');
  else deleteSceneTake(p,t.id);
  assert.equal(p.layouts!.find(l=>l.id==='later')!.start,p.scenes[1].start+2,action);assert.equal(layoutsProblem(p.layouts),null,action);
  if(action==='sync')assert.equal(p.scenes[1].start,previous+2);
 }
});
test('P2 layout-only copy, paste and duplicate preserve layouts, identity and avoid collisions',()=>{
 const p=fixture();p.layouts=[layout('a',1,2),layout('b',5,2)];const before=structuredClone(p),data=copySelection(p,new Set(['a']))!;
 assert.ok(data,'a layout-only selection can be copied');assert.deepEqual(p,before);
 const ids=pasteSelection(p,data,2);assert.equal(ids.length,1);assert.ok(!['a','b'].includes(ids[0]));assert.equal(layoutsProblem(p.layouts),null);
 const copied=p.layouts!.find(l=>l.id===ids[0])!;assert.equal(copied.preset,'Creator');assert.equal(copied.duration,2);
 const duplicate=pasteSelection(p,data,7);assert.equal(p.layouts!.find(l=>l.id===duplicate[0])!.start,7);assert.equal(projectDuration(p)>=9,true);assert.equal(layoutsProblem(p.layouts),null);
});

test('P2 Cut copies layouts before removal and retains anything unsupported',()=>{
 const p=fixture();p.markers=[{id:'note',time:1,name:'Keep me'}];const before=structuredClone(p);
 assert.equal(cutSelection(p,new Set(['note'])),null);assert.deepEqual(p,before);
 const data=cutSelection(p,new Set(['inside','note']))!;assert.equal(data.layouts?.[0].id,'inside');assert.ok(!p.layouts!.some(l=>l.id==='inside'));assert.deepEqual(p.markers,before.markers);
 assert.equal(clipboardEnd(data),3);assert.equal(clipboardEnd(data)-data.start,2);const ids=pasteSelection(p,data,10);assert.equal(p.layouts!.find(l=>l.id===ids[0])!.start,10);
});
test('P2 inserting copied layouts splits a spanning layout and preserves mixed selection timing',()=>{
 const p=fixture();p.layouts=[layout('all',0,10)];const source=fixture();source.layouts=[layout('copied',0,2)];const data=copySelection(source,new Set(['clip0','copied']))!;
 assert.equal(clipboardEnd(data),5);insertGap(p,3,5,new Set(['role:screen','layouts']));const ids=pasteSelection(p,data,3);
 assert.equal(layoutsProblem(p.layouts),null);assert.deepEqual(p.layouts!.map(l=>[l.start,l.duration]),[[0,3],[3,2],[8,7]]);
 assert.equal(p.clips.find(c=>ids.includes(c.id))!.start,3);assert.equal(data.layouts![0].start,0,'clipboard remains reusable');
});
test('P2 layout remapping removes a shorter take tail without overlaps or zero-duration stretches',()=>{
 const p=fixture();p.layouts=[layout('before',0,1),layout('span',2,5),layout('deleted',7,1),layout('after',8,2)];retimeLayouts(p,8,-5);
 assert.deepEqual(spans(p),[['before',0,1],['span',2,1],['after',3,2]]);assert.equal(layoutsProblem(p.layouts),null);
});
test('P1 infeasible resize bounds leave an existing interval untouched',()=>{
 const p=fixture();p.layouts=[layout('short',1,.05),layout('next',1.05-5e-7,1)];const before=structuredClone(p.layouts);resizeEffect(p,'short','right',1);assert.deepEqual(p.layouts,before);
});

test('P2 Cut preserves the uncopied part of a sentence crossing narration clips',()=>{
 const p=fixture();p.clips.forEach(c=>{c.track='audio';});p.media.push({...p.media[0],id:'other-source'});p.clips[1].mediaId='other-source';p.captions=[{id:'sentence',start:1,end:9,text:'first later',words:[{text:'first',start:1,end:2},{text:'later',start:7,end:8}]}];
 const data=cutSelection(p,new Set(['clip0']))!;assert.equal(data.captions[0].text,'first');assert.equal(p.captions[0].text,'later');assert.equal(p.captions[0].words![0].start,7);
 const capOnly=copySelection(p,new Set([p.captions[0].id]))!;assert.equal(capOnly.captions[0].text,'later','an explicit caption can be copied without selecting its audio');
});
