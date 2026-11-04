import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,clipDuration,type Clip,type Project} from '../shared/types';
import {captionWordsByClip,remapClipCaptions} from '../shared/caption-timing';
import {applyProjectChange} from './project-draft';
import {applyClipStarts,deleteItems,linkedIds,planClipMove,rowItems,rowsOverlap,splitLinked,timelineGaps,trimClips} from './timeline-edit';
import {copySelection,pasteSelection} from './editing';
import {EditHistory} from './edit-history';

function fixture(){
 const p=createProject('Three source take');p.scenes=[{id:'scene',name:'Scene',script:'',notes:'',start:0,duration:12}];
 p.media=(['screen','camera','audio'] as const).map(id=>({id,name:id,path:`/tmp/${id}`,kind:id==='audio'?'audio' as const:'video' as const,duration:12,width:1920,height:1080,hasAudio:id!=='screen'}));
 p.clips=p.media.map(m=>({id:m.id,mediaId:m.id,name:m.id,track:m.id as Clip['track'],start:0,sourceIn:0,sourceOut:12,speed:1,gain:1,muted:false,recordingTakeId:'take',linkId:'take-link',transform:defaultTransform(),effects:defaultEffects()}));
 p.captions=[{id:'spoken',start:0,end:12,text:'testing one two three screen recording',words:[{text:'testing',start:.3,end:1.1},{text:'one',start:1.3,end:2.1},{text:'two',start:2.4,end:3.2},{text:'three',start:3.8,end:4.2},{text:'screen',start:5,end:6},{text:'recording',start:9,end:10}]}];return p;
}
function consistent(p:Project){
 assert.equal(rowsOverlap(rowItems({...p,captions:[]})),false);assert.deepEqual(timelineGaps(p.clips),[]);
 for(const group of new Set(p.clips.map(c=>c.linkId))){const clips=p.clips.filter(c=>c.linkId===group);assert.equal(clips.length,3);assert.equal(new Set(clips.map(c=>[c.start,c.sourceIn,c.sourceOut].join(','))).size,1);}
 for(const cap of p.captions){const audio=p.clips.find(c=>c.track==='audio'&&cap.start>=c.start-1e-6&&cap.end<=c.start+clipDuration(c)+1e-6);assert.ok(audio,`${cap.text} is attached to an audio piece`);for(const w of cap.words??[])assert.ok(w.start>=audio!.start-1e-6&&w.end<=audio!.start+clipDuration(audio!)+1e-6);}
}

test('reported take: split, drag right mic piece backward and forward, with one undo step per gesture',()=>{
 let p=fixture();const history=new EditHistory<Project>();
 const edit=(fn:(d:Project)=>void)=>{history.record(p,()=>80);p=applyProjectChange(p,fn);};
 edit(d=>{splitLinked(d,4,new Set(['audio']));});consistent(p);assert.equal(p.captions.length,2,'spanning sentence splits with the audio');
 const right=p.clips.find(c=>c.track==='audio'&&c.start===4)!;const left=p.clips.find(c=>c.id==='audio')!;assert.notEqual(right.linkId,left.linkId);
 const afterSplit=p;
 for(const [delta,pointer] of [[-4,1],[4,11]]){
  const before=p,n=history.past.length,plan=planClipMove(p,new Set([right.id]),delta,pointer);assert.equal(plan.kind,'insert');
  edit(d=>applyClipStarts(d,plan.starts));consistent(p);assert.equal(history.past.length,n+1);
  const next=p;p=history.undo(p)!;assert.deepEqual(p,before);p=history.redo(p)!;assert.deepEqual(p,next);
 }
 assert.deepEqual(p.clips.map(c=>[c.id,c.start,c.sourceIn,c.sourceOut]),afterSplit.clips.map(c=>[c.id,c.start,c.sourceIn,c.sourceOut]));
});

test('default drag closes its source hole; deliberate Alt-style gap remains possible without overlaps',()=>{
 const p=fixture();splitLinked(p,4,new Set(['audio']));const right=p.clips.find(c=>c.start===4)!;
 const normal=planClipMove(p,new Set([right.id]),5,16);assert.equal(normal.kind,'none','cannot pull the last piece away from its neighbour');
 const explicit=planClipMove(p,new Set([right.id]),5,16,{leaveGap:true});assert.equal(explicit.kind,'move');applyClipStarts(p,explicit.starts);
 assert.deepEqual(timelineGaps(p.clips),[[4,9]]);assert.equal(rowsOverlap(rowItems({...p,captions:[]})),false);
});

test('trim and delete remove only words of the removed source, including leave-gap edits',()=>{
 const p=fixture();splitLinked(p,4,new Set(['audio']));const right=p.clips.find(c=>c.track==='audio'&&c.start===4)!;
 trimClips(p,new Set([right.id]),'right',-4,false);assert.ok(!p.captions.some(c=>c.words?.some(w=>w.text==='recording')));
 deleteItems(p,[right.id],false);assert.equal(p.clips.length,3);assert.ok(p.captions.every(c=>c.end<=4));
 const words=captionWordsByClip(p);assert.deepEqual([...words.keys()],['audio']);assert.ok(words.get('audio')?.some(w=>w.text==='testing'));
});

test('source-time projection respects nonunit speed, cuts through a word, and supports inverse undo mapping',()=>{
 const p=fixture();for(const c of p.clips){c.speed=2;c.sourceOut=12;}p.captions=[{id:'c',start:1,end:3,text:'across',words:[{text:'across',start:1,end:3}]}];
 const before=structuredClone(p);splitLinked(p,2,new Set(['camera']));assert.equal(p.captions.length,2);assert.deepEqual(p.captions.flatMap(c=>c.words??[]).map(w=>[w.start,w.end]),[[1,2],[2,3]]);
 const inverse=remapClipCaptions(p,before);assert.equal(inverse.flatMap(c=>c.words??[]).reduce((sum,w)=>sum+w.end-w.start,0),2);
});

test('copying any take piece includes linked pictures and only its source captions; pasted pieces get independent links',()=>{
 const p=fixture();splitLinked(p,4,new Set(['audio']));const right=p.clips.find(c=>c.track==='audio'&&c.start===4)!;
 const data=copySelection(p,new Set([right.id]))!;assert.equal(data.clips.length,3);assert.equal(data.captions.length,1);assert.ok(data.captions[0].words?.some(w=>w.text==='screen'));
 const ids=pasteSelection(p,data,12),copies=p.clips.filter(c=>ids.includes(c.id));assert.equal(new Set(copies.map(c=>c.linkId)).size,1);assert.notEqual(copies[0].linkId,right.linkId);assert.ok(copies.every(c=>!c.recordingTakeId));
 const pasted=p.captions.find(c=>ids.includes(c.id))!;assert.ok(pasted.start>=12);assert.ok(pasted.words?.every(w=>w.start>=12));
});
