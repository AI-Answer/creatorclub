import {useMemo} from 'react';
import App,{type EmbeddedRecorder} from '../App';

/**
 * SceneForge's recorder (`mode="Record"`) or editor (`mode="Edit"`) for one video's recording project,
 * filling the video page. SceneForge's Home, brand, Projects button and step bar are hidden;
 * closing the project calls `onBack`.
 */
export function ClubRecorder({projectId,mode,onBack}:EmbeddedRecorder){
 const embedded=useMemo<EmbeddedRecorder>(()=>({projectId,mode,onBack}),[projectId,mode,onBack]);
 return <div className="club-embed"><App embedded={embedded}/></div>;
}
