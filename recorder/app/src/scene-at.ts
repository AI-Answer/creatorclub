import type {Scene} from '../shared/types';

/**
 * The scene the playhead is in: the scene whose time range holds it. Scenes with no footage (duration 0) never hold it, and at or past the end
 * of the last scene with footage the last one still does, so the scene chips never go blank at the end of a video. Undefined when nothing is on the timeline.
 */
export function sceneAt(scenes:readonly Pick<Scene,'id'|'start'|'duration'>[],time:number):string|undefined{
 const timed=scenes.filter(scene=>scene.duration>0).sort((a,b)=>a.start-b.start);
 if(!timed.length)return undefined;
 const inside=timed.find(scene=>time>=scene.start&&time<scene.start+scene.duration);
 if(inside)return inside.id;
 // Between two scenes (a gap) the earlier one still holds the playhead; before the first, the first does.
 const before=[...timed].reverse().find(scene=>scene.start<=time);
 return (before??timed[0]).id;
}
