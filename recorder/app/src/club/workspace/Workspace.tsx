import {prepareRecording} from '../recorder-setup';
import {hasCurrentExport} from '../export-status';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {PublishingState,Video,VideoStage} from '../../../shared/club';
import {ClubApiError,clubFetch,errorMessage,notifyVideosChanged} from '../api';
import {MOVE_REFUSED_STATUS} from '../../../shared/club-move';
import {deleteLater} from '../pending-delete';
import {ClubRecorder} from '../ClubRecorder';
import {api,listSavedExports,projectRevision} from '../../api';
import type {Project} from '../../../shared/types';
import {latestVideoExport} from '../recorder/edit-steps';
import {ErrorLine} from '../ErrorLine';
import {IdeaPage} from '../idea/IdeaPage';
import {SECTION_NAME,type SectionKey} from '../idea/idea-logic';
import {type Route,type VideoTab} from '../routes';
import {useVideoScenes} from '../scenes';
import {Button,Spinner,useToast} from '../ui';
import {usePlan} from '../usePlan';
import {EMPTY_PACKAGE} from '../plan/plan-logic';
import {STAGE_LABEL} from '../board';
import {recordedCount} from '../scene-status';
import {Companion,type CompanionEditor} from './Companion';
import type {EditorBridge,EditorState} from '../../App';
import {screenSummary} from './companion-logic';
import type {CompanionAction,CompanionChanged} from '../../../shared/companion';
import {Foot,Header} from './Frame';
import {Publish} from './Publish';
import {outlineSceneFor,recorderSceneFor} from './record-logic';
import {TAKE_NOT_ADDED,takesWaiting,continueFor,nextTab,stageForContinue,TAB_LABEL,type ContinueButton,type LockFacts,type TabFacts} from './rules';

/**
 * One video's page: the frame (header with the one set of step tabs, scene chips on Record and Edit, a bottom bar with Back and Continue) around the tab's own content.
 * Idea is the video's plan beside its board; Record, Edit and Publish show the step screens they have.
 */

