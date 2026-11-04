import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,clipDuration,type Clip,type LayoutSegment,type Media,type Project} from '../shared/types';
import {bakeLayouts,baseLayout,chooseLayout,insertLayout,layoutAt,layoutGeometry,layoutRoom,layoutsProblem,layoutTransform} from '../shared/layouts';
import {closeRange,deleteItems,freeDelta,moveEffects,openRange,resizeEffect,rowItems} from './timeline-edit';
import {moveRecordingScene} from './recording-scenes';
import {validateProject} from '../server/storage';

const media=(id:string):Media=>({id,name:id,path:`/tmp/${id}.mov`,kind:'video',duration:600,width:1920,height:1080,hasAudio:true});
const clip=(id:string,track:Clip['track'],start:number,length:number,extra:Partial<Clip>={}):Clip=>({id,mediaId:track==='camera'?'cam':track==='audio'?'mic':'scr',name:id,track,start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects(),...extra});
const stretch=(id:string,start:number,duration:number,preset:LayoutSegment['preset']='Picture in picture'):LayoutSegment=>({id,start,duration,preset});
/** A ten-second linked take: screen, camera and microphone. */
function project(layouts:LayoutSegment[]=[]):Project{
 const p=createProject('Layouts');p.media=[media('scr'),media('cam'),media('mic')];
 p.clips=[clip('screen','screen',0,10,{linkId:'take'}),clip('camera','camera',0,10,{linkId:'take'}),clip('mic','audio',0,10,{linkId:'take'})];
 p.scenes=[{id:'s1',name:'One',script:'',notes:'',start:0,duration:10}];p.layouts=layouts;return p;
}
const LEFT='left' as const,RIGHT='right' as const;
const spans=(p:Project)=>(p.layouts??[]).map(l=>[l.id,+l.start.toFixed(6),+l.duration.toFixed(6),l.preset]);

test('inside a layout stretch the camera and screen take its arrangement; outside it, and for sound, a clip keeps its own place',()=>{
 const p=project([stretch('l',4,3,'Side by side')]),camera=p.clips[1],screen=p.clips[0],g=layoutGeometry('Side by side',p.canvas);
 assert.deepEqual(layoutTransform(p,camera,5),{...camera.transform,...g.camera});
 assert.deepEqual(layoutTransform(p,screen,5),{...screen.transform,...g.screen});
 assert.equal(layoutTransform(p,camera,3.99),camera.transform,'before the stretch');
 assert.equal(layoutTransform(p,camera,7),camera.transform,'the end is open, as a clip\'s is');
 assert.equal(layoutTransform(p,p.clips[2],5),p.clips[2].transform,'the microphone has no place');
 const background={...camera,zIndex:-1000};assert.equal(layoutTransform(p,background,5),background.transform,'the canvas background stays');
});

test('choosing a layout as Borumi does: the selected stretch, else the one at the playhead, else a new one from the playhead to the next change',()=>{
 const p=project([stretch('later',6,2,'Full frame')]);
 assert.deepEqual(chooseLayout(p,'Side by side',new Set(),2,'new'),['new']);
 assert.deepEqual(spans(p),[['new',2,4,'Side by side'],['later',6,2,'Full frame']],'it runs up to the next change');
 assert.deepEqual(chooseLayout(p,'Camera spotlight',new Set(),3),['new'],'the playhead is inside it: that stretch changes');
 assert.deepEqual(chooseLayout(p,'Creator',new Set(['later']),3),['later'],'a selected stretch wins over the playhead');
 assert.deepEqual(spans(p),[['new',2,4,'Camera spotlight'],['later',6,2,'Creator']]);
 assert.deepEqual(chooseLayout(p,'Full frame',new Set(),9,'tail'),['tail']);assert.deepEqual(spans(p).at(-1),['tail',9,1,'Full frame'],'after the last stretch it runs to the end');
});

test('a choice with the playhead on the very end changes the last stretch, or covers the video when there is none',()=>{
 const covered=project([stretch('all',0,10)]);assert.deepEqual(chooseLayout(covered,'Creator',new Set(),10),['all']);assert.equal(covered.layouts![0].preset,'Creator');
 const bare=project();assert.deepEqual(chooseLayout(bare,'Side by side',new Set(),10,'whole'),['whole']);assert.deepEqual(spans(bare),[['whole',0,10,'Side by side']]);
 const empty=createProject('Nothing');assert.deepEqual(chooseLayout(empty,'Creator',new Set(),0),[],'no footage, no stretch');assert.equal(empty.layouts,undefined);
});

test('a new stretch fills only free room on the Layout row and never overlaps',()=>{
 const p=project([stretch('a',2,2),stretch('b',6,2)]);
 assert.deepEqual(insertLayout(p,{start:1,stop:7,preset:'Creator',id:'c'}),['c']);assert.deepEqual(spans(p).map(s=>s.slice(0,3)),[['c',1,1],['a',2,2],['b',6,2]],'clipped at the next stretch');
 assert.deepEqual(insertLayout(p,{start:3,stop:5,preset:'Creator',id:'d'}),['d']);assert.deepEqual(spans(p).find(s=>s[0]==='d'),['d',4,1,'Creator'],'starts after the stretch it began inside');
 assert.deepEqual(insertLayout(p,{start:5,stop:5.05,preset:'Creator'}),[],'too short');
 assert.equal(layoutsProblem(p.layouts),null);
});

