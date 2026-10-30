import type {Outline,OutlineScene,Package,Video,VideoScene} from '../../../shared/club';
import {describeAngle} from '../../../shared/description';

/*
 * The parts of Record and Publish that need no screen: which recording-project scene a strip choice means, which outline scene the
 * teleprompter shows, and the description to paste into YouTube.
 */

/** The recording project's scene for an outline scene (what Continue to recording pushed), or nothing when it was not pushed. */
export const recorderSceneFor=(video:Pick<Video,'recorderScenes'>,outlineId:string|null):string|undefined=>
 outlineId?video.recorderScenes?.find(entry=>entry.outlineId===outlineId)?.sceneId:undefined;

/** The outline scene a recording-project scene belongs to: the reverse of `recorderSceneFor`. */
export const outlineSceneFor=(video:Pick<Video,'recorderScenes'>,recorderSceneId:string):string|undefined=>
 video.recorderScenes?.find(entry=>entry.sceneId===recorderSceneId)?.outlineId;

/** The scene the teleprompter shows: the focused one, else the first scene without a kept take, else the first. Nothing while there is no outline. */
export function promptScene(outline:Outline|null,scenes:readonly VideoScene[]|undefined,focusId:string|null):{index:number;scene:OutlineScene}|undefined{
 const list=outline?.scenes??[];
 if(!list.length)return undefined;
 let index=focusId?list.findIndex(scene=>scene.id===focusId):-1;
 if(index<0&&scenes)index=list.findIndex(scene=>{const known=scenes.find(value=>value.id===scene.id);return known&&!known.takes.some(take=>take.kept);});
 if(index<0)index=0;
 return {index,scene:list[index]};
}

/** The seconds each scene runs in the video: its kept take less what removing pauses cut, else the seconds the outline gives it. */
export const sceneRunSeconds=(scene:VideoScene):number=>{
 const kept=scene.takes.find(take=>take.kept);
 return kept?Math.max(0,kept.seconds-(scene.cutSeconds??0)):scene.seconds;
};

/**
 * The description to start from: the hook, the angle, then a chapter line per scene ("0:00 Opening"). YouTube needs the first chapter at 0:00.
 * Nothing comes from the outline's promise, and the angle is cut before any sentence of the planner's own notes about the brief (`describeAngle`).
 */
export function buildDescription(pkg:Package|null,scenes:readonly VideoScene[]|undefined,clock:(seconds:number)=>string):string{
 let at=0;
 const chapters=(scenes??[]).map(scene=>{const line=`${clock(at)} ${scene.title}`;at+=sceneRunSeconds(scene);return line;});
 const parts=[pkg?.hook.spoken.trim(),describeAngle(pkg?.angle??''),chapters.length?`Chapters\n${chapters.join('\n')}`:''].filter(Boolean);
 return parts.join('\n\n');
}

/** Seconds the finished video runs, from the scenes. */
export const videoSeconds=(scenes:readonly VideoScene[]|undefined)=>(scenes??[]).reduce((sum,scene)=>sum+sceneRunSeconds(scene),0);

/** Pauses are removed when at least one scene reports cut seconds. */
export const pausesRemoved=(scenes:readonly VideoScene[]|undefined)=>!!scenes?.some(scene=>(scene.cutSeconds??0)>0);

/** The link to read a YouTube link's host from: "youtu.be/abc" for "https://youtu.be/abc". */
export const shortLink=(url:string)=>url.replace(/^https?:\/\/(www\.)?/,'');
