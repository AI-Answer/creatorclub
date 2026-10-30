import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createProject,projectDuration,type MotionBlock,type MotionTemplateId,type Project} from '../shared/types';
import {MOTION_CSS,MOTION_TEMPLATES,MOTION_TEMPLATE_IDS,motionBlockProblem,motionMarkup,motionPropsFrom,newMotionBlock,normalizeMotionProps,seekAnimations} from '../shared/motion/templates';
import {MOTION_SEEK,motionClip,motionDocument} from '../shared/motion/document';
import {cutTimelineRange} from '../shared/timeline-edits';
import {applyProjectChange} from './project-draft';
import {MotionLayer} from './MotionLayer';
import {addMotionBlock,deleteItems,moveEffects,MOTION_ROW,openRange,resizeEffect,rowItems,rowsOverlap} from './timeline-edit';
import {validateProject} from '../server/storage';

/*
 * Motion blocks: the template registry, the preview and the export rendering the same template function, and the timeline rules on the
 * Motion row (blocks overlap clips of other rows, never each other).
 */

let seed=7;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};const pick=<X,>(list:readonly X[])=>list[Math.floor(rnd()*list.length)];
const words=['Samin','Yasar','<b>bold</b>','"quoted"',"it's",'&','Claude','Club','💡','Ünïcode','  spaced   out  '];
const text=()=>Array.from({length:1+Math.floor(rnd()*6)},()=>pick(words)).join(' ');
function randomBlock(i:number):MotionBlock{
 const template=pick(MOTION_TEMPLATE_IDS);
 return newMotionBlock(template,rnd()*60,`b${i}`,{style:pick(MOTION_TEMPLATES[template].styles).id,duration:.5+rnd()*25,props:motionPropsFrom(template,{text:text(),detail:rnd()<.5?text():undefined,x:rnd()*1.4-.2,y:rnd()*1.4-.2})});
}

