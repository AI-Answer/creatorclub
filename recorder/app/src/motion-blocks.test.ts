import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createProject,projectDuration,type MotionBlock,type MotionTemplateId,type Project} from '../shared/types';
import {MOTION_CSS,MOTION_TEMPLATES,MOTION_TEMPLATE_IDS,motionBlockProblem,motionBox,motionMarkup,motionPropsFrom,motionText,newMotionBlock,normalizeMotionProps,seekAnimations} from '../shared/motion/templates';
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
 assert.deepEqual(MOTION_TEMPLATE_IDS,['title-card','lower-third','callout','chapter-label','bullets','stat','compare','steps','quote','keyword','flow','tree','headline','versus','logos']);
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
  // From the panel the video keeps its length (30 s here): a block stops at the end, and none starts in the last second.
  const late=addMotionBlock(d,newMotionBlock('title-card',28,'late'),true,true);assert.ok('block' in late&&late.block.duration===2);
  assert.deepEqual(addMotionBlock(d,newMotionBlock('chapter-label',29.5,'end'),true,true),{problem:'There is no room for a chapter label before the end of the video.'});
  d.motion=d.motion!.filter(m=>m.id!=='late');
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

const NEW_TEMPLATES:MotionTemplateId[]=['bullets','stat','compare','steps','quote','keyword','flow','tree','headline','versus','logos'];

test('the new templates normalize their props: defaults, the companion\'s flat fields, limits and the main text',()=>{
 for(const id of NEW_TEMPLATES){
  const t=MOTION_TEMPLATES[id];
  // Bumped when a template's look changes (icons came to lists, steps and compare; then beats to everything that builds, and the outline flow).
  assert.equal(t.version,{bullets:3,steps:4,compare:2,flow:2,tree:2}[id as string]??1,id);
  assert.deepEqual(normalizeMotionProps(id,{}),Object.fromEntries(t.props.map(s=>[s.key,s.default])),`${id} fills from its defaults`);
  assert.deepEqual(normalizeMotionProps(id,{unknown:'x'}),normalizeMotionProps(id,{}),`${id} drops unknown keys`);
 }
 assert.deepEqual(motionPropsFrom('bullets',{text:'Cut | Caption | Post',detail:'Workflow'}),{items:'Cut | Caption | Post',heading:'Workflow',beats:''});
 assert.deepEqual(motionPropsFrom('stat',{text:'710K',detail:'Views in 30 days'}),{value:'710K',label:'Views in 30 days'});
 assert.deepEqual(motionPropsFrom('compare',{text:'Old way | New way',detail:'Hours of editing | One prompt'}),{titles:'Old way | New way',lines:'Hours of editing | One prompt'});
 assert.deepEqual(motionPropsFrom('steps',{text:'Record | Cut | Post'}),{steps:'Record | Cut | Post',heading:'',beats:''});
 assert.deepEqual(motionPropsFrom('quote',{text:'Ship it.',detail:'Samin'}),{quote:'Ship it.',who:'Samin'});
 assert.deepEqual(motionPropsFrom('keyword',{text:'Ten times faster',detail:'Same edit, same day'}),{word:'Ten times faster',line:'Same edit, same day'});
 assert.equal(motionText(newMotionBlock('compare',0,'c',{props:motionPropsFrom('compare',{text:'Old way | New way'})})),'Old way | New way');
 assert.equal(motionText(newMotionBlock('quote',0,'q',{props:motionPropsFrom('quote',{text:'Ship it.'})})),'Ship it.');
 assert.equal(motionText(newMotionBlock('chapter-label',0,'k',{props:{title:'Intro',number:'1'}})),'Intro');
 // Text is cut to its template's limit, and a stat's figure is a short one.
 assert.equal(String(normalizeMotionProps('stat',{value:'1'.repeat(40)}).value).length,12);
 assert.equal(String(normalizeMotionProps('keyword',{word:'w'.repeat(99)}).word).length,40);
 assert.equal(newMotionBlock('steps',0,'s',{duration:99}).duration,MOTION_TEMPLATES.steps.maxDuration);
});

test('the boxes of the new templates stay inside the frame; bullets and steps leave the bottom fifth for captions',()=>{
 const long='Mm '.repeat(120);
 for(const id of NEW_TEMPLATES){
  for(const props of [{},motionPropsFrom(id,{text:long,detail:long})]){
   const box=motionBox(newMotionBlock(id,0,'b',{props}));
   assert.ok(box.x>=0&&box.y>=0&&box.width>0&&box.height>0,`${id} ${JSON.stringify(box)}`);
   assert.ok(box.x+box.width<=1+1e-9&&box.y+box.height<=1+1e-9,`${id} ${JSON.stringify(box)}`);
  }
 }
 for(const id of ['bullets','steps'] as const)assert.ok(motionBox(newMotionBlock(id,0,'b')).y+motionBox(newMotionBlock(id,0,'b')).height<=.8+1e-9,`${id} leaves the bottom fifth`);
});

