import type {EditAction,PauseLevel,TextPosition} from '../shared/companion';
import {clipDuration,makeId,projectDuration,type Clip,type Project} from '../shared/types';
import {minimumPiece} from '../shared/timeline-edits';
import {clipsFingerprint,fillerRanges,gapRanges,rangesSeconds} from './club/recorder/edit-auto';
import {plainView} from './project-draft';
import {addMotionBlock,closeRange,ensureLinks,linkedIds,mergeRanges,motionAt,newElement,nextMotionStart,rowItems,splitLinked,syncScenesToTakes,trimBounds,trimClips} from './timeline-edit';
import {MOTION_TEMPLATES,motionPropsFrom,newMotionBlock} from '../shared/motion/templates';

/**
 * The companion's Edit actions as pure functions over a project (or a draft of one). Every change goes through the editor's own timeline
 * rules (`timeline-edit.ts`, `shared/timeline-edits.ts`), never by writing clips directly, so link groups, scene ranges and no overlap on a row
 * hold; afterwards the take links are written and the scenes follow their takes. The server applies them to the saved project; the editor
 * uses the same functions to preview a card.
 */

export type Range=[number,number];
/** The shortest pause between words each level cuts, in seconds. */
export const PAUSE_SECONDS:Record<PauseLevel,number>={gentle:2,balanced:1,tight:.5};
/** Breath kept on each side of a cut pause, and the shortest cut worth making. */
export const PAUSE_KEEP=.15;
const MIN_CUT=.25;
/** A longer stretch between two words is not a pause (a silent demo, a take without a transcript): it is never cut. */
export const PAUSE_MAX=8;
/** One card never deletes more than this share of the video; a quarter or more is said on the card. */
export const DELETE_MAX_SHARE=.5,DELETE_WARN_SHARE=.25;
/**
 * Auto-edit's audio plan: the silences it heard, for the timeline whose clips have this fingerprint (`clipsFingerprint`). When the clips
 * still match, a pause is cut only where the audio is silent too.
 */
export interface SilencePlan {fingerprint:string;ranges:Range[]}
export interface EditOptions {silences?:SilencePlan|null}
/** Rows that carry the recorded speech. */
const SPEECH:ReadonlySet<Clip['track']>=new Set(['screen','camera','audio']);
const EPS=1e-6;
const end=(c:Clip)=>c.start+clipDuration(c);
const clock=(t:number)=>{const s=Math.max(0,t);return `${Math.floor(s/60)}:${(s%60).toFixed(1).padStart(4,'0')}`;};
const secs=(n:number)=>n>=60?`${Math.floor(n/60)} min ${Math.round(n%60)} s`:`${n<10?Math.round(n*10)/10:Math.round(n)} s`;
const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;

/** Every spoken word with a time, in order; a caption without word timings counts as one word. */
function spoken(p:Project){
 return p.captions.flatMap(c=>c.words?.length?c.words:[{text:c.text,start:c.start,end:c.end}]).filter(w=>w.end>w.start).sort((a,b)=>a.start-b.start);
}
export const hasTranscript=(p:Project)=>spoken(p).length>0;

/** The speech clips that hold a whole word (start to end). A word no clip holds was left behind by a move: its time is not speech any more. */
const holding=(p:Project,a:number,b:number)=>p.clips.filter(c=>SPEECH.has(c.track)&&!c.muted&&c.start<=a+1e-3&&end(c)>=b-1e-3);
/** True when one recording runs on from the word before to the word after: the same clip, or pieces of one media file cut at the same source point. */
function continuous(p:Project,before:{start:number;end:number},after:{start:number;end:number}){
 const left=holding(p,before.start,before.end),right=holding(p,after.start,after.end);
 return left.some(c=>right.includes(c))||left.some(c=>right.some(d=>d.mediaId===c.mediaId&&Math.abs(end(c)-d.start)<1e-3&&Math.abs(c.sourceOut-d.sourceIn)<1e-3));
}
/** The ranges that are inside the plan's silences, pieces shorter than a cut is worth left out. Without a plan that matches these clips, the ranges as they are. */
function withinSilences(p:Project,ranges:Range[],silences?:SilencePlan|null):Range[]{
 if(!silences||silences.fingerprint!==clipsFingerprint(p.clips))return ranges;
 const quiet=mergeRanges(silences.ranges);
 return ranges.flatMap(([a,b])=>quiet.map(([x,y])=>[Math.max(a,x),Math.min(b,y)] as Range).filter(([x,y])=>y-x>=MIN_CUT));
}
/**
 * Pauses between spoken words at least as long as the level asks, each shortened to keep a breath on both sides. A gap counts only when
 * one recording holds both words around it (so a take with no transcript, or captions left behind by a move, is never taken for a pause),
 * and only up to `PAUSE_MAX`; with Auto-edit's audio plan for this timeline, only where the audio is silent too.
 */
