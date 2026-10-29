import {PLAN_JOB_KINDS,type PlanJobKind,type Video,type VideoScene} from '../../../shared/club';
import {ErrorLine} from '../ErrorLine';
import type {JobRun} from '../useJobRun';
import type {Notice,Plan as PlanState} from '../usePlan';
import {Button,Spinner} from '../ui';
import {changedSceneLine} from '../video-plan';
import {PackageColumn} from './PackageColumn';
import {ScenesColumn} from './ScenesColumn';

const STARTING='Starting…';

/** A running AI step's latest line with a quiet `Stop`, or its one-sentence failure with `Try again`. Nothing when it is idle or done. */
function JobLine({state,onRetry,onStop}:{state:JobRun;onRetry():void;onStop():void}){
 if(state.phase==='running')return <div className="row" style={{gap:12}}>
  <p role="status" className="row small muted" style={{gap:8}}><Spinner size={14} label="Working"/>{state.line??STARTING}</p>
  <Button variant="ghost" size="sm" onClick={onStop}>Stop</Button>
 </div>;
 if(state.phase==='failed')return <ErrorLine message={state.message} onRetry={onRetry}/>;
 return null;
}

const WHAT:Record<PlanJobKind,string>={package:'package',outline:'outline',script:'script'};

/** "Replaced the outline · Undo" after a run replaced earlier work; "New outline ready · Use it" when a run finished after the step was edited. */
function NoticeLine({kind,notice,onAct}:{kind:PlanJobKind;notice?:Notice;onAct(kind:PlanJobKind):void}){
 if(!notice)return null;
 const replaced=notice.type==='replaced';
 return <p role="status" className="small muted">
  {replaced?`Replaced the ${WHAT[kind]}`:`New ${WHAT[kind]} ready`} · <button type="button" className="linkish" onClick={()=>onAct(kind)} style={{background:'none',border:0,padding:'0 2px',font:'inherit',fontWeight:600,color:'var(--cc-accent-text)',cursor:'pointer'}}>{replaced?'Undo':'Use it'}</button>
 </p>;
}

/**
 * The Plan tab: the package on the left, the scenes on the right. Titles, hooks and scripts are written by the real jobs;
 * the lines above the columns show what is running, what was replaced (Undo), and what is waiting (Use it).
 */
export function Plan({video,plan,known,focusId,onFocus,onTitle,onRecordScene}:{video:Video;plan:PlanState;known:readonly VideoScene[]|undefined;focusId:string|null;onFocus(sceneId:string):void;onTitle(title:string):void;onRecordScene(sceneId:string):void}){
 if(plan.load.status==='loading')return <div className="grow" style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'64px 0'}}><Spinner label="Loading the plan" size={20}/></div>;
 if(plan.load.status==='error')return <div style={{maxWidth:720,margin:'0 auto',padding:'32px 24px'}}><ErrorLine message={plan.load.message} onRetry={plan.reload}/></div>;
 const packaging=plan.packageJob.phase==='running',outlining=plan.outlineJob.phase==='running',scripting=plan.scriptJob.phase==='running';
 const lines=[
  plan.changedScene!==undefined&&<p key="changed" role="status" className="small" style={{background:'var(--cc-warn-soft)',color:'var(--cc-warn)',padding:'10px 14px',borderRadius:10}}>{changedSceneLine(plan.changedScene)}</p>,
  plan.continueError&&<ErrorLine key="continue" message={plan.continueError} onRetry={()=>plan.continueAction?.run()}/>,
  plan.saveError&&<ErrorLine key="save" message={plan.saveError} onRetry={plan.retrySave}/>,
  plan.noticeError&&<ErrorLine key="notice" message={plan.noticeError} onRetry={()=>{for(const kind of PLAN_JOB_KINDS)if(plan.notices[kind]){void plan.resolveNotice(kind);break;}}}/>,
  <JobLine key="outline-job" state={plan.outlineJob} onRetry={plan.createOutline} onStop={()=>plan.stop('outline')}/>,
  <JobLine key="package-job" state={plan.packageJob} onRetry={()=>plan.writePackage()} onStop={()=>plan.stop('package')}/>,
  <JobLine key="script-job" state={plan.scriptJob} onRetry={()=>plan.writeScript(plan.scriptScene)} onStop={()=>plan.stop('script')}/>,
  <NoticeLine key="package-notice" kind="package" notice={plan.notices.package} onAct={plan.resolveNotice}/>,
  <NoticeLine key="outline-notice" kind="outline" notice={plan.notices.outline} onAct={plan.resolveNotice}/>,
  <NoticeLine key="script-notice" kind="script" notice={plan.notices.script} onAct={plan.resolveNotice}/>,
 ].filter(Boolean);
 return <div style={{display:'flex',flexDirection:'column',minHeight:'100%'}}>
  {lines.length>0&&<div style={{display:'flex',flexDirection:'column',gap:8,padding:'12px 40px 0'}}>{lines}</div>}
  <div className="plan" style={{flex:1}}>
   <PackageColumn videoId={video.id} videoTitle={video.title} pkg={plan.pkg} running={packaging} onEdit={plan.editPackage} onWrite={plan.writePackage} onPickTitle={onTitle}/>
   <ScenesColumn videoId={video.id} hasRecording={!!video.recorderProjectId} outline={plan.outline} known={known} focusId={focusId}
    drafting={outlining} draftLine={plan.outlineJob.phase==='running'?plan.outlineJob.line:undefined} scripting={scripting} scriptingScene={plan.scriptScene}
    onEdit={plan.editOutline} onFocus={onFocus} onDraft={plan.createOutline} onWriteFull={()=>plan.writeScript()} onWriteScene={plan.writeScript} onSceneScript={plan.saveSceneScript} onRecord={onRecordScene}/>
  </div>
 </div>;
}
