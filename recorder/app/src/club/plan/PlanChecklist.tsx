import type {ReactNode} from 'react';
import {Check,ChevronDown} from 'lucide-react';
import {PLAN_JOB_KINDS,type PlanJobKind,type Video} from '../../../shared/club';
import {ErrorLine} from '../ErrorLine';
import type {JobRun} from '../useJobRun';
import type {Notice,Plan} from '../usePlan';
import {Button,Spinner,cn} from '../ui';
import {PLAN_COPY,PLAN_TAB_STEPS,WRITE_SCRIPT,changedSceneLine,type PlanTabStep} from '../video-plan';
import {OutlineEditor,ScriptEditor} from './OutlineEditor';
import {PackageForm} from './PackageForm';

const STARTING='Starting…';

/** A running AI step's latest line with a quiet `Stop`, or its one-sentence failure with `Try again`. Nothing when it is idle or done. */
function JobLine({state,onRetry,onStop}:{state:JobRun;onRetry():void;onStop():void}){
 if(state.phase==='running')return <div className="flex items-center gap-3">
  <p role="status" className="flex items-center gap-2 text-base text-muted"><Spinner size={14} label="Working"/>{state.line??STARTING}</p>
  <Button variant="ghost" size="sm" onClick={onStop}>Stop</Button>
 </div>;
 if(state.phase==='failed')return <ErrorLine message={state.message} onRetry={onRetry}/>;
 return null;
}

const NOTICE_WHAT:Record<PlanJobKind,string>={package:'package',outline:'outline',script:'full script'};

/** "Replaced the outline · Undo" after a run replaced earlier work; "New outline ready · Use it" when a run finished after the step was edited. */
function NoticeLine({kind,notice,onAct}:{kind:PlanJobKind;notice?:Notice;onAct(kind:PlanJobKind):void}){
 if(!notice)return null;
 const replaced=notice.type==='replaced';
 return <p role="status" className="flex items-center gap-1 text-base text-muted">
  {replaced?`Replaced the ${NOTICE_WHAT[kind]}`:`New ${NOTICE_WHAT[kind]} ready`}
  <span aria-hidden>·</span>
  <button type="button" onClick={()=>onAct(kind)} className="rounded-sm px-1 font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">{replaced?'Undo':'Use it'}</button>
 </p>;
}

function Step({index,step,done,open,summary,help,onOpen,children}:{index:number;step:PlanTabStep;done:boolean;open:boolean;summary?:string;help?:string;onOpen():void;children:ReactNode}){
 const {title}=PLAN_COPY[step];
 return <section aria-label={title} className="rounded-lg border border-line bg-card">
  <button type="button" aria-expanded={open} onClick={onOpen} className="flex w-full items-center gap-3 rounded-lg px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-accent">
   <span aria-hidden className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',done?'bg-success-soft text-success':open?'bg-accent text-accent-ink':'bg-subtle text-muted')}>{done?<Check size={15} strokeWidth={2.5}/>:index+1}</span>
   <span className="flex min-w-0 flex-1 flex-col">
    <span className="text-lg font-semibold text-ink">{title}{done&&<span className="sr-only"> (done)</span>}</span>
    {!open&&summary&&<span className="truncate text-sm text-muted">{summary}</span>}
   </span>
   <ChevronDown aria-hidden size={16} className={cn('shrink-0 text-muted transition-transform',open&&'rotate-180')}/>
  </button>
  {open&&<div className="flex flex-col gap-4 border-t border-line px-5 py-4">
   {help&&<p className="text-base text-muted">{help}</p>}
   {children}
  </div>}
 </section>;
}

/**
 * The Plan tab: Package and Create outline as a checklist, one open at a time, with PLAN.md's copy. Research is the Board tab.
 * Only one primary button shows: Package it or Create outline while there is nothing yet, else the tab's Continue.
 */