export function wordPauseRanges(p:Project,level:PauseLevel,options:EditOptions={}):Range[]{
 const words=spoken(p),out:Range[]=[];let last:{start:number;end:number}|undefined;
 for(const w of words){
  if(last&&w.start-last.end>=PAUSE_SECONDS[level]&&w.start-last.end<=PAUSE_MAX&&continuous(p,last,w)){const a=last.end+PAUSE_KEEP,b=w.start-PAUSE_KEEP;if(b-a>=MIN_CUT)out.push([a,b]);}
  if(!last||w.end>last.end)last=w;
 }
 return mergeRanges(withinSilences(p,out,options.silences));
}
/** Filler words that a speech clip still holds (a word left behind by a move is not cut). */
const heldFillers=(p:Project):Range[]=>fillerRanges(p).filter(([a,b])=>holding(p,a,b).length>0);

/** The time an action takes out of every row (cuts), or undefined for actions that cut nothing. */
export function editRanges(p:Project,action:EditAction,options:EditOptions={}):Range[]|undefined{
 switch(action.type){
  case 'cut_pauses':return wordPauseRanges(p,action.level,options);
  case 'remove_fillers':return heldFillers(p);
  case 'close_gaps':return gapRanges(p);
  case 'delete_range':return [[Math.max(0,action.start),Math.min(projectDuration(p),action.end)]];
  default:return undefined;
 }
}

const clipAt=(p:Project,time:number,clipId?:string)=>{const piece=minimumPiece(p)-1e-9;return p.clips.filter(c=>(!clipId||c.id===clipId)&&time-c.start>=piece&&end(c)-time>=piece);};
const overlapping=(p:Project,row:'captions'|'elements'|'zooms',start:number,stop:number)=>rowItems(p).filter(i=>i.row===row&&i.start<stop-1e-3&&i.start+i.duration>start+1e-3);

/**
 * Why this action cannot be applied to this timeline, in one sentence, or undefined when it can. The server checks every action with it
 * before offering a card and again before applying it.
 */
