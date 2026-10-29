import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,clipDuration,type Clip,type Media,type Project} from '../shared/types';
import {applyProjectChange} from './project-draft';
import {addMarker,anchoredScroll,openRange,remapLinks,applyClipStarts,closeRange,collides,deleteItems,ensureLinks,filmstripTiles,fitScale,freeDelta,insertPlan,isLinked,linkClips,linkGroups,linkedIds,moveEffects,moveMarker,planClipMove,removeMarker,resizeEffect,rowItems,rulerLabel,rulerTicks,splitLinked,timelineGaps,trimBounds,trimClips,uncovered,unlinkClips} from './timeline-edit';

const media=(id:string,duration=600):Media=>({id,name:id,path:`/tmp/${id}.mov`,kind:'video',duration,width:1920,height:1080,hasAudio:true});
const clip=(id:string,track:Clip['track'],start:number,length:number,extra:Partial<Clip>={}):Clip=>({id,mediaId:track==='camera'?'cam':track==='audio'?'mic':'scr',name:id,track,start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects(),...extra});
const take=(n:number,start:number,length:number,sourceIn=0):Clip[]=>(['screen','camera','audio'] as const).map(track=>clip(`${track}${n}`,track,start,length,{recordingTakeId:`t${n}`,sourceIn,sourceOut:sourceIn+length}));
function project(clips:Clip[]):Project{const p=createProject('Edit');p.media=[media('scr'),media('cam'),media('mic')];p.clips=clips;p.scenes=[{id:'s1',name:'One',script:'',notes:'',start:0,duration:10},{id:'s2',name:'Two',script:'',notes:'',start:10,duration:10}];return p;}
let n=0;const id=()=>`id${++n}`;

test('a take\'s screen, camera and audio are linked; split pieces and other takes are separate groups',()=>{
 const p=project([...take(1,0,10),...take(2,10,10)]);
 const groups=linkGroups(p.clips);
 assert.equal(groups.get('screen1'),groups.get('audio1'));assert.notEqual(groups.get('screen1'),groups.get('screen2'));
 assert.deepEqual([...linkedIds(p.clips,['camera2'])].sort(),['audio2','camera2','screen2']);
 assert.ok(isLinked(p.clips,'screen1'));
 const music=clip('m','music',0,20);p.clips.push(music);assert.equal(isLinked(p.clips,'m'),false,'clips without a take stay alone');
});

test('ensureLinks writes one id per take group; unlink makes each clip its own group; link joins chosen clips',()=>{
 n=0;const p=project(take(1,0,10));ensureLinks(p,id);
 assert.deepEqual(p.clips.map(c=>c.linkId),['id1','id1','id1']);
 unlinkClips(p,['screen1'],id);assert.equal(new Set(p.clips.map(c=>c.linkId)).size,3);assert.deepEqual([...linkedIds(p.clips,['screen1'])],['screen1']);
 assert.equal(linkClips(p,['screen1','camera1'],id),true);assert.deepEqual([...linkedIds(p.clips,['screen1'])].sort(),['camera1','screen1']);
 assert.equal(linkClips(p,['screen1'],id),false,'one clip cannot be linked');
});

test('split at the playhead cuts the selected clip and its linked clips, and the right pieces form their own group',()=>{
 n=0;const p=project([...take(1,0,10),clip('m','music',0,20)]);
 assert.equal(splitLinked(p,4,new Set(['screen1']),undefined,id),3,'the music under it is not selected');
 const right=p.clips.filter(c=>c.start===4);assert.equal(right.length,3);assert.ok(right.every(c=>c.sourceIn===4));
 assert.equal(new Set(right.map(c=>c.linkId)).size,1);assert.notEqual(right[0].linkId,p.clips.find(c=>c.id==='screen1')!.linkId);
 assert.deepEqual([...linkedIds(p.clips,[right[0].id])].length,3);
 assert.equal(p.clips.find(c=>c.id==='screen1')!.sourceOut,4);
 const all=project([...take(1,0,10),clip('m','music',0,20)]);assert.equal(splitLinked(all,5,new Set(),undefined,id),4,'nothing selected: every clip under the playhead');
 const blade=project([...take(1,0,10),clip('m','music',0,20)]);assert.equal(splitLinked(blade,5,new Set(),'m',id),1,'a blade click splits the clicked group only');
});

test('split works inside a mutative draft',()=>{
 const p=project(take(1,0,10)),next=applyProjectChange(p,d=>{splitLinked(d,3,new Set(['audio1']));});
 assert.equal(next.clips.length,6);assert.equal(p.clips.length,3,'the base stays untouched');
});

