import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,clipDuration,type Clip,type Project} from '../shared/types';
import {applyProjectChange} from './project-draft';
import {deleteTranscriptSelection,transcriptWords} from './transcript-editing';
import {withoutRanges} from './club/recorder/edit-auto';
import {applyClipStarts,closeRange,deleteItems,ensureLinks,insertGap,isLinked,linkClips,linkedIds,planClipMove,remapLinks,rowItems,rowsOverlap,splitLinked,syncScenesToTakes,trimClips,unlinkClips} from './timeline-edit';

/** The review's probes (Task 2, fix round 1) as tests: pieces left by cuts stay separate, ripple trims and inserts never overlap, scenes follow their takes. */
const clip=(id:string,track:Clip['track'],start:number,length:number,extra:Partial<Clip>={}):Clip=>({id,mediaId:'m',name:id,track,start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects(),...extra});
function project(clips:Clip[]):Project{
 const p=createProject('x');p.media=[{id:'m',name:'m',path:'/m',kind:'video',duration:600,width:1920,height:1080,hasAudio:true}];p.clips=clips;
 p.scenes=[{id:'s1',name:'a',script:'',notes:'',start:0,duration:10},{id:'s2',name:'b',script:'',notes:'',start:10,duration:10}];return p;
}
const take=(n:number,start:number,length:number):Clip[]=>(['screen','camera','audio'] as const).map(track=>clip(`${track}${n}`,track,start,length,{recordingTakeId:`t${n}`}));
const overlaps=(p:Project)=>rowsOverlap(rowItems(p));
const withTakes=(p:Project)=>{p.recordedTakes=[1,2].map(n=>({id:`t${n}`,createdAt:'',sceneId:`s${n}`,media:[],tracks:[],offsets:[]}));return p;};

test('a linked take cut twice leaves three groups: deleting one middle piece keeps the others',()=>{
 const p=project(take(1,0,30));ensureLinks(p);closeRange(p,10,11);closeRange(p,20,21);
 assert.equal(p.clips.length,9);const middle=p.clips.find(c=>c.track==='screen'&&c.start>5&&c.start<15)!;
 assert.equal(linkedIds(p.clips,[middle.id]).size,3,'only the screen, camera and audio of that piece');
 deleteItems(p,[middle.id],true);
 assert.equal(p.clips.length,6);assert.deepEqual([...new Set(p.clips.map(c=>c.start))].sort((a,b)=>a-b),[0,10]);assert.equal(overlaps(p),false);
});

test('after a transcript delete or Remove pauses, deleting one piece keeps the rest',()=>{
 const p=project(take(1,0,30));ensureLinks(p);p.captions=[{id:'c',start:0,end:30,text:'one two three',words:[{text:'one',start:1,end:2},{text:'two',start:12,end:13},{text:'three',start:25,end:26}]}];
 const words=transcriptWords(p),two=words.findIndex(w=>w.text==='two');
 const cut=applyProjectChange(p,d=>{deleteTranscriptSelection(d,{anchor:two,focus:two});});
 assert.equal(cut.clips.length,6);const first=cut.clips.find(c=>c.track==='audio'&&c.start===0)!;
 const after=applyProjectChange(cut,d=>{deleteItems(d,[first.id],true);});assert.equal(after.clips.length,3,'the later piece survives');
 const paused=withoutRanges(p,[[5,6],[15,16]]);assert.equal(paused.clips.length,9);
 deleteItems(paused,[paused.clips.find(c=>c.track==='camera'&&c.start>10)!.id],true);assert.equal(paused.clips.length,6);
});

test('a pasted copy gets its own link; unlink then move moves one clip',()=>{
 const p=project(take(1,0,10));ensureLinks(p);p.clips.push(...p.clips.map(c=>({...c,id:'copy-'+c.id,start:20})));
 assert.equal(linkedIds(p.clips,['screen1']).size,6,'a link group is exactly the clips sharing a linkId, until the paste remaps them');
 remapLinks(p,new Set(['copy-screen1','copy-camera1','copy-audio1']));assert.equal(linkedIds(p.clips,['screen1']).size,3);
 unlinkClips(p,['screen1']);assert.equal(isLinked(p.clips,'screen1'),false);
 const move=planClipMove(p,new Set(['screen1']),2,5);applyClipStarts(p,move.starts);
 assert.deepEqual(p.clips.slice(0,3).map(c=>c.start),[2,0,0]);
 assert.equal(linkClips(p,['camera1','copy-camera1']),false,'clips that do not line up are not linked');
 assert.equal(linkClips(p,['camera1','audio1']),true);
});

