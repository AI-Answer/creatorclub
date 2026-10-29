import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,clipDuration,type Clip,type Project} from '../shared/types';
import {applyProjectChange} from './project-draft';
import {deleteTranscriptSelection,transcriptWords} from './transcript-editing';
import {withoutRanges} from './club/recorder/edit-auto';
import {applyClipStarts,closeRange,deleteItems,ensureLinks,insertGap,isLinked,linkClips,linkedIds,planClipMove,rowItems,rowsOverlap,splitLinked,syncScenesToTakes,trimClips,unlinkClips} from './timeline-edit';

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

test('a pasted copy keeps its link id but is its own group; unlink then move moves one clip',()=>{
 const p=project(take(1,0,10));ensureLinks(p);p.clips.push(...p.clips.map(c=>({...c,id:'copy-'+c.id,start:20})));
 assert.equal(linkedIds(p.clips,['screen1']).size,3);
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
