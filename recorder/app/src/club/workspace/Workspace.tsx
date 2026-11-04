import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {Video,VideoStage} from '../../../shared/club';
import {ClubApiError,clubFetch,errorMessage} from '../api';
import {MOVE_REFUSED_STATUS} from '../../../shared/club-move';
import {deleteLater} from '../pending-delete';
import {ClubRecorder} from '../ClubRecorder';
import {ErrorLine} from '../ErrorLine';
import {Plan} from '../plan/Plan';
import {type Route,type VideoTab} from '../routes';
import {useVideoScenes} from '../scenes';
import {Button,EmptyState,Icon,Spinner,useToast} from '../ui';
import {usePlan} from '../usePlan';
import {EMPTY_PACKAGE} from '../plan/plan-logic';
import {STAGE_LABEL} from '../board';
import {recordedCount} from '../scene-status';
import {Board} from './Board';
import {Companion,type CompanionEditor} from './Companion';
import type {EditorBridge,EditorState} from '../../App';
import {screenSummary} from './companion-logic';
import type {CompanionChanged} from '../../../shared/companion';
import {Foot,Header} from './Frame';
import {Publish} from './Publish';
import {outlineSceneFor,recorderSceneFor} from './record-logic';
import {TAKE_NOT_ADDED,takesWaiting,continueFor,nextTab,stageForContinue,TAB_LABEL,type ContinueButton,type LockFacts,type TabFacts} from './rules';

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
 const [startingQuick,setStartingQuick]=useState(false);
 const quickPending=useRef(false);
 const recordWithoutPlan=async()=>{
  if(quickPending.current)return;
  quickPending.current=true;setStartingQuick(true);
  try{onVideo(await clubFetch<Video>(`/videos/${id}/recorder`,{body:{quick:true}}));reloadScenes();navigate(tabRoute('record'));}
  catch(reason){toast(errorMessage(reason,"Couldn't start the recording."));}
  finally{quickPending.current=false;setStartingQuick(false);}
 };


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
 const facts:TabFacts&LockFacts={stage:video.stage,scenes:list,allRecorded:allRecorded||undefined,exported,hasRecording:!!video.recorderProjectId};

 // A finished outline job changes the scenes; they are read again so the strip and the tab's job follow it.
 const outlineDone=plan.outlineJob.phase==='done';
 useEffect(()=>{if(outlineDone)scenes.reload();},[outlineDone,scenes.reload]);

 /** Moves the card to a stage, with Undo when `undoTo` is given (the stage menu). */
 const moveTo=useCallback(async(stage:VideoStage,undoTo?:VideoStage)=>{
  if(stage===video.stage)return;
  try{onVideo(await clubFetch<Video>(`/videos/${id}/move`,{body:{stage}}));}
  catch(reason){toast(errorMessage(reason,"Couldn't move the video."),{refused:true});return;}
  if(undoTo)toast(`Moved to ${STAGE_LABEL[stage]}`,{undo:()=>void moveTo(undoTo)});
 },[id,video.stage,onVideo,toast]);

 /** Deletes the video after the toast's Undo has had its time (the server cannot bring it back), and goes back where it was opened from. */
 const deleteVideo=useCallback(()=>{
  const undo=deleteLater(video.id,message=>toast(message));
  toast(`Deleted “${video.title}”`,{undo});
  navigate(back);
 },[video.id,video.title,toast,navigate,back]);

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
   // The server refuses a move the video is not ready for (no take to edit, no export to publish): the step still opens, and the card stays where it is.
   if(stage)onVideo(await clubFetch<Video>(`/videos/${id}/move`,{body:{stage}}).catch(reason=>{if(reason instanceof ClubApiError&&reason.status===MOVE_REFUSED_STATUS)return video;throw reason;}));
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
 // Leaving a step saves what is still waiting to be saved there, at once.
 const flushPlan=useRef(plan.flush);flushPlan.current=plan.flush;
 useEffect(()=>()=>{void flushPlan.current().catch(()=>{});},[tab]);
 const refreshPlan=plan.refresh;
 useEffect(()=>{if(tab==='plan'||tab==='publish')void refreshPlan();},[tab,refreshPlan]);

 const waiting=takesWaiting(list);

 // The one Continue rule (rules.ts): it names the next step, says why when it cannot go, and is the primary only once the step is done.
 // Plan's Continue sets up the recording first, so it goes by the plan's own outline and its running jobs.
 let nextButton:(ContinueButton&{run():void})|undefined;
 if(tab==='plan'){
  const planScenes=plan.load.status==='ready'?(plan.outline?.scenes??[]).map(()=>({takes:[]})):undefined;
  const rule=continueFor('plan',{...facts,scenes:planScenes},{busy:plan.busy});
  if(rule)nextButton={...rule,disabled:rule.disabled||startingQuick||!!plan.continueAction?.disabled,run:()=>plan.continueAction?plan.continueAction.run():void recordWithoutPlan()};
 }else{
  // Record without a recording project shows its own primary, Start recording.
  const ownPrimary=tab==='record'&&!video.recorderProjectId;
  const rule=continueFor(tab,facts,{ownPrimary});
  if(rule)nextButton={...rule,disabled:rule.disabled||moving,run:()=>void continueToNext()};
 }

 // The companion is docked beside every step. On Edit it works through the open editor: it reads the playhead and selection,
 // previews a card on the stage and applies it as one of the editor's undo steps.
 const [boardKey,setBoardKey]=useState(0),[boardSelection,setBoardSelection]=useState<readonly string[]>([]);
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
 const recorded=list&&recordedCount(list);
 const screen=screenSummary(tab,{pkg:plan.pkg,outline:plan.outline,recorded});


 return <div className="ws">
  <Header video={video} tab={tab} onTitle={saveTitle} onStage={stage=>void moveTo(stage,video.stage)} onDelete={deleteVideo} onHome={()=>void addReviewedTake().then(left=>{if(left)navigate({name:'home'});})}/>
  <div className="ws-row"><div className="ws-col">
  {moveError&&<div className="ws-body" style={{flex:'none',padding:'8px 18px'}}><ErrorLine message={moveError} onRetry={()=>void continueToNext()}/></div>}
  <div className="ws-body" key={tab}>
   {tab==='board'&&<Board key={video.id} video={video} onSelection={setBoardSelection} scenes={list} onDrafted={draftedNow} refreshKey={boardKey} navigate={navigate}/>}
   {tab==='plan'&&<Plan video={video} plan={plan} known={list} focusId={focusId} onFocus={setFocusId} onTitle={saveTitle}
    onTarget={seconds=>{clubFetch<Video>(`/videos/${id}`,{method:'PUT',body:{targetSeconds:seconds>0?seconds:null}}).then(onVideo,reason=>toast(errorMessage(reason,"Couldn't save the target.")));}}
    onRecordScene={sceneId=>{setFocusId(sceneId);setPickN(n=>n+1);navigate(tabRoute('record'));}}/>}
   {/* Floats over the top of the editor, so the editor keeps its full height and the timeline is not cut off. */}
   {tab==='edit'&&waiting.length>0&&<div className="ws-take-notice"><div className="ws-notice" role="status"><span>{waiting.length===1?`The take for “${waiting[0]}” isn't on the timeline yet.`:`${waiting.length} takes aren't on the timeline yet.`}</span><Button size="sm" onClick={()=>navigate(tabRoute('record'))}>Open the take</Button></div></div>}
   {tab==='edit'&&list!==undefined&&!list.some(scene=>scene.takes.length)&&<EmptyState icon={<Icon name="cut"/>} title="Nothing recorded yet" description="Record something to start editing." action={<Button variant="primary" onClick={()=>navigate(tabRoute('record'))}>Open record</Button>}/>}
   {(tab==='record'||(tab==='edit'&&(list===undefined||list.some(scene=>scene.takes.length))))&&(video.recorderProjectId
    ?<div className="rec with-embed">
     <div className="rec-left"><ClubRecorder projectId={video.recorderProjectId} mode={tab==='record'?'Record':'Edit'} onBack={()=>navigate({name:'videos',view:'board'})}
      registerLeaveGuard={registerLeaveGuard} onMode={mode=>{if(mode==='Edit'&&tab==='record')void continueToNext();else navigate(tabRoute(mode==='Edit'?'edit':'record'));}} onProgress={onProgress} onExported={tab==='edit'?onExported:undefined}
      onRestart={plan.continueAction?.run}
      sceneId={recorderSceneFor(video,focusId)??undefined} sceneNonce={pickN} onSceneChange={recorderScene} onChanged={reloadScenes}
      onEditor={tab==='edit'?onEditor:undefined} onEditState={tab==='edit'?setEditState:undefined}/></div>
    </div>
    :list===undefined?<div className="flex flex-1 items-center justify-center" style={{padding:'64px 0'}}><span className="row small muted" role="status"><Spinner label="Loading the scenes" size={20}/>Loading the scenes…</span></div>
    :<EmptyState icon={<Icon name="camera"/>} title={list.length?'Ready to record':'Record without a plan'} description={list.length?'Start the recording for these scenes.':'Start with one scene. You can plan and edit this video later.'}
      action={list.length?<Button variant="primary" size="md" disabled={!plan.continueAction||plan.continueAction.disabled} onClick={()=>plan.continueAction?.run()}>Start recording</Button>:<Button variant="primary" size="md" disabled={startingQuick} onClick={()=>void recordWithoutPlan()}>{startingQuick?'Opening recorder…':'Record without a plan'}</Button>}/>)}
   {tab==='publish'&&scenes.state.status==='loading'&&video.stage!=='published'&&<div className="flex flex-1 items-center justify-center" style={{padding:'64px 0'}}><span className="row small muted" role="status"><Spinner label="Loading the scenes" size={20}/>Loading the scenes…</span></div>}
   {tab==='publish'&&(scenes.state.status!=='loading'||video.stage==='published')&&<Publish video={video} pkg={plan.pkg} scenes={list} onVideo={onVideo} onSettings={()=>navigate({name:'settings',section:'publishing'})} onGoTo={target=>navigate(tabRoute(target))}
    saveError={plan.saveError} onRetry={plan.retrySave} onDescription={description=>plan.editPackage({...(pkgNow.current??EMPTY_PACKAGE),description})}
    onTags={tags=>{plan.editPackage({...(pkgNow.current??EMPTY_PACKAGE),tags});void plan.flush().catch(()=>{});}}/>}
  </div>
  </div>
  <Companion videoId={video.id} selection={tab==='board'?boardSelection:undefined} videoTitle={video.title} boardKey={boardKey} tab={tab} scene={companionScene} screen={screen} pkg={plan.pkg} outline={plan.outline} scenes={list} onChanged={companionChanged} beforeApply={plan.flush} editor={companionEditor} roomy={tab==='record'}/>
  </div>
  <Foot video={video} tab={tab} facts={facts} onTab={target=>void goToTab(target)} next={nextButton}/>
 </div>;
}
