import {MIN_LAYOUT,followsLayout} from './layouts.js';
import {clipDuration,makeId,projectDuration,type Clip,type LayoutPreset,type LayoutSegment,type Project} from './types.js';

/**
 * Auto layout: picks a Layout stretch for each part of the video from what is said and what the screen does.
 * - `Screen only` while the speaker demos or the screen is the point ("let me show you", "click", a screen that keeps changing);
 * - `Full frame` (the speaker fills the frame) while they just talk: the opening, the close, the call to action, an opinion or a story,
 *   and stretches where the screen does not change;
 * - `Creator` (both) everywhere else.
 * Edges fall between sentences, no stretch is shorter than `AUTO_LAYOUT_MIN` so the picture does not flicker, and stretches set by hand
 * (and the look's stage) are left alone. Pure and deterministic: the Layout panel, the companion and the MCP tool all get the same plan.
 */

export type AutoPreset=Extract<LayoutPreset,'Screen only'|'Full frame'|'Creator'>;
/** How much one screen recording changes over its own time: `values[i]` is the share of the picture (0..1) that changed between the samples at source seconds (i-1)/rate and i/rate. */
export interface MediaActivity {rate:number;values:number[]}
/** Screen activity by media id. */
export type ScreenActivity=Record<string,MediaActivity>;
export interface AutoLayoutOptions {/** Measured screen change, when the app has it; without it the plan goes by the words, the cursor and the zooms. */screenActivity?:ScreenActivity|null}
export interface AutoLayoutStretch {start:number;end:number;preset:AutoPreset;/** Why, in a few words. */reason:string}

/** The shortest stretch Auto layout makes, in seconds. */
export const AUTO_LAYOUT_MIN=3.5;
/** The least share of the picture that must change between two samples for the screen to count as moving. */
export const SCREEN_ACTIVE=.01;
/** A sample counts as moving only when it changes this many times more than the recording's typical second (a playing video or a face in the picture moves all the time). */
const ACTIVE_OVER_TYPICAL=3;
/** A recording that moves in more than this share of its seconds even so says nothing about where the demo is: it is not read. */
const ALWAYS_MOVING=.7;
/** A longer pause between two words ends a sentence; a longer silence becomes its own stretch of the video. */
const SENTENCE_GAP=1.2,SILENT_GAP=2;
/** A sentence with no full stop is cut at the next caption once it runs this long. */
const SENTENCE_MAX=12;
/** Cuts land a little before the next sentence starts and a little after a sentence ends. */
const LEAD=.4,TAIL=.3;
/** The opening and the close are counted within this much of the video's start and end. */
const EDGE_SECONDS=15;
const EPS=1e-6;

