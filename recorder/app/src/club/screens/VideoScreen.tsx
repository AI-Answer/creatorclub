import {useCallback,useEffect,useState} from 'react';
import {ChevronRight,FileText} from 'lucide-react';
import type {Video} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ClubRecorder} from '../ClubRecorder';
import {ErrorLine} from '../ErrorLine';
import {sceneAnchor} from '../plan/OutlineEditor';
import {PlanChecklist} from '../plan/PlanChecklist';
import {PublishStep} from './PublishStep';
import type {VideoStep} from '../routes';
import {Button,EmptyState,cn} from '../ui';
import {usePlan} from '../usePlan';
import {VideoBottomBar} from '../VideoBottomBar';
import {PLAN_COPY,continueStage,doneSteps,movesForward} from '../video-plan';
import {backLabel,continueLabel,nextStep,previousStep,videoStepList} from '../video-steps';

/**
 * One video's page, the same frame for every step: breadcrumb on top, the outline's scenes on the left once there are any,
 * the step in the middle, and the bottom bar. Every `Continue to …` also moves the card to the next stage; Record and Edit
 * show SceneForge for the video's recording project.
 */
export function VideoScreen({video,step,onStep,onBoard,onVideo}:{video:Video;step:VideoStep;onStep(step:VideoStep):void;onBoard():void;onVideo(video:Video):void}){
 const previous=previousStep(step);
 const back=useCallback(()=>previous==='board'?onBoard():onStep(previous),[previous,onBoard,onStep]);
 const openRecord=useCallback(()=>onStep('record'),[onStep]);
 const plan=usePlan(video,{onVideo,onRecord:openRecord});
 const [moving,setMoving]=useState(false),[moveError,setMoveError]=useState('');

 /** Continue from Record or Edit: the card moves forward (never back), then the next step opens. */
 const advance=useCallback(async(from:VideoStep)=>{
  const target=continueStage[from],next=nextStep(from);
  setMoving(true);setMoveError('');
  try{
   if(target&&movesForward(video.stage,target))onVideo(await clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}/move`,{body:{stage:target}}));
   if(next)onStep(next);
  }catch(reason){setMoveError(errorMessage(reason,"Couldn't move the video."));}
  finally{setMoving(false);}
 },[video.id,video.stage,onVideo,onStep]);
 // Record keeps its own primary (the scene's Record button) until every scene has a take; then Continue to editing becomes the primary.
 const [allRecorded,setAllRecorded]=useState(false);
 useEffect(()=>setAllRecorded(false),[video.recorderProjectId]);
 const onProgress=useCallback(({recorded,total}:{recorded:number;total:number})=>setAllRecorded(total>0&&recorded>=total),[]);
 // Edit keeps its own primary (Export video) until the current edit is exported; then Continue to publishing becomes the primary.
 const [exported,setExported]=useState(false);
 useEffect(()=>setExported(false),[video.recorderProjectId]);
 const onExported=useCallback((done:boolean)=>setExported(done),[]);
 // SceneForge's own "go to the editor" (and back) runs through the same steps as the bottom bar.
 const onMode=useCallback((mode:'Record'|'Edit')=>{if(mode==='Edit')void advance('record');else onStep('record');},[advance,onStep]);

 const scenes=plan.outline?.scenes??[];
 const showScenes=(step==='plan'||step==='publish')&&scenes.length>0;
 const openScene=(index:number)=>{
  if(step!=='plan')onStep('plan');
  plan.setOpen('outline');
  requestAnimationFrame(()=>document.getElementById(sceneAnchor(index))?.scrollIntoView?.({block:'start',behavior:'smooth'}));
 };

 // Record and Edit need the video's recording project; without one the page only leads back to Plan, and the bar offers no Continue.
 const unplanned=(step==='record'||step==='edit')&&!video.recorderProjectId;
 const openPlan=useCallback(()=>onStep('plan'),[onStep]);
 const bar=step==='plan'
  ?{label:plan.continueAction&&PLAN_COPY[plan.continueAction.step].continue,run:plan.continueAction?.run,disabled:plan.continueAction?.disabled}
  :unplanned?{label:undefined,run:undefined,disabled:true}
  :{label:continueLabel(step),run:()=>void advance(step),disabled:moving};

 return <div className="flex h-full min-h-0 flex-col">
  <header className="club-drag club-traffic flex h-12 shrink-0 items-center border-b border-line px-4">
   <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-base">
    <button type="button" onClick={onBoard} className="rounded-sm px-1.5 py-0.5 text-muted hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">Board</button>
    <ChevronRight aria-hidden size={14} className="text-muted"/>
    <span aria-current="page" className="truncate px-1.5 font-medium text-ink">{video.title}</span>
   </nav>
  </header>
  {moveError&&<div className="border-b border-line px-4 py-2"><ErrorLine message={moveError} onRetry={()=>void advance(step)}/></div>}
  <div className="flex min-h-0 flex-1">
   {showScenes&&<aside aria-label="Scenes" className="w-56 shrink-0 overflow-auto border-r border-line bg-card px-2 py-3">
    <ol className="flex flex-col gap-0.5">
     {scenes.map((scene,index)=><li key={index}><button type="button" onClick={()=>openScene(index)}
      className={cn('flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-base text-ink hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent')}>
      <span className="w-4 shrink-0 text-right text-sm text-muted tabular-nums">{index+1}</span><span className="line-clamp-2 min-w-0">{scene.title||`Scene ${index+1}`}</span>
     </button></li>)}
    </ol>
   </aside>}
   <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
    <StepContent video={video} step={step} plan={plan} onBoard={onBoard} onPlan={openPlan} onMode={onMode} onProgress={onProgress} onExported={onExported} onVideo={onVideo}/>
   </div>
  </div>
  <VideoBottomBar steps={videoStepList} current={step} done={doneSteps(video)} onStep={onStep}
   backLabel={backLabel(step)} onBack={back}
   continueLabel={bar.label} onContinue={bar.run} continueDisabled={bar.disabled}
   continuePrimary={!(step==='record'&&video.recorderProjectId&&!allRecorded)&&!(step==='edit'&&video.recorderProjectId&&!exported)}/>
 </div>;
}

function StepContent({video,step,plan,onBoard,onPlan,onMode,onProgress,onExported,onVideo}:{video:Video;step:VideoStep;plan:ReturnType<typeof usePlan>;onBoard():void;onPlan():void;onMode(mode:'Record'|'Edit'):void;onProgress(progress:{recorded:number;total:number}):void;onExported(exported:boolean):void;onVideo(video:Video):void}){
 if(step==='plan')return <PlanChecklist video={video} plan={plan}/>;
 if((step==='record'||step==='edit')&&video.recorderProjectId)return <ClubRecorder projectId={video.recorderProjectId} mode={step==='record'?'Record':'Edit'} onBack={onBoard} onMode={onMode} onProgress={onProgress} onExported={step==='edit'?onExported:undefined}/>;
 if(step==='record'||step==='edit')return <EmptyState icon={<FileText/>} title="Plan this video first" description="Create the outline first. Each scene is recorded on its own."
  action={<Button variant="primary" size="md" onClick={onPlan}>Back to plan</Button>}/>;
 return <PublishStep video={video} pkg={plan.pkg} onVideo={onVideo}/>;
}
