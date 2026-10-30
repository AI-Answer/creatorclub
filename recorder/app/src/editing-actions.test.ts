import test from 'node:test';
import assert from 'node:assert/strict';
import type {EditAction} from '../shared/companion';
import {createProject,defaultEffects,defaultTransform,clipDuration,projectDuration,type Clip,type Project} from '../shared/types';
import {clipLayerRowId} from '../shared/timeline-layers';
import {applyProjectChange} from './project-draft';
import {applyEditAction,describeEditAction,editActionProblem,editEstimate,editRanges,wordPauseRanges} from './editing-actions';
import {clipsFingerprint} from './club/recorder/edit-auto';
import {addMotionBlock,applyClipStarts,deleteItems,ensureLinks,freeDelta,linkGroups,linkedIds,mergeRanges,MOTION_ROW,moveEffects,newElement,planClipMove,resizeEffect,rowItems,rowsOverlap,splitLinked,syncScenesToTakes,trimBounds,trimClips} from './timeline-edit';
import {MOTION_TEMPLATES,MOTION_TEMPLATE_IDS,newMotionBlock} from '../shared/motion/templates';

/*
 * The companion's Edit actions: each one through the timeline rules, the checks that keep a card off a timeline it does not fit,
 * and random sequences of actions, undos and the person's own edits that must keep rows, links and scenes consistent.
 */

const clip=(id:string,track:Clip['track'],start:number,length:number,extra:Partial<Clip>={}):Clip=>({id,mediaId:'m',name:id,track,start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects(),...extra});
/** Two takes (screen, camera 0.4 s late, audio), an overlay and a music bed, one word a second with a 3 s pause in each take and an "um". */
function make():Project{
 const p=createProject('x');p.media=[{id:'m',name:'m',path:'/m',kind:'video',duration:600,width:1920,height:1080,hasAudio:true}];
 p.clips=[clip('s1','screen',0,30,{recordingTakeId:'t1'}),clip('c1','camera',.4,30,{recordingTakeId:'t1'}),clip('a1','audio',0,30,{recordingTakeId:'t1'}),
  clip('s2','screen',30.4,20,{recordingTakeId:'t2'}),clip('a2','audio',30.4,20,{recordingTakeId:'t2'}),clip('o','overlay',5,8),clip('mus','music',0,70)];
 p.scenes=[{id:'S1',name:'a',script:'',notes:'',start:0,duration:30.4},{id:'S2',name:'b',script:'',notes:'',start:30.4,duration:20},{id:'S3',name:'c',script:'',notes:'',start:50.4,duration:0}];
 p.recordedTakes=[{id:'t1',createdAt:'',sceneId:'S1',media:[],tracks:[],offsets:[]},{id:'t2',createdAt:'',sceneId:'S2',media:[],tracks:[],offsets:[]}];
 p.captions=[{id:'w1',start:0,end:30,text:'',words:[]},{id:'w2',start:30.4,end:50.4,text:'',words:[]}];
 for(const c of p.captions){for(let t=c.start;t+.5<=c.end;t++){if(t-c.start>=10&&t-c.start<13)continue;c.words!.push({text:t-c.start===5?'um':`w${Math.round(t)}`,start:t,end:t+.5});}c.text=c.words!.map(w=>w.text).join(' ');}
 return p;
}
const apply=(p:Project,action:EditAction)=>{let result='';const next=applyProjectChange(p,d=>{result=applyEditAction(d,action);});return {next,result};};

test('cut pauses: the pauses between words, keeping a breath, cut from every row as one change',()=>{
 const p=make();
 // 3.5 s of silence after word 9.5 in each take (words 10, 11, 12 left out).
 assert.deepEqual(wordPauseRanges(p,'gentle').map(([a,b])=>[+a.toFixed(2),+b.toFixed(2)]),[[9.65,12.85],[40.05,43.25]]);
 assert.equal(wordPauseRanges(p,'balanced').length,2);
 const {next,result}=apply(p,{type:'cut_pauses',level:'balanced'});
 assert.match(result,/^Cut 2 pauses, 6\.4 s shorter$/);
 assert.ok(Math.abs(projectDuration(p)-projectDuration(next)-6.4)<1e-6);
 assert.ok(next.clips.filter(c=>c.recordingTakeId).every(c=>c.linkId),'take links are written');
 assert.equal(rowsOverlap(rowItems({...next,captions:[]})),false);
 assert.deepEqual(next.scenes.map(s=>[+s.start.toFixed(2),+s.duration.toFixed(2)]).slice(0,2),[[0,27.2],[27.2,16.8]],'scenes follow their takes');
 assert.equal(p.clips.length,7,'the project it was applied to is untouched');
});

