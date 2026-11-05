import {lazy,Suspense,useCallback,useEffect,useMemo,useState} from 'react';
import type {EmbeddedRecorder,EditorBridge,EditorState} from '../App';
import {createPortal} from 'react-dom';
import type {Project} from '../../shared/types';
import {ClubExport,EXPORT_FORMAT_EVENT} from './recorder/ClubExport';
const App=lazy(()=>import('../App'));
import {ErrorLine} from './ErrorLine';
import {Button} from './ui';

export const OPEN_FAILED="Couldn't open this video's recording.";
export const NOT_ON_THIS_COMPUTER="This video's recording isn't on this computer.";

/**
 * SceneForge's recorder (`mode="Record"`) or editor (`mode="Edit"`) for one video's recording project,
 * filling the video page. SceneForge's Home, brand, Projects button and step bar are hidden;
 * closing the project calls `onBack`, SceneForge's own move between recording and editing calls `onMode`,
 * `onProgress` hears how many scenes have a take while recording, and `onExported` whether the edit has a finished MP4 export.
 * A project that cannot be opened shows one sentence and `Try again`, which opens it afresh. A project that is not there at all
 * (the data came from another computer) says so, with `onRestart` (starting the recording again from the plan) as its one button.
 */
export function ClubRecorder({projectId,mode,importNonce,onImportOpened,onBack,onMode,onProgress,onExported,sceneId,sceneNonce,onSceneChange,onChanged,registerLeaveGuard,onEditor,onEditState,onRestart}:Omit<EmbeddedRecorder,'onOpenFailed'>&{onRestart?():void}){
 const [failed,setFailed]=useState<'error'|'missing'|null>(null),[attempt,setAttempt]=useState(0);
 const onOpenFailed=useCallback(()=>{
  fetch(`/api/projects/${encodeURIComponent(projectId)}`).then(response=>setFailed(response.status===404?'missing':'error'),()=>setFailed('error'));
 },[projectId]);
 // The embedded app omits its old header controls. Reuse its editor bridge so export saves the current edit first.
 const [editor,setEditor]=useState<EditorBridge|null>(null),[project,setProject]=useState<Project|null>(null),[version,setVersion]=useState<string>(),[hasMedia,setHasMedia]=useState(false);
 const [exportHost,setExportHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{setExportHost(document.getElementById('ws-edit-export'));},[mode]);
 useEffect(()=>{
  setProject(null);if(mode!=='Edit'||!editor)return;
  let alive=true;
  void editor.flush().then(value=>{const fresh=value as Project|undefined;if(alive&&fresh?.id===projectId)setProject(fresh);},()=>{});
  return()=>{alive=false;};
 },[projectId,mode,attempt,editor]);
 const handleEditor=useCallback((bridge:EditorBridge|null)=>{setEditor(bridge);onEditor?.(bridge);},[onEditor]);
 const handleState=useCallback((state:EditorState)=>{setVersion(state.version);setHasMedia(Boolean(state.hasMedia));if(state.hasMedia===false)onExported?.(false);onEditState?.(state);},[onEditState,onExported]);
 const flushExport=useCallback(async()=>{
  const fresh=await editor?.flush() as Project|undefined;
  if(fresh?.id===projectId){setProject(fresh);return fresh;}
 },[editor,projectId]);
 const exportControl=mode==='Edit'&&project&&hasMedia&&editor?<ClubExport project={project} flush={flushExport} dirty={!!version&&version!==project.updatedAt} onExported={onExported} onOtherFormat={format=>window.dispatchEvent(new CustomEvent(EXPORT_FORMAT_EVENT,{detail:format}))}/>:null;
 const embedded=useMemo<EmbeddedRecorder>(()=>({projectId,mode,importNonce,onImportOpened,onBack,onMode,onOpenFailed,onProgress,onExported,sceneId,sceneNonce,onSceneChange,onChanged,registerLeaveGuard,onEditor:handleEditor,onEditState:handleState}),[projectId,mode,importNonce,onImportOpened,onBack,onMode,onOpenFailed,onProgress,onExported,sceneId,sceneNonce,onSceneChange,onChanged,registerLeaveGuard,handleEditor,handleState]);
 if(failed==='missing'&&onRestart)return <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-base">{NOT_ON_THIS_COMPUTER}</p><Button variant="primary" onClick={onRestart}>Start the recording again from the plan</Button></div>;
 if(failed)return <div className="flex flex-1 items-center justify-center p-6"><ErrorLine message={OPEN_FAILED} onRetry={()=>{setFailed(null);setAttempt(n=>n+1);}}/></div>;
 return <div className="club-embed"><Suspense fallback={<div className="flex flex-1" role="status" aria-label="Loading editor"/>}><App key={`${projectId}:${attempt}`} embedded={embedded}/></Suspense>{exportHost&&exportControl?createPortal(exportControl,exportHost):exportControl}</div>;
}
