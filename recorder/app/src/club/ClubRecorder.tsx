import {useCallback,useMemo,useState} from 'react';
import App,{type EmbeddedRecorder} from '../App';
import {ErrorLine} from './ErrorLine';

export const OPEN_FAILED="Couldn't open this video's recording.";

/**
 * SceneForge's recorder (`mode="Record"`) or editor (`mode="Edit"`) for one video's recording project,
 * filling the video page. SceneForge's Home, brand, Projects button and step bar are hidden;
 * closing the project calls `onBack`, and SceneForge's own move between recording and editing calls `onMode`.
 * A project that cannot be opened shows one sentence and `Try again`, which opens it afresh.
 */
export function ClubRecorder({projectId,mode,onBack,onMode}:Omit<EmbeddedRecorder,'onOpenFailed'>){
 const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 const onOpenFailed=useCallback(()=>setFailed(true),[]);
 const embedded=useMemo<EmbeddedRecorder>(()=>({projectId,mode,onBack,onMode,onOpenFailed}),[projectId,mode,onBack,onMode,onOpenFailed]);
 if(failed)return <div className="flex flex-1 items-center justify-center p-6"><ErrorLine message={OPEN_FAILED} onRetry={()=>{setFailed(false);setAttempt(n=>n+1);}}/></div>;
 return <div className="club-embed"><App key={`${projectId}:${attempt}`} embedded={embedded}/></div>;
}