test('remove fillers, close gaps, delete a range from every row, split, trim',()=>{
 const p=make();
 const fillers=editRanges(p,{type:'remove_fillers'})!;assert.deepEqual(fillers,[[5,5.5],[35.4,35.9]]);
 assert.match(apply(p,{type:'remove_fillers'}).result,/^Removed 2 filler words, 1 s shorter$/);
 assert.equal(editActionProblem(p,{type:'close_gaps'}),'There are no gaps between clips.');
 // Take 2 moved 4.6 s later leaves a gap; closing it brings the take back to where it was.
 const moved=applyProjectChange(p,d=>{ensureLinks(d);applyClipStarts(d,new Map([['s2',35],['a2',35]]));syncScenesToTakes(d);});
 assert.deepEqual(editRanges(moved,{type:'close_gaps'}),[[30.4,35]]);
 const closed=apply(moved,{type:'close_gaps'});
 assert.equal(closed.next.clips.find(c=>c.id==='s2')!.start,30.4);assert.match(closed.result,/^Closed 1 gap, 4\.6 s shorter$/);
 const cut=apply(p,{type:'delete_range',start:10,end:12}).next;
 assert.ok(Math.abs(projectDuration(p)-projectDuration(cut)-2)<1e-6,'two seconds gone from every row');
 assert.ok(cut.clips.filter(c=>c.track==='music').reduce((n,c)=>n+clipDuration(c),0)<70-1.99,'music too');
 const split=apply(p,{type:'split_at',time:15}).next;
 assert.equal(split.clips.length,p.clips.length+4,'every clip across 15 s: screen, camera, audio and music (the overlay ends at 13)');
 const one=apply(p,{type:'split_at',time:15,clipId:'s1'}).next;
 assert.equal(one.clips.length,p.clips.length+3,'only the take: screen, camera and audio');
 const groups=linkGroups(one.clips);assert.notEqual(groups.get('s1'),groups.get(one.clips.find(c=>c.track==='screen'&&Math.abs(c.start-15)<1e-9)!.id));
 const trimmed=apply(p,{type:'trim_clip',clipId:'s1',side:'end',time:25});
 assert.match(trimmed.result,/^Trimmed 5 s off the end of the clip$/);
 assert.equal(trimmed.next.clips.find(c=>c.id==='s2')!.start,25.4,'the next take moves up');
 assert.ok(Math.abs(clipDuration(trimmed.next.clips.find(c=>c.id==='c1')!)-25)<1e-9,'the camera with it');
});

test('captions, text, zoom and loudness',()=>{
 const p=make();
 const styled=apply(p,{type:'set_caption_style',fontSize:64,position:'top'}).next;
 assert.equal(styled.captionStyle.fontSize,64);assert.equal(styled.captionStyle.position,'top');assert.equal(styled.captionStyle.color,p.captionStyle.color);
 assert.equal(editActionProblem(styled,{type:'set_caption_style',fontSize:64}),'The captions already look like that.');
 assert.equal(editActionProblem(p,{type:'add_caption',start:3,end:4,text:'Hi'}),'A caption is already there at that time.');
 const free=applyProjectChange(p,d=>{d.captions=[];});
 assert.equal(apply(free,{type:'add_caption',start:3,end:4,text:'Hi'}).next.captions[0].text,'Hi');
 const text=apply(p,{type:'add_text',start:2,duration:4,text:'Three hidden features',position:'top'}).next.elements[0];
 assert.deepEqual([text.type,text.start,text.duration,text.text,text.y],['text',2,4,'Three hidden features',.08]);
 const twice=apply(apply(p,{type:'add_text',start:10,duration:3,text:'B'}).next,{type:'add_text',start:8,duration:5,text:'A'}).next;
 assert.equal(twice.elements.find(e=>e.text==='A')!.duration,2,'a text stops at the next one on its row');
 assert.equal(editActionProblem(twice,{type:'add_text',start:9,duration:2,text:'C'}),'Something is already on the text row at that time.');
 const zoomed=apply(p,{type:'set_zoom',start:20,duration:4,scale:1.5}).next;
 const again=apply(zoomed,{type:'set_zoom',start:22,duration:4,scale:2}).next;
 assert.deepEqual(again.zooms.map(z=>[z.start,z.scale]),[[22,2]],'a zoom replaces the zoom it overlaps');
 const loud=apply(p,{type:'normalize_audio'});assert.ok(loud.next.clips.every(c=>c.effects.normalize));assert.match(loud.result,/7 clips/);
 assert.equal(editActionProblem(loud.next,{type:'normalize_audio'}),'Loudness is already evened out.');
 for(const action of [{type:'cut_pauses',level:'tight'},{type:'set_zoom',start:1,duration:2,scale:2},{type:'set_caption_style',enabled:false}] as EditAction[])assert.ok(describeEditAction(action).length>10);
});