test('a ripple trim closes or opens time on every track: no overlap with a two-clip music bed, scenes and markers follow',()=>{
 const p=project([clip('s','screen',0,30),clip('m1','music',0,60),clip('m2','music',60,60),clip('x','screen',30,10)]);p.markers=[{id:'k',time:35}];
 trimClips(p,new Set(['s']),'right',-5,true);
 assert.equal(overlaps(p),false);assert.deepEqual(p.clips.filter(c=>c.track==='screen').map(c=>[c.start,clipDuration(c)]),[[0,25],[25,10]]);assert.equal(p.markers![0].time,30);
 const q=project([clip('s','screen',0,10,{sourceIn:5,sourceOut:15}),clip('x','screen',10,10)]);q.scenes[1].start=10;
 trimClips(q,new Set(['s']),'left',-3,true);
 assert.deepEqual(q.clips.map(c=>[c.start,c.sourceIn,clipDuration(c)]),[[0,2,13],[13,0,10]],'extends at the start; the next clip and scene move later');
 assert.equal(q.scenes[1].start,13);assert.equal(overlaps(q),false);
 trimClips(q,new Set(['s']),'left',4,true);assert.deepEqual(q.clips.map(c=>[c.start,clipDuration(c)]),[[0,9],[9,10]]);
});

test('an insert move whose linked rows have different boundaries never overlaps: it slides instead',()=>{
 const p=project([clip('M1','screen',0,5,{linkId:'L'}),clip('M2','camera',0,5,{linkId:'L'}),clip('X','screen',20,10),clip('Y','camera',17,4)]);
 const ids=linkedIds(p.clips,['M1']);
 for(const pointer of [18,19,20,21,22,23,24,25,26,27]){const q=structuredClone(p),plan=planClipMove(q,ids,pointer-2,pointer);applyClipStarts(q,plan.starts);assert.equal(overlaps(q),false,`pointer ${pointer}: ${plan.kind}`);}
});

test('inserting time cuts clips that run across the insert point, so a paste overlaps nothing',()=>{
 const p=project([clip('a','screen',0,10),clip('m','music',0,30)]);
 insertGap(p,4,3,new Set(['role:screen']));
 assert.deepEqual(p.clips.filter(c=>c.track==='screen').map(c=>[c.start,clipDuration(c),c.sourceIn]),[[0,4,0],[7,6,4]]);
 assert.equal(p.clips.filter(c=>c.track==='music').length,1,'other rows stay whole');
 p.clips.push(clip('paste','screen',4,3));assert.equal(overlaps(p),false);
});

test('scenes follow their takes after a move, insert or trim',()=>{
 const p=withTakes(project([...take(1,0,10),...take(2,10,10)]));
 const ids=linkedIds(p.clips,['screen2']),move=planClipMove(p,ids,-10,1);assert.equal(move.kind,'insert');applyClipStarts(p,move.starts);syncScenesToTakes(p);
 assert.deepEqual(p.scenes.map(s=>[s.start,s.duration]),[[10,10],[0,10]]);
 trimClips(p,linkedIds(p.clips,['screen1']),'right',-4,true);syncScenesToTakes(p);assert.deepEqual(p.scenes.map(s=>[s.start,s.duration]),[[10,6],[0,10]]);
 splitLinked(p,12,new Set());syncScenesToTakes(p);assert.deepEqual(p.scenes.map(s=>[s.start,s.duration]),[[10,6],[0,10]],'a split keeps the scene whole');
});

/* Fix round 2: a link group is exactly the clips that share one linkId; time never regroups them. Takes with an offset camera. */
const offsetTake=()=>project([clip('s','screen',0,30,{recordingTakeId:'t'}),clip('c','camera',.4,30,{recordingTakeId:'t'}),clip('a','audio',0,30,{recordingTakeId:'t'})]);

test('offset take: after Remove pauses or a split, moving a piece and deleting it removes only that piece',()=>{
 for(const how of ['pauses','split'] as const){
  const p=offsetTake();ensureLinks(p);if(how==='pauses')closeRange(p,10,10.5);else splitLinked(p,10,new Set());
  const ids=linkedIds(p.clips,['s']);assert.equal(ids.size,3,how);
  const plan=planClipMove(p,ids,25,28);ensureLinks(p);applyClipStarts(p,plan.starts);
  for(const c of p.clips)assert.equal(linkedIds(p.clips,[c.id]).size,3,`${how}: ${c.track} at ${c.start} keeps its own group`);
  const q=structuredClone(p);deleteItems(q,['s'],true);assert.equal(q.clips.length,3,`${how}: the other piece stays`);
  assert.deepEqual([...new Set(q.clips.map(c=>c.linkId))].length,1);
 }
});

