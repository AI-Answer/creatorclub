import type {AutomationJob,AutomationProposal} from '../../../shared/automation';
import type {ExportRecord} from '../../../shared/export-history';
import {automationRunning} from '../../automation-state';
import {DEFAULT_PAUSE_LEVEL,PAUSE_SECONDS,PLAN_PAUSE_MARGIN} from '../../../shared/companion';

/** "3m 12s", "45s", "2m": how much the suggested cuts take out. */
export function formatCutDuration(seconds:number){
 const total=Math.max(0,Math.round(seconds)),m=Math.floor(total/60),s=total%60;
 return m?(s?`${m}m ${s}s`:`${m}m`):`${s}s`;
}

/** Seconds removed when every proposed cut is applied: overlapping cuts count once. */
export function removedSeconds(proposal:Pick<AutomationProposal,'changes'>){
 const ranges=proposal.changes.filter(c=>c.start!==undefined&&c.end!==undefined&&c.end>c.start).map(c=>[c.start!,c.end!] as [number,number]).sort((a,b)=>a[0]-b[0]);
 let total=0,open:[number,number]|null=null;
 for(const [a,b] of ranges){if(open&&a<=open[1])open[1]=Math.max(open[1],b);else{if(open)total+=open[1]-open[0];open=[a,b];}}
 return open?total+open[1]-open[0]:total;
}

/** The project-wide Remove pauses plan, newest first: what the Edit step's suggestion card shows. */
export type CutSuggestion=
 |{state:'none'}
 |{state:'running';job:AutomationJob}
 |{state:'ready';job:AutomationJob;seconds:number;label:string;/** The plan's changes the card applies: pauses at the default level (the sheet's and the companion's threshold) and every repeat. */changeIds:string[]}
 |{state:'done';job:AutomationJob};

/** Under a second of cuts is not worth asking about. */
const MIN_SECONDS=1;

export function cutSuggestion(jobs:readonly AutomationJob[]):CutSuggestion{
 const job=[...jobs].filter(j=>j.kind==='auto-cut'&&!j.sceneId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
 if(!job)return {state:'none'};
 if(automationRunning(job))return {state:'running',job};
 if(job.status==='ready'&&job.proposal){
  const kept=job.proposal.changes.filter(c=>c.category!=='silence'||c.start!==undefined&&c.end!==undefined&&c.end-c.start+2*PLAN_PAUSE_MARGIN>=PAUSE_SECONDS[DEFAULT_PAUSE_LEVEL]-1e-9),seconds=removedSeconds({changes:kept});
  if(seconds>=MIN_SECONDS)return {state:'ready',job,seconds,label:`Remove ${formatCutDuration(seconds)} of pauses and repeats?`,changeIds:kept.map(c=>c.id)};
 }
 return {state:'done',job};
}

/** The newest finished MP4 export whose file is still on disk. */
export function latestVideoExport(records:readonly ExportRecord[]):ExportRecord|undefined{
 return records.filter(r=>r.status==='complete'&&r.options.format==='mp4'&&r.output.status==='available'&&r.outputPath)
  .sort((a,b)=>(b.completedAt??b.startedAt).localeCompare(a.completedAt??a.startedAt))[0];
}

/** The exported file's name, without the folder. */
export const exportFileName=(record:Pick<ExportRecord,'outputPath'>)=>record.outputPath?.split(/[\\/]/).pop()??'';
