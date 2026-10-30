import {useEffect,useMemo,useRef,useState} from 'react';
import type {AutomationJob,AutomationMutation,CutReview,QuickActionRequest} from '../../../shared/automation';
import {DEFAULT_PAUSE_LEVEL} from '../../../shared/companion';
import type {Project} from '../../../shared/types';
import {projectDuration} from '../../../shared/types';
import {api} from '../../api';
import {automationRunning} from '../../automation-state';
import {closeRange} from '../../timeline-edit';
import {Button,Icon} from '../ui';
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
export function EditAutoSheet({project:p,jobs,merge,reload,flush,change,refresh,onPreview,onClose,onChanged,notify,initial}:{project:Project;jobs:AutomationJob[];merge(job:AutomationJob):void;reload():Promise<void>;flush():Promise<Project|undefined>;change(fn:(p:Project)=>void):void;refresh():Promise<void>;onPreview(preview:EditPreview|null):void;onClose():void;onChanged?():void;notify(message:string):void;initial?:AutoOption}){
 const [level,setLevel]=useState<PauseLevel>(DEFAULT_PAUSE_LEVEL),[padding,setPadding]=useState(.16),[hover,setHover]=useState<AutoOption|null>(null),[pin,setPin]=useState<AutoOption|null>(initial??null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const [styled,setStyled]=useState<{jobId:string;after:Project}|null>(null),list=useRef<HTMLDivElement>(null),retry=useRef<()=>void>(()=>{});
 const cutJob=latestCutJob(jobs),styleJob=latestStyleJob(jobs);
 // A plan made before the latest edit no longer matches the timeline: it is never applied, and the row offers to look again.
 const cutBase=usePlanBase(cutJob),stale=cutJob?.status==='ready'&&planIsStale(cutBase,p);
 const ranges=useMemo(()=>({pauses:pauseRanges(cutJob,level,padding,stale),fillers:fillerRanges(p,cutJob,stale),gaps:gapRanges(p)}),[cutJob,level,padding,p,stale]);
 const active=pin??hover;
 const describe=(option:AutoOption)=>{
  if(option==='pauses'){if(!cutJob)return 'Finds quiet gaps in your speech.';if(automationRunning(cutJob))return 'Looking for pauses…';if(stale)return 'The timeline changed since the last look.';const r=ranges.pauses;return r.length?`${r.length} ${r.length===1?'pause':'pauses'} · ${seconds(rangesSeconds(r))} shorter`:'No pauses left at this setting';}
  if(option==='fillers'){const r=ranges.fillers;return r.length?`${r.length} found: "um", "uh" and repeated phrases · ${seconds(rangesSeconds(r))}`:p.captions.length?'None left':'Needs a transcript first';}
  if(option==='gaps'){const r=ranges.gaps;return r.length?`${r.length} empty ${r.length===1?'stretch':'stretches'} between clips · ${seconds(rangesSeconds(r))}`:'No gaps between clips';}
  if(option==='normalize')return p.clips.length&&p.clips.every(c=>c.effects.normalize)?'On: loudness is evened out when you export':'Evens out loudness when you export';
  if(!styleJob)return 'Plans a layout and title slates for each scene.';if(automationRunning(styleJob))return 'Planning a style…';return styleJob.status==='ready'?(styleJob.proposal?.summary??'Ready to preview'):'Plan a new style';
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

 const plan=async(kind:QuickActionRequest['kind'])=>{setBusy(kind);setError('');retry.current=()=>void plan(kind);try{const fresh=await flush();if(!fresh||fresh.id!==p.id)throw Error('changed');merge(await api<AutomationJob>(`/projects/${p.id}/quick-action`,{kind,semantic:false} satisfies QuickActionRequest));}catch{setError(kind==='visualize'?"Couldn't plan a style.":"Couldn't look for pauses.");}finally{setBusy('');}};
 const apply=async(option:AutoOption)=>{
  setError('');retry.current=()=>void apply(option);
  if(option==='pauses'||option==='fillers'||option==='gaps'){
   const r=ranges[option];if(!r.length)return;
   if(option!=='gaps'){const fresh=await flush().catch(()=>undefined),base=await planBase(cutJob);if(!fresh||base===undefined||planIsStale(base,fresh)){setError('The timeline changed since the last look. Find pauses again.');return;}}
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
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(pin)setPin(null);else onClose();}
 };
const actions=(option:AutoOption)=>{
  if(option==='normalize')return <div className="club-auto-actions"><Button size="sm" disabled={!p.clips.length||p.clips.every(c=>c.effects.normalize)} onClick={()=>void apply('normalize')}>Even out</Button></div>;
  if(option!=='pauses'&&option!=='fillers'&&option!=='gaps')return null;
  if(option==='pauses'&&(!cutJob||stale||cutJob.status!=='ready'))return null;
  const found=ranges[option].length>0;
  return <div className="club-auto-actions"><Button size="sm" disabled={!found||!!busy} onClick={()=>setPin(option)}>Review</Button><Button size="sm" disabled={!found||!!busy} onClick={()=>void apply(option)}>{option==='pauses'?'Remove all':'Cut all'}</Button></div>;
 };
 const row=(option:AutoOption,icon:React.ReactNode,title:string,extra?:React.ReactNode)=><div key={option} role="listitem" data-option={option} tabIndex={0} className={`club-auto-row ${pin===option?'is-pinned':''}`} aria-label={title}
  onMouseEnter={()=>setHover(option)} onMouseLeave={()=>setHover(h=>h===option?null:h)} onFocus={event=>{if(event.target===event.currentTarget)setHover(option);}} onBlur={()=>setHover(h=>h===option?null:h)}
  onClick={event=>{if((event.target as HTMLElement).closest('button,input'))return;setPin(option);}} onKeyDown={event=>keys(event,option)}>
  <div className="club-auto-title">{icon}{title}</div><div className="club-auto-desc">{describe(option)}</div>{extra}
  {actions(option)}
 </div>;
 return <aside className="club-sheet club-auto-sheet" aria-label="Auto-edit">
  <header><b>Cut</b><span className="club-sheet-grow"/><button type="button" className="btn sm" onClick={onClose}>Show transcript</button></header>
  <div className="club-sheet-body" ref={list} role="list">
   {row('fillers',<Icon name="audio" size={15}/>,'Mistakes')}
   {row('pauses',<Icon name="cut" size={15}/>,'Silences',<>
    {(!cutJob||stale||cutJob.status!=='ready'&&!automationRunning(cutJob))&&<Button size="sm" disabled={!!busy||!p.clips.length} onClick={()=>void plan('auto-cut')}>{busy==='auto-cut'&&<Icon name="loading" className="spin" aria-hidden/>}{cutJob?'Find pauses again':'Find pauses'}</Button>}
    {cutJob?.status==='ready'&&!stale&&<><div className="club-auto-control"><span className="club-seg" role="group" aria-label="How much to cut">{(Object.keys(PAUSE_LEVEL_NAMES) as PauseLevel[]).map(l=><button key={l} type="button" aria-pressed={level===l} onClick={()=>{setLevel(l);setPin('pauses');}}>{PAUSE_LEVEL_NAMES[l]}</button>)}</span></div>
     <label className="club-auto-control"><span>Keep</span><input type="range" min={.05} max={.5} step={.01} value={padding} aria-label="Breathing room kept around each cut" onChange={event=>{setPadding(+event.target.value);setPin('pauses');}}/><span className="tnum">{padding.toFixed(2)}s</span><span className="faint">around each cut</span></label></>}
   </>)}
   {row('gaps',<Icon name="slide" size={15}/>,'Gaps between clips')}
   {row('normalize',<Icon name="adjust" size={15}/>,'Volume')}
   {row('style',<Icon name="image" size={15}/>,'Layout and titles',(!styleJob||styleJob.status!=='ready')&&<Button size="sm" disabled={!!busy||!p.clips.length||!!styleJob&&automationRunning(styleJob)} onClick={()=>void plan('visualize')}>{(busy==='visualize'||styleJob&&automationRunning(styleJob))&&<Icon name="loading" className="spin" aria-hidden/>}{styleJob?'Plan again':'Plan a style'}</Button>)}
  </div>
  {error&&<p className="club-sheet-error" role="alert">{error} <button type="button" onClick={()=>{setError('');retry.current();}}>Try again</button></p>}
  {pin&&<footer className="club-sheet-pin"><span>Previewing <b>{pin==='pauses'?`Remove pauses (${PAUSE_LEVEL_NAMES[level].toLowerCase()})`:pin==='fillers'?'Remove filler words':pin==='gaps'?'Close gaps between clips':pin==='normalize'?'Even out the volume':'Suggest a layout and titles'}</b></span>
   <Button size="sm" variant="ghost" onClick={()=>setPin(null)}>Cancel</Button><Button size="sm" variant="primary" disabled={!!busy} onClick={()=>void apply(pin)}>{busy==='style'&&<Icon name="loading" className="spin" aria-hidden/>}Apply</Button></footer>}
 </aside>;
}