test('an action that does not fit the timeline is refused: unknown clips, times outside the video, nothing to cut',()=>{
 const p=make();
 assert.equal(editActionProblem(p,{type:'trim_clip',clipId:'nope',side:'end',time:3}),'That clip is no longer on the timeline.');
 assert.equal(editActionProblem(p,{type:'split_at',time:3,clipId:'nope'}),'That clip is no longer on the timeline.');
 assert.equal(editActionProblem(p,{type:'split_at',time:500}),'That time is outside the video.');
 assert.equal(editActionProblem(p,{type:'delete_range',start:60,end:400}),'That time is outside the video.');
 assert.equal(editActionProblem(p,{type:'delete_range',start:0,end:projectDuration(p)}),'That would delete the whole video.');
 assert.equal(editActionProblem(p,{type:'trim_clip',clipId:'s1',side:'end',time:40}),'That time is not inside the clip.');
 assert.equal(editActionProblem(p,{type:'set_zoom',start:68,duration:10,scale:2}),'That time is outside the video.');
 const silent=applyProjectChange(p,d=>{d.captions=[];});
 assert.equal(editActionProblem(silent,{type:'cut_pauses',level:'gentle'}),'There is no transcript yet, so the pauses between words are not known.');
 assert.equal(editActionProblem(createProject('empty'),{type:'close_gaps'}),'There is nothing on the timeline yet.');
 assert.throws(()=>apply(p,{type:'split_at',time:500}),/outside the video/);
});

test('a pause is cut only where one recording holds the words on both sides, never over 8 s, and only where the audio plan is silent',()=>{
 const words=(from:number,to:number)=>{const w=[];for(let t=from;t+.5<=to;t+=.7)w.push({text:'w',start:t,end:t+.5});return w;};
 // Reviewer's probe: takes 1 and 3 were transcribed; take 2 (20 s to 50 s of speech) was not. It is not a pause.
 const p=createProject('x');p.media=[{id:'m',name:'m',path:'/m',kind:'video',duration:600,width:1920,height:1080,hasAudio:true}];
 p.clips=[clip('s1','screen',0,20),clip('s2','screen',20,30),clip('s3','screen',50,20)];
 p.captions=[{id:'c1',start:0,end:20,text:'a',words:words(0,20)},{id:'c3',start:50,end:70,text:'c',words:words(50,70)}];
 assert.deepEqual(wordPauseRanges(p,'gentle'),[]);
 assert.equal(editActionProblem(p,{type:'cut_pauses',level:'gentle'}),'There are no pauses that long between your words.');
 // Reviewer's probe: a clip moved 3 s later by hand while its captions stayed: speech now plays at 13..23, the words still say 10..20.
 const moved=createProject('x');moved.media=p.media;
 moved.clips=[clip('s1','screen',0,10),clip('s2','screen',13,10,{sourceIn:10,sourceOut:20})];
 moved.captions=[{id:'c1',start:0,end:10,text:'a',words:words(0,10)},{id:'c2',start:10,end:20,text:'b',words:words(10,20)},{id:'c3',start:23,end:24,text:'c',words:[{text:'x',start:23,end:23.5}]}];
 assert.deepEqual(wordPauseRanges(moved,'gentle'),[],'no cut out of the speech at 19.75 to 22.85');
 // One recording across a 3 s pause is cut; the same pause across a split of that recording too; 9 s of quiet is not a pause.
 const one=createProject('x');one.media=p.media;one.clips=[clip('s','screen',0,40)];
 one.captions=[{id:'a',start:0,end:10,text:'a',words:words(0,10)},{id:'b',start:13,end:20,text:'b',words:words(13,20)},{id:'c',start:29,end:40,text:'c',words:words(29,40)}];
 assert.deepEqual(wordPauseRanges(one,'gentle').map(([a,b])=>[+a.toFixed(2),+b.toFixed(2)]),[[9.75,12.85]]);
 const split=applyProjectChange(one,d=>{splitLinked(d,11,new Set(),'s');});
 assert.equal(wordPauseRanges(split,'gentle').length,1,'a split inside the pause does not hide it');
 // With Auto-edit's audio plan for these clips, only where the audio is silent too; a plan for other clips is ignored.
 const plan={fingerprint:clipsFingerprint(one.clips),ranges:[[11,12.5]] as [number,number][]};
 assert.deepEqual(wordPauseRanges(one,'gentle',{silences:plan}),[[11,12.5]]);
 assert.deepEqual(wordPauseRanges(one,'gentle',{silences:{...plan,fingerprint:'other'}}).length,1);
 assert.equal(editActionProblem(one,{type:'cut_pauses',level:'gentle'},{silences:{...plan,ranges:[[30,31]]}}),'There are no pauses that long between your words.');
 // The card says how much it takes out, the same as Apply.
 assert.deepEqual(editEstimate(one,{type:'cut_pauses',level:'gentle'}),{text:'1 cut · 3.1 s shorter'});
 const applied=applyProjectChange(one,d=>{applyEditAction(d,{type:'cut_pauses',level:'gentle'},{silences:plan});});
 assert.ok(Math.abs(projectDuration(one)-projectDuration(applied)-1.5)<1e-9,'Apply cuts what the plan allows');
});

