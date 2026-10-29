import {useCallback,useEffect,useRef,useState} from 'react';
import type {Video,VideoStage} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ClubRecorder} from '../ClubRecorder';
import {ErrorLine} from '../ErrorLine';
import {Plan} from '../plan/Plan';
import {type Route,type VideoTab} from '../routes';
import {useVideoScenes} from '../scenes';
import {Button,EmptyState,Icon,useToast} from '../ui';
import {usePlan} from '../usePlan';
import {EMPTY_PACKAGE} from '../plan/plan-logic';
import {STAGE_LABEL} from '../board';
import {Board} from './Board';
import {Foot,Header,Strip} from './Frame';
import {Publish} from './Publish';
import {Teleprompter} from './Teleprompter';
import {outlineSceneFor,promptScene,recorderSceneFor} from './record-logic';
import {continueIsPrimary,pickJumpsToPlan,nextTab,stageForContinue,tabDone,TAB_LABEL,type TabFacts} from './rules';
import {originLabel} from '../routes';

/**
 * One video's page: the frame (header, tabs, scene strip, bottom bar) around the tab's own content. Board is the research canvas;
 * Plan, Record, Edit and Publish show the step screens they have until their own tasks replace them.
 */
export function Workspace({video,tab,back,navigate,onVideo}:{video:Video;tab:VideoTab;back:Route;navigate(route:Route,options?:{replace?:boolean}):void;onVideo(video:Video):void}){
 const toast=useToast();
 const id=encodeURIComponent(video.id);
 const tabRoute=useCallback((next:VideoTab):Route=>({name:'video',id:video.id,tab:next}),[video.id]);
 const plan=usePlan(video,{onVideo,onRecord:()=>navigate(tabRoute('record'))});
 const scenes=useVideoScenes(video.id);
 const [focusId,setFocusId]=useState<string|null>(null),[pickN,setPickN]=useState(0);
 const pkgNow=useRef(plan.pkg);pkgNow.current=plan.pkg;
 /** The recorder moved to another scene (its own cards, or the next scene after Continue): the strip and the teleprompter follow. */
 const recorderScene=useCallback((sceneId:string)=>{const outlineId=outlineSceneFor(video,sceneId);if(outlineId)setFocusId(outlineId);},[video.recorderScenes]);
 const [moving,setMoving]=useState(false),[moveError,setMoveError]=useState('');

 // Recording and editing report back through the recorder: whether every scene has a take, and whether the edit was exported.
 const [allRecorded,setAllRecorded]=useState(false),[exported,setExported]=useState(false);
 useEffect(()=>{setAllRecorded(false);setExported(false);},[video.recorderProjectId]);
 const reloadScenes=scenes.reload;
 // A take was kept or deleted: the strip reads the scenes again.
 const lastRecorded=useRef<number>(-1);
 const onProgress=useCallback(({recorded,total}:{recorded:number;total:number})=>{
  setAllRecorded(total>0&&recorded>=total);
  if(lastRecorded.current!==recorded){if(lastRecorded.current>=0)reloadScenes();lastRecorded.current=recorded;}
 },[reloadScenes]);
 const onExported=useCallback((done:boolean)=>setExported(done),[]);

 const list=scenes.state.status==='ready'?scenes.state.scenes:undefined;
 const facts:TabFacts={stage:video.stage,scenes:list,allRecorded:allRecorded||undefined,exported};

 // A finished outline job changes the scenes; they are read again so the strip and the tab's job follow it.
 const outlineDone=plan.outlineJob.phase==='done';
 useEffect(()=>{if(outlineDone)scenes.reload();},[outlineDone,scenes.reload]);

 /** Moves the card to a stage, with Undo when `undoTo` is given (the stage menu). */
 const moveTo=useCallback(async(stage:VideoStage,undoTo?:VideoStage)=>{
  if(stage===video.stage)return;
  try{onVideo(await clubFetch<Video>(`/videos/${id}/move`,{body:{stage}}));}
  catch(reason){toast(errorMessage(reason,"Couldn't move the video."));return;}
  if(undoTo)toast(`Moved to ${STAGE_LABEL[stage]}`,{undo:()=>void moveTo(undoTo)});
 },[id,video.stage,onVideo,toast]);

 const saveTitle=useCallback((title:string)=>{
  clubFetch<Video>(`/videos/${id}`,{method:'PUT',body:{title}}).then(onVideo,reason=>toast(errorMessage(reason,"Couldn't save the title.")));
 },[id,onVideo,toast]);

 /** Continue to the next tab: the card moves forward when the tab's stage is further along than the card, then the tab opens. */
 const next=nextTab(tab);
 const continueToNext=async()=>{
  if(!next)return;
  const stage=stageForContinue(video.stage,next);
  setMoving(true);setMoveError('');
  try{
   if(stage)onVideo(await clubFetch<Video>(`/videos/${id}/move`,{body:{stage}}));
   navigate(tabRoute(next));
  }catch(reason){setMoveError(errorMessage(reason,"Couldn't move the video."));}
  finally{setMoving(false);}
 };
 // A draft from the Board wrote the outline: the plan and the strip read it before Plan opens, so neither shows "No scenes yet".
 const reloadPlan=plan.reload;
 const draftedNow=useCallback(()=>{
  clubFetch<Video>(`/videos/${id}`).then(onVideo,()=>{});
  reloadPlan();reloadScenes();
  navigate(tabRoute('plan'));
 },[id,onVideo,navigate,tabRoute,reloadPlan,reloadScenes]);
 // The Board can write the package (Use as hook, Ask Claude): Plan and Publish read it again when they open.
 const refreshPlan=plan.refresh;
 useEffect(()=>{if(tab==='plan'||tab==='publish')void refreshPlan();},[tab,refreshPlan]);

 // Record and Edit need the video's recording project. Without one the page leads back to Plan, and offers no Continue.
 // Recording shows the focused scene's talking points beside the recorder; Edit has no teleprompter.
 const prompting=tab==='record'?promptScene(plan.outline,list,focusId):undefined;
 const unplanned=(tab==='record'||tab==='edit')&&!video.recorderProjectId;

 let nextButton:{label:string;run():void;disabled:boolean;primary:boolean}|undefined;
 if(tab==='plan'){
  nextButton=plan.continueAction?{label:'Continue to recording',run:plan.continueAction.run,disabled:plan.continueAction.disabled,primary:continueIsPrimary(tabDone('plan',facts),false)}
   :{label:'Continue to recording',run:()=>{},disabled:true,primary:false};
 }else if(next&&!unplanned&&tab!=='publish'){
  nextButton={label:`Continue to ${TAB_LABEL[next].toLowerCase()}`,run:()=>void continueToNext(),disabled:moving,primary:continueIsPrimary(tabDone(tab,facts),false)};
 }

 const backLabel=`Back to ${originLabel(back).toLowerCase()}`;

 return <div className="ws">
  <Header video={video} tab={tab} back={back} facts={facts} onTitle={saveTitle} onStage={stage=>void moveTo(stage,video.stage)} onTab={next=>navigate(tabRoute(next))}/>
  <Strip scenes={scenes.state} focusId={focusId} onRetry={scenes.reload} onPick={sceneId=>{setFocusId(sceneId);setPickN(n=>n+1);if(pickJumpsToPlan(tab))navigate(tabRoute('plan'));}}/>
  {moveError&&<div className="ws-body" style={{flex:'none',padding:'8px 18px'}}><ErrorLine message={moveError} onRetry={()=>void continueToNext()}/></div>}
  <div className="ws-body" key={tab}>
   {tab==='board'&&<Board video={video} scenes={list} onDrafted={draftedNow}/>}
   {tab==='plan'&&<Plan video={video} plan={plan} known={list} focusId={focusId} onFocus={setFocusId} onTitle={saveTitle}
    onTarget={seconds=>{clubFetch<Video>(`/videos/${id}`,{method:'PUT',body:{targetSeconds:seconds>0?seconds:null}}).then(onVideo,reason=>toast(errorMessage(reason,"Couldn't save the target.")));}}
    onRecordScene={sceneId=>{setFocusId(sceneId);navigate(tabRoute('record'));}}/>}
   {(tab==='record'||tab==='edit')&&(video.recorderProjectId
    ?<div className={prompting?'rec with-prompter':'rec with-embed'}>
     <div className="rec-left"><ClubRecorder projectId={video.recorderProjectId} mode={tab==='record'?'Record':'Edit'} onBack={()=>navigate({name:'production',view:'board'})}
      onMode={mode=>{if(mode==='Edit'&&tab==='record')void continueToNext();else navigate(tabRoute(mode==='Edit'?'edit':'record'));}} onProgress={onProgress} onExported={tab==='edit'?onExported:undefined}
      sceneId={tab==='record'?recorderSceneFor(video,focusId)??undefined:undefined} sceneNonce={pickN} onSceneChange={tab==='record'?recorderScene:undefined} onChanged={reloadScenes}/></div>
     {prompting&&<Teleprompter index={prompting.index} scene={prompting.scene}/>}
    </div>
    :<EmptyState icon={<Icon name="FileText"/>} title="Plan this video first" description="Create the outline first. Each scene is recorded on its own."
      action={<Button variant="primary" size="md" onClick={()=>navigate(tabRoute('plan'))}>Back to plan</Button>}/>)}
   {tab==='publish'&&<Publish video={video} pkg={plan.pkg} scenes={list} onVideo={onVideo} onGoTo={target=>navigate(tabRoute(target))}
    saveError={plan.saveError} onRetry={plan.retrySave} onDescription={description=>plan.editPackage({...(pkgNow.current??EMPTY_PACKAGE),description})}/>}
  </div>
  <Foot tab={tab} back={back} backLabel={backLabel} facts={facts} onTab={next=>navigate(tabRoute(next))} next={nextButton}/>
 </div>;
}