test('offset takes: a ripple trim never overlaps or cuts the next take',()=>{
 const two=()=>{const p=project([clip('As','screen',0,30,{recordingTakeId:'A'}),clip('Ac','camera',.4,30,{recordingTakeId:'A'}),clip('Bs','screen',30,20,{recordingTakeId:'B'}),clip('Bc','camera',30.4,20,{recordingTakeId:'B'})]);ensureLinks(p);return p;};
 const extend=two();trimClips(extend,linkedIds(extend.clips,['As']),'right',1,true);
 assert.equal(overlaps(extend),false);assert.deepEqual(extend.clips.map(c=>[c.id,c.start,c.start+clipDuration(c)]),[['As',0,31],['Ac',.4,31.4],['Bs',31,51],['Bc',31.4,51.4]]);
 const shrink=two();trimClips(shrink,linkedIds(shrink.clips,['As']),'right',-1,true);
 assert.equal(overlaps(shrink),false);const bs=shrink.clips.find(c=>c.id==='Bs')!;assert.deepEqual([bs.sourceIn,clipDuration(bs)],[0,20],'take B keeps its first 0.4 s');
 const left=two();trimClips(left,linkedIds(left.clips,['Bs']),'left',1,true);
 assert.equal(overlaps(left),false);const ac=left.clips.find(c=>c.id==='Ac')!;assert.equal(clipDuration(ac),30,'the camera tail of take A is not cut');
});

test('an insert of a single clip moves whole pieces: siblings shift together and each group keeps one clip per row',()=>{
 const p=project([clip('s','screen',0,30,{recordingTakeId:'t'}),clip('c','camera',.4,30,{recordingTakeId:'t'}),clip('a','audio',0,30,{recordingTakeId:'t'}),clip('us','screen',30.4,20,{recordingTakeId:'u'}),clip('ua','audio',30.4,20,{recordingTakeId:'u'})]);
 ensureLinks(p);closeRange(p,10,10.01);closeRange(p,20,20.01);p.clips.push(clip('b','screen',60,12));
 const plan=planClipMove(p,new Set(['b']),10-60,10.2);applyClipStarts(p,plan.starts);
 assert.equal(plan.kind,'insert');assert.equal(overlaps(p),false);
 const groups=new Map<string,string[]>();for(const c of p.clips)if(c.linkId)groups.set(c.linkId,[...(groups.get(c.linkId)??[]),c.track]);
 for(const tracks of groups.values())assert.equal(new Set(tracks).size,tracks.length,'one clip per row');
 const third=p.clips.find(c=>c.track==='audio'&&c.start>30&&c.recordingTakeId==='t')!;const q=structuredClone(p);deleteItems(q,[third.id],false);
 assert.equal(p.clips.length-q.clips.length,3,'deleting a piece removes its screen, camera and audio only');
});

test('scenes never overlap: a moved piece does not stretch its scene over the next one, copies carry no take',()=>{
 const p=withTakes(project([...take(1,0,20),...take(2,20,20)]));p.scenes=[{id:'s1',name:'a',script:'',notes:'',start:0,duration:20},{id:'s2',name:'b',script:'',notes:'',start:20,duration:20}];
 ensureLinks(p);splitLinked(p,10,new Set());const piece=p.clips.find(c=>c.track==='screen'&&c.start===10)!;
 const plan=planClipMove(p,linkedIds(p.clips,[piece.id]),40,55);applyClipStarts(p,plan.starts);syncScenesToTakes(p);
 const [a,b]=p.scenes;assert.ok(a.start+a.duration<=b.start+1e-9,`scene 1 ${a.start}+${a.duration} stays before scene 2 at ${b.start}`);
 const copy=withTakes(project(take(1,0,10)));ensureLinks(copy);copy.clips.push(...copy.clips.map(c=>({...c,id:'k'+c.id,start:30})));remapLinks(copy,new Set(['kscreen1','kcamera1','kaudio1']));
 assert.ok(copy.clips.filter(c=>c.id.startsWith('k')).every(c=>c.recordingTakeId===undefined&&c.linkId!==copy.clips[0].linkId));
 assert.equal(new Set(copy.clips.filter(c=>c.id.startsWith('k')).map(c=>c.linkId)).size,1,'the copies stay linked to each other');
});