interface Unit {start:number;end:number;text:string;silent:boolean}
type Cue=[RegExp,number,string];
const SCREEN_CUES:Cue[]=[
 [/\b(let me|let's|i'?ll|i will|i'?m going to|gonna|we'?re going to|we'?ll) (show|walk (you )?through|demo|look at|open|go (to|into|over))\b/,2,'a walkthrough'],
 [/\b(here you can see|as you can see|you can see (here|that|this|it)|take a look at (this|the|it)|look at (this|that|the))\b/,2,'pointing at the screen'],
 [/\b(on (the|my|your) screen|on screen)\b/,2,'pointing at the screen'],
 [/\b(click|clicks|clicking|clicked|double[- ]click|right[- ]click|scroll|scrolling|drag|dragging|paste|copy and paste|type in|typing|hover)\b/,1.5,'clicking through'],
 [/\bthis (button|page|tab|menu|field|panel|file|folder|window|setting|option|dropdown|link|box|code|line|function|prompt|screen)\b/,1,'pointing at the screen'],
 [/\b(go (to|into|over to)|open (up )?(the|this|a|it)|navigate|hit (enter|save|run)|press|toggle|select (the|this|it))\b/,1,'clicking through'],
 [/\b(right here|over here|up here|down here|in here)\b/,1,'pointing at the screen'],
 [/\b(terminal|dashboard|sidebar|browser tab|the editor|repo|spreadsheet)\b/,.5,'the screen'],
];
const CAMERA_CUES:Cue[]=[
 [/\b(subscribe|hit the like|like (and|this) video|comment (below|down)|let me know (in|what)|thanks for watching|see you (in the next|next time)|links? (is |are )?in the description)\b/,2,'the call to action'],
 [/\b(hey (guys|everyone|everybody|there)|hi (guys|everyone|everybody)|welcome (back|to)|in this video|today (i|we)('?m| am|'re| are|'ll| will)?\b)/,1.5,'the intro'],
 [/\b(so in summary|to sum up|in conclusion|the bottom line|the big takeaway)\b/,1.5,'the wrap-up'],
 [/\b(i think|i believe|i feel|in my opinion|honestly|personally|the truth is|my take|the reason (is|why)|here'?s (the thing|why))\b/,1,'an opinion'],
 [/\b(story|when i was|years ago|i remember|i used to|my (life|journey|experience))\b/,1,'a story'],
];

const spokenText=(text:string)=>/[\p{L}\p{N}]/u.test(text)&&!/^\s*[[(].*[\])]\s*$/.test(text);
const TERMINAL=/[.!?…]["')\]]*$/;

/** The sentences said, in time order: word timings broken at full stops, long pauses, and (for a run-on sentence) caption edges. */
export function sentences(p:Pick<Project,'captions'>):Array<{start:number;end:number;text:string}>{
 const words=p.captions.flatMap(c=>c.words?.length?c.words.map(w=>({...w,caption:c.id})):[{text:c.text,start:c.start,end:c.end,caption:c.id}])
  .filter(w=>Number.isFinite(w.start)&&w.end>w.start&&spokenText(w.text)).sort((a,b)=>a.start-b.start);
 const out:Array<{start:number;end:number;text:string}>=[];let current:{start:number;end:number;text:string;caption:string}|undefined;
 for(const w of words){
  if(current&&(w.start-current.end>SENTENCE_GAP||(current.end-current.start>=SENTENCE_MAX&&w.caption!==current.caption))){out.push(current);current=undefined;}
  if(!current)current={start:w.start,end:w.end,text:w.text.trim(),caption:w.caption};
  else{current.end=Math.max(current.end,w.end);current.text+=' '+w.text.trim();current.caption=w.caption;}
  if(TERMINAL.test(w.text.trim())){out.push(current);current=undefined;}
 }
 if(current)out.push(current);
 return out.map(({start,end,text})=>({start,end,text}));
}

const overlapsSpan=(c:Clip,a:number,b:number)=>c.start<b-EPS&&c.start+clipDuration(c)>a+EPS;
/** Camera and screen clips the layout places and that show their picture. */
const shown=(p:Project,track:'camera'|'screen',a:number,b:number)=>p.clips.filter(c=>c.track===track&&followsLayout(c)&&c.transform.opacity>0&&overlapsSpan(c,a,b));

/** What counts as the screen moving in one recording, relative to how much it usually moves; null when it moves nearly all the time. */
export function activeLevel(m:MediaActivity):number|null{
 const values=m.values.slice(1).filter(Number.isFinite).sort((a,b)=>a-b);
 if(values.length<3)return SCREEN_ACTIVE;
 const level=Math.max(SCREEN_ACTIVE,values[Math.floor(values.length/2)]*ACTIVE_OVER_TYPICAL);
 return values.filter(v=>v>=level).length/values.length>ALWAYS_MOVING?null:level;
}
/** How the screen behaves over [a, b], read through each screen clip's source time: samples measured, how many clearly moved, and how many were still. */
function screenChange(p:Project,activity:ScreenActivity|null|undefined,a:number,b:number,levels:Map<string,number|null>){
 let samples=0,active=0,still=0;
 if(!activity)return {samples,active,still};
 for(const c of shown(p,'screen',a,b)){
  const m=activity[c.mediaId];if(!m||!(m.rate>0))continue;
  if(!levels.has(c.mediaId))levels.set(c.mediaId,activeLevel(m));
  const level=levels.get(c.mediaId);if(level===null||level===undefined)continue;
  const from=Math.max(a,c.start),to=Math.min(b,c.start+clipDuration(c));
  const first=Math.ceil((c.sourceIn+(from-c.start)*c.speed)*m.rate),last=Math.floor((c.sourceIn+(to-c.start)*c.speed)*m.rate);
  // The first sample of a clip compares with the frame before the clip: not a change the viewer sees.
  for(let i=Math.max(1,first+(from===c.start?1:0));i<=last&&i<m.values.length;i++){samples++;if(m.values[i]>=level)active++;if(m.values[i]<SCREEN_ACTIVE)still++;}
 }
 return {samples,active,still};
}
/** Recorded cursor over [a, b]: clicks and how far it moved (in frame widths). */
function cursorMoves(p:Project,a:number,b:number){
 const points=p.cursor.points.filter(pt=>pt.time>=a&&pt.time<b&&pt.visible!==false);
 let travel=0,clicks=0;
 for(let i=1;i<points.length;i++){travel+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);if(points[i].pressed&&!points[i-1].pressed)clicks++;}
 return {travel,clicks};
}

/** Scores one unit: above 0 leans to the screen, below 0 to the speaker. */
function score(p:Project,u:Unit,units:Unit[],duration:number,options:AutoLayoutOptions,levels:Map<string,number|null>){
 const notes:Array<[number,string]>=[];
 const text=u.text.toLowerCase().replace(/[’‘]/g,"'");
 for(const [re,weight,why] of SCREEN_CUES)if(re.test(text))notes.push([weight,why]);
 for(const [re,weight,why] of CAMERA_CUES)if(re.test(text))notes.push([-weight,why]);
 const spoken=units.filter(x=>!x.silent),at=spoken.indexOf(u);
 // The opening and the close are you, even over a busy screen; a demo said in so many words can still take them.
 if(!u.silent&&(at===0||(at===1&&u.start<EDGE_SECONDS)))notes.push([-3,'the opening']);
 if(!u.silent&&(at===spoken.length-1||(at===spoken.length-2&&duration-u.end<EDGE_SECONDS)))notes.push([-3,'the close']);
 const change=screenChange(p,options.screenActivity,u.start,u.end,levels);
 if(change.samples>=2){
  const share=change.active/change.samples;
  if(share>=.5)notes.push([1.5,'the screen keeps changing']);
  else if(share>=.25)notes.push([1,'the screen changes']);
  else if(change.still===change.samples&&change.samples>=3)notes.push([-1.5,'the screen does not change']);
 }else if(u.silent&&u.end-u.start>=4)notes.push([1,'a silent stretch of the screen']);
 const cursor=cursorMoves(p,u.start,u.end);
 if(cursor.clicks)notes.push([1,'clicks on screen']);
 else if(cursor.travel/(u.end-u.start||1)>.05)notes.push([.5,'the cursor moves']);
 if(p.zooms.some(z=>z.target==='screen'&&Math.min(z.start+z.duration,u.end)-Math.max(z.start,u.start)>(u.end-u.start)/2))notes.push([1,'a zoom on the screen']);
 const total=notes.reduce((sum,[w])=>sum+w,0);
 const lead=[...notes].filter(([w])=>Math.sign(w)===Math.sign(total)).sort((x,y)=>Math.abs(y[0])-Math.abs(x[0]))[0];
 return {total,reason:lead?.[1]??'talking with the screen'};
}

/** Parts of [0, end) that Auto layout may lay out: outside stretches set by hand and outside the look's stage. */
function freeIntervals(p:Project,end:number):Array<[number,number]>{
 const taken:Array<[number,number]>=[...(p.layouts??[]).filter(l=>!l.auto).map(l=>[l.start,l.start+l.duration] as [number,number]),
  ...p.clips.filter(c=>c.stage).map(c=>[c.start,c.start+clipDuration(c)] as [number,number])].sort((a,b)=>a[0]-b[0]);
 const out:Array<[number,number]>=[];let at=0;
 for(const [a,b] of taken){if(a>at+EPS)out.push([at,Math.min(a,end)]);at=Math.max(at,b);if(at>=end)break;}
 if(at<end-EPS)out.push([at,end]);
 return out.filter(([a,b])=>b-a>=MIN_LAYOUT-EPS);
}

/** Why Auto layout cannot run on this project, or undefined when it can. */
export function autoLayoutProblem(p:Project):string|undefined{
 const duration=projectDuration(p);
 if(!shown(p,'camera',0,duration).length)return 'Auto layout needs a camera clip to place.';
 if(!shown(p,'screen',0,duration).length)return 'Auto layout needs a screen recording to place.';
 if(!sentences(p).length)return 'There is no transcript yet, so Auto layout cannot tell talking from demoing.';
 if(!freeIntervals(p,duration).length)return 'Every part of the video already has a layout you set by hand.';
 return undefined;
}

/** The stretches Auto layout would write, in time order, within the parts of the video that have no hand-set layout. */
export function planAutoLayout(p:Project,options:AutoLayoutOptions={}):AutoLayoutStretch[]{
 const duration=projectDuration(p);if(duration<=0)return [];
 // The video as a row of units: each sentence, and each long silence between them, from the start of the video to its end.
 const units:Unit[]=[];
 for(const s of sentences(p)){
  if(s.start>=duration)break;
  const last=units.at(-1),gapFrom=last?last.end:0;
  if(s.start-gapFrom>=SILENT_GAP+LEAD+TAIL)units.push({start:gapFrom+(last?TAIL:0),end:s.start-LEAD,text:'',silent:true});
  units.push({start:s.start,end:Math.min(s.end,duration),text:s.text,silent:false});
 }
 if(!units.length)return [];
 const tail=units.at(-1)!;if(duration-tail.end>=SILENT_GAP+TAIL)units.push({start:tail.end+TAIL,end:duration,text:'',silent:true});
 // Each unit's span runs to where the next one takes over: a little before its first word, or where a silence starts.
 const spans=units.map((u,i)=>{
  const next=units[i+1],prev=units[i-1];
  const cut=(x:Unit,y:Unit)=>y.silent?y.start:x.silent?x.end:Math.max((x.end+y.start)/2,y.start-LEAD);
  return {unit:u,start:prev?cut(prev,u):0,end:next?cut(u,next):duration};
 });
 const levels=new Map<string,number|null>();
 const labelled=spans.map(({unit,start,end})=>{
  const {total,reason}=score(p,unit,units,duration,options,levels);
  const camera=shown(p,'camera',start,end).length>0,screen=shown(p,'screen',start,end).length>0;
  let preset:AutoPreset=total>=1.5?'Screen only':total<=-1.5?'Full frame':'Creator';
  if(!camera)preset='Screen only';else if(!screen)preset='Full frame';
  return {start,end,preset,reason:!camera?'no camera here':!screen?'no screen here':preset==='Creator'?'talking with the screen':reason};
 });
 const out:AutoLayoutStretch[]=[];
 for(const [from,to] of freeIntervals(p,duration)){
  let pieces=labelled.flatMap(s=>{const start=Math.max(s.start,from),end=Math.min(s.end,to);return end-start>EPS?[{...s,start,end}]:[];});
  const merge=()=>{pieces=pieces.reduce<AutoLayoutStretch[]>((list,s)=>{const last=list.at(-1);if(last&&last.preset===s.preset&&Math.abs(last.end-s.start)<EPS){if(s.end-s.start>last.end-last.start)last.reason=s.reason;last.end=s.end;}else list.push({...s});return list;},[]);};
  merge();
  // Too short to hold: a stretch joins its neighbours when they agree, else the longer neighbour.
  for(;;){
   const short=pieces.map((s,i)=>({i,length:s.end-s.start})).filter(x=>x.length<AUTO_LAYOUT_MIN-EPS).sort((a,b)=>a.length-b.length)[0];
   if(!short||pieces.length<2)break;
   const i=short.i,left=pieces[i-1],right=pieces[i+1];
   const into=!left?right:!right?left:left.preset===right.preset?left:(left.end-left.start>=right.end-right.start?left:right);
   pieces[i]={...pieces[i],preset:into.preset,reason:into.reason};
   merge();
  }
  out.push(...pieces);
 }
 return out;
}

/** Counts a plan by preset, for the line said after it is applied. */
export function autoLayoutSummary(plan:readonly AutoLayoutStretch[]):string{
 if(!plan.length)return 'No layout to change';
 const count=(preset:AutoPreset)=>plan.filter(s=>s.preset===preset).length,plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
 const parts=[count('Screen only')&&plural(count('Screen only'),'screen-only stretch','screen-only stretches'),count('Full frame')&&plural(count('Full frame'),'stretch of you full screen','stretches of you full screen'),count('Creator')&&plural(count('Creator'),'stretch with both','stretches with both')].filter(Boolean);
 return `Auto layout: ${parts.join(', ')}`;
}

/**
 * Writes the plan to the Layout row: earlier Auto layout stretches go, stretches set by hand stay, and the new ones are marked `auto` so the
 * next run may replace them. Returns the plan written.
 */
export function applyAutoLayout(p:Project,options:AutoLayoutOptions={},newId:()=>string=makeId):AutoLayoutStretch[]{
 const plan=planAutoLayout(p,options),kept=(p.layouts??[]).filter(l=>!l.auto);
 const made:LayoutSegment[]=plan.map(s=>({id:newId(),start:s.start,duration:s.end-s.start,preset:s.preset,auto:true}));
 if(kept.length||made.length||p.layouts)p.layouts=[...kept,...made].sort((a,b)=>a.start-b.start);
 return plan;
}