test('every template has two styles, sane lengths and props; text is escaped; no backdrop blur or blend modes',()=>{
 assert.deepEqual(MOTION_TEMPLATE_IDS,['title-card','lower-third','callout','chapter-label']);
 for(const id of MOTION_TEMPLATE_IDS){const t=MOTION_TEMPLATES[id];
  assert.equal(t.styles.length,2,id);assert.ok(t.minDuration<=t.defaultDuration&&t.defaultDuration<=t.maxDuration,id);
  for(const s of t.styles)assert.match(MOTION_CSS,new RegExp(`\\.mb-s-${s.id}\\b`),`${id} ${s.id} has rules`);
  assert.match(MOTION_CSS,new RegExp(`\\.mb-${id}\\b`),`${id} has rules`);
 }
 const block=newMotionBlock('lower-third',1,'x',{props:{name:'<script>alert(1)</script>',role:'A & B "C"'}});
 const html=motionMarkup(block);
 assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.match(html,/A &amp; B &quot;C&quot;/);
 assert.doesNotMatch(MOTION_CSS,/backdrop-filter|mix-blend-mode/);
 // Colour values live only in the token block (the first rule); the template rules read the tokens.
 const [tokens,...rest]=MOTION_CSS.split('\n.mb *');
 assert.match(tokens,/--mb-accent:#/);
 assert.doesNotMatch(rest.join(''),/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
 // Sizes are container units, so one markup draws the 640 px preview and the 1080p frame alike: no px lengths in the templates.
 assert.doesNotMatch(rest.join(''),/\d px|\dpx/);
});

test('props are normalized: defaults, limits, positions inside the frame, unknown keys dropped',()=>{
 assert.deepEqual(normalizeMotionProps('callout',{label:'  Look   here ',x:1.7,y:'0.25',z:3}),{label:'Look here',x:1,y:.25});
 assert.deepEqual(normalizeMotionProps('lower-third',{}),{name:'Your name',role:''});
 assert.equal(String(normalizeMotionProps('title-card',{title:'x'.repeat(500)}).title).length,80);
 assert.deepEqual(motionPropsFrom('chapter-label',{text:'Projects',detail:'2'}),{number:'2',title:'Projects'});
 assert.equal(newMotionBlock('title-card',-3,'t',{style:'neon',duration:99}).style,'clean');
 assert.equal(newMotionBlock('title-card',-3,'t',{duration:99}).duration,20);
 assert.equal(newMotionBlock('title-card',-3,'t').start,0);
 assert.equal(motionBlockProblem(newMotionBlock('callout',0,'c')),undefined);
 assert.equal(motionBlockProblem({...newMotionBlock('callout',0,'c'),style:'neon'}),'Unknown motion style');
 assert.equal(motionBlockProblem({...newMotionBlock('callout',0,'c'),template:'sparkles'}),'Unknown motion template');
});

test('property: the export page and the preview render the same template markup and seek with the same function',()=>{
 const ms=1234.5;
 for(let i=0;i<300;i++){
  const block=randomBlock(i),markup=motionMarkup(block),width=2*(160+Math.floor(rnd()*1800)),height=2*(90+Math.floor(rnd()*1000));
  const page=motionDocument(block,width,height,'data:font/woff2;base64,AAAA');
  assert.equal(page.split(markup).length,2,`the export page holds the block's markup once (${block.template})`);
  assert.ok(page.includes(MOTION_CSS),'and the same stylesheet');
  assert.match(page,new RegExp(`\\.mb-stage\\{[^}]*width:${width}px;height:${height}px;container-type:size`),'on a stage the size of the frame');
  const time=block.start+rnd()*block.duration;
  const preview=renderToStaticMarkup(createElement(MotionLayer,{blocks:[block],time}));
  assert.ok(preview.includes(markup),`the preview holds the same markup (${block.template})`);
  assert.equal(renderToStaticMarkup(createElement(MotionLayer,{blocks:[block],time:block.start+block.duration+.01})),'','nothing after the block ends');
  // The clip stays inside the frame, on even pixels.
  const clip=motionClip(block,width,height);
  assert.ok(clip.x>=0&&clip.y>=0&&clip.x+clip.width<=width&&clip.y+clip.height<=height&&clip.width%2===0&&clip.height%2===0,JSON.stringify({clip,width,height}));
 }
 // The export's seek expression is `seekAnimations` itself; run in a page it pauses each animation and sets the frame's time, as the preview does.
 assert.equal(MOTION_SEEK,`(${seekAnimations.toString()})(document.getAnimations(),__MS__)`);
 const fake=()=>[{paused:false,currentTime:0 as unknown,pause(){this.paused=true;}},{paused:false,currentTime:0 as unknown,pause(){this.paused=true;}}];
 const page=fake(),stage=fake();
 new Function('document',MOTION_SEEK.replace('__MS__',String(ms)))({getAnimations:()=>page});
 seekAnimations(stage,ms);
 assert.deepEqual(page.map(a=>[a.paused,a.currentTime]),stage.map(a=>[a.paused,a.currentTime]));
 assert.deepEqual(page.map(a=>[a.paused,a.currentTime]),[[true,ms],[true,ms]]);
});

const project=():Project=>{const p=createProject('m');p.media=[{id:'v',name:'v',path:'/v',kind:'video',duration:60,width:1920,height:1080}];
 p.clips=[{id:'c',mediaId:'v',name:'c',track:'screen',start:0,sourceIn:0,sourceOut:30,speed:1,gain:1,muted:false,transform:{x:0,y:0,width:1,height:1,rotation:0,opacity:1,fit:'contain',borderRadius:0},effects:{brightness:0,contrast:1,saturation:1,blur:0,grayscale:false,flipX:false,fadeIn:0,fadeOut:0,denoise:false,normalize:false}}];return p;};

test('the Motion row: blocks over clips, never over each other; ripple, delete, move and resize follow the timeline rules',()=>{
 const p=applyProjectChange(project(),d=>{
  assert.ok('block' in addMotionBlock(d,newMotionBlock('lower-third',2,'a')));
  assert.deepEqual(addMotionBlock(d,newMotionBlock('title-card',4,'b')),{problem:'Another motion block is already there at that time.'});
  const slid=addMotionBlock(d,newMotionBlock('title-card',4,'b'),true);assert.ok('block' in slid&&slid.block.start===7);
  assert.deepEqual(addMotionBlock(d,newMotionBlock('chapter-label',1.5,'c')),{problem:'There is no room for a chapter label there: the next motion block starts too soon.'});
 });
 assert.deepEqual(p.motion!.map(m=>[m.id,m.start,m.duration]),[['a',2,5],['b',7,4]]);
 const items=rowItems(p);assert.deepEqual(items.filter(i=>i.row===MOTION_ROW).map(i=>i.id),['a','b']);assert.equal(rowsOverlap(items),false);
 assert.equal(projectDuration({...p,clips:[]}),11,'a block counts toward the length');
 // Ripple cut before and across, gap-keeping cut, open, delete, move (slides to a gap via freeDelta elsewhere), resize stops at neighbours and the template's shortest.
 const cut=applyProjectChange(p,d=>cutTimelineRange(d,0,1,true));assert.deepEqual(cut.motion!.map(m=>[m.start,m.duration]),[[1,5],[6,4]]);
 const across=applyProjectChange(p,d=>cutTimelineRange(d,6,8,true));assert.deepEqual(across.motion!.map(m=>[m.start,m.duration]),[[2,4],[6,3]]);
 const opened=applyProjectChange(p,d=>openRange(d,5,2));assert.deepEqual(opened.motion!.map(m=>m.start),[2,9]);
 const deleted=applyProjectChange(p,d=>{deleteItems(d,['a'],true);});assert.deepEqual(deleted.motion!.map(m=>[m.id,m.start]),[['b',7]]);assert.equal(deleted.clips[0].sourceOut,30,'a block holds no time: deleting it closes nothing');
 const moved=applyProjectChange(p,d=>moveEffects(d,new Set(['b']),3));assert.equal(moved.motion![1].start,10);
 const grown=applyProjectChange(p,d=>resizeEffect(d,'a','right',10));assert.deepEqual([grown.motion![0].start,grown.motion![0].duration],[2,5],'stops at the next block');
 const shrunk=applyProjectChange(p,d=>resizeEffect(d,'a','right',-10));assert.equal(shrunk.motion![0].duration,MOTION_TEMPLATES['lower-third'].minDuration);
 const early=applyProjectChange(p,d=>resizeEffect(d,'b','left',-10));assert.deepEqual([early.motion![1].start,early.motion![1].duration],[7,4],'stops at the block before');
});

test('old projects have no motion and stay valid; stored blocks are checked',()=>{
 const p=project();assert.equal(p.motion,undefined);assert.doesNotThrow(()=>validateProject(structuredClone(p)));
 const withBlocks={...p,motion:[newMotionBlock('chapter-label',1,'k',{props:{title:'Intro',number:'1'}})]};
 assert.doesNotThrow(()=>validateProject(structuredClone(withBlocks)));
 assert.throws(()=>validateProject({...structuredClone(withBlocks),motion:[{...withBlocks.motion[0],template:'confetti' as MotionTemplateId}]}),/Unknown motion template/);
 assert.throws(()=>validateProject({...structuredClone(withBlocks),motion:[{...withBlocks.motion[0],start:-1}]}),/Invalid motion block timing/);
});
