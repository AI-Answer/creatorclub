import {deviceLabel} from './club/recorder/device-label';
import {useEffect,useInsertionEffect,useMemo,useRef,useState,useSyncExternalStore,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import './recording.css';
import {Camera,Mic,Monitor,Square,Pause,Play,Check,Settings2,ChevronDown,AudioLines,LoaderCircle,ArrowRight} from './Icons';
import type {Media,Project,TrackKind,TakeSynchronization} from '../shared/types';
import {api} from './api';
import {TakeReview} from './TakeReview';
import {loadSavedTakes,persistSavedTakes,saveProjectTake,activateSceneTake,type SavedTake,type ConfirmTakeOptions,type TakeConfirmMode} from './recorded-takes';
import {archiveSceneTake,deleteSceneTake,moveSceneTake,updateSceneTake} from './scene-takes';
import {RecordingSceneCards} from './RecordingSceneCards';
import {addRecordingScene,deleteRecordingScene,moveRecordingScene} from './recording-scenes';
import {countdownChime,countdownWithPreRoll,recordingCountdown,waitForCountdown} from './recording-countdown';
import type {RecordingHudCommand} from './desktop';
import type {ShortcutAction} from './shortcuts';
import {defaultRecordingSettings,loadRecordingPreferences,saveRecordingPreferences,saveRecordingPreset,grantedPreviewRequests,type RecordingSettings} from './recording-presets';
import {clampRegion,cropCaptureStream,regionInset,type NormalizedRegion} from './capture-region';
import type {DesktopCaptureSelection} from './desktop';
import {CaptureSourcePicker} from './capture-preview-picker';
import {defaultCaptureSource} from './capture-preview-sources';
import {RecordingClock,RecordingTransitionGate,recordingNow,browserRecordingSelection,nativeRecordingOutputs,nativeRecordingOutputErrors,nativeRecordingNote,recorderMimeType,recorderOptions} from './recording-session';
import {recordingSamples} from './recording-samples';
import {RecordingHudSession} from './recording-hud-session';
import {ACCESS_NOT_GRANTED,CapturePreviewManager,recordingSources,sameDeviceList,type CaptureKind,type CaptureRequest,type PreviewState} from './capture-preview';
import {requestDisplayMedia,requestUserMedia} from './media-access';
import {ScreenPreviewResume,loadScreenSource,saveScreenSource,savedScreenSource,screenCaptureRequest,screenCaptureSize,type SavedScreenSource} from './screen-preview-resume';
import {MeterAudio} from './recording-meter';
import {AudioMeter} from './AudioMeter';
import {MicLevel} from './club/recorder/MicLevel';
import {RecordingSourceHeader} from './RecordingSourceHeader';
import {sceneCardData} from './recording-scene-data';
import {nextSceneToRecord,recorderProblems,sourceChecks,type ProblemAction,type SourceCheck,type SourceSnapshot} from './club/recorder/recorder-checks';
import {useDiskSpace,useMediaAccess} from './club/recorder/RecorderWarnings';
import {RecorderWarnings} from './club/recorder/RecorderWarnings';

type Capture={stream:MediaStream;recorder:MediaRecorder;track:TrackKind;id:string;queue:Promise<void>;index:number;pending:number;startedAtMs:number;sourceTimestampUs?:number;samples:ReturnType<typeof recordingSamples>;label:string;failure?:Error};
type Status='idle'|'starting'|'recording'|'paused'|'saving';
type Selection={camera:boolean;microphone:boolean;screen:boolean;systemAudio:boolean};


/** Stable function identities for a memoized child; each call runs the latest committed render's handler. */
function useStableHandlers<T extends Record<string,((...args:any[])=>any)|undefined>>(handlers:T):T{
 const latest=useRef(handlers),cache=useRef<Record<string,(...args:any[])=>any>>({});useInsertionEffect(()=>{latest.current=handlers;});
 const out:Record<string,unknown>={};for(const key of Object.keys(handlers))if(handlers[key])out[key]=cache.current[key]??=(...args:any[])=>latest.current[key]!(...args);
 return out as T;
}
function SourceSwitch({label,value,disabled,onChange}:{label:string;value:boolean;disabled:boolean;onChange:(value:boolean)=>void}){
 return <button type="button" className="capture-switch" role="switch" aria-label={label} aria-checked={value} disabled={disabled} onClick={()=>onChange(!value)}><span/></button>;
}
export function VideoPreview({source,label,mirror=false,compact=false,permissionMissing=false,onAllow,onEnable,onStalled,onReady,frameRef,hasFrame=false,viewBox,captureSize}:{source:PreviewState;label:string;mirror?:boolean;compact?:boolean;permissionMissing?:boolean;onAllow?:()=>void;onEnable:()=>void;onStalled?:(stalled:boolean)=>void;onReady?:(ready:boolean)=>void;frameRef?:RefObject<HTMLImageElement|null>;hasFrame?:boolean;viewBox?:string;captureSize?:{width:number;height:number}|null}){
 const video=useRef<HTMLVideoElement>(null);const [resolution,setResolution]=useState('');const badge=resolution&&captureSize?`${captureSize.width} × ${captureSize.height}`:resolution;
 useEffect(()=>{const el=video.current;if(!el)return;el.srcObject=source.stream;setResolution('');if(source.stream)void el.play().catch(()=>{});return()=>{el.srcObject=null;};},[source.stream]);
 const loading=source.status==='loading',receiving=Boolean(resolution)||hasFrame;const [stalled,setStalled]=useState(false);
 // A stream can open while macOS withholds frames (e.g. camera access not granted); only real frames count as live.
 useEffect(()=>{setStalled(false);if(!source.stream||receiving)return;const timer=setTimeout(()=>setStalled(true),4000);return()=>clearTimeout(timer);},[source.stream,receiving]);
 useEffect(()=>{onStalled?.(stalled&&!receiving);},[stalled,receiving,onStalled]);
 useEffect(()=>{onReady?.(receiving);},[receiving,onReady]);
 return <div style={captureSize?{aspectRatio:`${captureSize.width}/${captureSize.height}`} : resolution?{aspectRatio:resolution.replace(" × ","/")}:undefined} className={`capture-video ${receiving?'has-stream':''}`}>
  <video aria-label={`${label} live preview`} ref={video} muted playsInline autoPlay style={{transform:mirror?'scaleX(-1)':undefined,objectViewBox:viewBox}} onLoadedMetadata={e=>{const v=e.currentTarget;if(v.videoWidth>0)setResolution(`${v.videoWidth} × ${v.videoHeight}`);}} onResize={e=>{const v=e.currentTarget;if(v.videoWidth>0)setResolution(`${v.videoWidth} × ${v.videoHeight}`);}}/>
  {frameRef&&<img ref={frameRef} className="capture-native-frame" hidden={!hasFrame} alt={`${label} native recording preview`}/>}
  {!receiving&&!hasFrame&&<div className={`capture-preview-empty${compact?' compact':''}`}>
   {permissionMissing?<><Camera size={compact?18:25}/><button className="button compact" onClick={onAllow??onEnable}>{label==='Camera'?'Allow camera access':'Allow screen recording'}</button></>
    :loading||source.stream&&!stalled?<><LoaderCircle className="spin" size={compact?18:22}/><span>{label==='Camera'?'Starting the camera…':`Starting the ${label.toLowerCase()} preview…`}</span></>
    :<>{label==='Camera'?<Camera size={compact?18:25}/>:<Monitor size={compact?18:25}/>}<span>{source.error||(stalled?`No picture is coming from the ${label.toLowerCase()}.`:label==='Camera'?'Preview is off. Your camera will be included when you record.':`${label} preview is off`)}</span><button className="button compact" onClick={onEnable}>{source.error||stalled?'Try again':label==='Camera'?'Start preview':'Choose a source'}</button></>}
  </div>}
  {receiving&&!compact&&badge&&<span className="capture-resolution">{badge}</span>}
 </div>;
}
/** Scenes with a take on the timeline, out of all scenes. Creator Compiler uses it to make `Continue to editing` the primary once every scene is recorded. */
export type RecordingProgress={recorded:number;total:number};
/**
 * SceneForge's Record screen. Inside Creator Compiler (`club`) it is one calm column: a readiness line (or the warnings card) with a Change sheet
 * that holds the source rows, presets and the countdown option, one big Record button for the selected scene, compact scene cards, the
 * three-choice take preview, a move to the next scene to record after Continue, and progress through `onProgress`. The caller leaves out
 * `onEdit` to hide the `Edit & export` banner; the club's cards have no per-scene quick actions. Recording itself is the same in both.
 */
export function Recording({project,change,commit,onRecorded,onError,onImport,onSetup,onEdit,onAutoCut,onVisualize,club=false,onProgress,selectSceneId,selectNonce,onSceneChange,registerLeaveGuard}:{project:Project;change:(fn:(p:Project)=>void,opts?:{coalesce?:string})=>void;commit?:(fn:(p:Project)=>void)=>Promise<void>;onRecorded:(media:Media[],tracks:TrackKind[],offsets?:number[],options?:ConfirmTakeOptions)=>string|void|Promise<string|void>;onError:(error:string)=>void;onImport?:(sceneId?:string)=>void;onSetup?:()=>void;onEdit?:()=>void;onAutoCut?:(sceneId:string)=>void|Promise<void>;onVisualize?:(sceneId:string)=>void|Promise<void>;club?:boolean;onProgress?:(progress:RecordingProgress)=>void;/** The scene to select, chosen outside the recorder (the club's scene strip). Ignored while a take is being recorded. */selectSceneId?:string;selectNonce?:number;/** Told whenever the selected scene changes, so the club can follow it. */onSceneChange?:(sceneId:string)=>void;registerLeaveGuard?:(guard:(()=>Promise<boolean>)|null)=>void}){
 const [recordSceneId,setRecordSceneId]=useState(project.scenes[0]?.id||''),[savedTakes,setSavedTakes]=useState(()=>loadSavedTakes(project.id)),[reviewId,setReviewId]=useState<string|null>(()=>[...loadSavedTakes(project.id),...(project.recordedTakes||[])].reverse().find(t=>!t.retained&&!t.confirmedAt)?.id||null);
 const [confirming,setConfirming]=useState(false),confirmingRef=useRef(false);
 const [countdown,setCountdown]=useState<number|null>(null),[countdownEnabled,setCountdownEnabled]=useState(()=>{try{return localStorage.getItem('sceneforge.recording-countdown')!=='false';}catch{return true;}});
 const countdownAbort=useRef<AbortController|null>(null),captureScene=useRef(recordSceneId),reviewRef=useRef(reviewId);reviewRef.current=reviewId;
 const allTakes=useMemo(()=>Array.from(new Map([...savedTakes,...(project.recordedTakes||[])].map(take=>[take.id,take])).values()),[savedTakes,project.recordedTakes]);
 const reviewTake=allTakes.find(take=>take.id===reviewId),captureTakeMode=useRef<TakeConfirmMode>('replace-matching');
 const applyChange=async(fn:(p:Project)=>void)=>{if(commit)await commit(fn);else change(fn);};
 useEffect(()=>{if(!project.scenes.some(scene=>scene.id===recordSceneId))setRecordSceneId(project.scenes[0]?.id||'');},[project.scenes,recordSceneId]);
 // With native capture the browser screen stream is only a preview: a region is cropped by CSS object-view-box, not per frame. An invalid region still fails closed.
 const nativeRecording=Boolean(window.sceneForge?.startNativeRecording);
 const [manager]=useState(()=>new CapturePreviewManager({getUserMedia:constraints=>requestUserMedia(constraints??{}),getDisplayMedia:constraints=>requestDisplayMedia(constraints??{})},(raw,options,signal)=>nativeRecording?Promise.resolve().then(()=>{clampRegion(options.crop!);return {stream:raw,dispose:()=>{}};}):cropCaptureStream(raw,options.crop!,options.frameRate||30,signal)));
 const previews=useSyncExternalStore(manager.subscribe,manager.getSnapshot);
 const [preferences,setPreferences]=useState(loadRecordingPreferences);
 const [savedSource,setSavedSource]=useState(loadScreenSource),savedSourceRef=useRef(savedSource);savedSourceRef.current=savedSource;
 const screenResume=useRef(new ScreenPreviewResume()),sourcePickerRef=useRef(false);
 const initial=preferences.current;
 const [selection,setSelection]=useState<Selection>(initial.selection),[status,setStatus]=useState<Status>('idle'),[elapsed,setElapsed]=useState(0),[devices,setDevices]=useState<MediaDeviceInfo[]>([]);
 const [cameraId,setCameraId]=useState(initial.cameraId),[microphoneId,setMicrophoneId]=useState(initial.microphoneId),[cameraResolution,setCameraResolution]=useState(initial.cameraResolution),[cameraFps,setCameraFps]=useState(initial.cameraFps),[screenFps,setScreenFps]=useState(initial.screenFps),[mirror,setMirror]=useState(initial.mirror),[echoCancellation,setEchoCancellation]=useState(initial.echoCancellation),[noiseSuppression,setNoiseSuppression]=useState(initial.noiseSuppression),[settings,setSettings]=useState<CaptureKind|'systemAudio'|null>(null);
 const captures=useRef<Capture[]>([]),timer=useRef<ReturnType<typeof setInterval>|null>(null),ended=useRef(false),recordingClock=useRef(new RecordingClock()),transitionGate=useRef(new RecordingTransitionGate()),mounted=useRef(true),statusRef=useRef<Status>('idle'),hudFailure=useRef(''),stopRef=useRef<()=>Promise<void>>(async()=>{});
 const hudSession=useRef<RecordingHudSession|null>(null);
 const {onLevel:publishMicrophoneLevel}=useStableHandlers({onLevel:(level:number|null)=>{if(hudSession.current)void hudSession.current.update({microphoneLevel:level});}});
 const takeStartedAtMs=useRef(0),takeKeepFromMs=useRef<number|undefined>(undefined);
 const nativeSession=useRef<{id:string;recordVideo:boolean;systemAudio:boolean}|null>(null),nativeSkew=useRef(0);
 const [,setNativeReady]=useState(false),[hasNativeFrame,setHasNativeFrame]=useState(false),[transitionBusy,setTransitionBusy]=useState(false),[captureNotice,setCaptureNotice]=useState('');
 const nativeFrame=useRef<HTMLImageElement>(null),[visible,setVisible]=useState(true),visibleRef=useRef(true),[meterAudio]=useState(()=>new MeterAudio());
 const clearNativeFrame=()=>{nativeFrame.current?.removeAttribute('src');setHasNativeFrame(false);};
 const [captureMode,setCaptureMode]=useState(initial.captureMode),[region,setRegion]=useState<NormalizedRegion|null>(initial.region),[sourcePicker,setSourcePicker]=useState(false),[sourceBusy,setSourceBusy]=useState(false),[sourceError,setSourceError]=useState(''),[sourceInfo,setSourceInfo]=useState<SavedScreenSource|null>(savedSource);
 const chosenSource=useRef<DesktopCaptureSelection|null>(null),choiceGeneration=useRef(0),pickerAudio=useRef(initial.selection.systemAudio);
 const current:RecordingSettings={captureMode,region,selection,cameraId,microphoneId,cameraResolution,cameraFps,screenFps,mirror,echoCancellation,noiseSuppression};
 const currentRef=useRef(current);currentRef.current=current;
 const [presetOpen,setPresetOpen]=useState(false),[presetName,setPresetName]=useState(''),[presetError,setPresetError]=useState(''),[presetHost,setPresetHost]=useState<HTMLElement|null>(null);
 const presetRoot=useRef<HTMLDivElement>(null),restoreGeneration=useRef(0);
 // Recording presets sit at the left of the header, as in Borumi: SceneForge's slot, or the club video header's left slot.
 useEffect(()=>{setPresetHost(document.getElementById(club?'ws-top-left':'recording-presets-slot'));},[club]);
 useEffect(()=>{try{saveRecordingPreferences({...preferences,current});}catch{setPresetError('Recording settings could not be saved in this profile. Check local storage availability.');}},[selection,cameraId,microphoneId,cameraResolution,cameraFps,screenFps,mirror,echoCancellation,noiseSuppression,captureMode,region,preferences]);
 useEffect(()=>{if(!presetOpen)return;const close=(e:PointerEvent)=>{if(!presetRoot.current?.contains(e.target as Node))setPresetOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setPresetOpen(false);}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[presetOpen]);
 const active=status!=='idle';
 const transition=(next:Status)=>{statusRef.current=next;if(mounted.current)setStatus(next);};
 const report=(message:string)=>{if(mounted.current)onError(message);};
 const [cameraExpanded,setCameraExpanded]=useState(false);
 useEffect(()=>{if(!cameraExpanded)return;const close=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;event.preventDefault();event.stopPropagation();setCameraExpanded(false);};window.addEventListener('keydown',close,true);return()=>window.removeEventListener('keydown',close,true);},[cameraExpanded]);
 const [cameraStalled,setCameraStalled]=useState(false),[cameraReceiving,setCameraReceiving]=useState(false),[screenReceiving,setScreenReceiving]=useState(false);
 // Plain-language notes about a saved take (stutter, early stop), shown in its review instead of an alert.
 const [takeNotes,setTakeNotes]=useState<Record<string,string>>({});
 const updateClock=()=>{if(mounted.current)setElapsed(Math.floor(recordingClock.current.elapsed(Date.now())));};
 const closeHud=()=>{const currentHud=hudSession.current;hudSession.current=null;return currentHud?.stop()??Promise.resolve();};
 /** Opens at countdown start in 'starting', hiding the editor then, as Borumi does; the countdown shows in the island. The HUD shows its own live camera.
  * A failure during 'starting' is held until recording begins, and dropped if the start is cancelled. */
 const openHud=(countdown:number|null)=>{
  const bridge=window.sceneForge;if(!bridge?.beginRecordingHud||!bridge.updateRecordingHud||!bridge.endRecordingHud)return;
  let id:string|undefined;let reported=false;
  const warn=(error:unknown)=>{if(reported||!mounted.current||(hudSession.current!==session&&!id))return;reported=true;const text=`Floating controls are unavailable: ${(error as Error).message}. The take is still recording; use this window to stop.`;if(statusRef.current==='starting')hudFailure.current=text;else setCaptureNotice(text);};
  const snapshot=manager.getSnapshot();
  const session=new RecordingHudSession({begin:async()=>{const opened=await bridge.beginRecordingHud!({appearance:document.documentElement.dataset.theme==='dark'?'dark':'light',projectName:project.name,script:(project.scenes.find(scene=>scene.id===captureScene.current)?.script||'').slice(0,100000),cameraEnabled:selection.camera,cameraLabel:snapshot.camera.stream?.getVideoTracks()[0]?.label||'',microphoneLabel:selection.microphone?snapshot.microphone.stream?.getAudioTracks()[0]?.label||'Microphone':'',systemAudioLabel:selection.systemAudio?chosenSource.current?.label||'System sound':'',mirror,hideMain:true,status:'starting',elapsed:0,countdown});id=opened.id;if(!opened.visible)throw new Error('The preview window did not open');},update:patch=>bridge.updateRecordingHud!(patch,id),end:()=>bridge.endRecordingHud!(id)},warn);
  hudSession.current=session;void session.start();
 };
 useEffect(()=>{void hudSession.current?.update({status,elapsed});},[status,elapsed]);
 const storeTakes=(next:SavedTake[])=>{setSavedTakes(next);try{persistSavedTakes(project.id,next);}catch{setCaptureNotice('This take is saved, but the review list could not be persisted in this profile. Confirm it before closing the project.');}};
 const runTakeAction=async(action:()=>Promise<void>)=>{if(confirmingRef.current)return;confirmingRef.current=true;setConfirming(true);try{await action();}catch(error){report((error as Error).message);}finally{confirmingRef.current=false;if(mounted.current)setConfirming(false);}};
 const closeReview=()=>{reviewRef.current=null;setReviewId(null);};
 const confirmReview=async(destination:'record'|'edit',mode:TakeConfirmMode=reviewTake?.recordOver?'record-over':'replace-matching')=>runTakeAction(async()=>{
  if(!reviewTake)return;const take={...reviewTake,clipIds:reviewTake.clipIds||reviewTake.media.map(()=>crypto.randomUUID())};
  // stop() normally saved the take already, and the project's copy is the one under review; save only a recovered local take.
  if(!project.recordedTakes?.some(value=>value.id===take.id))await applyChange(draft=>saveProjectTake(draft,take));
  const next=await onRecorded(take.media,take.tracks,take.offsets,{destination,sceneId:take.sceneId,clipIds:take.clipIds,takeId:take.id,mode});
  storeTakes(savedTakes.filter(value=>value.id!==take.id));closeReview();if(next)setRecordSceneId(next);
 });
 const keepReview=async()=>runTakeAction(async()=>{if(reviewTake){const take={...reviewTake,retained:true};storeTakes([...savedTakes.filter(value=>value.id!==take.id),take]);await applyChange(draft=>{const saved=saveProjectTake(draft,take);saved.retained=true;});storeTakes(savedTakes.filter(value=>value.id!==take.id));}closeReview();});
 const retake=async()=>{if(!reviewTake||confirmingRef.current)return;const sceneId=reviewTake.sceneId,mode:TakeConfirmMode=reviewTake.recordOver?'record-over':'replace-matching';await keepReview();if(!reviewRef.current){setRecordSceneId(sceneId);void start(sceneId,mode);}};
 const takeAction=async(id:string,kind:'archive'|'delete'|'activate')=>runTakeAction(async()=>{const take=allTakes.find(value=>value.id===id);if(!take)return;await applyChange(draft=>{saveProjectTake(draft,take);if(kind==='archive')archiveSceneTake(draft,id);else if(kind==='delete')deleteSceneTake(draft,id);else activateSceneTake(draft,take.sceneId,id,'keep-both');});storeTakes(savedTakes.filter(value=>value.id!==id));if(reviewId===id)closeReview();});
 const updateTake=async(take:SavedTake)=>{await applyChange(draft=>{if(!draft.recordedTakes?.some(value=>value.id===take.id))saveProjectTake(draft,take);updateSceneTake(draft,take.id,{name:take.name,offsets:take.offsets});});storeTakes(savedTakes.filter(value=>value.id!==take.id));};
 // Creator Compiler: which scenes have a take on the timeline, to pick the next scene to record and to report progress.
 const recordedScenes=useMemo(()=>{if(!club)return null;const cards=sceneCardData({clips:project.clips,media:project.media,scenes:project.scenes},allTakes);return new Set(project.scenes.filter(scene=>{const card=cards.get(scene.id);return Boolean(card&&(card.all.some(take=>take.active)||card.legacyFootage));}).map(scene=>scene.id));},[club,project.clips,project.media,project.scenes,allTakes]);
 useEffect(()=>{if(recordedScenes)onProgress?.({recorded:recordedScenes.size,total:project.scenes.length});},[recordedScenes,project.scenes.length,onProgress]);
 // Opening Record selects the first scene still to record.
 useEffect(()=>{const first=recordedScenes&&project.scenes.find(scene=>!recordedScenes.has(scene.id));if(first)setRecordSceneId(first.id);},[]);
 // The club selects the scene to record: the one the page opened on (a scene chosen in Plan), then each pick in the scene strip (a new `selectNonce`).
 // The scene this recorder reports back through `onSceneChange` is not a pick; following it made the recorder and the strip chase each other.
 // A pick made during a recording waits for the recording to end.
 const pickedNonce=useRef(selectNonce);
 const pickable=(id?:string)=>Boolean(id&&project.scenes.some(scene=>scene.id===id));
 // Only a scene that was picked (Plan's Record this scene, a chip) wins over the first scene still to record; the scene last reported back does not.
 useEffect(()=>{if(selectNonce&&pickable(selectSceneId))setRecordSceneId(selectSceneId!);},[]);
 useEffect(()=>{if(selectNonce===pickedNonce.current||status!=='idle')return;pickedNonce.current=selectNonce;if(pickable(selectSceneId))setRecordSceneId(selectSceneId!);},[selectNonce,status]);
 useEffect(()=>{if(recordSceneId)onSceneChange?.(recordSceneId);},[recordSceneId]);
 /** The take preview's Continue: keep or confirm the take exactly as before, then select the next scene still to record. */
 const continueReview=async(confirmed:boolean)=>{
  const sceneId=reviewTake?.sceneId;if(!sceneId)return;
  if(confirmed)await keepReview();else await confirmReview('record');
  if(reviewRef.current||!mounted.current)return;
  const next=nextSceneToRecord(project.scenes.map(scene=>scene.id),id=>id===sceneId||Boolean(recordedScenes?.has(id)),sceneId);
  if(next)setRecordSceneId(next);
 };
 // Leaving for Edit adds a take still under review to the timeline first, the same as the preview's Continue; a take already on it just stays.
 const leaveRef=useRef<()=>Promise<boolean>>(async()=>true);
 leaveRef.current=async()=>{
  if(!reviewTake||project.clips.some(clip=>clip.recordingTakeId===reviewTake.id||reviewTake.clipIds?.includes(clip.id)))return true;
  await confirmReview('record');
  return !reviewRef.current;
 };
 useEffect(()=>{if(!registerLeaveGuard)return;registerLeaveGuard(()=>leaveRef.current());return()=>registerLeaveGuard(null);},[registerLeaveGuard]);
 const cancelStart=()=>countdownAbort.current?.abort();
 // Start now: the countdown ends at once and recording begins.
 const countdownSkip=useRef<(()=>void)|null>(null);
 const skipCountdown=()=>countdownSkip.current?.();
 useEffect(()=>{try{localStorage.setItem('sceneforge.recording-countdown',String(countdownEnabled));}catch{}},[countdownEnabled]);
 const refreshDevices=()=>navigator.mediaDevices?.enumerateDevices().then(list=>{if(mounted.current)setDevices(old=>sameDeviceList(old,list)?old:list);}).catch(()=>{});
 const nativeCapture=Boolean(window.sceneForge?.listCaptureSources&&window.sceneForge?.chooseCaptureSource);
 const rememberSource=(selection:DesktopCaptureSelection|null)=>{const value=savedScreenSource(selection);savedSourceRef.current=value;setSavedSource(old=>JSON.stringify(old)===JSON.stringify(value)?old:value);saveScreenSource(value);};
 const cancelChoice=()=>{defaultScreenPending.current=null;screenResume.current.cancel();++choiceGeneration.current;sourcePickerRef.current=false;setSourceBusy(false);setSourcePicker(false);void window.sceneForge?.cancelCaptureSelection?.().catch(()=>{});};
 const openPicker=(systemAudio=currentRef.current.selection.systemAudio)=>{defaultScreenPending.current=null;screenResume.current.cancel();++choiceGeneration.current;sourcePickerRef.current=true;pickerAudio.current=systemAudio;setSourceBusy(false);setSourcePicker(true);setSourceError('');};
 const captureSelected=async(sourceId:string,override:Partial<CaptureRequest>={},mode=currentRef.current.captureMode)=>{
  if(statusRef.current!=='idle'&&statusRef.current!=='starting')return null;
  screenResume.current.cancel();const ticket=++choiceGeneration.current;setSourceBusy(true);setSourceError('');manager.stop('screen');
  try{const c=currentRef.current;const selected=await window.sceneForge!.chooseCaptureSource!({sourceId,mode,initialRegion:c.region??undefined});
   if(!selected)return null;
   if(!mounted.current||ticket!==choiceGeneration.current){await window.sceneForge?.cancelCaptureSelection?.(selected.token);return null;}
   if(mode==='region'&&!selected.crop?.normalized)throw new Error('No capture region was selected. Full-screen capture was not started.');
   chosenSource.current=selected;currentRef.current={...currentRef.current,captureMode:mode};setCaptureMode(mode);rememberSource(selected);setSourceInfo(selected);setRegion(selected.crop?.normalized??c.region);sourcePickerRef.current=false;setSourcePicker(false);
   const stream=await manager.acquire(screenCaptureRequest(selected,override.frameRate??c.screenFps,override.systemAudio??pickerAudio.current,nativeRecording));if(!stream)await window.sceneForge?.cancelCaptureSelection?.(selected.token);return stream;
  }catch(error){if(mounted.current&&ticket===choiceGeneration.current){setSourceError((error as Error).message);report((error as Error).message);}return null;
  }finally{if(mounted.current&&ticket===choiceGeneration.current)setSourceBusy(false);}
 };
 const resumeScreen=(override:Partial<CaptureRequest>={},automatic=false):Promise<MediaStream|null>=>{
  const bridge=window.sceneForge,source=savedSourceRef.current,c=currentRef.current,ticket=choiceGeneration.current;
  if(!source||source.kind!==c.captureMode||!bridge?.restoreCaptureSource||!bridge.getMediaPermissions)return Promise.resolve(null);
  const current=()=>mounted.current&&ticket===choiceGeneration.current&&!sourcePickerRef.current&&!reviewRef.current&&(automatic?statusRef.current==='idle'&&currentRef.current.selection.screen:['idle','starting'].includes(statusRef.current))&&savedSourceRef.current?.sourceId===source.sourceId;
  if(!current())return Promise.resolve(null);
  const options=screenCaptureRequest(source,override.frameRate??c.screenFps,override.systemAudio??c.selection.systemAudio,nativeRecording),state=manager.getSnapshot().screen;
  if(state.status==='live'&&state.key===JSON.stringify(options))return manager.acquire(options);
  return screenResume.current.resume(source,options,{getMediaPermissions:()=>bridge.getMediaPermissions!(),restoreCaptureSource:value=>bridge.restoreCaptureSource!(value),cancelCaptureSelection:token=>bridge.cancelCaptureSelection?.(token)??Promise.resolve()},manager,current,selected=>{chosenSource.current=selected;rememberSource(selected);setSourceInfo(selected);setSourceError('');},message=>setSourceError(message));
 };
 // Coalesce mount, focus, permission and toggle triggers. Default selection never requests thumbnails or records media.
 const defaultScreenPending=useRef<Promise<MediaStream|null>|null>(null);
 const ensureScreen=(override:Partial<CaptureRequest>={},automatic=false):Promise<MediaStream|null>=>{
  if(defaultScreenPending.current)return defaultScreenPending.current;
  const ticket=choiceGeneration.current,bridge=window.sceneForge;
  const current=()=>mounted.current&&ticket===choiceGeneration.current&&!sourcePickerRef.current&&!reviewRef.current&&['idle','starting'].includes(statusRef.current)&&(!automatic||currentRef.current.selection.screen);
  const work=async()=>{
   if(!bridge?.getMediaPermissions||!current())return null;
   if((await bridge.getMediaPermissions()).screen!=='granted'||!current())return null;
   const c=currentRef.current;
   if(savedSourceRef.current?.kind===c.captureMode&&bridge.restoreCaptureSource)return resumeScreen(override,automatic);
   if(c.captureMode!=='display')return null;
   const list=await bridge.listCaptureSources!();if(!current())return null;
   const source=defaultCaptureSource(list.sources);if(!source){setSourceError('No display is available. Connect a display and try again.');return null;}
   pickerAudio.current=override.systemAudio??c.selection.systemAudio;return captureSelected(source.id,override,'display');
  };
  const pending=work().catch(error=>{if(current())setSourceError((error as Error).message);return null;}).finally(()=>{if(defaultScreenPending.current===pending)defaultScreenPending.current=null;});defaultScreenPending.current=pending;return pending;
 };
 const request=(kind:CaptureKind,override:Partial<CaptureRequest>={}):Promise<MediaStream|null>=>{const c=currentRef.current,[width,height]=c.cameraResolution.split('x').map(Number);const options:CaptureRequest={kind,...(kind==='camera'?{deviceId:c.cameraId,width,height,frameRate:c.cameraFps}:kind==='microphone'?{deviceId:c.microphoneId,echoCancellation:c.echoCancellation,noiseSuppression:c.noiseSuppression}:{frameRate:c.screenFps,systemAudio:c.selection.systemAudio}),...override};
  if(kind==='screen'&&nativeCapture){if(c.captureMode==='display'||savedSourceRef.current?.kind===c.captureMode)return ensureScreen(override);const selected=chosenSource.current;if(selected){pickerAudio.current=options.systemAudio??false;return captureSelected(selected.sourceId,override);}openPicker(options.systemAudio);return Promise.resolve(null);}
  if(kind==='screen'&&c.captureMode!=='display'){setSourceError('Exact window and region selection requires the current Creator Compiler desktop app. No capture was started.');openPicker(options.systemAudio);return Promise.resolve(null);}
  return manager.acquire(options).then(stream=>{void refreshDevices();return stream;});
 };
 const chooseScreen=(systemAudio=currentRef.current.selection.systemAudio,activateScreen=true)=>{setSelection(s=>({...s,screen:activateScreen?true:s.screen,systemAudio}));if(nativeCapture)openPicker(systemAudio);else void request('screen',{systemAudio});};
 const toggleSource=(kind:CaptureKind,value:boolean)=>{if(kind==='screen'&&!value){defaultScreenPending.current=null;screenResume.current.cancel();++choiceGeneration.current;}setSelection(s=>({...s,[kind]:value}));if(value)void request(kind);else if(kind!=='screen'||!currentRef.current.selection.systemAudio){manager.stop(kind);if(kind==='screen')cancelChoice();}};
 const toggleSystemAudio=(value:boolean)=>{setSelection(s=>({...s,systemAudio:value}));if(value)chooseScreen(true,false);else if(currentRef.current.selection.screen)manager.stopScreenAudio();else{manager.stop('screen');cancelChoice();}};
 const changeCaptureMode=(mode:RecordingSettings['captureMode'])=>{if(mode===currentRef.current.captureMode)return;defaultScreenPending.current=null;screenResume.current.cancel();rememberSource(null);++choiceGeneration.current;setSourceBusy(false);void window.sceneForge?.cancelCaptureSelection?.().catch(()=>{});currentRef.current={...currentRef.current,captureMode:mode};setCaptureMode(mode);chosenSource.current=null;setSourceInfo(null);manager.stop('screen');setSourceError('');if(mode==='display')void ensureScreen();else openPicker();};
 const openGranted=async()=>{const generation=restoreGeneration.current;let granted:{camera?:boolean;microphone?:boolean}={};try{if(window.sceneForge?.getMediaPermissions){const p=await window.sceneForge.getMediaPermissions();granted={camera:p.camera==='granted',microphone:p.microphone==='granted'};}else if(navigator.permissions){const values=await Promise.all(['camera','microphone'].map(async name=>{try{return(await navigator.permissions.query({name:name as PermissionName})).state==='granted';}catch{return false;}}));granted={camera:values[0],microphone:values[1]};}}catch{/* Explicit preview controls remain available. */}if(!mounted.current||generation!==restoreGeneration.current||statusRef.current!=='idle'||reviewRef.current)return;for(const options of grantedPreviewRequests(currentRef.current,granted))if(!['live','loading'].includes(manager.getSnapshot()[options.kind].status))void request(options.kind);void ensureScreen({},true);};
 const applySettings=(next:RecordingSettings,id:string|null)=>{if(statusRef.current!=='idle')return;++restoreGeneration.current;cancelChoice();const saved=savedSourceRef.current,compatible=saved?.kind===next.captureMode&&(saved.kind!=='region'||JSON.stringify(saved.crop?.normalized)===JSON.stringify(next.region));if(!compatible){rememberSource(null);setSourceInfo(null);}chosenSource.current=null;manager.stopAll();currentRef.current=structuredClone(next);setCaptureMode(next.captureMode);setRegion(next.region);setSelection(next.selection);setCameraId(next.cameraId);setMicrophoneId(next.microphoneId);setCameraResolution(next.cameraResolution);setCameraFps(next.cameraFps);setScreenFps(next.screenFps);setMirror(next.mirror);setEchoCancellation(next.echoCancellation);setNoiseSuppression(next.noiseSuppression);setPreferences(p=>({...p,activeId:id,current:next}));setPresetOpen(false);setPresetError('');void openGranted();};
 const savePreset=(rename=false)=>{try{const activePreset=preferences.presets.find(p=>p.id===preferences.activeId);if(rename&&!activePreset)return;const id=rename?activePreset!.id:crypto.randomUUID();const presets=saveRecordingPreset(preferences.presets,presetName,rename?activePreset!.settings:current,id);setPreferences(p=>({...p,presets,activeId:id}));setPresetName('');setPresetError('');}catch(error){setPresetError((error as Error).message);}};
 useEffect(()=>{
  mounted.current=true;void refreshDevices();
  window.addEventListener('sceneforge-media-permissions',openGranted);window.addEventListener('focus',openGranted);
  void window.sceneForge?.getNativeRecordingStatus?.().then(value=>{if(mounted.current)setNativeReady(value.available&&value.excludesSceneForge);}).catch(()=>{});
  const update=()=>void refreshDevices();navigator.mediaDevices?.addEventListener?.('devicechange',update);
  return()=>{screenResume.current.cancel();++restoreGeneration.current;++choiceGeneration.current;void window.sceneForge?.cancelCaptureSelection?.().catch(()=>{});mounted.current=false;countdownAbort.current?.abort();void closeHud();window.removeEventListener('sceneforge-media-permissions',openGranted);window.removeEventListener('focus',openGranted);navigator.mediaDevices?.removeEventListener?.('devicechange',update);if(timer.current)clearInterval(timer.current);captures.current.forEach(c=>{if(c.recorder.state!=='inactive')c.recorder.stop();c.samples.close();});if(nativeSession.current)void window.sceneForge?.stopNativeRecording?.(nativeSession.current.id).catch(()=>{});manager.stopAll();};
 },[manager]);
 useEffect(()=>{if(status==='idle'&&!reviewId)void openGranted();},[status,reviewId]);
 useEffect(()=>{if(status==='idle'&&!reviewId&&!sourcePicker&&selection.screen&&['off','ended'].includes(previews.screen.status))void ensureScreen({},true);},[status,reviewId,sourcePicker,selection.screen,previews.screen.status,savedSource]);
 // Sources the creator already allowed start their preview on their own; a missing grant still waits for a click,
 // so opening Record never raises a macOS prompt by itself.
 useEffect(()=>{if(status!=='idle'||reviewId)return;const kinds=(['camera','microphone'] as const).filter(kind=>selection[kind]&&previews[kind].status==='off');if(!kinds.length)return;let cancelled=false;
  void window.sceneForge?.getMediaPermissions?.().then(access=>{if(!cancelled)for(const kind of kinds)if(access[kind]==='granted')void request(kind);},()=>{});
  return()=>{cancelled=true;};},[status,reviewId,selection.camera,selection.microphone,previews.camera.status,previews.microphone.status]);
 useEffect(()=>{if(!['recording','paused'].includes(statusRef.current))return;const browserSelection=browserRecordingSelection(selection,Boolean(nativeSession.current));if((['camera','microphone','screen'] as const).some(kind=>(browserSelection[kind]||(kind==='screen'&&browserSelection.systemAudio))&&previews[kind].status==='ended'))void stopRef.current();if(browserSelection.systemAudio&&!previews.screen.stream?.getAudioTracks().some(t=>t.readyState==='live'))void stopRef.current();},[previews,selection]);
 // Frames go straight to the <img>, so they never re-render this tree, and are skipped while the editor is hidden.
 useEffect(()=>window.sceneForge?.onNativeRecordingEvent?.(event=>{if(event.id!==nativeSession.current?.id)return;if(event.type==='preview'&&event.image){if(!visibleRef.current)return;if(nativeFrame.current)nativeFrame.current.src=event.image;setHasNativeFrame(true);}else if(event.type==='error'){report(event.message||'Native recording stopped unexpectedly.');void stopRef.current();}else if(event.type==='stopped'){if(statusRef.current==='starting')report('macOS stopped the screen capture before recording began. Press Record to try again.');void stopRef.current();}}),[]);
 useEffect(()=>window.sceneForge?.onMainWindowVisibility?.(value=>{visibleRef.current=value;setVisible(value);}),[]);
 useEffect(()=>{meterAudio.setActive(visible||active);const root=document.documentElement;root.toggleAttribute('data-main-hidden',!visible);return()=>root.removeAttribute('data-main-hidden');},[visible,active,meterAudio]);
 async function start(sceneOverride=recordSceneId,takeMode:TakeConfirmMode='replace-matching'){
  if(statusRef.current!=='idle'||reviewRef.current||document.querySelector('[data-capture-setup]'))return;
  if(!selection.screen&&!selection.camera&&!selection.microphone&&!selection.systemAudio){report('Choose at least one recording source.');return;}
  const bridge=window.sceneForge,wantsNative=Boolean((selection.screen||selection.systemAudio)&&bridge?.startNativeRecording);
  if(wantsNative&&!chosenSource.current){await ensureScreen();if(!mounted.current||statusRef.current!=='idle'||reviewRef.current||document.querySelector('[data-capture-setup]'))return;if(!chosenSource.current){openPicker(selection.systemAudio);setCaptureNotice('Choose a display, window, or region, then press Record when you’re ready.');return;}}
  if(selection.camera&&cameraStalled){report('Your camera is not sending a picture. Turn Camera off, choose another camera, or allow camera access in System Settings → Privacy & Security → Camera.');return;}
  if(!project.scenes.some(scene=>scene.id===sceneOverride)){report('Add a scene before recording.');return;}
  const abort=new AbortController();countdownAbort.current=abort;captureScene.current=sceneOverride;captureTakeMode.current=takeMode;setRecordSceneId(sceneOverride);
  screenResume.current.cancel();++choiceGeneration.current;setPresetOpen(false);transition('starting');ended.current=false;captures.current=[];nativeSession.current=null;nativeSkew.current=0;takeKeepFromMs.current=undefined;transitionGate.current.reset();setElapsed(0);clearNativeFrame();setCaptureNotice('');hudFailure.current='';
  const sessionIds:string[]=[];
  try{
   if(wantsNative){const capability=await bridge!.getNativeRecordingStatus!();if(!capability.available||!capability.excludesSceneForge)throw new Error('Native screen capture is unavailable in this build. No screen recording was started.');}
   const browserSelection=browserRecordingSelection(selection,wantsNative),kinds=(['camera','microphone'] as const).filter(kind=>browserSelection[kind]);
   // Screen resolves first, as it may only open the picker; camera and microphone then open together and the first failure in source order is reported.
   if((browserSelection.screen||browserSelection.systemAudio)&&!await request('screen'))throw new Error(manager.getSnapshot().screen.error||'The screen preview could not start.');if(!mounted.current)return;
   const streams=await Promise.all(kinds.map(kind=>request(kind)));kinds.forEach((kind,i)=>{if(!streams[i])throw new Error(manager.getSnapshot()[kind].error||`The ${kind} preview could not start.`);});if(!mounted.current)return;
   const sources=recordingSources(manager.getSnapshot(),browserSelection);
   if(abort.signal.aborted)throw new DOMException('Start cancelled','AbortError');
   const formats=sources.map(source=>{const video=source.stream.getVideoTracks().length>0,mimeType=recorderMimeType(video,t=>MediaRecorder.isTypeSupported(t));if(!mimeType)throw new Error('This browser does not support WebM capture. Use the Creator Compiler desktop app.');return {...source,video,mimeType};});
   openHud(countdownEnabled?3:null);
   // Capture arms during the countdown (at 2), so it is already rolling at go and the take keeps PRE_ROLL_MS from before it.
   const arm=async()=>{
    const sessions=await Promise.all(formats.map(async source=>{const {id}=await api<{id:string}>('/recordings',{name:`${project.name} — ${source.track}`,mimeType:source.mimeType,audioRole:source.audioRole});sessionIds.push(id);return {...source,id};}));if(!mounted.current||abort.signal.aborted)throw new DOMException('Start cancelled','AbortError');
    for(const {stream,track,audioRole,video,mimeType,id} of sessions){
     let capture:Capture;const samples=recordingSamples(stream,(at,pts)=>{capture.startedAtMs=at;capture.sourceTimestampUs=pts;},error=>{capture.failure=error;report(`Capture sample error: ${error.message}`);void stopRef.current();});
     let recorder:MediaRecorder;try{recorder=new MediaRecorder(samples.stream,recorderOptions(video,mimeType));}catch(error){samples.close();throw error;}capture={stream,recorder,track,id,queue:Promise.resolve(),index:0,pending:0,startedAtMs:0,samples,label:track==='camera'?`Camera (${deviceLabel(devices,'camera',cameraId||stream.getVideoTracks()[0]?.getSettings?.().deviceId)})`:track==='screen'?`Screen (${chosenSource.current?.label||'selected display'})`:`${audioRole==='system'?'Computer audio':'Microphone'} (${deviceLabel(devices,'microphone',microphoneId||stream.getAudioTracks()[0]?.getSettings?.().deviceId)})`};captures.current.push(capture);
     recorder.ondataavailable=event=>{if(!event.data.size)return;const index=capture.index++;capture.pending+=event.data.size;capture.queue=capture.queue.then(async()=>{const result=await fetch(`/api/recordings/${capture.id}/chunks?index=${index}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:event.data});if(!result.ok)throw new Error((await result.json()).error||'Recording could not be saved');}).catch(error=>{capture.failure=error;report(`Recording storage error: ${error.message}`);if(['recording','paused'].includes(statusRef.current))void stopRef.current();}).finally(()=>{capture.pending-=event.data.size;});
      if(capture.pending>64*1024*1024){capture.failure=new Error('Disk writing cannot keep up. Recording was stopped to preserve your take.');report(capture.failure.message);void stopRef.current();}
     };
     recorder.onerror=()=>{capture.failure=new Error('A capture source failed. Saving the completed portion.');report(capture.failure.message);void stopRef.current();};
    }
    if(abort.signal.aborted)throw new DOMException('Start cancelled','AbortError');
    let startedAtMs=recordingNow();takeStartedAtMs.current=startedAtMs;
    if(wantsNative){const take=await bridge!.startNativeRecording!({selection:chosenSource.current!,systemAudio:selection.systemAudio,recordVideo:selection.screen,fps:screenFps,maxDimension:1920});nativeSession.current={id:take.id,recordVideo:selection.screen,systemAudio:selection.systemAudio};startedAtMs=take.startedAtMs;if(!mounted.current||abort.signal.aborted)throw new DOMException('Start cancelled','AbortError');}
    captures.current.forEach(c=>{c.recorder.start(1000);c.samples.start();});
    return startedAtMs;
   };
   const {armed:startedAtMs,keepFromMs}=await countdownWithPreRoll({arm,cancel:()=>abort.abort(),countdown:async onTick=>{
    if(!countdownEnabled)return;
    let sound:ReturnType<typeof countdownChime>|undefined;try{sound=countdownChime();}catch{setCaptureNotice('Countdown sound is unavailable. The visual countdown still runs.');}const skipped=new Promise<'skip'>(resolve=>{countdownSkip.current=()=>resolve('skip');});
    const SKIP='SkipCountdown',wait=(ms:number,signal:AbortSignal)=>Promise.race([waitForCountdown(ms,signal),skipped.then(()=>{throw new DOMException('Countdown skipped',SKIP);})]);
    try{await recordingCountdown(abort.signal,value=>{setCountdown(value);void hudSession.current?.update({countdown:value});onTick(value);},()=>sound?.play(),wait);}catch(error){if((error as Error).name!==SKIP)throw error;}finally{await sound?.close();if(mounted.current)setCountdown(null);void hudSession.current?.update({countdown:null});}
   }});
   if(!mounted.current||abort.signal.aborted)throw new DOMException('Start cancelled','AbortError');
   // The clock counts the take itself: from the pre-roll, or from the first sample when capture armed after go.
   takeKeepFromMs.current=keepFromMs;recordingClock.current.start(Math.max(startedAtMs,keepFromMs));transition('recording');timer.current=setInterval(updateClock,250);
   if(wantsNative)manager.stop('screen');if(hudFailure.current)setCaptureNotice(hudFailure.current);hudFailure.current='';
  }catch(error){hudFailure.current='';const entries=captures.current,native=nativeSession.current;captures.current=[];nativeSession.current=null;void closeHud();await discardArmed(entries,sessionIds,native);transition('idle');if((error as Error).name!=='AbortError')report((error as Error).message);}finally{countdownAbort.current=null;countdownSkip.current=null;if(mounted.current)setCountdown(null);}
 }
 /** A take that never began keeps nothing: armed recorders stop without saving a chunk, and their storage sessions and native files are deleted. */
 async function discardArmed(entries:Capture[],sessionIds:string[],native:{id:string}|null){
  const bridge=window.sceneForge,dropNative=bridge?.discardNativeRecording??bridge?.stopNativeRecording;
  await Promise.all([...entries.map(async c=>{c.recorder.ondataavailable=null;if(c.recorder.state!=='inactive'){const stopped=new Promise(resolve=>c.recorder.addEventListener('stop',resolve,{once:true}));c.recorder.stop();await stopped;}c.samples.close();await c.queue;}),native&&dropNative?dropNative(native.id).catch(()=>{}):null]);
  await Promise.all(sessionIds.map(id=>api(`/recordings/${id}`,undefined,'DELETE').catch(()=>{})));
 }
 function pause(){
  if(!['recording','paused'].includes(statusRef.current))return;
  const running=statusRef.current==='recording';
  const work=transitionGate.current.run(async()=>{
   if(mounted.current)setTransitionBusy(true);
   try{
    let transitionAtMs=Date.now();
    if(running){captures.current.forEach(c=>{if(c.recorder.state==='recording')c.recorder.pause();});const browserAt=Date.now();if(nativeSession.current){const result=await window.sceneForge!.pauseNativeRecording!(nativeSession.current.id);transitionAtMs=result.transitionAtMs??Date.now();nativeSkew.current+=Math.abs(transitionAtMs-browserAt);}recordingClock.current.pause(transitionAtMs);if(timer.current)clearInterval(timer.current);timer.current=null;updateClock();if(!ended.current)transition('paused');}
    else {if(nativeSession.current){const result=await window.sceneForge!.resumeNativeRecording!(nativeSession.current.id);transitionAtMs=result.transitionAtMs??Date.now();}captures.current.forEach(c=>{if(c.recorder.state==='paused')c.recorder.resume();});if(nativeSession.current)nativeSkew.current+=Math.abs(Date.now()-transitionAtMs);recordingClock.current.resume(transitionAtMs);if(!ended.current){timer.current=setInterval(updateClock,250);transition('recording');}}
   }catch(error){report(`Recording controls failed: ${(error as Error).message}`);queueMicrotask(()=>void stopRef.current());}
   finally{if(mounted.current)setTransitionBusy(false);}
  });void work?.catch(()=>{});
 }
 /** Ends the take and saves it. `review` opens its preview (Stop); Record again (`retry`) keeps the take and goes straight to the next one. */
 async function stop(review=true){
  // While capture arms during the countdown, a stop (a source failing) cancels the start; no take is kept.
  if(statusRef.current==='starting'){cancelStart();return;}
  if(ended.current||(!captures.current.length&&!nativeSession.current))return;ended.current=true;updateClock();transition('saving');void closeHud();if(timer.current)clearInterval(timer.current);timer.current=null;
  await transitionGate.current.stop();
  const entries=[...captures.current],native=nativeSession.current,assets:Media[]=[],tracks:TrackKind[]=[],offsets:number[]=[],sourceTimestamps:Array<number|undefined>=[],labels:string[]=[],failures:string[]=[],notes:string[]=[];
  const browserStop=Promise.all(entries.map(c=>new Promise<void>(resolve=>{if(c.recorder.state==='inactive'){resolve();return;}c.recorder.addEventListener('stop',()=>resolve(),{once:true});c.recorder.stop();})));
  const nativeStop=native?window.sceneForge!.stopNativeRecording!(native.id):null;
  try{
   const [nativeResult]=await Promise.all([nativeStop?.then(value=>({value}),error=>({error}))??null,browserStop]);entries.forEach(c=>c.samples.close());await Promise.all(entries.map(c=>c.queue));
   // Sources finalize concurrently (the server serializes per recording); results are applied in source order.
   const output=native&&nativeResult&&!('error'in nativeResult)?nativeResult.value:null;
   const [finished,imported]=await Promise.all([Promise.allSettled(entries.map(c=>api<Media>(`/recordings/${c.id}/finish`,{startedAtMs:takeStartedAtMs.current,firstSampleAtMs:c.startedAtMs,sourceTimestampUs:c.sourceTimestampUs}))),(async()=>{const done:Array<{media:Media;track:TrackKind}>=[];try{for(const source of output?nativeRecordingOutputs(output,native!.recordVideo,native!.systemAudio):[]){const [media]=await api<Media[]>('/media/import',{paths:[source.path],audioRole:source.audioRole});done.push({media,track:source.track});}return {done};}catch(error){return {done,error:error as Error};}})()]);
   finished.forEach((result,i)=>{const c=entries[i];if(result.status==='fulfilled'){assets.push(result.value);tracks.push(c.track);offsets.push(c.startedAtMs);sourceTimestamps.push(c.sourceTimestampUs);labels.push(c.label);}else failures.push((result.reason as Error).message);});
   if(native&&nativeResult){if('error'in nativeResult)failures.push(String(nativeResult.error));else{const output=nativeResult.value;failures.push(...nativeRecordingOutputErrors(output,native.recordVideo,native.systemAudio));{const note=nativeRecordingNote(output);if(note)notes.push(note);}for(const {media,track} of imported.done){assets.push(media);tracks.push(track);offsets.push(output.startedAtMs);sourceTimestamps.push(undefined);labels.push(`${track==='screen'?'Screen':'Computer audio'} (${chosenSource.current?.label||'selected source'})`);}if(imported.error)failures.push(imported.error.message);}}
   if(nativeSkew.current>100&&entries.length)notes.push('Camera and screen may be slightly out of sync after pausing. Check the take before you use it.');
   if(mounted.current&&assets.length){
    if(offsets.some(at=>!Number.isFinite(at)||at<=0))throw Error('A source did not deliver a timestamped sample.');
    const aligned=await api<{media:Media[];offsets:number[];synchronization:TakeSynchronization}>('/recordings/synchronize',{startedAtMs:takeStartedAtMs.current,keepFromMs:takeKeepFromMs.current,sources:assets.map((media,i)=>({mediaId:media.id,track:tracks[i],firstSampleAtMs:offsets[i],sourceTimestampUs:sourceTimestamps[i]}))});
    const take:SavedTake={id:crypto.randomUUID(),createdAt:new Date().toISOString(),sceneId:captureScene.current,media:aligned.media,tracks,offsets:aligned.offsets,synchronization:aligned.synchronization,labels,clipIds:assets.map(()=>crypto.randomUUID()),recordOver:captureTakeMode.current==='record-over'};storeTakes([...savedTakes,take]);if(review){reviewRef.current=take.id;setReviewId(take.id);}if(notes.length)setTakeNotes(value=>({...value,[take.id]:notes.join(' ')}));try{await applyChange(draft=>saveProjectTake(draft,take));storeTakes(savedTakes.filter(value=>value.id!==take.id));}catch(error){failures.push(`The take is in local recovery; project save failed: ${(error as Error).message}`);}}
   if(entries.some(c=>c.failure))failures.push('A source reported an error during capture.');
   if(failures.length)report(`Saved ${assets.length} completed ${assets.length===1?'source':'sources'}. ${failures.join(' ')} Any unfinished source remains in local capture storage.`);
  }catch(error){report(`The take could not be prepared. Original files and unfinished chunks remain in local capture storage: ${(error as Error).message}`);}finally{entries.forEach(c=>c.samples.close());captures.current=[];nativeSession.current=null;manager.stopAll();clearNativeFrame();transition('idle');}
 }
 stopRef.current=stop;
 // Subscribed once; the handlers run the latest committed render's actions (set on commit, so a discarded render never leaks in). Stop in the HUD during the countdown cancels the start.
 const hudCommand=useRef<(command:RecordingHudCommand)=>void>(()=>{}),shortcut=useRef<(action?:ShortcutAction)=>void>(()=>{});
 useInsertionEffect(()=>{
  hudCommand.current=command=>{if(command==='cancel'){if(statusRef.current==='starting')cancelStart();return;}if(command==='skip-countdown'){if(statusRef.current==='starting')skipCountdown();return;}if(command==='retry'){if(['recording','paused'].includes(statusRef.current)){const scene=captureScene.current,mode=captureTakeMode.current;void stop(false).then(()=>{if(mounted.current)void start(scene,mode);});}return;}if(command==='stop'){if(statusRef.current==='starting')cancelStart();else void stop();}else if(command==='pause'&&statusRef.current==='recording')pause();else if(command==='resume'&&statusRef.current==='paused')pause();};
  shortcut.current=action=>{if(action==='record')void start();else if(action==='stopRecord'&&['recording','paused'].includes(statusRef.current))void stop();else if(action==='pauseRecord')pause();else if(action==='recordingPresets'&&statusRef.current==='idle')setPresetOpen(v=>!v);};
 });
 useEffect(()=>window.sceneForge?.onRecordingHudCommand?.(command=>hudCommand.current(command)),[]);
 useEffect(()=>{const handle=(event:Event)=>shortcut.current((event as CustomEvent<{action:ShortcutAction}>).detail?.action);window.addEventListener('sceneforge-shortcut',handle);return()=>window.removeEventListener('sceneforge-shortcut',handle);},[]);
 const clock=`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
 const deviceSelect=(kind:'camera'|'microphone')=><div className="capture-device"><select aria-label={`${kind==='camera'?'Camera':'Microphone'} device`} disabled={active} value={kind==='camera'?cameraId:microphoneId} onChange={event=>{const deviceId=event.target.value;if(kind==='camera')setCameraId(deviceId);else setMicrophoneId(deviceId);setSelection(s=>({...s,[kind]:true}));void request(kind,{deviceId});}}><option value="">{deviceLabel(devices,kind,previews[kind].stream?.getTracks()[0]?.getSettings?.().deviceId)}</option>{devices.filter(d=>d.kind===(kind==='camera'?'videoinput':'audioinput')&&d.deviceId).map((d,i)=><option key={`${d.deviceId}-${i}`} value={d.deviceId}>{deviceLabel(devices,kind,d.deviceId)}</option>)}</select><ChevronDown size={13}/></div>;
 const settingsButton=(kind:CaptureKind|'systemAudio',label:string)=><button className={`capture-settings-button ${settings===kind?'selected':''}`} aria-label={`${label} settings`} aria-expanded={settings===kind} disabled={active} onClick={()=>setSettings(settings===kind?null:kind)}><Settings2 size={18}/></button>;
 const hasRecording=project.clips.some(clip=>Boolean(clip.recordingTakeId));
 const sourceReadiness=(kind:CaptureKind)=>{
  const source=previews[kind],included=selection[kind],receiving=kind==='camera'?cameraReceiving:kind==='screen'?screenReceiving:Boolean(source.stream?.getAudioTracks().some(track=>track.readyState==='live'));
  const text=!included?'Not included':source.error?'Needs attention':source.status==='loading'?'Opening preview…':source.status==='ended'?'Disconnected':receiving?'Ready':source.stream?'Waiting for signal…':'Preview not started';
  return <div className={`source-readiness ${included&&receiving?'is-ready':''}`} role="status"><span aria-hidden="true"/>{text}</div>;
 };
 const enabledCount=Object.values(selection).filter(Boolean).length;
 const readyCount=(['camera','microphone','screen'] as const).filter(k=>selection[k]&&previews[k].status==='live'&&(k==='camera'?cameraReceiving:k==='screen'?screenReceiving:true)).length+(selection.systemAudio&&previews.screen.stream?.getAudioTracks().some(t=>t.readyState==='live')?1:0);
 const disk=useDiskSpace(club),access=useMediaAccess(true,previews);
 // Creator Compiler's warnings card and pre-flight line: each switched-on source, read from its preview and from macOS's permission.
 const liveAudio=(stream:MediaStream|null)=>Boolean(stream?.getAudioTracks().some(track=>track.readyState==='live'));
 // Computer audio comes from the chosen screen or window, so a failed choice fails both.
 const screenFailed=previews.screen.status==='error'||Boolean(sourceError);
 const snapshot=(kind:CaptureKind):SourceSnapshot=>{const source=previews[kind];return {kind,included:selection[kind],permission:access?.[kind],accessDenied:source.error===ACCESS_NOT_GRANTED,failed:kind==='screen'?screenFailed:source.status==='error',ended:source.status==='ended',receiving:kind==='camera'?cameraReceiving:kind==='screen'?screenReceiving:liveAudio(source.stream),opening:source.status==='loading'||Boolean(source.stream),stalled:kind==='camera'&&cameraStalled};};
 const checks:SourceCheck[]=club?sourceChecks([snapshot('camera'),snapshot('microphone'),snapshot('screen'),{kind:'systemAudio',included:selection.systemAudio,permission:access?.screen,accessDenied:previews.screen.error===ACCESS_NOT_GRANTED,failed:screenFailed,ended:previews.screen.status==='ended',receiving:liveAudio(previews.screen.stream),opening:previews.screen.status==='loading'}]):[];
 const problemAction=(action:ProblemAction)=>{if(action==='setup')onSetup?.();else if(action==='retry-camera')void request('camera');else if(action==='retry-microphone')void request('microphone');else chooseScreen(selection.systemAudio,selection.screen);};
 const problems=club?recorderProblems(checks,disk):null;
 const activePreset=preferences.presets.find(p=>p.id===preferences.activeId);
 const modified=Boolean(activePreset&&JSON.stringify(activePreset.settings)!==JSON.stringify(current));
 // Stable callbacks let the memoized scene cards skip preview, device and status renders.
 const cardHandlers=useStableHandlers({onSelectScene:setRecordSceneId,onAutoCut,onVisualize,
  onRecord:(id:string,mode:TakeConfirmMode)=>{if(!enabledCount){report('Choose at least one recording source.');return;}void start(id,mode);},
  onImport:(id:string)=>onImport?.(id),onPreview:(id:string)=>{reviewRef.current=id;setReviewId(id);},
  onArchive:(id:string)=>takeAction(id,'archive'),onDeleteTake:(id:string)=>takeAction(id,'delete'),onActivate:(id:string)=>takeAction(id,'activate'),
  onRenameScene:(id:string,name:string)=>applyChange(draft=>{const scene=draft.scenes.find(value=>value.id===id);if(scene)scene.name=name;}),
  onAddScene:async(afterId?:string)=>{let id='';await applyChange(draft=>{id=addRecordingScene(draft,afterId);});setRecordSceneId(id);},
  onDeleteScene:(id:string)=>applyChange(draft=>deleteRecordingScene(draft,id)),
  onMoveScene:(id:string,beforeId?:string)=>applyChange(draft=>moveRecordingScene(draft,id,beforeId)),
  onMoveTake:(id:string,sceneId:string,archive:boolean)=>runTakeAction(async()=>{const take=allTakes.find(value=>value.id===id);if(!take)return;await applyChange(draft=>{saveProjectTake(draft,take);moveSceneTake(draft,id,sceneId,archive);});storeTakes(savedTakes.filter(value=>value.id!==id));})});
 // A preview-only screen stream is reduced in size: the badge reports the source's own pixels and a region is cropped by CSS.
 // The native-mode preview is the whole source, so an unusable region hides it rather than showing the full screen.
 const screenView=useMemo(()=>{const screen=previews.screen;let request:CaptureRequest;try{request=JSON.parse(screen.key||'{}');}catch{return {source:screen,viewBox:undefined,size:null};}const size=sourceInfo?.sourceId===request.sourceId?screenCaptureSize(sourceInfo):null;if(!nativeRecording||!request.crop)return {source:screen,viewBox:undefined,size};try{return {source:screen,viewBox:regionInset(request.crop),size};}catch(error){return {source:{...screen,status:'error' as const,stream:null,error:(error as Error).message},viewBox:undefined,size:null};}},[previews.screen,sourceInfo,nativeRecording]);
 const allowScreen=()=>{if(window.sceneForge?.openPrivacySettings)void window.sceneForge.openPrivacySettings('screen').catch(error=>report((error as Error).message));else chooseScreen();};
 const screenPermissionMissing=Boolean(nativeCapture&&access&&access.screen!=='granted');
 const cameraPermissionMissing=Boolean(access&&access.camera!=='granted'||previews.camera.error===ACCESS_NOT_GRANTED);
 const allowCamera=()=>{if(window.sceneForge?.openPrivacySettings&&['denied','restricted'].includes(access?.camera??''))void window.sceneForge.openPrivacySettings('camera').catch(error=>report((error as Error).message));else void request('camera');};
 const presetPicker=<div className="recording-presets" ref={presetRoot}><button className="recording-presets-trigger" aria-label="Recording presets" aria-expanded={presetOpen} disabled={active} title="Recording presets (⌘⇧P)" onClick={()=>setPresetOpen(v=>!v)}>{activePreset?activePreset.name:'Recording presets'}{modified?' · Modified':''}<ChevronDown size={13}/></button>{presetOpen&&<div className="recording-presets-menu" role="dialog" aria-label="Recording presets"><strong>Recording presets</strong><span className="preset-description">Save devices, source toggles, and capture settings in this profile.</span><div className="recording-presets-list"><button onClick={()=>applySettings(defaultRecordingSettings(),null)}>Default settings</button>{preferences.presets.map(p=><button key={p.id} aria-pressed={preferences.activeId===p.id} onClick={()=>applySettings(p.settings,p.id)}><span>{p.name}</span>{preferences.activeId===p.id&&<Check size={15}/>}</button>)}</div><form onSubmit={e=>{e.preventDefault();savePreset();}}><label>Preset name<input aria-label="Preset name" maxLength={80} value={presetName} placeholder={activePreset?.name||'e.g. Camera and desktop'} onChange={e=>setPresetName(e.target.value)}/></label><div className="preset-actions"><button className="button compact" type="submit" disabled={!presetName.trim()}>Save as new</button>{activePreset&&<button className="button compact" type="button" disabled={!presetName.trim()} onClick={()=>savePreset(true)}>Rename</button>}</div></form>{activePreset&&<div className="preset-actions"><button onClick={()=>{setPreferences(p=>({...p,presets:saveRecordingPreset(p.presets,activePreset.name,current,activePreset.id)}));setPresetError('');}}>Update saved settings</button><button onClick={()=>{setPreferences(p=>({...p,activeId:null,presets:p.presets.filter(item=>item.id!==activePreset.id)}));setPresetError('');}}>Delete preset</button></div>}<small>Applying a preset stops current previews. Allowed camera and mic reopen. A saved screen resumes when its capture area still matches; choose a source when needed.</small>{presetError&&<p role="alert">{presetError}</p>}</div>}</div>;
 // Each source shows its own live media under its row, as in Borumi: camera picture, microphone line, screen picture, computer-audio line.
 const screenShown=selection.screen;
 const sourcesPanel=<aside className="recording-source-panel" aria-label="Recording sources"><fieldset className="capture-sources-fieldset" disabled={active}>
   <section className={`capture-source ${selection.camera?'enabled':''}`}><RecordingSourceHeader label="Include camera" toggle={<SourceSwitch label="Include camera" value={selection.camera} disabled={active} onChange={v=>toggleSource('camera',v)}/>} device={deviceSelect('camera')} settings={settingsButton('camera','Camera')}/>{sourceReadiness('camera')}
    {selection.camera&&<div className="rec-camera-slot">{club&&cameraExpanded&&<div className="rec-preview-backdrop" onClick={()=>setCameraExpanded(false)} aria-hidden/>}<div className={`capture-media capture-media-camera ${cameraExpanded?'rec-camera-expanded':''}`}>{club&&(cameraReceiving||cameraExpanded)&&<button type="button" className="rec-preview-enlarge" aria-label={cameraExpanded?'Back to recorder':'Enlarge preview'} aria-expanded={cameraExpanded} onClick={()=>setCameraExpanded(value=>!value)}>{cameraExpanded?'Close':'Enlarge preview'}</button>}{cameraExpanded&&<span className="rec-preview-caption">Camera preview</span>}<VideoPreview source={previews.camera} label="Camera" mirror={mirror} permissionMissing={cameraPermissionMissing} onAllow={allowCamera} onEnable={()=>void request('camera')} onStalled={setCameraStalled} onReady={setCameraReceiving}/></div></div>}
    {settings==='camera'&&<div className="capture-settings"><label>Resolution<select value={cameraResolution} onChange={e=>{const value=e.target.value;setCameraResolution(value);const [width,height]=value.split('x').map(Number);if(selection.camera)void request('camera',{width,height});}}><option value="1280x720">1280 × 720</option><option value="1920x1080">1920 × 1080</option><option value="3840x2160">3840 × 2160</option></select></label><label>Frame rate<select value={cameraFps} onChange={e=>{const frameRate=+e.target.value;setCameraFps(frameRate);if(selection.camera)void request('camera',{frameRate});}}><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label><label className="capture-check"><input type="checkbox" checked={mirror} onChange={e=>setMirror(e.target.checked)}/>Mirror preview only</label><small>The preview badge shows the resolution your camera actually provides.</small></div>}
   </section>
   <section className={`capture-source ${selection.microphone?'enabled':''}`}><RecordingSourceHeader label="Microphone" toggle={<SourceSwitch label="Microphone" value={selection.microphone} disabled={active} onChange={v=>toggleSource('microphone',v)}/>} device={deviceSelect('microphone')} settings={settingsButton('microphone','Microphone')}/>{sourceReadiness('microphone')}
    {settings==='microphone'&&<div className="capture-settings"><label className="capture-check"><input type="checkbox" checked={echoCancellation} onChange={e=>{setEchoCancellation(e.target.checked);if(selection.microphone)void request('microphone',{echoCancellation:e.target.checked});}}/>Echo cancellation</label><label className="capture-check"><input type="checkbox" checked={noiseSuppression} onChange={e=>{setNoiseSuppression(e.target.checked);if(selection.microphone)void request('microphone',{noiseSuppression:e.target.checked});}}/>Noise suppression</label><small>Applied by the capture device where supported. Microphone audio is saved once as its own track.</small></div>}
    {selection.microphone&&(club?<MicLevel stream={previews.microphone.stream} audio={meterAudio} live={visible||active} background={active&&!visible} onLevel={publishMicrophoneLevel}/>:<AudioMeter stream={previews.microphone.stream} label="Microphone" audio={meterAudio} live={visible||active} background={active&&!visible} onLevel={publishMicrophoneLevel} emptyHint={previews.microphone.status==='loading'?'Opening microphone…':previews.microphone.error||'Enable the microphone to check your level.'}/>)}
   </section>
   <section className={`capture-source ${selection.screen?'enabled':''}`}><RecordingSourceHeader label="Screen" toggle={<SourceSwitch label="Screen" value={selection.screen} disabled={active} onChange={v=>toggleSource('screen',v)}/>} device={<button className="capture-screen-choice" aria-label="Choose screen source" aria-haspopup="dialog" aria-expanded={sourcePicker} disabled={active} onClick={()=>{if(screenPermissionMissing)allowScreen();else chooseScreen();}}><span>{sourceInfo?.label||previews.screen.stream?.getVideoTracks()[0]?.label||'Choose a screen'}</span><ChevronDown size={13}/></button>} settings={settingsButton('screen','Screen')}/>{sourceReadiness('screen')}
    {screenShown&&<div className="capture-media capture-media-screen" style={screenView.size?{aspectRatio:`${screenView.size.width}/${screenView.size.height}`} : undefined}><VideoPreview source={screenView.source} label="Screen" permissionMissing={screenPermissionMissing} onAllow={allowScreen} frameRef={nativeFrame} hasFrame={hasNativeFrame} onReady={setScreenReceiving} viewBox={screenView.viewBox} captureSize={screenView.size} onEnable={()=>void request('screen')}/></div>}
    {selection.screen&&<><div className="capture-area-segments" role="group" aria-label="Capture area">{([['display','Entire display'],['window','Window'],['region','Region']] as const).map(([mode,label])=><button type="button" key={mode} aria-pressed={captureMode===mode} disabled={active||sourceBusy} onClick={()=>{if(screenPermissionMissing){allowScreen();return;}if(mode===captureMode&&mode!=='display')openPicker();else changeCaptureMode(mode);}}>{label}</button>)}</div>{captureMode==='region'&&sourceInfo?.crop&&<button className="capture-region-adjust" disabled={active||sourceBusy} onClick={()=>{pickerAudio.current=selection.systemAudio;void captureSelected(sourceInfo.sourceId);}}>Move or resize region…</button>}</>}
    {sourceError&&!sourcePicker&&!screenPermissionMissing&&<p className="capture-source-error" role="alert">{sourceError}</p>}
    {sourcePicker&&<CaptureSourcePicker selectedId={sourceInfo?.sourceId} region={captureMode==='region'} busy={sourceBusy} error={sourceError} onClose={cancelChoice} onSelect={source=>void captureSelected(source.id,{},captureMode==='region'?'region':source.kind)}/>}
    {settings==='screen'&&<div className="capture-settings"><label>Frame rate<select value={screenFps} onChange={e=>{const frameRate=+e.target.value;setScreenFps(frameRate);if(selection.screen||selection.systemAudio)void request('screen',{frameRate});}}><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label><button className="button compact" onClick={()=>chooseScreen()}>Choose another screen or window</button><small>Select any available display or window. Stop recording before changing its area or settings.</small></div>}
   </section>
   <section className={`capture-source ${selection.systemAudio?'enabled':''}`}><RecordingSourceHeader label="Computer audio" toggle={<SourceSwitch label="Computer audio" value={selection.systemAudio} disabled={active} onChange={toggleSystemAudio}/>} device={!selection.screen&&<button className="capture-system-label" disabled={active} onClick={()=>chooseScreen(true,false)}><span>{sourceInfo?.label||previews.screen.stream?.getVideoTracks()[0]?.label||'Choose source'}</span><ChevronDown size={13}/></button>} settings={settingsButton('systemAudio','Computer audio')}/>
    {settings==='systemAudio'&&<div className="capture-settings"><p>Records the sound playing on your computer, like music or a video in your browser. It follows the screen you pick; with Screen off, only the sound is recorded.</p><button className="button compact" onClick={()=>chooseScreen(true,false)}>Choose where the sound comes from</button></div>}
    {selection.systemAudio&&!selection.screen&&<><p className="capture-audio-only">Only the sound is recorded, not the screen.</p>{settings==='systemAudio'&&<VideoPreview source={screenView.source} label="Sound source" viewBox={screenView.viewBox} captureSize={screenView.size} onEnable={()=>chooseScreen(true,false)}/>}</>}
    {selection.systemAudio&&nativeSession.current?<p className="capture-source-hint">System sound is captured as a separate native audio track. Its live meter is unavailable during this take.</p>:selection.systemAudio&&<AudioMeter stream={previews.screen.stream} label="System sound" audio={meterAudio} live={visible} emptyHint={previews.screen.status==='loading'?'Waiting for screen selection…':'No system audio track is available from this source.'}/>}
   </section>
  </fieldset></aside>;
 const countdownOption=<div className="recording-countdown-toggle"><SourceSwitch label="3-second countdown with chimes" value={countdownEnabled} disabled={active} onChange={setCountdownEnabled}/><span>3-second countdown with chimes</span></div>;
 return <div className={`recording-workspace${club?' club-record':''}`}>
  {presetHost?createPortal(presetPicker,presetHost):<div className="recording-presets-fallback">{presetPicker}</div>}
  {club?<div className="club-record-left">{problems&&<RecorderWarnings problems={problems} onAction={problemAction}/>}{sourcesPanel}{countdownOption}</div>:sourcesPanel}
  <main className={`recording-main ${active?'capture-active':'scene-cards-mode'}`}>
   {!active?<><RecordingSceneCards project={project} takes={allTakes} selectedSceneId={recordSceneId} disabled={confirming} club={club} {...cardHandlers}/>
    {hasRecording&&onEdit&&<div className="recording-next"><div><strong>Recording saved</strong><span>Trim it, add captions and export your video.</span></div><button className="button primary" onClick={onEdit}>Edit &amp; export<ArrowRight size={16}/></button></div>}
    {(!club||captureNotice)&&<div className="recording-card-options">{!club&&countdownOption}{!club&&<div className="recording-ready-hint">{readyCount===enabledCount&&enabledCount?`${readyCount} ${readyCount===1?'source is':'sources are'} ready · previews are live`:enabledCount?'Check your sources before recording.':'Choose a camera, microphone, screen, or system sound to begin.'}</div>}{captureNotice&&<p className="recording-capture-notice" role="status">{captureNotice}</p>}</div>}
   </>:<div className="recording-readiness"><div className={`recording-status ${status==='recording'?'is-recording':''}`}><i/>{status==='starting'?(countdown!==null?'Recording starts in…':'Preparing your sources'):status==='saving'?'Saving your take':status==='paused'?'Recording paused':'Recording in progress'}</div>{countdown!==null?<div className="recording-countdown-number" role="status" aria-live="assertive">{countdown}</div>:<div className="recording-big-clock">{clock}</div>}<p className="recording-active-note">{status==='saving'?'Finishing the files saved on your Mac.':'Use the floating camera and script controls, or this window, to pause and stop.'}</p>
    <div className="recording-controls"><button className="button" onClick={pause} disabled={transitionBusy||!['recording','paused'].includes(status)}>{status==='paused'?<Play size={17}/>:<Pause size={17}/>} {status==='paused'?'Resume':'Pause'}</button><button className="button primary" onClick={()=>void stop()} disabled={status==='starting'||status==='saving'}>{status==='saving'?<LoaderCircle size={17} className="spin"/>:<Square size={16}/>} {status==='saving'?'Saving take…':'Stop & save'}</button></div>
    {status==='starting'&&<button className="button" onClick={cancelStart}>Cancel recording start</button>}
    {!club&&project.scenes.some(s=>s.script.trim())&&<div className="recording-script"><span>YOUR SCRIPT</span><div>{project.scenes.find(s=>s.id===recordSceneId)?.script||'Add a script to this scene in the Script workspace.'}</div></div>}
   </div>}
  </main>
  {reviewTake&&<TakeReview key={reviewTake.id} project={project} take={reviewTake} note={takeNotes[reviewTake.id]} busy={confirming||active} onConfirm={confirmReview} onRetake={()=>void retake()} onClose={()=>void keepReview()} onDelete={()=>void takeAction(reviewTake.id,'delete')} onUpdate={updateTake} club={club} onContinue={club?confirmed=>void continueReview(confirmed):undefined}/>}
 </div>;
}
