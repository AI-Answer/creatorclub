import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {Video,VideoStage} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ClubRecorder} from '../ClubRecorder';
import {ErrorLine} from '../ErrorLine';
import {Plan} from '../plan/Plan';
import {type Route,type VideoTab} from '../routes';
import {useVideoScenes} from '../scenes';
import {Button,EmptyState,Icon,Spinner,useToast} from '../ui';
import {usePlan} from '../usePlan';
import {EMPTY_PACKAGE} from '../plan/plan-logic';
import {STAGE_LABEL} from '../board';
import {Board} from './Board';
import {Companion,type CompanionEditor} from './Companion';
import type {EditorBridge,EditorState} from '../../App';
import {screenSummary} from './companion-logic';
import type {CompanionChanged} from '../../../shared/companion';
import {Foot,Header,Strip} from './Frame';
import {Publish} from './Publish';
import {Teleprompter} from './Teleprompter';
import {outlineSceneFor,promptScene,recorderSceneFor} from './record-logic';
import {TAKE_NOT_ADDED,takesWaiting,continueIsPrimary,showsStrip,nextTab,stageForContinue,tabDone,TAB_LABEL,type TabFacts} from './rules';

/**
 * One video's page: the frame (header with the one set of step tabs, scene chips on Record and Edit, a bottom bar with Back and Continue) around the tab's own content. Board is the research canvas;
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
 // Leaving Record first adds a take still under review to the timeline, the same as the preview's Continue.
 const leaveGuard=useRef<(()=>Promise<boolean>)|null>(null);
 const registerLeaveGuard=useCallback((guard:(()=>Promise<boolean>)|null)=>{leaveGuard.current=guard;},[]);
 const addReviewedTake=async()=>{
  if(tab!=='record'||!leaveGuard.current)return true;
  const added=await leaveGuard.current();
  reloadScenes();
  if(added)return true;
  setMoveError(TAKE_NOT_ADDED);return false;
 };
 const goToTab=async(target:VideoTab)=>{if(target!=='record'&&!(await addReviewedTake()))return;navigate(tabRoute(target));};
 const continueToNext=async()=>{
  if(!next)return;
  if(!(await addReviewedTake()))return;
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
 // The scenes' takes change while recording and editing (a take added, pauses cut); the strip and the notice read them again when Record or Edit opens.
 useEffect(()=>{if(tab==='record'||tab==='edit')reloadScenes();},[tab,reloadScenes]);
 // The Board can write the package (Use as hook, Ask Claude): Plan and Publish read it again when they open.
 const refreshPlan=plan.refresh;
 useEffect(()=>{if(tab==='plan'||tab==='publish')void refreshPlan();},[tab,refreshPlan]);

 // Record and Edit need the video's recording project. Without one the page leads back to Plan, and offers no Continue.
 // Recording shows the focused scene's talking points beside the recorder; Edit has no teleprompter.
 const prompting=tab==='record'?promptScene(plan.outline,list,focusId):undefined;
 // Record needs scenes and then a recording project; Edit needs something recorded. Until then the tab says what comes first, and offers no Continue.
 const waiting=takesWaiting(list);
 const hasScenes=!!list?.length,hasTakes=!!list?.some(scene=>scene.takes.length>0);
 const unplanned=(tab==='record'&&!video.recorderProjectId)||(tab==='edit'&&(!video.recorderProjectId||(!!list&&!hasTakes)));

 let nextButton:{label:string;run():void;disabled:boolean;primary:boolean}|undefined;
 if(tab==='plan'){
  nextButton=plan.continueAction?{label:'Continue to recording',run:plan.continueAction.run,disabled:plan.continueAction.disabled,primary:continueIsPrimary(tabDone('plan',facts),false)}
   :{label:'Continue to recording',run:()=>{},disabled:true,primary:false};
 }else if(next&&!unplanned&&tab!=='publish'){
  nextButton={label:`Continue to ${TAB_LABEL[next].toLowerCase()}`,run:()=>void continueToNext(),disabled:moving,primary:continueIsPrimary(tabDone(tab,facts),false)};
 }

 // The companion is docked beside every step. On Edit it works through the open editor: it reads the playhead and selection,
 // previews a card on the stage and applies it as one of the editor's undo steps.
 const [boardKey,setBoardKey]=useState(0);
 const editorRef=useRef<EditorBridge|null>(null),[editState,setEditState]=useState<EditorState|null>(null);
 const onEditor=useCallback((bridge:EditorBridge|null)=>{editorRef.current=bridge;if(!bridge)setEditState(null);},[]);
 const companionEditor=useMemo<CompanionEditor|undefined>(()=>tab==='edit'?{get:()=>editorRef.current,state:editState}:undefined,[tab,editState]);
 const refresh=plan.refresh;
 const companionChanged=useCallback((changed:CompanionChanged[])=>{
  if(changed.includes('package')||changed.includes('outline'))void refresh();
  if(changed.includes('outline')){reloadScenes();clubFetch<Video>(`/videos/${id}`).then(onVideo,()=>{});}
  if(changed.includes('board'))setBoardKey(key=>key+1);
  if(changed.includes('timeline'))reloadScenes();
 },[refresh,reloadScenes,id,onVideo]);
 const scenesInPlan=plan.outline?.scenes;
 const focusIndex=focusId&&scenesInPlan?scenesInPlan.findIndex(scene=>scene.id===focusId):-1;
 const companionScene=useMemo(()=>(tab==='plan'||tab==='record')&&focusIndex>=0&&scenesInPlan?{id:focusId!,index:focusIndex,title:scenesInPlan[focusIndex].title}:undefined,[tab,focusId,focusIndex,scenesInPlan]);
 const recorded=list?.filter(scene=>scene.takes.some(take=>take.kept)).length;
 const screen=screenSummary(tab,{pkg:plan.pkg,outline:plan.outline,recorded});

 return <div className="ws">
  <Header video={video} tab={tab} back={back} facts={facts} onTitle={saveTitle} onStage={stage=>void moveTo(stage,video.stage)} onTab={target=>void goToTab(target)}/>
  <div className="ws-row"><div className="ws-col">
  {showsStrip(tab)&&<Strip scenes={scenes.state} focusId={focusId} onRetry={scenes.reload} onPick={sceneId=>{setFocusId(sceneId);setPickN(n=>n+1);}}/>}
  {moveError&&<div className="ws-body" style={{flex:'none',padding:'8px 18px'}}><ErrorLine message={moveError} onRetry={()=>void continueToNext()}/></div>}
  <div className="ws-body" key={tab}>
   {tab==='board'&&<Board video={video} scenes={list} onDrafted={draftedNow} refreshKey={boardKey}/>}
   {tab==='plan'&&<Plan video={video} plan={plan} known={list} focusId={focusId} onFocus={setFocusId} onTitle={saveTitle}
    onTarget={seconds=>{clubFetch<Video>(`/videos/${id}`,{method:'PUT',body:{targetSeconds:seconds>0?seconds:null}}).then(onVideo,reason=>toast(errorMessage(reason,"Couldn't save the target.")));}}
    onRecordScene={sceneId=>{setFocusId(sceneId);navigate(tabRoute('record'));}}/>}
   {tab==='edit'&&!unplanned&&waiting.length>0&&<div className="ws-body" style={{flex:'none',padding:'8px 18px'}}><div className="ws-notice" role="status"><span>{waiting.length===1?`The take for “${waiting[0]}” isn't on the timeline yet.`:`${waiting.length} takes aren't on the timeline yet.`}</span><Button variant="primary" size="sm" onClick={()=>navigate(tabRoute('record'))}>Open the take</Button></div></div>}
   {(tab==='record'||tab==='edit')&&(!unplanned&&video.recorderProjectId
    ?<div className={prompting?'rec with-prompter':'rec with-embed'}>
     <div className="rec-left"><ClubRecorder projectId={video.recorderProjectId} mode={tab==='record'?'Record':'Edit'} onBack={()=>navigate({name:'videos',view:'board'})}
      registerLeaveGuard={registerLeaveGuard} onMode={mode=>{if(mode==='Edit'&&tab==='record')void continueToNext();else navigate(tabRoute(mode==='Edit'?'edit':'record'));}} onProgress={onProgress} onExported={tab==='edit'?onExported:undefined}
      onRestart={plan.continueAction?.run}
      sceneId={tab==='record'?recorderSceneFor(video,focusId)??undefined:undefined} sceneNonce={pickN} onSceneChange={tab==='record'?recorderScene:undefined} onChanged={reloadScenes}
      onEditor={tab==='edit'?onEditor:undefined} onEditState={tab==='edit'?setEditState:undefined}/></div>
     {prompting&&<Teleprompter index={prompting.index} scene={prompting.scene}/>}
    </div>
    :tab==='edit'?<EmptyState icon={<Icon name="cut"/>} title="Nothing recorded yet" description="Record a scene first. Then you can edit it here."
      action={<Button variant="primary" size="md" onClick={()=>navigate(tabRoute('record'))}>Open record</Button>}/>
    :list===undefined?<div className="flex flex-1 items-center justify-center"><Spinner label="Loading the scenes" size={20}/></div>
    :!hasScenes?<EmptyState icon={<Icon name="script"/>} title="Plan the scenes first" description="Each scene is recorded on its own, so the scenes come first."
      action={<Button variant="primary" size="md" onClick={()=>navigate(tabRoute('plan'))}>Open plan</Button>}/>
    :<EmptyState icon={<Icon name="camera"/>} title="Ready to record" description="Start the recording for these scenes."
      action={<Button variant="primary" size="md" disabled={!plan.continueAction||plan.continueAction.disabled} onClick={()=>plan.continueAction?.run()}>Start recording</Button>}/>)}
   {tab==='publish'&&<Publish video={video} pkg={plan.pkg} scenes={list} onVideo={onVideo} onGoTo={target=>navigate(tabRoute(target))}
    saveError={plan.saveError} onRetry={plan.retrySave} onDescription={description=>plan.editPackage({...(pkgNow.current??EMPTY_PACKAGE),description})}/>}
  </div>
  <Foot next={nextButton}/>
  </div>
  <Companion videoId={video.id} tab={tab} scene={companionScene} screen={screen} pkg={plan.pkg} outline={plan.outline} scenes={list} onChanged={companionChanged} beforeApply={plan.flush} editor={companionEditor} roomy={tab==='record'}/>
  </div>
 </div>;
}