export function editActionProblem(p:Project,action:EditAction,options:EditOptions={}):string|undefined{
 const length=projectDuration(p),inRange=(t:number)=>Number.isFinite(t)&&t>=0&&t<=length+.05;
 const clip=(id:string)=>p.clips.find(c=>c.id===id);
 if(!p.clips.length&&action.type!=='set_caption_style')return 'There is nothing on the timeline yet.';
 switch(action.type){
  case 'cut_pauses':case 'remove_fillers':{
   if(!hasTranscript(p))return 'There is no transcript yet, so the pauses between words are not known.';
   if(!editRanges(p,action,options)!.length)return action.type==='cut_pauses'?'There are no pauses that long between your words.':'There are no filler words in the transcript.';
   return;
  }
  case 'close_gaps':return gapRanges(p).length?undefined:'There are no gaps between clips.';
  case 'delete_range':{
   if(!inRange(action.start)||!inRange(action.end))return 'That time is outside the video.';
   if(action.end-action.start<minimumPiece(p))return 'That stretch is too short to delete.';
   if(action.start<=EPS&&action.end>=length-EPS)return 'That would delete the whole video.';
   if(Math.min(action.end,length)-action.start>DELETE_MAX_SHARE*length)return 'That would delete more than half the video: select it on the timeline and delete it there.';
   return;
  }
  case 'split_at':{
   if(!inRange(action.time))return 'That time is outside the video.';
   if(action.clipId!==undefined&&!clip(action.clipId))return 'That clip is no longer on the timeline.';
   return clipAt(p,action.time,action.clipId).length?undefined:'No clip runs across that time.';
  }
  case 'trim_clip':{
   const c=clip(action.clipId);if(!c)return 'That clip is no longer on the timeline.';
   if(!inRange(action.time))return 'That time is outside the video.';
   return clipAt(p,action.time,c.id).length?undefined:'That time is not inside the clip.';
  }
  case 'set_caption_style':{
   const {type:_type,...fields}=action;if(!Object.keys(fields).length)return 'That changes nothing.';
   const style=p.captionStyle;if(Object.entries(fields).every(([key,value])=>style[key as keyof typeof style]===value))return 'The captions already look like that.';
   return;
  }
  case 'add_caption':{
   if(!inRange(action.start)||!inRange(action.end)||action.end<=action.start)return 'That time is outside the video.';
   return overlapping(p,'captions',action.start,action.end).length?'A caption is already there at that time.':undefined;
  }
  case 'add_text':{
   if(!inRange(action.start)||!(action.duration>0))return 'That time is outside the video.';
   // A text that would run into the next item stops there; one that starts on another is refused.
   return overlapping(p,'elements',action.start,action.start+.1).length?'Something is already on the text row at that time.':undefined;
  }
  case 'set_zoom':{
   if(!inRange(action.start)||!(action.duration>0)||action.start+action.duration>length+.05)return 'That time is outside the video.';
   return;
  }
  case 'add_motion_block':{
   const template=MOTION_TEMPLATES[action.template];if(!template)return 'There is no such motion template.';
   if(action.style!==undefined&&!template.styles.some(s=>s.id===action.style))return `A ${template.label.toLowerCase()} has no style called "${action.style}".`;
   if(!inRange(action.start))return 'That time is outside the video.';
   if(motionAt(p,action.start))return 'Another motion block is already there at that time.';
   const room=Math.min(length,nextMotionStart(p,action.start))-action.start;
   if(room<template.minDuration-1e-9)return room<length-action.start?`There is no room for a ${template.label.toLowerCase()} there: the next motion block starts too soon.`:'That is too close to the end of the video.';
   return;
  }
  case 'normalize_audio':return p.clips.some(c=>!c.effects.normalize)?undefined:'Loudness is already evened out.';
 }
}
/** The block an `add_motion_block` card adds: its template's defaults, the card's text, and its length cut to the room on the Motion row and in the video. */
export function motionBlockFor(p:Project,action:Extract<EditAction,{type:'add_motion_block'}>,id:string){
 const template=MOTION_TEMPLATES[action.template],room=Math.min(projectDuration(p),nextMotionStart(p,action.start))-action.start;
 return newMotionBlock(action.template,action.start,id,{style:action.style,duration:Math.min(action.duration??template.defaultDuration,room),props:motionPropsFrom(action.template,action)});
}

const POSITION_Y:Record<TextPosition,number>={top:.08,center:.42,bottom:.72};

/**
 * Applies one action to a project (or a draft), through the timeline rules, then writes the take links and moves the scenes with their takes.
 * Returns one line saying what changed. Throws the problem sentence when the action cannot be applied to this timeline.
 */