test('a long delete is said on the card and capped; a zoom says which zoom it replaces; one element factory',()=>{
 const p=make(),length=projectDuration(p);
 assert.equal(describeEditAction({type:'delete_range',start:10,end:14.8}),'Delete 0:10.0 to 0:14.8 (4.8 s) from every row; the rest moves up.');
 assert.deepEqual(editEstimate(p,{type:'delete_range',start:10,end:14.8}),{text:'1 cut · 4.8 s shorter (7% of the video)'});
 const big=editEstimate(p,{type:'delete_range',start:10,end:30})!;assert.equal(big.warn,true);assert.match(big.text,/That is 29% of the video\.$/);
 assert.equal(editActionProblem(p,{type:'delete_range',start:0,end:length*.6}),'That would delete more than half the video: select it on the timeline and delete it there.');
 const zoomed=applyProjectChange(p,d=>{applyEditAction(d,{type:'set_zoom',start:20,duration:4,scale:1.5});});
 assert.equal(describeEditAction({type:'set_zoom',start:22,duration:4,scale:2},zoomed),'Zoom 2× on the screen at 0:22.0 for 4 s, replacing the 1.5× zoom at 0:20.0.');
 assert.deepEqual(editEstimate(zoomed,{type:'set_zoom',start:22,duration:4,scale:2}),{text:'Replaces the 1.5× zoom at 0:20.0.'});
 assert.deepEqual(editEstimate(p,{type:'split_at',time:500}),{text:'That time is outside the video.',warn:true});
 const text=newElement('text',3,'t1',{text:'Hi'});assert.deepEqual([text.id,text.start,text.duration,text.text,text.fontSize,text.background],['t1',3,5,'Hi',64,'#171b27bb']);
 assert.equal(newElement('highlight',0).background,'#bba6ff66');
});