test('the "+ Layout" stretch under the pointer: a tenth of the view, inside the room, and none over a stretch',()=>{
 const p=project([stretch('a',4,2)]);
 assert.deepEqual(layoutRoom(p,1,1,1.5,10),{start:1,stop:2.5});
 assert.deepEqual(layoutRoom(p,3.5,3.5,1.5,10),{start:2.5,stop:4},'pushed back so it ends at the next stretch');
 assert.deepEqual(layoutRoom(p,7,9.5,1,10),{start:7,stop:9.5},'a drag sets its length');
 assert.deepEqual(layoutRoom(p,8,1,1,10),{start:6,stop:8},'a drag back stops at the previous stretch');
 assert.equal(layoutRoom(p,5,5,1,10),null,'over a stretch there is nothing to add');
 assert.deepEqual(layoutRoom(p,9.6,9.6,1.5,10),{start:8.5,stop:10},'the end of the video bounds it');
});

test('export cuts camera and screen clips where a stretch changes their place; pieces keep their source and their fades\' origin',()=>{
 const p=project([stretch('a',4,2,'Side by side'),stretch('b',6,1,'Side by side'),stretch('c',8,3,'Camera spotlight')]);p.clips[1].effects.fadeOut=1;
 bakeLayouts(p);assert.equal(p.layouts,undefined);
 const cams=p.clips.filter(c=>c.track==='camera').sort((a,b)=>a.start-b.start);
 assert.deepEqual(cams.map(c=>[c.start,c.sourceIn,c.sourceOut]),[[0,0,4],[4,4,7],[7,7,8],[8,8,10]],'adjacent stretches with the same place stay one piece');
 assert.equal(cams[0].id,'camera');assert.ok(cams.every(c=>c.effectTiming?.sourceIn===0&&c.effectTiming.sourceOut===10));
 const side=layoutGeometry('Side by side',p.canvas).camera,spot=layoutGeometry('Camera spotlight',p.canvas).camera;
 assert.deepEqual(cams.map(c=>c.transform.width),[1,side.width,1,spot.width]);
 assert.equal(cams.reduce((sum,c)=>sum+clipDuration(c),0),10);
 assert.deepEqual(p.clips.filter(c=>c.track==='audio').map(c=>[c.id,c.start,c.sourceOut]),[['mic',0,10]],'sound is not cut');
 const whole=project([stretch('w',0,10,'Creator')]);bakeLayouts(whole);assert.equal(whole.clips.length,3,'a stretch over the whole clip moves it without a cut');
 assert.deepEqual(whole.clips[1].transform,layoutTransform({layouts:[stretch('w',0,10,'Creator')],canvas:whole.canvas},project().clips[1],5));
});

test('layout stretches follow the footage: a ripple cut shortens and shifts them, an opening inside one grows it, a delete removes one',()=>{
 const cut=project([stretch('a',2,4),stretch('b',7,2)]);closeRange(cut,3,5);assert.deepEqual(spans(cut).map(s=>s.slice(0,3)),[['a',2,2],['b',5,2]]);
 const open=project([stretch('a',2,4),stretch('b',7,2)]);openRange(open,3,2);assert.deepEqual(spans(open).map(s=>s.slice(0,3)),[['a',2,6],['b',9,2]]);
 const gone=project([stretch('a',2,4)]);deleteItems(gone,['a'],true);assert.deepEqual(gone.layouts,[]);assert.equal(gone.clips.length,3,'the footage stays');
});

test('a layout stretch moves and trims on its own row without overlapping the next one',()=>{
 const p=project([stretch('a',1,2),stretch('b',5,2)]),items=rowItems(p),moving=items.filter(i=>i.id==='a');
 assert.deepEqual(items.filter(i=>i.row==='layouts').map(i=>i.id),['a','b']);
 const delta=freeDelta(moving,3.5,items);assert.equal(delta,2,'it stops against the next stretch');moveEffects(p,new Set(['a']),delta);
 resizeEffect(p,'b',RIGHT,1);resizeEffect(p,'b',LEFT,-1);
 assert.deepEqual(spans(p).map(s=>s.slice(0,3)),[['a',3,2],['b',5,3]],'the left edge stops at the stretch before it');
});

test('reordering scenes carries each scene\'s layout with it',()=>{
 const p=project([stretch('a',0,4,'Side by side')]);
 p.clips=[clip('s1','screen',0,4,{linkId:'one'}),clip('c1','camera',0,4,{linkId:'one'}),clip('s2','screen',4,6,{linkId:'two'}),clip('c2','camera',4,6,{linkId:'two'})];
 p.scenes=[{id:'one',name:'One',script:'',notes:'',start:0,duration:4},{id:'two',name:'Two',script:'',notes:'',start:4,duration:6}];
 moveRecordingScene(p,'two','one');
 assert.deepEqual(spans(p),[['a',6,4,'Side by side']],'the first scene\'s layout went with it to the end');
 assert.equal(layoutAt(p,7)?.id,'a');
});

test('the project file keeps layout stretches and refuses broken ones',()=>{
 const p=project([stretch('a',0,4)]);assert.doesNotThrow(()=>validateProject(structuredClone(p)));
 for(const bad of [[stretch('a',0,4),stretch('b',3,2)],[{...stretch('a',0,4),preset:'Wide'} as unknown as LayoutSegment],[{...stretch('a',0,4),duration:0}],[stretch('a',0,1),stretch('a',2,1)]])
  assert.throws(()=>validateProject({...structuredClone(p),layouts:bad}),/Layout|layout/);
 assert.equal(baseLayout(p),'Full frame','a camera filling the frame is the Full frame preset');p.clips[1].transform.x=.5;assert.equal(baseLayout(p),null,'a camera placed by hand is no preset');
});