test('delete closes the gap on every track: later clips, captions, scenes and markers move up',()=>{
 const p=project([...take(1,0,10),...take(2,10,10)]);
 p.captions=[{id:'c1',start:2,end:3,text:'one'},{id:'c2',start:12,end:13,text:'two',words:[{text:'two',start:12,end:13}]}];
 p.elements=[{id:'e',type:'text',start:15,duration:2,text:'Title',x:0,y:0,width:1,height:1,color:'#fff',background:'#000',fontSize:40,opacity:1,rotation:0}];
 p.markers=[{id:'mk',time:14}];
 const gaps=deleteItems(p,['camera1'],true);
 assert.deepEqual(gaps,[[0,10]]);
 assert.deepEqual(p.clips.map(c=>[c.id,c.start]),[['screen2',0],['camera2',0],['audio2',0]]);
 assert.deepEqual(p.captions.map(c=>[c.text,c.start,c.words?.[0]?.start]),[['two',2,2]]);
 assert.equal(p.elements[0].start,5);assert.equal(p.markers![0].time,4);
 assert.deepEqual(p.scenes.map(s=>[s.start,s.duration]),[[0,0],[0,10]]);
});

test('delete keeps the gap when asked, and never closes time another row still uses',()=>{
 const p=project([...take(1,0,10),...take(2,10,10)]);deleteItems(p,['screen2'],false);assert.equal(p.clips.length,3);assert.ok(p.clips.every(c=>c.start===0));
 const q=project([...take(1,0,10),...take(2,10,10)]);unlinkClips(q,['screen1']);deleteItems(q,['screen1'],true);
 assert.deepEqual(q.clips.map(c=>c.start),[0,0,10,10,10],'camera and audio of take 1 still play there');
 assert.deepEqual(uncovered([0,20],[clip('a','audio',2,3),clip('b','music',0,20)]),[[0,2],[5,20]],'music does not keep a gap open');
 assert.deepEqual(timelineGaps([clip('a','screen',0,2),clip('b','screen',5,2)]),[[2,5]]);
});

test('closeRange keeps markers inside the cut at its start',()=>{
 const p=project(take(1,0,20));p.markers=[{id:'a',time:5},{id:'b',time:12}];closeRange(p,4,8);assert.deepEqual(p.markers.map(m=>m.time),[4,8]);
});

test('clips cannot overlap on a row: a move slides to the nearest gap, or inserts and shifts the row',()=>{
 const p=project([clip('a','screen',0,5),clip('b','screen',5,5),clip('c','screen',10,5)]);const items=rowItems(p);
 assert.equal(collides(items.filter(i=>i.id==='c'),-2,items),true);
 assert.equal(freeDelta(items.filter(i=>i.id==='c'),3,items),3,'free space after the last clip');
 assert.equal(freeDelta(items.filter(i=>i.id==='a'),-1,items),0,'never before zero');
 const plan=insertPlan(items.filter(i=>i.id==='c'),1,items)!;
 assert.equal(plan.at,0);assert.deepEqual([...plan.starts].sort(),[['a',5],['b',10],['c',0]]);
 const move=planClipMove(p,new Set(['c']),-9,1);assert.equal(move.kind,'insert');
 assert.equal(planClipMove(p,new Set(['c']),2,17).kind,'move');
 assert.equal(planClipMove(p,new Set(['b']),.5,7.4).kind,'none','dropped back where it was');
});

test('a linked take moves as one block and its captions follow the narration',()=>{
 const p=project([...take(1,0,10),...take(2,10,10)]);p.captions=[{id:'c',start:2,end:3,text:'hi'},{id:'d',start:12,end:13,text:'there'}];
 const ids=linkedIds(p.clips,['screen1']),move=planClipMove(p,ids,15,18);
 assert.equal(move.kind,'insert');applyClipStarts(p,move.starts);
 assert.deepEqual(p.clips.map(c=>[c.id,c.start]).sort(),[['audio1',10],['audio2',0],['camera1',10],['camera2',0],['screen1',10],['screen2',0]]);
 assert.deepEqual(p.captions.map(c=>[c.id,c.start]),[['c',12],['d',2]]);
});

test('effects move without overlapping and resize within their neighbours',()=>{
 const p=project([]);p.zooms=[{id:'z1',start:0,duration:2,scale:2,x:.5,y:.5,target:'screen',easing:'smooth'},{id:'z2',start:4,duration:2,scale:2,x:.5,y:.5,target:'screen',easing:'smooth'}];
 const items=rowItems(p);assert.equal(freeDelta(items.filter(i=>i.id==='z1'),3,items),2);
 moveEffects(p,new Set(['z1']),1);assert.equal(p.zooms[0].start,1);
 resizeEffect(p,'z1','right',5);assert.equal(p.zooms[0].duration,3,'stops at the next zoom');
 resizeEffect(p,'z2','left',-9);assert.equal(p.zooms[1].start,4,'stops at the previous zoom');
 p.captions=[{id:'c',start:1,end:2,text:'x',words:[{text:'x',start:1,end:2}]}];moveEffects(p,new Set(['c']),-5);assert.deepEqual([p.captions[0].start,p.captions[0].words![0].start],[0,0]);
});