test('add a motion block: on the Motion row over clips, never inside another block, shortened to the room it has',()=>{
 const p=make();
 const {next,result}=apply(p,{type:'add_motion_block',template:'lower-third',start:12,text:'Samin Yasar',detail:'Founder'});
 assert.equal(result,'Lower third added at 0:12.0');
 assert.deepEqual(next.motion!.map(m=>[m.template,m.style,m.start,m.duration,m.props.name,m.props.role]),[['lower-third','block',12,5,'Samin Yasar','Founder']]);
 assert.equal(next.clips.length,p.clips.length,'clips untouched');
 assert.equal(editActionProblem(next,{type:'add_motion_block',template:'title-card',start:14,text:'T'}),'Another motion block is already there at that time.');
 // Starts before the block at 12 s: it stops where that one starts, and the card says so.
 assert.deepEqual(editEstimate(next,{type:'add_motion_block',template:'title-card',start:9,text:'T'}),{text:'Shortened to 3 s: it stops at 0:12.0, where the next motion block starts.'});
 const two=apply(next,{type:'add_motion_block',template:'title-card',start:9,text:'T'}).next;
 assert.deepEqual(two.motion!.map(m=>[m.start,m.duration]),[[9,3],[12,5]]);
 assert.equal(editActionProblem(two,{type:'add_motion_block',template:'callout',start:11.5,text:'Here',x:.2,y:.3}),'Another motion block is already there at that time.');
 assert.match(editActionProblem(next,{type:'add_motion_block',template:'lower-third',start:11,text:'X'})!,/no room for a lower third/);
 assert.equal(editActionProblem(p,{type:'add_motion_block',template:'lower-third',style:'neon',start:2,text:'X'}),'A lower third has no style called "neon".');
 assert.equal(editActionProblem(p,{type:'add_motion_block',template:'chapter-label',start:projectDuration(p)-.5,text:'X'}),'That is too close to the end of the video.');
 assert.equal(editActionProblem(p,{type:'add_motion_block',template:'chapter-label',start:projectDuration(p)+3,text:'X'}),'That time is outside the video.');
 const callout=apply(p,{type:'add_motion_block',template:'callout',style:'ring',start:3,duration:2,text:'Click here',x:.25,y:.7}).next.motion![0];
 assert.deepEqual(callout.props,{label:'Click here',x:.25,y:.7});
 assert.equal(describeEditAction({type:'add_motion_block',template:'lower-third',start:12,text:'Samin Yasar',detail:'Founder'}),'Lower third (block) “Samin Yasar” · Founder at 0:12.0 for 5 s.');
 // A ripple delete before the block moves it up; a delete across it shortens it; deleting it removes only it.
 const cut=apply(next,{type:'delete_range',start:2,end:4}).next;assert.deepEqual(cut.motion!.map(m=>[m.start,m.duration]),[[10,5]]);
 const across=apply(next,{type:'delete_range',start:14,end:16}).next;assert.deepEqual(across.motion!.map(m=>[m.start,m.duration]),[[12,3]]);
 const gone=applyProjectChange(next,d=>{deleteItems(d,[next.motion![0].id],false);});assert.deepEqual(gone.motion,[]);assert.equal(gone.clips.length,next.clips.length);
});

// ---------------------------------------------------------------- random sequences