export function applyEditAction(p:Project,action:EditAction,options:EditOptions={},newId:()=>string=makeId):string{
 const problem=editActionProblem(plainView(p),action,options);if(problem)throw new Error(problem);
 ensureLinks(p,newId);
 let result:string;
 switch(action.type){
  case 'cut_pauses':case 'remove_fillers':case 'close_gaps':case 'delete_range':{
   const ranges=mergeRanges(editRanges(plainView(p),action,options)!);
   // Latest first, so the earlier ranges keep their times.
   for(const [a,b] of [...ranges].sort((x,y)=>y[0]-x[0]))closeRange(p,a,b);
   const total=secs(rangesSeconds(ranges));
   result=action.type==='cut_pauses'?`Cut ${plural(ranges.length,'pause')}, ${total} shorter`:action.type==='remove_fillers'?`Removed ${plural(ranges.length,'filler word')}, ${total} shorter`
    :action.type==='close_gaps'?`Closed ${plural(ranges.length,'gap')}, ${total} shorter`:`Removed ${total} from every row at ${clock(action.start)}`;
   break;
  }
  case 'split_at':{
   const n=splitLinked(p,action.time,new Set(),action.clipId,newId);
   result=`Split ${plural(n,'clip')} at ${clock(action.time)}`;
   break;
  }
  case 'trim_clip':{
   const c=plainView(p).clips.find(x=>x.id===action.clipId)!,ids=linkedIds(plainView(p).clips,[c.id]),side=action.side==='start'?'left':'right';
   const want=side==='left'?action.time-c.start:action.time-end(c),bounds=trimBounds(plainView(p),ids,side,true),delta=Math.max(bounds.min,Math.min(bounds.max,want));
   trimClips(p,ids,side,delta,true);
   result=`Trimmed ${secs(Math.abs(delta))} off the ${action.side} of the clip`;
   break;
  }
  case 'set_caption_style':{
   const {type:_type,...fields}=action;p.captionStyle={...p.captionStyle,...fields};
   result='Caption style set';
   break;
  }
  case 'add_caption':{
   p.captions.push({id:newId(),start:action.start,end:action.end,text:action.text});p.captions.sort((a,b)=>a.start-b.start);
   result=`Caption added at ${clock(action.start)}`;
   break;
  }
  case 'add_text':{
   // A text that runs into the next item on its row stops there, so the row never overlaps.
   const next=rowItems(plainView(p)).filter(i=>i.row==='elements'&&i.start>=action.start+1e-3).reduce((at,i)=>Math.min(at,i.start),Infinity);
   const duration=Math.min(action.duration,next-action.start,Math.max(.1,projectDuration(plainView(p))-action.start));
   p.elements.push(newElement('text',action.start,newId(),{duration,text:action.text,y:POSITION_Y[action.position??'bottom']}));
   result=`Text added at ${clock(action.start)}`;
   break;
  }
  case 'set_zoom':{
   // A zoom replaces the zooms it would overlap: one zoom at a time on the row.
   const gone=new Set(overlapping(plainView(p),'zooms',action.start,action.start+action.duration).map(i=>i.id));
   p.zooms=p.zooms.filter(z=>!gone.has(z.id));
   p.zooms.push({id:newId(),start:action.start,duration:action.duration,scale:action.scale,x:action.x??.5,y:action.y??.5,target:action.target??'screen',easing:'smooth'});p.zooms.sort((a,b)=>a.start-b.start);
   result=`Zoom ${action.scale}× at ${clock(action.start)}${gone.size?`, replacing ${plural(gone.size,'zoom')}`:''}`;
   break;
  }
  case 'add_motion_block':{
   const r=addMotionBlock(p,motionBlockFor(plainView(p),action,newId()));if('problem' in r)throw new Error(r.problem);
   result=`${MOTION_TEMPLATES[action.template].label} added at ${clock(action.start)}`;
   break;
  }
  case 'normalize_audio':{
   let n=0;for(const c of p.clips)if(!c.effects.normalize){c.effects={...c.effects,normalize:true};n++;}
   result=`Loudness evened out on ${plural(n,'clip')} when you export`;
   break;
  }
 }
 ensureLinks(p,newId);
 syncScenesToTakes(p);
 return result;
}

