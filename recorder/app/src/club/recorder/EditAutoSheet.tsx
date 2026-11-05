import {AI_CONNECT_HINT,useAiAvailable} from '../ai-status';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {AutomationJob,AutomationMutation,CutReview,QuickActionRequest} from '../../../shared/automation';
import {DEFAULT_PAUSE_LEVEL} from '../../../shared/companion';
import type {Project} from '../../../shared/types';
import {projectDuration} from '../../../shared/types';
import {api} from '../../api';
import {automationRunning} from '../../automation-state';
import {closeRange} from '../../timeline-edit';
import {Icon} from '../ui';
import type {IconName} from '../ui/icons';
import {BrSection,BrTabs} from '../edit-panels/br';
import {UNKNOWN_PLAN,clipsFingerprint,cutReview,fillerRanges,gapRanges,latestCutJob,latestStyleJob,PAUSE_LEVEL_NAMES,pauseRanges,planIsStale,rangesSeconds,type PauseLevel,type Range} from './edit-auto';
import {formatCutDuration} from './edit-steps';

/** What the stage shows while a choice is previewed: a cut comparison (CutPlayback), or the styled video at the playhead. */
export type EditPreview={key:string;label:string;summary:string;ranges?:Range[];review?:CutReview;after?:Project};
export type AutoOption='pauses'|'fillers'|'gaps'|'normalize'|'style';

/** The fingerprint of the timeline a plan was made on, read once per plan from the server's own copy (`before` of its review), kept for the session. */
const planBases=new Map<string,string>(),planBaseRequests=new Map<string,Promise<string|undefined>>();
export function planBase(job:AutomationJob|undefined):Promise<string|undefined>{
 if(!job||job.status!=='ready'||!job.proposal?.changes.length)return Promise.resolve(undefined);
 if(planBases.has(job.id))return Promise.resolve(planBases.get(job.id));
 let request=planBaseRequests.get(job.id);
 // A plan whose timeline cannot be read is UNKNOWN_PLAN: never applied here (and asked for again next time).
 if(!request){request=api<CutReview>(`/automation/${job.id}/review`,{changeIds:[job.proposal.changes[0].id]}).then(review=>{const base=clipsFingerprint(review.before.clips);planBases.set(job.id,base);return base;}).catch(()=>UNKNOWN_PLAN).finally(()=>planBaseRequests.delete(job.id));planBaseRequests.set(job.id,request);}
 return request;
}
export function usePlanBase(job:AutomationJob|undefined){
 const [base,setBase]=useState<string|undefined>(()=>job?planBases.get(job.id):undefined);
 useEffect(()=>{let live=true;setBase(job?planBases.get(job.id):undefined);void planBase(job).then(value=>{if(live)setBase(value);});return()=>{live=false;};},[job?.id,job?.status]);
 return base;
}
const seconds=(n:number)=>n<60?`${n.toFixed(1)}s`:formatCutDuration(n);

/**
 * The "Auto-edit and style" sheet over the right side of Edit. Hovering, focusing or arrow-keying a choice previews it on the stage;
 * clicking pins it (Before/After on the stage, Apply or Cancel here); Enter applies. Cuts are applied as one undoable edit of the timeline;
 * Style video applies the planned layout and slates through SceneForge's automation, like before.
 */
