import type {AutomationJob,CutReview} from '../../../shared/automation';
import type {Clip,Project} from '../../../shared/types';
import {PAUSE_SECONDS,PLAN_PAUSE_MARGIN,type PauseLevel} from '../../../shared/companion';
import {plainClone} from '../../project-draft';
import {closeRange,mergeRanges,timelineGaps} from '../../timeline-edit';

/** What the Auto-edit and style sheet can do to the timeline: a set of time ranges to remove, previewed before it is applied. */
export type Range=[number,number];
export type {PauseLevel};
/** The shortest quiet gap each level removes, in seconds: the shared table (the Edit card and the companion use it too). */
export const PAUSE_LEVELS=PAUSE_SECONDS;
export const PAUSE_LEVEL_NAMES:Record<PauseLevel,string>={gentle:'Gentle',balanced:'Balanced',tight:'Tight'};
/** The plan keeps 160 ms of breath on each side of a quiet gap; `padding` replaces that. */
const PLAN_MARGIN=PLAN_PAUSE_MARGIN,MIN_CUT=.25;

/** The newest whole-video Remove pauses plan. */
export const latestCutJob=(jobs:readonly AutomationJob[])=>[...jobs].filter(j=>j.kind==='auto-cut'&&!j.sceneId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
export const latestStyleJob=(jobs:readonly AutomationJob[])=>[...jobs].filter(j=>j.kind==='visualize'&&!j.sceneId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];

/** The clip timings a plan's cuts are measured against: which clips, where, which source range, speed, row. Captions, effects and saves do not change it. */
export function clipsFingerprint(clips:readonly Clip[]){
 const r=(n:number)=>Math.round(n*1e4)/1e4;
 return JSON.stringify([...clips].sort((a,b)=>a.id.localeCompare(b.id)).map(c=>[c.id,c.track,c.layerId??'',r(c.start),r(c.sourceIn),r(c.sourceOut),r(c.speed),c.muted]));
}
/**
 * A plan is out of date only when the clips moved since it was made: `base` is the fingerprint of the timeline the plan was made on
 * (from the server's own copy of it), compared with the timeline now. The server's side effects (a transcription saving captions,
 * Normalize, autosave stamps) never make it stale. While `base` is not known yet the plan is not called stale.
 */
export function planIsStale(base:string|undefined,p:Pick<Project,'clips'>){return base!==undefined&&base!==clipsFingerprint(p.clips);}
/** The base of a plan whose timeline could not be read: it counts as out of date, so it is never applied without asking again. */
export const UNKNOWN_PLAN='unknown';
/** Quiet gaps from the plan at least as long as the level asks, each shortened to keep `padding` seconds on both sides. */
export function pauseRanges(job:AutomationJob|undefined,level:PauseLevel,padding:number,stale=false):Range[]{
 if(stale||job?.status!=='ready'||!job.proposal)return [];
 const pad=Math.max(0,Math.min(.5,padding));
 return mergeRanges(job.proposal.changes.filter(c=>c.category==='silence'&&c.start!==undefined&&c.end!==undefined).flatMap(c=>{
  const a=c.start!-PLAN_MARGIN,b=c.end!+PLAN_MARGIN;if(b-a<PAUSE_LEVELS[level])return [];const start=a+pad,end=b-pad;return end-start>=MIN_CUT?[[start,end] as Range]:[];
 }));
}
/** The silences a ready plan heard (each plan change widened back by its margin), for the companion's cut of pauses. */
export function planSilenceRanges(job:AutomationJob|undefined):Range[]{
 if(job?.status!=='ready'||!job.proposal)return [];
 return mergeRanges(job.proposal.changes.filter(c=>c.category==='silence'&&c.start!==undefined&&c.end!==undefined).map(c=>[c.start!-PLAN_MARGIN,c.end!+PLAN_MARGIN] as Range));
}
const FILLER=/^(um+|uh+|erm+|hmm+|ah+|uhm+)[,.!?]?$/i;
/** Hesitation words ("um", "uh") from the word timings, and repeated phrases the plan found. */
export function fillerRanges(p:Project,job?:AutomationJob,stale=false):Range[]{
 const words=p.captions.flatMap(c=>c.words??[]).filter(w=>FILLER.test(w.text.trim())&&w.end>w.start).map(w=>[w.start,w.end] as Range);
 const repeats=!stale&&job?.status==='ready'?(job.proposal?.changes??[]).filter(c=>c.category==='repeat'&&c.start!==undefined&&c.end!==undefined).map(c=>[c.start!,c.end!] as Range):[];
 return mergeRanges([...words,...repeats]);
}
/** Empty stretches between clips. */
export const gapRanges=(p:Project):Range[]=>timelineGaps(p.clips).filter(([a,b])=>b-a>=1/Math.max(1,p.canvas.fps));
export const rangesSeconds=(ranges:readonly Range[])=>ranges.reduce((n,[a,b])=>n+b-a,0);

/** The timeline with the ranges removed (latest first, so earlier ranges keep their times). */
export function withoutRanges(p:Project,ranges:readonly Range[]):Project{
 const after=plainClone(p);for(const [a,b] of mergeRanges(ranges).sort((x,y)=>y[0]-x[0]))closeRange(after,a,b);return after;
}
/** A before/after comparison for CutPlayback: one join per removed range. */
export function cutReview(p:Project,ranges:readonly Range[],label:string):CutReview{
 const merged=mergeRanges(ranges);let removed=0;
 const joins=merged.map(([a,b],i)=>{const join={id:`cut-${i}`,label:`${label} ${i+1} of ${merged.length} · ${(b-a).toFixed(1)}s at ${Math.floor(a/60)}:${String(Math.floor(a%60)).padStart(2,'0')}`,originalStart:a,originalEnd:b,editedTime:a-removed};removed+=b-a;return join;});
 return {before:p,after:withoutRanges(p,merged),joins};
}
