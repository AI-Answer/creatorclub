import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,clipDuration,type Clip,type Project} from '../shared/types';
import {clipLayerRowId} from '../shared/timeline-layers';
import {applyProjectChange} from './project-draft';
import {copySelection,pasteSelection} from './editing';
import {deleteTranscriptSelection,transcriptWords} from './transcript-editing';
import {applyClipStarts,closeRange,deleteItems,ensureLinks,freeDelta,insertGap,linkGroups,linkedIds,planClipMove,remapLinks,rowItems,rowsOverlap,splitLinked,syncScenesToTakes,trimBounds,trimClips,unlinkClips} from './timeline-edit';

/**
 * Random edit sequences (fix round 2): moves, inserts, nudges, ripple and plain trims, splits, deletes with and without ripple, transcript deletes,
 * Remove pauses cuts, paste, duplicate, unlink, undo and redo, on takes whose camera starts 0.4 s after the screen. After every step:
 * deleting any one piece group removes only that group's clips; no row overlaps; no negative start; a link group holds at most one clip per row;
 * the clips of a link group stay in sync with each other; scenes never overlap.
 */
const clip=(id:string,track:Clip['track'],start:number,length:number,extra:Partial<Clip>={}):Clip=>({id,mediaId:'m',name:id,track,start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects(),...extra});
function make():Project{
 const p=createProject('x');p.media=[{id:'m',name:'m',path:'/m',kind:'video',duration:600,width:1920,height:1080,hasAudio:true}];
 p.clips=[clip('s1','screen',0,30,{recordingTakeId:'t1'}),clip('c1','camera',.4,30,{recordingTakeId:'t1'}),clip('a1','audio',0,30,{recordingTakeId:'t1'}),
  clip('s2','screen',30.4,20,{recordingTakeId:'t2'}),clip('a2','audio',30.4,20,{recordingTakeId:'t2'}),clip('o','overlay',5,8),clip('mus','music',0,70)];
 p.scenes=[{id:'S1',name:'a',script:'',notes:'',start:0,duration:30.4},{id:'S2',name:'b',script:'',notes:'',start:30.4,duration:20},{id:'S3',name:'c',script:'',notes:'',start:50.4,duration:0}];
 p.recordedTakes=[{id:'t1',createdAt:'',sceneId:'S1',media:[],tracks:[],offsets:[]},{id:'t2',createdAt:'',sceneId:'S2',media:[],tracks:[],offsets:[]}];
 // One timed word a second across both takes, so transcript deletes cut real ranges.
 p.captions=[{id:'w1',start:0,end:30,text:'',words:[]},{id:'w2',start:30.4,end:50.4,text:'',words:[]}];
 for(const c of p.captions){for(let t=c.start;t+.5<=c.end;t++)c.words!.push({text:`w${Math.round(t)}`,start:t,end:t+.5});c.text=c.words!.map(w=>w.text).join(' ');}
 return p;
}
let seed=1;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};const pick=<X,>(list:readonly X[])=>list[Math.floor(rnd()*list.length)];
const length=(p:Project)=>Math.max(1,...p.clips.map(c=>c.start+clipDuration(c)));
const edited=(p:Project)=>p.clips.filter(c=>c.track!=='music');
const ops:Record<string,(p:Project)=>void>={
 pauses:p=>{const a=rnd()*length(p);closeRange(p,a,a+.2+rnd()*2);},
 split:p=>{const c=rnd()<.5?pick(edited(p)):undefined;splitLinked(p,rnd()*length(p),c?linkedIds(p.clips,[c.id]):new Set());},
 delete:p=>{const c=pick(edited(p));if(c){deleteItems(p,[c.id],rnd()<.7);syncScenesToTakes(p);}},
 move:p=>{const c=pick(edited(p));if(!c)return;const ids=linkedIds(p.clips,[c.id]),plan=planClipMove(p,ids,(rnd()-.5)*40,rnd()*length(p));ensureLinks(p);applyClipStarts(p,plan.starts);syncScenesToTakes(p);},
 nudge:p=>{const c=pick(edited(p));if(!c)return;const ids=linkedIds(p.clips,[c.id]),items=rowItems(p),moving=items.filter(i=>ids.has(i.id)),delta=freeDelta(moving,rnd()<.5?-1:1,items);if(delta){ensureLinks(p);applyClipStarts(p,new Map(moving.map(m=>[m.id,m.start+delta])));syncScenesToTakes(p);}},
 trim:p=>{const c=pick(edited(p));if(!c)return;const side=rnd()<.5?'left':'right',ripple=rnd()<.6,edge=(x:Clip)=>side==='left'?x.start:x.start+clipDuration(x);
  const ids=new Set([...linkedIds(p.clips,[c.id])].filter(id=>Math.abs(edge(p.clips.find(x=>x.id===id)!)-edge(c))<1e-3)),b=trimBounds(p,ids,side,ripple),d=Math.max(b.min,Math.min(b.max,(rnd()-.5)*10));
  if(d){ensureLinks(p);trimClips(p,ids,side,d,ripple);syncScenesToTakes(p);}},
 transcript:p=>{const words=transcriptWords(p);if(!words.length)return;const i=Math.floor(rnd()*words.length),j=Math.min(words.length-1,i+Math.floor(rnd()*3));try{deleteTranscriptSelection(p,{anchor:i,focus:j});}catch{/* untimed selection */}},
 paste:p=>{const c=pick(edited(p));if(!c)return;const data=copySelection(p,linkedIds(p.clips,[c.id]));if(!data)return;ensureLinks(p);const t=rnd()*length(p);
  const at=Math.max(t,...p.clips.filter(x=>x.track!=='music'&&x.start<t&&x.start+clipDuration(x)>t).map(x=>x.start+clipDuration(x))),size=Math.max(...data.clips.map(x=>x.start+clipDuration(x)))-data.start;
  insertGap(p,at,size,new Set(data.clips.map(x=>clipLayerRowId(x,p))));remapLinks(p,new Set(pasteSelection(p,data,at)));},
 duplicate:p=>{const c=pick(edited(p));if(!c)return;const data=copySelection(p,linkedIds(p.clips,[c.id]));if(!data)return;const end=Math.max(...data.clips.map(x=>x.start+clipDuration(x)));
  ensureLinks(p);insertGap(p,end,end-data.start,new Set(data.clips.map(x=>clipLayerRowId(x,p))));remapLinks(p,new Set(pasteSelection(p,data,end)));},
 unlink:p=>{const c=pick(p.clips);if(c)unlinkClips(p,[c.id]);},
};
function problems(p:Project):string[]{
 const out:string[]=[];
 // Clip rows. (Captions can overlap after a non-ripple delete leaves words where no clip plays and another clip moves there; they are not clips.)
 if(rowsOverlap(rowItems({...p,captions:[]}))){const items=rowItems({...p,captions:[]});const rows=[...new Set(items.map(i=>i.row))].filter(r=>rowsOverlap(items.filter(i=>i.row===r)));out.push(`row ${rows.join(',')} overlaps`);}
 if(p.clips.some(c=>c.start<-1e-6))out.push('negative start');
 const groups=linkGroups(p.clips),members=new Map<string,Clip[]>();for(const c of p.clips){const key=groups.get(c.id)!;members.set(key,[...(members.get(key)??[]),c]);}
 for(const [key,list] of members){
  const rows=list.map(c=>clipLayerRowId(c,p));if(new Set(rows).size<rows.length)out.push(`group ${key} has two clips on one row`);
  // Every clip of one take keeps its offset to the others: timeline start minus source time, plus the camera's 0.4 s.
  const offsets=list.filter(c=>c.track!=='overlay').map(c=>c.start-c.sourceIn/c.speed-(c.track==='camera'?.4:0));if(offsets.length>1&&Math.max(...offsets)-Math.min(...offsets)>1e-6)out.push(`group ${key} out of sync`);
 }
 const scenes=p.scenes.filter(s=>s.duration>1e-3).sort((a,b)=>a.start-b.start);for(let i=1;i<scenes.length;i++)if(scenes[i].start<scenes[i-1].start+scenes[i-1].duration-1e-3)out.push('scenes overlap');
 if(p.clips.some(c=>clipDuration(c)<.05-1e-9))out.push('a sliver under 0.05 s');
 // Deleting any one piece group: clips outside the group and outside the time it closes are never removed or changed, except moved up by that time.
 // Three piece groups per step (the 3,600 steps cover them all many times over).
 for(const c of [...p.clips.filter(x=>x.track!=='music')].sort(()=>rnd()-.5).slice(0,3)){for(const ripple of [true,false]){const group=linkedIds(p.clips,[c.id]);let done={closed:[] as Array<[number,number]>,swept:[] as string[]};
  const q=applyProjectChange(p,d=>{done=deleteItems(d,[c.id],ripple);}),now=new Map(q.clips.map(x=>[x.id,x]));
  for(const x of p.clips){if(group.has(x.id))continue;const stop=x.start+clipDuration(x);if(done.closed.some(([a,b])=>x.start<b-1e-6&&stop>a+1e-6))continue;
   const y=now.get(x.id),shift=done.closed.filter(([,b])=>b<=x.start+1e-6).reduce((n,[a,b])=>n+b-a,0);
   if(!y)out.push(`deleting ${c.id} also removed ${x.id}`);else if(Math.abs(y.start-(x.start-shift))>1e-6||Math.abs(y.sourceIn-x.sourceIn)>1e-6||Math.abs(y.sourceOut-x.sourceOut)>1e-6)out.push(`deleting ${c.id} changed ${x.id} beyond the shift`);}
 }}
 return out;
}

test('random edit sequences keep links, rows and scenes consistent',t=>{
 const names=Object.keys(ops),failures:string[]=[];let operations=0;
 for(let run=0;run<300;run++){
  seed=run+1;let p=make();const history:string[]=[],undo:Project[]=[],redo:Project[]=[];
  for(let step=0;step<12;step++){
   const r=rnd();
   if(r<.08&&undo.length){redo.push(p);p=undo.pop()!;history.push('undo');}
   else if(r<.12&&redo.length){undo.push(p);p=redo.pop()!;history.push('redo');}
   else{const name=pick(names);history.push(name);const before=p;p=applyProjectChange(p,d=>ops[name](d));undo.push(before);redo.length=0;}
   operations++;
   const found=problems(p);if(found.length){failures.push(`run ${run}: ${history.join(' > ')}: ${found[0]}`);break;}
  }
 }
 assert.deepEqual(failures.slice(0,8),[],`${failures.length} of 300 sequences broke an invariant`);
 assert.ok(operations>3000,`${operations} operations`);t.diagnostic(`${operations} operations in 300 sequences`);

});