test('linked trims move together; a ripple trim moves everything after, a plain one stops at the neighbour',()=>{
 const p=project([...take(1,0,10,2),...take(2,10,10)]);p.markers=[{id:'m',time:15}];
 const ids=linkedIds(p.clips,['screen1']);
 assert.deepEqual(trimBounds(p,ids,'left',true),{min:-2,max:9.9},'a ripple trim can bring back the 2 s before the source in point');
 assert.deepEqual(trimBounds(p,ids,'right',false),{min:-9.9,max:0},'take 2 sits right after');
 trimClips(p,ids,'left',2,true);
 assert.deepEqual(p.clips.filter(c=>ids.has(c.id)).map(c=>[c.start,c.sourceIn,clipDuration(c)]),[[0,4,8],[0,4,8],[0,4,8]]);
 assert.deepEqual(p.clips.filter(c=>!ids.has(c.id)).map(c=>c.start),[8,8,8]);assert.equal(p.markers![0].time,13);
 trimClips(p,ids,'right',-1,false);assert.ok(p.clips.filter(c=>ids.has(c.id)).every(c=>clipDuration(c)===7));assert.deepEqual(p.clips.filter(c=>!ids.has(c.id)).map(c=>c.start),[8,8,8]);
});

test('opening time at a point moves everything after it; pasted clips get their own link groups',()=>{
 n=0;const p=project([...take(1,0,10),...take(2,10,10)]);p.markers=[{id:'m',time:12}];p.captions=[{id:'c',start:11,end:12,text:'x',words:[{text:'x',start:11,end:12}]}];
 openRange(p,10,5);assert.deepEqual(p.clips.map(c=>c.start),[0,0,0,15,15,15]);assert.equal(p.markers[0].time,17);assert.deepEqual([p.captions[0].start,p.captions[0].words![0].end],[16,17]);assert.deepEqual(p.scenes.map(s=>s.start),[0,15]);
 ensureLinks(p,id);const copies=p.clips.slice(0,3).map(c=>({...c,id:`copy-${c.id}`,start:10}));p.clips.push(...copies);remapLinks(p,new Set(copies.map(c=>c.id)),id);
 assert.equal(new Set(copies.map(c=>p.clips.find(x=>x.id===c.id)!.linkId)).size,1);assert.notEqual(p.clips.find(c=>c.id==='copy-screen1')!.linkId,p.clips.find(c=>c.id==='screen1')!.linkId);
});

test('markers are added sorted, moved and removed',()=>{
 n=0;const p=project([]);addMarker(p,5,id);addMarker(p,2,id);assert.deepEqual(p.markers!.map(m=>m.time),[2,5]);moveMarker(p,'id2',9);assert.deepEqual(p.markers!.map(m=>m.id),['id1','id2']);
 removeMarker(p,'id1');removeMarker(p,'id2');assert.equal(p.markers,undefined);
});

test('zoom keeps the playhead where it is on screen, or the view centre when the playhead is off screen',()=>{
 assert.equal(anchoredScroll({anchor:10,from:50,to:100,scrollLeft:200,viewport:800}),700,'x=300 before and after');
 assert.equal(anchoredScroll({anchor:100,from:50,to:100,scrollLeft:0,viewport:800}),400,'centre at 8 s stays centred');
 assert.equal(anchoredScroll({anchor:1,from:50,to:10,scrollLeft:0,viewport:800}),0);
 assert.equal(fitScale(380,1240),3.1578947368421053);assert.equal(fitScale(0,800),152);
});

test('ruler ticks: labelled majors at least 70 px apart, minors between, frames at high zoom',()=>{
 const coarse=rulerTicks(0,60,10,30);assert.ok(coarse.filter(t=>t.major).every(t=>t.time%10===0));assert.equal(coarse.find(t=>t.time===10)?.label,'0:10');assert.ok(coarse.some(t=>!t.major));
 const fine=rulerTicks(1,1.5,1500,30),majors=fine.filter(t=>t.major);
 assert.ok(majors.length>=4);assert.equal(majors.find(t=>Math.abs(t.time-1.2)<1e-9)?.label,'0:01:06');
 assert.equal(rulerLabel(65.5,30,true),'1:05:15');assert.equal(rulerLabel(65.5,30,false),'1:05');
});

test('filmstrip tiles cover the visible part of a clip and point at frames of its source',()=>{
 const tiles=filmstripTiles({start:10,sourceIn:30,sourceOut:60,speed:1},60,60,10,50,0,100);
 assert.equal(tiles.length,6);assert.deepEqual(tiles[0],{left:0,index:32});assert.deepEqual(tiles.at(-1),{left:250,index:57});
 assert.equal(filmstripTiles({start:10,sourceIn:30,sourceOut:60,speed:1},60,60,10,50,30,100)[0].left,200,'starts at the window');
});