export function PlanChecklist({video,plan}:{video:Video;plan:Plan}){
 if(plan.load.status==='loading')return <div className="flex flex-1 items-center justify-center py-16"><Spinner label="Loading the plan" size={20}/></div>;
 if(plan.load.status==='error')return <div className="mx-auto w-full max-w-3xl px-6 py-8"><ErrorLine message={plan.load.message} onRetry={plan.reload}/></div>;
 const {pkg,outline}=plan;
 const done:Record<PlanTabStep,boolean>={package:video.planning.package,outline:video.planning.outline||!!video.recorderProjectId};
 const help=(step:PlanTabStep)=>plan.helpSeen&&!plan.helpSeen.includes(step)?PLAN_COPY[step].help:undefined;
 const summaries:Record<PlanTabStep,string|undefined>={
  package:pkg?.titles[0]||undefined,
  outline:outline?`${outline.scenes.length} ${outline.scenes.length===1?'scene':'scenes'}${outline.fullScript?' · full script':''}`:undefined,
 };
 const packaging=plan.packageJob.phase==='running',outlining=plan.outlineJob.phase==='running',scripting=plan.scriptJob.phase==='running';
 const body:Record<PlanTabStep,ReactNode>={
  package:<>
   <JobLine state={plan.packageJob} onRetry={plan.packageIt} onStop={()=>plan.stop('package')}/>
   <NoticeLine kind="package" notice={plan.notices.package} onAct={plan.resolveNotice}/>
   {pkg?<>
    <PackageForm value={pkg} onChange={plan.editPackage} disabled={packaging}/>
    <Button className="self-start" disabled={packaging} onClick={plan.packageIt}>{PLAN_COPY.package.action}</Button>
   </>:!packaging&&plan.packageJob.phase!=='failed'&&<Button variant="primary" className="self-start" onClick={plan.packageIt}>{PLAN_COPY.package.action}</Button>}
  </>,
  outline:<>
   <JobLine state={plan.outlineJob} onRetry={plan.createOutline} onStop={()=>plan.stop('outline')}/>
   <NoticeLine kind="outline" notice={plan.notices.outline} onAct={plan.resolveNotice}/>
   <NoticeLine kind="script" notice={plan.notices.script} onAct={plan.resolveNotice}/>
   {outline?<>
    {outline.fullScript!==undefined?<ScriptEditor value={outline.fullScript} onChange={plan.editScript} disabled={scripting}/>:<OutlineEditor value={outline} onChange={plan.editOutline} disabled={outlining||scripting}/>}
    <JobLine state={plan.scriptJob} onRetry={plan.writeScript} onStop={()=>plan.stop('script')}/>
    {plan.scriptError&&<ErrorLine message={plan.scriptError} onRetry={plan.backToTalkingPoints}/>}
    <div className="flex flex-wrap gap-2">
     <Button disabled={outlining||scripting} onClick={plan.createOutline}>{PLAN_COPY.outline.action}</Button>
     {outline.fullScript!==undefined?<Button variant="ghost" disabled={scripting} onClick={plan.backToTalkingPoints}>Use talking points</Button>
      :<Button variant="ghost" disabled={outlining||scripting} onClick={plan.writeScript}>{WRITE_SCRIPT}</Button>}
    </div>
   </>:!outlining&&plan.outlineJob.phase!=='failed'&&<Button variant="primary" className="self-start" onClick={plan.createOutline}>{PLAN_COPY.outline.action}</Button>}
  </>,
 };
 return <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
  {plan.changedScene!==undefined&&<p role="status" className="rounded-lg bg-band-amber-soft px-4 py-3 text-base text-band-amber">{changedSceneLine(plan.changedScene)}</p>}
  {plan.continueError&&<ErrorLine message={plan.continueError} onRetry={()=>plan.continueAction?.run()}/>}
  {plan.saveError&&<ErrorLine message={plan.saveError} onRetry={plan.retrySave}/>}
  {plan.noticeError&&<ErrorLine message={plan.noticeError} onRetry={()=>{for(const kind of PLAN_JOB_KINDS)if(plan.notices[kind]){void plan.resolveNotice(kind);break;}}}/>}
  {PLAN_TAB_STEPS.map((step,index)=><Step key={step} index={index} step={step} done={done[step]} open={plan.open===step} summary={summaries[step]} help={help(step)} onOpen={()=>plan.setOpen(step)}>{body[step]}</Step>)}
 </div>;
}