const replacedZooms=(p:Project,action:Extract<EditAction,{type:'set_zoom'}>)=>p.zooms.filter(z=>z.start<action.start+action.duration-1e-3&&z.start+z.duration>action.start+1e-3);
/** One line saying what a card will do, for the card itself. With the project it also names the zoom a new zoom replaces. */
export function describeEditAction(action:EditAction,p?:Project):string{
 switch(action.type){
  case 'cut_pauses':return `Cut pauses between your words longer than ${PAUSE_SECONDS[action.level]} s, keeping a breath on each side.`;
  case 'remove_fillers':return 'Cut "um", "uh" and similar words, using the transcript.';
  case 'close_gaps':return 'Close the empty stretches between clips.';
  case 'split_at':return `Split ${action.clipId?'the clip':'every clip'} at ${clock(action.time)}.`;
  case 'trim_clip':return `Trim the ${action.side} of the clip to ${clock(action.time)}; the rest moves up.`;
  case 'delete_range':return `Delete ${clock(action.start)} to ${clock(action.end)} (${secs(action.end-action.start)}) from every row; the rest moves up.`;
  case 'set_caption_style':{
   const parts=[action.enabled===false?'captions off':action.enabled?'captions on':'',action.fontSize?`size ${action.fontSize}`:'',action.position?`at the ${action.position}`:'',action.color?`text ${action.color}`:'',action.background?`background ${action.background}`:'',action.maxWords?`${action.maxWords} words a line`:''].filter(Boolean);
   return `Captions: ${parts.join(', ')}.`;
  }
  case 'add_caption':return `“${action.text}” from ${clock(action.start)} to ${clock(action.end)}.`;
  case 'add_text':return `“${action.text}” at ${clock(action.start)} for ${secs(action.duration)}${action.position?`, ${action.position}`:''}.`;
  case 'set_zoom':{
   const gone=p?replacedZooms(p,action):[];
   return `Zoom ${action.scale}× on the ${action.target??'screen'} at ${clock(action.start)} for ${secs(action.duration)}${gone.length?`, replacing ${gone.map(z=>`the ${z.scale}× zoom at ${clock(z.start)}`).join(' and ')}`:''}.`;
  }
  case 'add_motion_block':{
   const template=MOTION_TEMPLATES[action.template],style=template?.styles.find(s=>s.id===action.style)??template?.styles[0];
   return `${template?.label??'Motion graphic'} (${style?.label.toLowerCase()??'default'}) “${action.text}”${action.detail?` · ${action.detail}`:''} at ${clock(action.start)} for ${secs(action.duration??template?.defaultDuration??3)}.`;
  }
  case 'normalize_audio':return 'Even out the loudness of every clip when you export.';
 }
}

/**
 * What a card would do to the timeline now, in one line for the card: how many cuts and how much shorter, the share of the video a
 * deleted stretch is (`warn` from a quarter on), the zoom a new zoom replaces, or why it cannot be applied (`warn`).
 */
export function editEstimate(p:Project,action:EditAction,options:EditOptions={}):{text:string;warn?:boolean}|undefined{
 const problem=editActionProblem(p,action,options);if(problem)return {text:problem,warn:true};
 const ranges=editRanges(p,action,options);
 if(ranges){
  const merged=mergeRanges(ranges),total=rangesSeconds(merged),share=total/Math.max(1e-9,projectDuration(p));
  const text=`${plural(merged.length,'cut')} · ${secs(total)} shorter${action.type==='delete_range'?` (${Math.round(share*100)}% of the video)`:''}`;
  return share>=DELETE_WARN_SHARE?{text:`${text}. That is ${Math.round(share*100)}% of the video.`,warn:true}:{text};
 }
 if(action.type==='set_zoom'){const gone=replacedZooms(p,action);if(gone.length)return {text:`Replaces ${gone.map(z=>`the ${z.scale}× zoom at ${clock(z.start)}`).join(' and ')}.`};}
 if(action.type==='add_motion_block'){const block=motionBlockFor(p,action,'estimate'),asked=action.duration??MOTION_TEMPLATES[action.template].defaultDuration;if(block.duration<asked-1e-6)return {text:`Shortened to ${secs(block.duration)}: it stops at ${clock(block.start+block.duration)}, where ${nextMotionStart(p,action.start)<=block.start+block.duration+1e-6?'the next motion block starts':'the video ends'}.`};}
 return undefined;
}
