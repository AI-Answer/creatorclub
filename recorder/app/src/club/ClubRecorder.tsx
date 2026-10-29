import {useCallback,useMemo,useState} from 'react';
import App,{type EmbeddedRecorder} from '../App';
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
export function ClubRecorder({projectId,mode,onBack,onMode,onProgress,onExported,sceneId,sceneNonce,onSceneChange,onChanged,onRestart}:Omit<EmbeddedRecorder,'onOpenFailed'>&{onRestart?():void}){
 const [failed,setFailed]=useState<'error'|'missing'|null>(null),[attempt,setAttempt]=useState(0);
 const onOpenFailed=useCallback(()=>{
  fetch(`/api/projects/${encodeURIComponent(projectId)}`).then(response=>setFailed(response.status===404?'missing':'error'),()=>setFailed('error'));
 },[projectId]);
 const embedded=useMemo<EmbeddedRecorder>(()=>({projectId,mode,onBack,onMode,onOpenFailed,onProgress,onExported,sceneId,sceneNonce,onSceneChange,onChanged}),[projectId,mode,onBack,onMode,onOpenFailed,onProgress,onExported,sceneId,sceneNonce,onSceneChange,onChanged]);
 if(failed==='missing'&&onRestart)return <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-base">{NOT_ON_THIS_COMPUTER}</p><Button variant="primary" onClick={onRestart}>Start the recording again from the plan</Button></div>;
 if(failed)return <div className="flex flex-1 items-center justify-center p-6"><ErrorLine message={OPEN_FAILED} onRetry={()=>{setFailed(null);setAttempt(n=>n+1);}}/></div>;
 return <div className="club-embed"><App key={`${projectId}:${attempt}`} embedded={embedded}/></div>;
}
