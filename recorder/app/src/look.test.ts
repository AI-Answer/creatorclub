import test from 'node:test';
import assert from 'node:assert/strict';
import type {EditAction} from '../shared/companion';
import {createProject,defaultEffects,defaultTransform,clipDuration,type Clip,type Project} from '../shared/types';
import {CLEAN_LOOK,EDITORIAL_LOOK,drawnBlocks,lookFrom,normalizeLook,stagePanel,stageTile} from '../shared/look';
import {iconItem,motionMarkup,newMotionBlock,normalizeMotionProps} from '../shared/motion/templates';
import {applyProjectChange} from './project-draft';
import {applyEditAction,describeEditAction,editActionProblem} from './editing-actions';

/*
 * A look is data every graphic reads, and the stage is a layout made of ordinary timeline edits: the camera split at the stretch's edges,
 * the piece inside made a tile, the screen under it stepped away. Graphics drawn on a stage stretch take the middle of the frame.
 */

const clip=(id:string,track:Clip['track'],length:number):Clip=>({id,mediaId:'m',name:id,track,start:0,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()});
function talk():Project{
 const p=createProject('Look');
 p.media=[{id:'m',name:'take',path:'/tmp/take.mov',kind:'video',duration:20,width:1920,height:1080,hasAudio:true}];
 p.clips=[clip('screen-1','screen',20),clip('camera-1','camera',20)];
 return p;
}
const apply=(p:Project,action:EditAction)=>applyProjectChange(p,d=>{applyEditAction(d,action);});

test('a look card starts from a preset and changes only the values it sets; a stage of null drops the stage', () => {
 const editorial=apply(talk(),{type:'set_look',preset:'editorial'});
 assert.deepEqual(editorial.look,EDITORIAL_LOOK);
 const warm=apply(editorial,{type:'set_look',accent:'#E8B04B'});
 assert.equal(warm.look?.accent,'#e8b04b');
 assert.equal(warm.look?.display,'serif','what the card leaves out stays as it was');
 assert.equal(warm.look?.name,'Editorial (yours)');
 assert.equal(apply(warm,{type:'set_look',stage:null}).look?.stage,undefined);
 assert.deepEqual(apply(editorial,{type:'set_look',stage:{side:'left'}}).look?.stage,{...EDITORIAL_LOOK.stage,side:'left'});
 assert.match(describeEditAction({type:'set_look',preset:'editorial'}),/^Editorial: serif headlines .* stage with you on the right\.$/);
});

test('a stored look is checked value by value: anything wrong falls back to Clean', () => {
 const look=normalizeLook({name:'  ',display:'gothic',paper:'red',ink:'#000000',motion:'wild',stage:{background:'#123',side:'up',size:5}});
 assert.equal(look.name,'Clean');
 assert.equal(look.display,'sans');
 assert.equal(look.paper,CLEAN_LOOK.paper);
 assert.equal(look.ink,'#000000');
 assert.equal(look.motion,'lively');
 assert.deepEqual(look.stage,{background:'#1c1c1c',side:'right',size:.3});
 assert.equal(normalizeLook({stage:{size:.01}}).stage?.size,.12,'never a tile too small to see');
 assert.equal(lookFrom(undefined,{}).name,'Clean');
});

test('the stage card makes the camera inside the stretch a tile on the stage and steps the screen away there, nowhere else', () => {
 const p=apply(apply(talk(),{type:'set_look',preset:'editorial'}),{type:'set_stage',start:5,end:12});
 const at=(track:Clip['track'],time:number)=>p.clips.find(c=>c.track===track&&c.start<=time&&time<c.start+clipDuration(c))!;
 const tile=at('camera',8),before=at('camera',2),after=at('camera',15);
 assert.deepEqual([tile.start,tile.start+clipDuration(tile)],[5,12]);
 assert.equal(tile.stage,true);
 assert.equal(tile.effects.faceCenter,true,'the face stays in the tile');
 const box=stageTile(EDITORIAL_LOOK.stage!,p.canvas);
 assert.deepEqual([tile.transform.x,tile.transform.y,tile.transform.width,tile.transform.height],[box.x,box.y,box.width,box.height]);
 assert.ok(box.x>.75&&Math.abs(box.width*p.canvas.width*1.6-box.height*p.canvas.height)<1,'a portrait tile (5:8) on the right edge');
 assert.equal(at('screen',8).transform.opacity,0);
 assert.equal(at('screen',2).transform.opacity,1);
 for(const c of [before,after]){assert.equal(c.stage,undefined);assert.equal(c.transform.width,1);}
 assert.equal(p.canvas.background,EDITORIAL_LOOK.stage!.background);
 assert.equal(p.canvas.backgroundPattern,'moving-dots','the stage is a dark field of slow dots');
});

test('a stage card needs a camera in its stretch and a stretch inside the video', () => {
 const screenOnly=talk();screenOnly.clips=screenOnly.clips.filter(c=>c.track==='screen');
 assert.match(editActionProblem(screenOnly,{type:'set_stage',start:2,end:8})!,/no camera/);
 assert.match(editActionProblem(talk(),{type:'set_stage',start:15,end:30})!,/outside/);
 assert.match(editActionProblem(talk(),{type:'set_stage',start:5,end:5.2})!,/outside/);
 assert.equal(editActionProblem(talk(),{type:'set_stage',start:2,end:8}),undefined);
});

