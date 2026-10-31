import {recordedCount,sceneStatus,type SceneProgress} from '../scene-status';

/** One dot per scene, filled as takes are recorded and kept. Nothing for a video without scenes. */
export function SceneDots({scenes,pausesRemoved}:{scenes:readonly SceneProgress[];pausesRemoved?:boolean}){
 if(!scenes.length)return null;
 return <span className="dots" title={`${recordedCount(scenes)} of ${scenes.length} scenes recorded`}>{scenes.map((scene,index)=><i key={index} className={sceneStatus(scene,pausesRemoved).k}/>)}</span>;
}

/** The status word of one scene with its dot. */
export function SceneStatus({scene,pausesRemoved}:{scene:SceneProgress;pausesRemoved?:boolean}){
 const status=sceneStatus(scene,pausesRemoved);
 return <span className={`sst ${status.k}`}><span className="d"/>{status.label}</span>;
}