export function EditAutoSheet({project:p,jobs,merge,reload,flush,change,refresh,onPreview,onClose,onChanged,notify,initial,onMakeCaptions}:{project:Project;jobs:AutomationJob[];merge(job:AutomationJob):void;reload():Promise<void>;flush():Promise<Project|undefined>;change(fn:(p:Project)=>void):void;refresh():Promise<void>;onPreview(preview:EditPreview|null):void;onClose():void;onChanged?():void;notify(message:string):void;initial?:AutoOption;onMakeCaptions():Promise<void>}){
 const [level,setLevel]=useState<PauseLevel>(DEFAULT_PAUSE_LEVEL),[padding]=useState(.16),[hover,setHover]=useState<AutoOption|null>(null),[pin,setPin]=useState<AutoOption|null>(initial??null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const [styled,setStyled]=useState<{jobId:string;after:Project}|null>(null),[menuFor,setMenuFor]=useState<AutoOption|null>(null),list=useRef<HTMLDivElement>(null),retry=useRef<()=>void>(()=>{});
 const cutJob=latestCutJob(jobs),styleJob=latestStyleJob(jobs);
 // A plan made before the latest edit no longer matches the timeline: it is never applied, and the row offers to look again.
 const cutBase=usePlanBase(cutJob),stale=cutJob?.status==='ready'&&planIsStale(cutBase,p);
 const ranges=useMemo(()=>({pauses:pauseRanges(cutJob,level,padding,stale),fillers:fillerRanges(p,cutJob,stale),gaps:gapRanges(p)}),[cutJob,level,padding,p,stale]);
 const active=pin??hover;
 const describe=(option:AutoOption)=>{
  if(option==='pauses'){if(!cutJob)return 'Not checked yet';if(automationRunning(cutJob))return 'Looking for pauses…';if(stale)return 'The timeline changed since the last look.';if(cutJob.status!=='ready'&&cutJob.status!=='complete')return 'Not checked yet';const r=ranges.pauses;return r.length?`${r.length} ${r.length===1?'pause':'pauses'} · ${seconds(rangesSeconds(r))} shorter`:'No pauses found';}
  if(option==='fillers'){const r=ranges.fillers;return r.length?`${r.length} found: "um", "uh" and repeated phrases · ${seconds(rangesSeconds(r))}`:p.captions.length?'No filler words found':'Make captions first';}
  if(option==='gaps'){const r=ranges.gaps;return r.length?`${r.length} empty ${r.length===1?'stretch':'stretches'} between clips · ${seconds(rangesSeconds(r))}`:'No gaps between clips';}
  if(option==='normalize')return p.clips.length&&p.clips.every(c=>c.effects.normalize)?'On: loudness is evened out when you export':'Evens out loudness when you export';
  if(!styleJob)return 'Suggest a layout and scene titles to preview.';if(automationRunning(styleJob))return 'Suggesting a layout and titles…';return styleJob.status==='ready'?(styleJob.proposal?.summary??'Ready to preview'):'Suggest a new layout and titles';
 };
 // The preview follows the pinned or hovered choice.
 useEffect(()=>{
  if(!active){onPreview(null);return;}
  if(active==='pauses'||active==='fillers'||active==='gaps'){const r=ranges[active];if(!r.length){onPreview(null);return;}const label=active==='pauses'?`Remove pauses (${PAUSE_LEVEL_NAMES[level].toLowerCase()})`:active==='fillers'?'Remove filler words':'Close gaps between clips';
   onPreview({key:`${active}:${level}:${padding}:${r.length}`,label,summary:`${seconds(rangesSeconds(r))} shorter · ${projectDuration(p)>0?formatCutDuration(projectDuration(p)-rangesSeconds(r)):'0s'} long`,ranges:r,review:cutReview(p,r,active==='pauses'?'Pause':active==='fillers'?'Filler':'Gap')});return;}
  if(active==='style'&&styleJob?.status==='ready'){if(styled?.jobId===styleJob.id)onPreview({key:`style:${styleJob.id}`,label:'Suggest a layout and titles',summary:styleJob.proposal?.summary??'',after:styled.after});else onPreview(null);return;}
  onPreview(null);
 },[active,ranges,level,padding,styled,styleJob?.id,styleJob?.status]);
 useEffect(()=>()=>onPreview(null),[]);
 // The styled version comes from SceneForge's own plan (applyOperations on the server), fetched once per plan.
 useEffect(()=>{
  if(active!=='style'||styleJob?.status!=='ready'||styled?.jobId===styleJob.id)return;const controller=new AbortController();
  void api<CutReview>(`/automation/${styleJob.id}/review`,{changeIds:styleJob.proposal!.changes.map(c=>c.id)},'POST',controller.signal).then(review=>{if(!controller.signal.aborted)setStyled({jobId:styleJob.id,after:review.after});}).catch(()=>{});
  return()=>controller.abort();
 },[active,styleJob?.id,styleJob?.status]);

 const aiAvailable=useAiAvailable();
 const runningJobs=[cutJob,styleJob].filter((job):job is AutomationJob=>!!job&&automationRunning(job));
 const cancelJob=async(job:AutomationJob)=>{
  try{merge(await api<AutomationJob>(`/automation/${job.id}`,undefined,'DELETE'));}
  catch{setError("Couldn't cancel that action. Try again.");retry.current=()=>void cancelJob(job);}
 };
 const plan=async(kind:QuickActionRequest['kind'])=>{if(kind==='visualize'&&!aiAvailable)return;setBusy(kind);setError('');retry.current=()=>void plan(kind);try{const fresh=await flush();if(!fresh||fresh.id!==p.id)throw Error('changed');merge(await api<AutomationJob>(`/projects/${p.id}/quick-action`,{kind,semantic:false} satisfies QuickActionRequest));}catch{setError(kind==='visualize'?"Couldn't suggest a layout.":"Couldn't look for pauses.");}finally{setBusy('');}};
 const apply=async(option:AutoOption)=>{
  setError('');retry.current=()=>void apply(option);
  if(option==='pauses'||option==='fillers'||option==='gaps'){
   const r=ranges[option];if(!r.length)return;
   if(option!=='gaps'){const fresh=await flush().catch(()=>undefined),base=await planBase(cutJob);if(!fresh||base===undefined||planIsStale(base,fresh)){setError('The timeline changed since the last look. Find pauses.');return;}}
   change(d=>{for(const [a,b] of [...r].sort((x,y)=>y[0]-x[0]))closeRange(d,a,b);});
   notify(option==='pauses'?`Removed ${r.length} ${r.length===1?'pause':'pauses'} (${seconds(rangesSeconds(r))}).`:option==='fillers'?`Removed ${r.length} filler ${r.length===1?'word':'words'}.`:`Closed ${r.length} ${r.length===1?'gap':'gaps'}.`);
   // The plan was made for the timeline before this cut; retire it so the suggestion does not offer it again.
   if(option==='pauses'&&cutJob?.status==='ready')void api<AutomationJob>(`/automation/${cutJob.id}`,undefined,'DELETE').then(merge).catch(()=>{});
   setPin(null);setHover(null);onChanged?.();return;
  }
  if(option==='normalize'){change(d=>{for(const c of d.clips)c.effects.normalize=true;});notify('Loudness is evened out when you export.');setPin(null);return;}
  if(!styleJob||styleJob.status!=='ready'){await plan('visualize');return;}
  setBusy('style');
  try{const fresh=await flush();if(!fresh||fresh.id!==p.id)throw Error('changed');const result=await api<AutomationMutation>(`/automation/${styleJob.id}/apply`,{changeIds:styleJob.proposal!.changes.map(c=>c.id)});merge(result.job);await Promise.all([refresh().catch(()=>{}),reload().catch(()=>{})]);notify('Style applied.');setPin(null);onChanged?.();}
  catch{setError("Couldn't apply the style.");}finally{setBusy('');}
 };
 const keys=(event:React.KeyboardEvent,option:AutoOption)=>{
  if(event.target!==event.currentTarget)return;
  if(event.key==='Enter'){event.preventDefault();void apply(option);return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const rows=[...list.current!.querySelectorAll<HTMLElement>('[data-option]')],i=rows.indexOf(event.currentTarget as HTMLElement);rows[(i+(event.key==='ArrowDown'?1:rows.length-1))%rows.length]?.focus();}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(menuFor)setMenuFor(null);else if(pin)setPin(null);else onClose();}
 };
const makeCaptions=async()=>{
  setBusy('captions');setError('');retry.current=()=>void makeCaptions();
  try{await onMakeCaptions();}catch{setError("Couldn't make captions.");}finally{setBusy('');}
 };
 /** One item of a card's More options menu. */
type MenuItem={key:string;label:string;busy?:boolean;disabled?:boolean;title?:string;run():void};
/** The actions an automation card offers, under its More options button. Each one is the same action the card offered before. */
const menu=(option:AutoOption):MenuItem[]=>{
 if(option==='fillers'&&!p.captions.length){const transcribing=jobs.some(job=>job.kind==='transcription'&&automationRunning(job));return [{key:'captions',label:busy==='captions'||transcribing?'Making captions…':'Make captions',busy:busy==='captions'||transcribing,disabled:!!busy||transcribing,run:()=>void makeCaptions()}];}
 if(option==='normalize')return [{key:'even',label:'Even out',disabled:!p.clips.length||p.clips.every(c=>c.effects.normalize),run:()=>void apply('normalize')}];
 if(option==='style'){
  if(!styleJob||styleJob.status!=='ready')return [{key:'suggest',label:styleJob?'Suggest again':'Suggest',busy:busy==='visualize'||!!styleJob&&automationRunning(styleJob),title:!aiAvailable?AI_CONNECT_HINT:undefined,disabled:!aiAvailable||!!busy||!p.clips.length||!!styleJob&&automationRunning(styleJob),run:()=>void plan('visualize')}];
  return [];
 }
 if(option==='pauses'){
  const items:MenuItem[]=[];
  if(!cutJob||stale||cutJob.status!=='ready'&&!automationRunning(cutJob)||cutJob.status==='ready'&&!ranges.pauses.length)items.push({key:'find',label:'Find pauses',busy:busy==='auto-cut',disabled:!!busy||!p.clips.length,run:()=>void plan('auto-cut')});
  if(cutJob&&!stale&&cutJob.status==='ready'&&ranges.pauses.length)items.push({key:'review',label:'Review',disabled:!!busy,run:()=>setPin('pauses')});
  return items;
 }
 // Nothing found: no action at all, rather than one that cannot be pressed.
 if(!ranges[option].length)return [];
 return [{key:'review',label:'Review',disabled:!!busy,run:()=>setPin(option)}];
};
const TITLES:Record<AutoOption,string>={fillers:'Filler words',pauses:'Pauses',gaps:'Gaps between clips',normalize:'Even out volume',style:'Suggest layout and titles'};
const ICONS:Record<AutoOption,IconName>={fillers:'audio',pauses:'cut',gaps:'slide',normalize:'adjust',style:'image'};
/** One automation as a card row: a 32px icon well, the name and its status, and a More options button for its actions. */
const card=(option:AutoOption,extra?:ReactNode)=>{
 const items=menu(option),open=menuFor===option&&items.length>0,title=TITLES[option];
 return <div key={option} role="listitem" data-option={option} tabIndex={0} aria-label={title} className={`club-auto-card${pin===option?' is-pinned':''}`}
  onMouseEnter={()=>setHover(option)} onMouseLeave={()=>setHover(h=>h===option?null:h)}
  onFocus={event=>{if(event.target===event.currentTarget)setHover(option);}}
  onBlur={event=>{setHover(h=>h===option?null:h);if(!event.currentTarget.contains(event.relatedTarget as Node|null))setMenuFor(m=>m===option?null:m);}}
  onKeyDown={event=>keys(event,option)}>
  <div className="club-auto-line">
   <button type="button" className="club-auto-main" aria-pressed={pin===option} onClick={()=>setPin(option)}>
    <span className="club-auto-well"><Icon name={ICONS[option]} size={16}/></span>
    <span className="club-auto-text"><span className="club-auto-name">{title}</span><span className="club-auto-desc" title={describe(option)}>{describe(option)}</span></span>
   </button>
   {items.length>0&&<button type="button" className="club-auto-more" aria-label="More options" aria-haspopup="menu" aria-expanded={open} onClick={()=>setMenuFor(open?null:option)}><Icon name="more" size={16}/></button>}
  </div>
  {open&&<div className="club-auto-menu" role="menu" aria-label={`${title} actions`}>{items.map(item=><button key={item.key} type="button" role="menuitem" className="club-auto-menu-item" disabled={item.disabled} title={item.title}
   onClick={()=>{setMenuFor(null);item.run();}}>{item.busy&&<Icon name="loading" className="spin" size={14}/>}{item.label}</button>)}</div>}
  {extra&&pin===option&&<div className="club-auto-extra">{extra}</div>}
 </div>;
};
// How much a pinned pause cut removes: the level control of the pauses card.
const pauseLevels=(cutJob&&!stale&&cutJob.status==='ready'&&ranges.pauses.length)?<BrTabs<PauseLevel> value={level} label="How much to cut" full items={(Object.keys(PAUSE_LEVEL_NAMES) as PauseLevel[]).map(value=>({value,label:PAUSE_LEVEL_NAMES[value]}))} onChange={next=>{setLevel(next);setPin('pauses');}}/>:undefined;
const pinLabel=pin==='pauses'?`Remove pauses (${PAUSE_LEVEL_NAMES[level].toLowerCase()})`:pin==='fillers'?'Remove filler words':pin==='gaps'?'Close gaps between clips':pin==='normalize'?'Even out the volume':'Suggest a layout and titles';
 return <aside className="club-sheet club-auto-sheet br-panel" aria-label="Automations">
  <div className="club-auto-scroll">
   <BrSection title="Automations" actions={<button type="button" className="br-btn is-ghost is-sm" onClick={onClose}>Show transcript</button>}>
    {runningJobs.map(job=><div className="club-auto-progress" role="status" key={job.id}>
     <span>{job.kind==='auto-cut'?'Finding pauses':'Suggesting layout and titles'} · {Math.round(Math.max(0,Math.min(1,job.progress))*100)}%</span>
     <progress aria-label={job.kind==='auto-cut'?'Finding pauses':'Suggesting layout and titles'} value={job.progress} max={1}/>
     <button type="button" className="br-btn is-ghost is-sm" onClick={()=>void cancelJob(job)}>Cancel</button>
    </div>)}
    <div className="club-auto-list" ref={list} role="list">
     {card('fillers')}
     {card('pauses',pauseLevels)}
     {card('gaps')}
     {card('normalize')}
     {card('style')}
    </div>
    {error&&<p className="club-auto-error" role="alert">{error} <button type="button" className="br-link" onClick={()=>{setError('');retry.current();}}>Try again</button></p>}
   </BrSection>
  </div>
  {pin&&<footer className="club-auto-footer"><span>Previewing <b>{pinLabel}</b></span>
   <div className="club-auto-footer-actions"><button type="button" className="br-btn is-ghost is-sm" onClick={()=>setPin(null)}>Cancel</button><button type="button" className="br-btn is-sm" disabled={!!busy} onClick={()=>void apply(pin)}>{busy==='style'&&<Icon name="loading" className="spin" size={14}/>}Apply</button></div></footer>}
 </aside>;
}