test('graphics are drawn with the look, and in the middle of the frame where they start on a stage stretch', () => {
 let p=apply(apply(talk(),{type:'set_look',preset:'editorial'}),{type:'set_stage',start:5,end:12});
 p={...p,motion:[newMotionBlock('bullets',6,'s1'),{...newMotionBlock('stat',14,'s2'),place:'left'},{...newMotionBlock('lower-third',7,'s3')}]};
 const [onStage,offStage,lowerThird]=drawnBlocks(p);
 assert.equal(onStage.place,'stage');
 assert.equal(offStage.place,'left','off the stage, a graphic keeps the side it was given');
 assert.equal(lowerThird.place,undefined,'a lower third has its own place');
 assert.ok([onStage,offStage,lowerThird].every(b=>b.look===p.look));
 const html=motionMarkup(onStage);
 for(const part of ['mb-at-stage','mb-serif','mb-motion-subtle','--mb-paper:#f4f2ee'])assert.ok(html.includes(part),part);
 assert.ok(!motionMarkup(drawnBlocks({...p,look:undefined})[1]).includes('mb-serif'),'with no look, graphics are Clean');
});

test('on the stage a graphic sits in a still panel beside the tile, and only its content fades out', () => {
 const look=EDITORIAL_LOOK,html=motionMarkup({...newMotionBlock('flow',1,'f'),look,place:'stage'});
 const panel=stagePanel(look.stage!),tile=stageTile(look.stage!,{width:1920,height:1080});
 assert.match(html,new RegExp(`class="mb-panel" style="left:${(panel.x*100).toFixed(2)}cqw;width:${(panel.width*100).toFixed(2)}cqw"><div class="mb-panel-in">`));
 assert.ok(Math.abs(panel.x+panel.width+.025-tile.x)<1e-9,'the panel ends a gap before the tile');
 const left=stagePanel({...look.stage!,side:'left'});
 assert.ok(left.x>tile.width,'with the tile on the left, the panel is on the right');
 assert.ok(!motionMarkup({...newMotionBlock('flow',1,'f'),look}).includes('mb-panel'),'off the stage there is no panel');
});

test('an item starts with an icon in brackets: a status ring, a line icon or a brand; an unknown name is dropped, the words kept', () => {
 assert.deepEqual(iconItem('[check] Install the app'),{icon:'check',text:'Install the app'});
 assert.deepEqual(iconItem('[Claude] Claude Code'),{icon:'claude',text:'Claude Code'});
 assert.deepEqual(iconItem('[confetti] Party'),{text:'Party'});
 assert.deepEqual(iconItem('No icon [here]'),{text:'No icon [here]'});
 const list=motionMarkup({...newMotionBlock('bullets',0,'b'),props:{items:'[check] Done | [x] Not yet | [warn] Careful | [bot] Agent | Plain',heading:''}});
 for(const part of ['mb-badge-ok','mb-badge-no','mb-badge-warn','class="mb-tile"'])assert.ok(list.includes(part),part);
 assert.equal((list.match(/mb-has-ic/g)??[]).length,4,'the plain point keeps its dash');
 const dark=motionMarkup({...newMotionBlock('flow',0,'f'),props:{nodes:'[github] Repo | [claude] Claude',labels:''}});
 assert.match(dark,/<path fill="currentColor"/,'a black brand mark is drawn in the text colour, so it shows on a dark panel');
 assert.match(dark,/<path fill="#d97757"/,'a coloured brand mark keeps its colour');
});

test('a flow joins its boxes with one arrow between each, labelled in order; a tree draws one branch per box', () => {
 const flow=motionMarkup({...newMotionBlock('flow',0,'f'),props:normalizeMotionProps('flow',{nodes:'[mic] You | [bot] Claude | [check] Done',labels:'asks | answers'})});
 assert.equal((flow.match(/class="mb-fl-node"/g)??[]).length,3);
 assert.equal((flow.match(/class="mb-fl-link"/g)??[]).length,2);
 assert.deepEqual([...flow.matchAll(/mb-fl-label">([^<]*)</g)].map(m=>m[1]),['asks','answers']);
 const tree=motionMarkup({...newMotionBlock('tree',0,'t'),props:normalizeMotionProps('tree',{root:'[bot] Orchestrator',children:'A | B | C | D'})});
 assert.equal((tree.match(/<path pathLength="1"/g)??[]).length,4);
 assert.equal((tree.match(/class="mb-tr-kid"/g)??[]).length,4);
 const compare=motionMarkup({...newMotionBlock('compare',0,'c'),props:normalizeMotionProps('compare',{titles:'[laptop] Local | [cloud] Cloud',lines:'[x] Stops at night; [check] Your files | [check] Runs overnight'})});
 assert.equal((compare.match(/<li /g)??[]).length,3,'a side with points becomes a list');
});

test('a picture added on a stage stretch goes in the panel, beside the speaker', () => {
 const staged=apply(apply(talk(),{type:'set_look',preset:'editorial'}),{type:'set_stage',start:5,end:12});
 const media={id:'proof',name:'proof',path:'/tmp/proof.png',kind:'image' as const,duration:0,width:1920,height:1080,hasAudio:false};
 const inside=apply(staged,{type:'add_clip',media,start:6,duration:3,title:'Docs'}).clips.find(c=>c.track==='overlay')!;
 const panel=stagePanel(EDITORIAL_LOOK.stage!);
 assert.deepEqual([inside.transform.x,inside.transform.y,inside.transform.width,inside.transform.height,inside.transform.fit],[panel.x,panel.y,panel.width,panel.height,'contain']);
 const outside=apply(staged,{type:'add_clip',media,start:14,duration:3,title:'Docs'}).clips.find(c=>c.track==='overlay')!;
 assert.equal(outside.transform.width,1,'off the stage it fills the frame');
});