let seed=1;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};const pick=<X,>(list:readonly X[])=>list[Math.floor(rnd()*list.length)];
const length=(p:Project)=>Math.max(1,projectDuration(p));
const edited=(p:Project)=>p.clips.filter(c=>c.track!=='music');
/** Actions as a model would offer them: mostly in range, some outside it or naming a clip that is gone (those are refused, as on the server). */
function randomAction(p:Project):EditAction{
 const t=()=>rnd()<.9?rnd()*length(p):length(p)+5,c=()=>rnd()<.9?pick(edited(p))?.id??'gone':'gone';
 switch(Math.floor(rnd()*12)){
  case 0:return {type:'cut_pauses',level:pick(['gentle','balanced','tight'] as const)};
  case 1:return {type:'remove_fillers'};
  case 2:return {type:'close_gaps'};
  case 3:return rnd()<.5?{type:'split_at',time:t()}:{type:'split_at',time:t(),clipId:c()};
  case 4:return {type:'trim_clip',clipId:c(),side:rnd()<.5?'start':'end',time:t()};
  case 5:{const a=t();return {type:'delete_range',start:a,end:a+.1+rnd()*4};}
  case 6:return {type:'set_caption_style',fontSize:24+Math.floor(rnd()*60),position:pick(['top','center','bottom'] as const)};
  case 7:{const a=t();return {type:'add_caption',start:a,end:a+.5+rnd()*3,text:'Caption'};}
  case 8:return {type:'add_text',start:t(),duration:.5+rnd()*6,text:'Title'};
  case 9:return {type:'set_zoom',start:t(),duration:.5+rnd()*5,scale:1.2+rnd()*2};
  case 10:{const template=pick(MOTION_TEMPLATE_IDS);return {type:'add_motion_block',template,style:rnd()<.9?pick(MOTION_TEMPLATES[template].styles).id:'neon',start:t(),...(rnd()<.5?{duration:1+rnd()*8}:{}),text:'Graphic',...(template==='callout'?{x:rnd(),y:rnd()}:{})};}
  default:return {type:'normalize_audio'};
 }
}
/** The person's own edits between cards, as the editor makes them. */
const userEdits:Record<string,(p:Project)=>void>={
 split:p=>{const c=pick(edited(p));if(c)splitLinked(p,c.start+rnd()*clipDuration(c),linkedIds(p.clips,[c.id]));},
 delete:p=>{const c=pick(edited(p));if(c){deleteItems(p,[c.id],true);syncScenesToTakes(p);}},
 move:p=>{const c=pick(edited(p));if(!c)return;const ids=linkedIds(p.clips,[c.id]),plan=planClipMove(p,ids,(rnd()-.5)*30,rnd()*length(p));ensureLinks(p);applyClipStarts(p,plan.starts);syncScenesToTakes(p);},
 nudge:p=>{const c=pick(edited(p));if(!c)return;const ids=linkedIds(p.clips,[c.id]),items=rowItems(p),moving=items.filter(i=>ids.has(i.id)),delta=freeDelta(moving,rnd()<.5?-1:1,items);if(delta){ensureLinks(p);applyClipStarts(p,new Map(moving.map(m=>[m.id,m.start+delta])));syncScenesToTakes(p);}},
 trim:p=>{const c=pick(edited(p));if(!c)return;const side=rnd()<.5?'left':'right',edge=(x:Clip)=>side==='left'?x.start:x.start+clipDuration(x);
  const ids=new Set([...linkedIds(p.clips,[c.id])].filter(id=>Math.abs(edge(p.clips.find(x=>x.id===id)!)-edge(c))<1e-3)),b=trimBounds(p,ids,side,true),d=Math.max(b.min,Math.min(b.max,(rnd()-.5)*8));
  if(d){ensureLinks(p);trimClips(p,ids,side,d,true);syncScenesToTakes(p);}},
 // Motion blocks as the Motion row and panel change them: add at the playhead (after a block already there), drag (slides to a gap), resize an edge, delete.
 addMotion:p=>{addMotionBlock(p,newMotionBlock(pick(MOTION_TEMPLATE_IDS),rnd()*length(p),`mb${Math.floor(rnd()*1e9)}`),true);},
 moveMotion:p=>{const m=pick(p.motion??[]);if(!m)return;const items=rowItems(p),moving=items.filter(i=>i.id===m.id);moveEffects(p,new Set([m.id]),freeDelta(moving,(rnd()-.5)*20,items));},
 resizeMotion:p=>{const m=pick(p.motion??[]);if(m)resizeEffect(p,m.id,rnd()<.5?'left':'right',(rnd()-.5)*10);},
 deleteMotion:p=>{const m=pick(p.motion??[]);if(m){deleteItems(p,[m.id],rnd()<.5);syncScenesToTakes(p);}},
};
/** The timeline parts a card changes, as the server compares them for Undo. */
const KEYS=['clips','captions','captionStyle','elements','motion','zooms','scenes','markers','cursor'] as const;
const timeline=(p:Project)=>JSON.stringify(KEYS.map(key=>p[key]??null));
const restore=(p:Project,before:Project)=>applyProjectChange(p,d=>{for(const key of KEYS)(d as unknown as Record<string,unknown>)[key]=structuredClone((before as unknown as Record<string,unknown>)[key]);});