test('the new templates escape their text, and draw one item per point, step and side',()=>{
 const hostile:[MotionTemplateId,{text?:string;detail?:string}][]=[
  ['bullets',{text:'<b>One</b> | "Two" | it\'s & three',detail:'<i>Heading</i>'}],
  ['stat',{text:'<b>9</b>',detail:'a & b <img src=x>'}],
  ['compare',{text:'<i>Old</i> | New & "new"',detail:'<u>x</u> | y'}],
  ['steps',{text:'<img src=x> | Cut | <b>Post</b>',detail:'"Head"'}],
  ['quote',{text:'<script>x</script> "quoted"',detail:'it\'s & done'}],
  ['keyword',{text:'<b>Big</b> idea',detail:'<i>line</i>'}],
  ['flow',{text:'[bot] <b>You</b> | "Claude"',detail:'<i>asks</i>'}],
  ['tree',{text:'<b>Root</b>',detail:'[code] <i>A</i> | it\'s & B'}],
 ];
 for(const [id,flat] of hostile){
  const html=motionMarkup(newMotionBlock(id,0,'h',{props:motionPropsFrom(id,flat)}));
  assert.doesNotMatch(html,/<(b|i|u|img|script)[\s>]/,id);
  assert.match(html,/&lt;|&amp;|&quot;|&#39;/,id);
 }
 const count=(html:string,tag:string)=>html.split(tag).length-1;
 const bullets=(items:string)=>motionMarkup(newMotionBlock('bullets',0,'b',{props:motionPropsFrom('bullets',{text:items})}));
 assert.equal(count(bullets('a | b | c | d | e | f | g'),'<li'),5,'at most five points');
 assert.equal(count(bullets('one'),'<li'),1);
 assert.equal(count(bullets('  | a ||  b |'),'<li'),2,'empty points are dropped');
 const steps=(names:string)=>motionMarkup(newMotionBlock('steps',0,'s',{props:motionPropsFrom('steps',{text:names})}));
 const three=steps('Record | Cut | Post');
 assert.equal(count(three,'mb-sp-step"'),3);assert.equal(count(three,'mb-sp-link"'),2,'a connector between each pair');
 assert.match(three,/--mb-i:2;--mb-n:3/,'each step knows its place and the count');
 const five=steps('a|b|c|d|e|f|g');
 assert.equal(count(five,'mb-sp-step"'),5);assert.equal(count(five,'mb-sp-link"'),4);
 const compare=motionMarkup(newMotionBlock('compare',0,'c',{props:motionPropsFrom('compare',{text:'Old way | New way'})}));
 assert.equal(count(compare,'mb-cp-side'),2,'two sides');assert.equal(count(compare,'mb-cp-line'),0,'no lines when none are given');
 assert.match(compare,/mb-cp-left[^>]*><div class="mb-cp-title"><span class="mb-txt">Old way<\/span><\/div>/);
 assert.match(motionMarkup(newMotionBlock('stat',0,'s',{props:{value:'710K',label:''}})),/mb-st-xl/,'a short figure is the largest size');
 assert.match(motionMarkup(newMotionBlock('stat',0,'s',{props:{value:'12,345,678K',label:''}})),/mb-st-m/,'a long figure steps down');
});

test('a text graphic placed off the face draws in its side or band, and the export captures the whole frame for it', async () => {
 const {motionMarkup,motionBox,placeAwayFrom}=await import('../shared/motion/templates');
 const block={id:'b',template:'title-card' as const,style:'clean',start:0,duration:4,props:{title:'Look and feel'}};
 assert.equal(placeAwayFrom('title-card',{x:.55,y:.35}),'left','face right of centre: the text goes left');
 assert.equal(placeAwayFrom('keyword',{x:.3,y:.4}),'right');
 assert.equal(placeAwayFrom('steps',{x:.5,y:.3}),'bottom','a wide graphic goes to the band away from the face');
 assert.equal(placeAwayFrom('lower-third',{x:.5,y:.3}),undefined,'a lower third keeps its own spot');
 assert.equal(placeAwayFrom('title-card',undefined),undefined,'no face seen: it stays where the template puts it');
 assert.match(motionMarkup({...block,place:'left'}),/class="mb mb-title-card mb-s-clean mb-at-left"/);
 assert.doesNotMatch(motionMarkup({...block,place:'left',template:'lower-third',props:{name:'Dani'}}),/mb-at-left/,'a place a template cannot take is ignored');
 assert.deepEqual(motionBox({...block,place:'left'}),{x:0,y:0,width:1,height:1});
});

test('beats: each item comes in on the word that says it, inside the block and in order; without beats the template times them', async () => {
 const {beatsFrom,beatsOf,motionReadable}=await import('../shared/motion/templates');
 assert.equal(beatsFrom([10.4,11.9,13.25],10,5),'0.4|1.9|3.25');
 assert.equal(beatsFrom([9,12,11,40],10,5),'0|2|2|4.4','before the block is its start, out of order holds, past the end stops before the way out');
 assert.equal(beatsFrom(undefined,0,4),'');
 assert.deepEqual(beatsOf('0.4| x |1.9|-2|3.25'),[.4,1.9,3.25]);
 const steps=motionMarkup(newMotionBlock('steps',0,'s',{duration:6,props:motionPropsFrom('steps',{text:'Questions | Plan | Build',beats:'0.2|1.5|3'})}));
 assert.match(steps,/mb-sp-step" style="--mb-i:0;--mb-n:3;--mb-at:0\.20s"/);
 assert.match(steps,/mb-sp-link" style="--mb-i:0;--mb-n:3;--mb-at:1\.10s"/,'the connector draws just before the next step lights');
 assert.doesNotMatch(motionMarkup(newMotionBlock('steps',0,'s',{props:motionPropsFrom('steps',{text:'a | b'})})),/--mb-at/);
 assert.match(MOTION_CSS,/animation-delay:var\(--mb-at,calc\(\.45s \+ \.34s \* var\(--mb-i\)\)\)/,'a list point waits for its beat, else its own stagger');
 // The card and the timeline read words, not icon names or stars.
 assert.equal(motionReadable('[folder] A folder | [file-text] SKILL.md | [bot] Claude'),'A folder · SKILL.md · Claude');
 assert.equal(motionReadable('The economy | *is spiky.*'),'The economy · is spiky.');
 assert.equal(motionReadable('Attention | You get | A yes ; A maybe | It ends in | A payment'),'Attention · You get · A yes / A maybe · It ends in · A payment');
});

test('headline, versus and logos draw one line, row and tile per item, escape their text, and read the look', () => {
 const draw=(id:MotionTemplateId,style:string,flat:{text:string;detail?:string})=>motionMarkup(newMotionBlock(id,0,'x',{style,props:motionPropsFrom(id,flat)}));
 const count=(html:string,tag:string)=>html.split(tag).length-1;
 const lines=draw('headline','lines',{text:'The economy | *is spiky.* | Small businesses',detail:'Why it works'});
 assert.equal((lines.match(/class="mb-hl-line[" ]/g)??[]).length,3);assert.equal(count(lines,'mb-hl-em'),1,'the starred line lands in the sans');
 assert.match(lines,/mb-hl-kick">Why it works</);assert.doesNotMatch(lines,/\*/);
 assert.equal((draw('headline','reveal',{text:'Build. | Sell. | Stay.'}).match(/class="mb-hl-line[" ]/g)??[]).length,3);
 const vs=draw('versus','table',{text:'Marketing | Sales',detail:'Attention | You get | A yes ; A maybe | It ends in | A payment ; Content | Calls'});
 assert.equal(count(vs,'mb-vs-c mb-vs-l'),3);assert.equal(count(vs,'mb-vs-k'),3);assert.match(vs,/grid-row:1 \/ 5/,'the cards span the names and every row');
 assert.match(vs,/mb-vs-k" style="[^"]*"><\/div>/,'a row of two parts has an empty label');
 const logos=draw('logos','tiles',{text:'[claude] Claude Code | [n8n] n8n | GoHighLevel | <b>x</b>'});
 assert.equal(count(logos,'class="mb-lg-i"'),4);assert.match(logos,/mb-lg-abbr">GHL</,'a tool without an icon shows its letters');
 assert.doesNotMatch(logos,/<b>/);
 // A monochrome look (the highlight is the text colour) draws marks in the text colour, and text on a light plate reads in the panel colour.
 const look={name:'Editorial',display:'serif' as const,paper:'#f4f2ee',ink:'#1b1b1b',accent:'#f4f2ee',muted:'#8a8781',motion:'subtle' as const};
 const mono=motionMarkup({...newMotionBlock('steps',0,'s',{style:'pill'}),look});
 assert.match(mono,/class="mb mb-steps mb-s-pill mb-serif mb-mono mb-ring mb-motion-subtle"/);
 assert.match(mono,/--mb-on-accent:#1b1b1b/);
 assert.match(motionMarkup({...newMotionBlock('steps',0,'s'),look:{...look,accent:'#2563eb',paper:'#ffffff'}}),/--mb-on-accent:#ffffff/);
 assert.match(MOTION_CSS,/\.mb-mono \.mb-brand path,[^{]*\{fill:currentColor\}/);
 // A product whose mark the icon set lacks draws as a letter tile in its colour; an unknown name still drops to its words.
 const office=draw('logos','chips',{text:'[word] Word | [excel] Excel | [pdf] PDF | [nope] Other'});
 assert.equal(count(office,'mb-brand-letter'),3);assert.match(office,/>PDF<\/text>/);assert.match(office,/mb-lg-abbr">O</);
});