/** The part of "Your video" a card changes: applying it there opens that part. */
const PART_OF_CARD:Partial<Record<CompanionAction['type'],SectionKey>>={set_sketch:'sketch',set_idea:'idea',set_pairs:'package',use_title:'package',set_thumbnail_text:'package',set_hook:'hook',use_hook:'hook',draft_scenes:'scenes',set_scene:'scenes',set_scene_script:'scenes'};
/** Up to this window width the chat yields to an open Edit panel (it waits as its rail), so the picture keeps its room: Borumi has no chat column beside its panels. */
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
 const [startingQuick,setStartingQuick]=useState(false),[recorderError,setRecorderError]=useState('');
 const flushPlan=useRef(plan.flush);flushPlan.current=plan.flush;
 // Record and Edit share setup, including a request still running when the tab changes.
 const prepareRecorder=useCallback((quick:boolean)=>prepareRecording(video.id,quick,()=>flushPlan.current()),[video.id]);
 const recordWithoutPlan=async()=>{
  if(startingQuick)return;
  setStartingQuick(true);
  try{onVideo(await prepareRecorder(true));reloadScenes();navigate(tabRoute('record'));}
  catch(reason){toast(errorMessage(reason,"Couldn't start the recording."));}
  finally{setStartingQuick(false);}
 };

 // Recording and editing report back through the recorder: whether every scene has a take, and whether the edit was exported.
 const [allRecorded,setAllRecorded]=useState(false),[exported,setExported]=useState(false),[editState,setEditState]=useState<EditorState|null>(null);
 useEffect(()=>{setAllRecorded(false);setExported(false);},[video.recorderProjectId]);
 // Record and Idea show the same completion check as Edit and Publish, verified against the saved revision.
 useEffect(()=>{
  const projectId=video.recorderProjectId;if(!projectId||tab==='edit'||tab==='publish')return;
  const request=new AbortController();
  void Promise.all([api<Project>(`/projects/${encodeURIComponent(projectId)}`,undefined,undefined,request.signal).then(project=>projectRevision(project)).catch(()=>null),listSavedExports(projectId,request.signal)])
   .then(([revision,{jobs}])=>{const latest=latestVideoExport(jobs);if(!request.signal.aborted)setExported(hasCurrentExport(latest,revision));}).catch(()=>{});
  return()=>request.abort();
 },[video.recorderProjectId,tab]);
 const reloadScenes=scenes.reload;
 // A take was kept or deleted: the strip reads the scenes again.
 const lastRecorded=useRef<number>(-1);
 const onProgress=useCallback(({recorded,total}:{recorded:number;total:number})=>{
  setAllRecorded(total>0&&recorded>=total);
  if(lastRecorded.current!==recorded){if(lastRecorded.current>=0)reloadScenes();lastRecorded.current=recorded;}
 },[reloadScenes]);
 const onExported=useCallback((done:boolean)=>setExported(done),[]);

 const list=scenes.state.status==='ready'?scenes.state.scenes:undefined;
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const scenesLoaded=list!==undefined,hasPlannedScenes=!!list?.length;
 // Opening a step prepares its project; capture still waits for Start recording.
 useEffect(()=>{
  if((tab!=='record'&&tab!=='edit')||video.recorderProjectId||!scenesLoaded||recorderError||tab==='record'&&hasPlannedScenes&&plan.load.status!=='ready')return;
  // Keep the result after a tab change, so the video is not left without the project the server made; only leaving the video drops it.
  void prepareRecorder(tab==='edit'||!hasPlannedScenes).then(next=>{if(mounted.current){onVideo(next);reloadScenes();}},reason=>{if(mounted.current)setRecorderError(errorMessage(reason,tab==='edit'?"Couldn't open the editor.":"Couldn't open the recorder."));});
 },[tab,video.recorderProjectId,scenesLoaded,hasPlannedScenes,plan.load.status,recorderError,prepareRecorder,onVideo,reloadScenes]);
 useEffect(()=>{setRecorderError('');},[id,tab]);
 const openingError=recorderError||(scenes.state.status==='unknown'?"Couldn't load the scenes.":tab==='record'&&hasPlannedScenes&&plan.load.status==='error'?plan.load.message:'');
 const emptyEdit=tab==='edit'&&editState?.hasMedia===false;
 const facts:TabFacts&LockFacts={stage:video.stage,scenes:list,allRecorded:!emptyEdit&&allRecorded||undefined,exported:!emptyEdit&&exported,hasRecording:!!video.recorderProjectId};

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
 // The scenes' takes change while recording and editing (a take added, pauses cut); the strip and the notice read them again when Record or Edit opens.
 useEffect(()=>{if(tab==='record'||tab==='edit')reloadScenes();},[tab,reloadScenes]);
 // The Board can write the package (Use as hook, Ask Claude): Plan and Publish read it again when they open.
 // Leaving a step saves what is still waiting to be saved there, at once.
 useEffect(()=>()=>{void flushPlan.current().catch(()=>{});},[tab]);
 const refreshPlan=plan.refresh;
 useEffect(()=>{if(tab==='idea'||tab==='publish')void refreshPlan();},[tab,refreshPlan]);

 const waiting=takesWaiting(list);

 // The one Continue rule (rules.ts): it names the next step, says why when it cannot go, and is the primary only once the step is done.
 // Idea's Continue sets up the recording first, so it goes by the plan's own outline and its running jobs.
 let nextButton:(ContinueButton&{run():void})|undefined;
 if(tab==='idea'){
  const planScenes=plan.load.status==='ready'?(plan.outline?.scenes??[]).map(()=>({takes:[]})):undefined;
  const rule=continueFor('idea',{...facts,scenes:planScenes},{busy:plan.busy});
  if(rule)nextButton={...rule,disabled:rule.disabled||startingQuick||!!plan.continueAction?.disabled,run:()=>plan.continueAction?plan.continueAction.run():void recordWithoutPlan()};
 }else{
  // Wait for the recorder before offering Continue.
  const ownPrimary=tab==='record'&&!video.recorderProjectId;
  const rule=continueFor(tab,facts,{ownPrimary});
  if(rule)nextButton={...rule,...(emptyEdit?{disabled:true,primary:false,reason:'Record a scene or import media first'}:{}),disabled:emptyEdit||rule.disabled||moving,run:()=>void continueToNext()};
 }

 // The companion is docked beside every step. On Edit it works through the open editor: it reads the playhead and selection,
 // previews a card on the stage and applies it as one of the editor's undo steps.
 const [boardKey,setBoardKey]=useState(0),[boardSelection,setBoardSelection]=useState<readonly string[]>([]);
 const editorRef=useRef<EditorBridge|null>(null);
 const onEditor=useCallback((bridge:EditorBridge|null)=>{editorRef.current=bridge;if(!bridge)setEditState(null);},[]);
 const companionEditor=useMemo<CompanionEditor|undefined>(()=>tab==='edit'?{get:()=>editorRef.current,state:editState}:undefined,[tab,editState]);
 const refresh=plan.refresh;
 // Idea: the part of "Your video" that is open, which the companion is told about; a card applied there opens the part it changed.
 const [ideaPart,setIdeaPart]=useState<SectionKey|null>(null),[showPart,setShowPart]=useState<{key:SectionKey;n:number}>();
 // Coming back to Idea opens the first unfinished part again, not the last one a card changed.
 useEffect(()=>{if(tab!=='idea')setShowPart(undefined);},[tab]);
 const companionChanged=useCallback((changed:CompanionChanged[],applied?:CompanionAction['type'])=>{
  const part=applied&&PART_OF_CARD[applied];
  if(part)setShowPart(now=>({key:part,n:(now?.n??0)+1}));
  if(changed.includes('package')||changed.includes('outline'))void refresh();
  if(changed.includes('outline')){reloadScenes();clubFetch<Video>(`/videos/${id}`).then(onVideo,()=>{});}
  // An Idea card can set the video's title (the pair in use) or why it could work.
  else if(changed.includes('videos')){clubFetch<Video>(`/videos/${id}`).then(onVideo,()=>{});notifyVideosChanged();}
  if(changed.includes('board'))setBoardKey(key=>key+1);
  if(changed.includes('timeline'))reloadScenes();
 },[refresh,reloadScenes,id,onVideo]);
 const scenesInPlan=plan.outline?.scenes;
 const focusIndex=focusId&&scenesInPlan?scenesInPlan.findIndex(scene=>scene.id===focusId):-1;
 const companionScene=useMemo(()=>(tab==='idea'||tab==='record')&&focusIndex>=0&&scenesInPlan?{id:focusId!,index:focusIndex,title:scenesInPlan[focusIndex].title}:undefined,[tab,focusId,focusIndex,scenesInPlan]);
 const recorded=list&&recordedCount(list);
 const screen=screenSummary(tab,{pkg:plan.pkg,outline:plan.outline,recorded,part:tab==='idea'&&ideaPart?SECTION_NAME[ideaPart]:undefined});


 return <div className="ws">
  <Header video={video} tab={tab} onTitle={saveTitle} onStage={stage=>void moveTo(stage,video.stage)} onDelete={deleteVideo} onHome={()=>void addReviewedTake().then(left=>{if(left)navigate({name:'home'});})}/>
  <div className="ws-row"><div className="ws-col">
  {moveError&&<div className="ws-body" style={{flex:'none',padding:'8px 18px'}}><ErrorLine message={moveError} onRetry={()=>void continueToNext()}/></div>}
  <div className="ws-body" key={tab}>
   {tab==='idea'&&<IdeaPage video={video} plan={plan} known={list} focusId={focusId} boardKey={boardKey} navigate={navigate} onOpen={setIdeaPart} show={showPart} onFocus={setFocusId} onTitle={saveTitle} onVideo={onVideo} onSelection={setBoardSelection} onBoardChanged={()=>setBoardKey(key=>key+1)}
    onTarget={seconds=>{clubFetch<Video>(`/videos/${id}`,{method:'PUT',body:{targetSeconds:seconds>0?seconds:null}}).then(onVideo,reason=>toast(errorMessage(reason,"Couldn't save the target.")));}}
    onRecordScene={sceneId=>{setFocusId(sceneId);setPickN(n=>n+1);navigate(tabRoute('record'));}}/>}
   {/* Floats over the top of the editor, so the editor keeps its full height and the timeline is not cut off. */}
   {tab==='edit'&&waiting.length>0&&<div className="ws-take-notice"><div className="ws-notice" role="status"><span>{waiting.length===1?`The take for “${waiting[0]}” isn't on the timeline yet.`:`${waiting.length} takes aren't on the timeline yet.`}</span><Button size="sm" onClick={()=>navigate(tabRoute('record'))}>Open the take</Button></div></div>}
   {(tab==='record'||tab==='edit')&&(video.recorderProjectId
    ?<div className="rec with-embed">
     <div className="rec-left"><ClubRecorder projectId={video.recorderProjectId} mode={tab==='record'?'Record':'Edit'} onBack={()=>navigate({name:'videos',view:'board'})}
      registerLeaveGuard={registerLeaveGuard} onMode={mode=>{if(mode==='Edit'&&tab==='record')void continueToNext();else navigate(tabRoute(mode==='Edit'?'edit':'record'));}} onProgress={onProgress} onExported={tab==='edit'?onExported:undefined}
      onRestart={plan.continueAction?.run}
      sceneId={recorderSceneFor(video,focusId)??undefined} sceneNonce={pickN} onSceneChange={recorderScene} onChanged={reloadScenes}
      onEditor={tab==='edit'?onEditor:undefined} onEditState={tab==='edit'?setEditState:undefined}/></div>
    </div>
    :<div className="flex flex-1 items-center justify-center" style={{padding:'64px 0'}}>{openingError?<ErrorLine message={openingError} onRetry={()=>{setRecorderError('');reloadScenes();if(plan.load.status==='error')plan.reload();}}/>:<span className="row small muted" role="status"><Spinner label={tab==='edit'?'Opening the editor':'Opening the recorder'} size={20}/>{tab==='edit'?'Opening the editor…':'Opening the recorder…'}</span>}</div>)}
   {tab==='publish'&&scenes.state.status==='loading'&&video.stage!=='published'&&<div className="flex flex-1 items-center justify-center" style={{padding:'64px 0'}}><span className="row small muted" role="status"><Spinner label="Loading the scenes" size={20}/>Loading the scenes…</span></div>}
   {tab==='publish'&&(scenes.state.status!=='loading'||video.stage==='published')&&<Publish onExported={onExported} video={video} pkg={plan.pkg} scenes={list} onVideo={onVideo} onSettings={()=>navigate({name:'settings',section:'publishing'})} onGoTo={target=>navigate(tabRoute(target))}
    writingPackage={plan.packageJob.phase==='starting'||plan.packageJob.phase==='running'} saveError={plan.saveError} onRetry={plan.retrySave} onDescription={description=>plan.editPackage({...(pkgNow.current??EMPTY_PACKAGE),description})}
    onTags={tags=>{plan.editPackage({...(pkgNow.current??EMPTY_PACKAGE),tags});void plan.flush().catch(()=>{});}}/>}
  </div>
  </div>
  <Companion videoId={video.id} selection={tab==='idea'?boardSelection:undefined} videoTitle={video.title} videoWhy={video.idea?.why} part={tab==='idea'&&ideaPart?{key:ideaPart==='sketch'?'onepager':ideaPart,name:SECTION_NAME[ideaPart]}:undefined} boardKey={boardKey} tab={tab} scene={companionScene} screen={screen} pkg={plan.pkg} outline={plan.outline} scenes={list} onChanged={companionChanged} beforeApply={plan.flush} editor={companionEditor} roomy={tab==='record'}/>
  </div>
  <Foot video={video} tab={tab} facts={facts} onTab={target=>void goToTab(target)} next={nextButton}/>
 </div>;
}