/** Every (row, media, source time) point outside the cut survives at the shifted time, and nothing new appears there (the reviewer's check). */
function contentKept(before:Project,after:Project,ranges:Array<[number,number]>):string|undefined{
 const shift=(t:number)=>t-ranges.reduce((n,[a,b])=>n+(t>=b?b-a:0),0);
 const at=(p:Project,t:number)=>p.clips.filter(c=>c.start+1e-3<t&&c.start+clipDuration(c)-1e-3>t).map(c=>`${clipLayerRowId(c,p)}|${c.mediaId}|${(c.sourceIn+(t-c.start)*c.speed).toFixed(3)}`).sort().join(';');
 for(let t=.013;t<projectDuration(before);t+=.37){
  if(ranges.some(([a,b])=>t>a-.02&&t<b+.02))continue;
  if(before.clips.some(c=>Math.abs(c.start-t)<.02||Math.abs(c.start+clipDuration(c)-t)<.02))continue;
  const x=at(before,t),y=at(after,shift(t));if(x!==y)return `t=${t.toFixed(2)} before [${x}] after [${y}]`;
 }
}
const captionsOverlap=(p:Project)=>rowsOverlap(rowItems(p).filter(i=>i.row==='captions'));
function problems(p:Project):string[]{
 const out:string[]=[];
 // Clip rows, text and graphics, zooms. Captions are checked per card below: a move of a clip by hand can already make them overlap (older behaviour, Task 2).
 const items=rowItems({...p,captions:[]});if(rowsOverlap(items)){const rows=[...new Set(items.map(i=>i.row))].filter(r=>rowsOverlap(items.filter(i=>i.row===r)));out.push(`row ${rows.join(',')} overlaps`);}
 if(items.some(i=>i.start<-1e-6))out.push('negative start');
 if(items.some(i=>i.row===MOTION_ROW&&!(i.duration>0)))out.push('an empty motion block');
 const groups=linkGroups(p.clips),members=new Map<string,Clip[]>();for(const c of p.clips){const key=groups.get(c.id)!;members.set(key,[...(members.get(key)??[]),c]);}
 for(const [key,list] of members){
  const rows=list.map(c=>clipLayerRowId(c,p));if(new Set(rows).size<rows.length)out.push(`group ${key} has two clips on one row`);
  const offsets=list.filter(c=>c.track!=='overlay').map(c=>c.start-c.sourceIn/c.speed-(c.track==='camera'?.4:0));if(offsets.length>1&&Math.max(...offsets)-Math.min(...offsets)>1e-6)out.push(`group ${key} out of sync`);
 }
 const scenes=p.scenes.filter(s=>s.duration>1e-3).sort((a,b)=>a.start-b.start);for(let i=1;i<scenes.length;i++)if(scenes[i].start<scenes[i-1].start+scenes[i-1].duration-1e-3)out.push('scenes overlap');
 if(p.scenes.some(s=>s.start<-1e-6))out.push('a scene starts before zero');
 return out;
}

test('random sequences of cards, Undo and the person\'s own edits keep rows, links and scenes consistent',t=>{
 const failures:string[]=[];let applied=0,refused=0,undone=0,undoRefused=0,steps=0,motionCards=0,motionSteps=0;
 for(let run=0;run<300;run++){
  seed=run+1;let p=make();const history:string[]=[];const versions:Array<{before:Project;after:string}>=[];
  for(let step=0;step<14;step++){
   const r=rnd();steps++;
   if(r<.2&&versions.length){
    // Undo of a random applied card: only while the timeline still equals what that card wrote, as the server checks it.
    const v=versions.splice(Math.floor(rnd()*versions.length),1)[0];
    if(timeline(p)===v.after){p=restore(p,v.before);undone++;history.push('undo');}else{undoRefused++;history.push('undo refused');}
   }else if(r<.45){const name=pick(Object.keys(userEdits));p=applyProjectChange(p,d=>userEdits[name](d));history.push(name);if(name.endsWith('Motion'))motionSteps++;}
   else{
    const action=randomAction(p);
    if(editActionProblem(p,action)){refused++;history.push(`refused ${action.type}`);}
    else{const before=p,ranges=editRanges(p,action);p=apply(p,action).next;versions.push({before,after:timeline(p)});applied++;history.push(action.type);if(action.type==='add_motion_block')motionCards++;
     const changed=ranges&&contentKept(before,p,mergeRanges(ranges));if(changed){failures.push(`run ${run}: ${history.join(' > ')}: content changed outside the cut: ${changed}`);break;}
     if(captionsOverlap(p)&&!captionsOverlap(before)){failures.push(`run ${run}: ${history.join(' > ')}: the card made captions overlap`);break;}}
   }
   const found=problems(p);if(found.length){failures.push(`run ${run}: ${history.join(' > ')}: ${found[0]}`);break;}
  }
 }
 assert.deepEqual(failures.slice(0,6),[],`${failures.length} of 300 sequences broke an invariant`);
 assert.ok(applied>1000&&undone>50&&undoRefused>20&&refused>50,`applied ${applied}, refused ${refused}, undone ${undone}, undo refused ${undoRefused}`);
 assert.ok(motionCards>100&&motionSteps>200,`motion cards ${motionCards}, motion edits ${motionSteps}`);
 t.diagnostic(`${steps} steps in 300 sequences: ${applied} cards applied (${motionCards} motion blocks), ${refused} refused, ${undone} undone, ${undoRefused} undos refused after later changes, ${motionSteps} motion edits by hand`);
});
