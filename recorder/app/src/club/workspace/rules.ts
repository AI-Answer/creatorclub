import type {VideoScene,VideoStage} from '../../../shared/club';
import {videoTabs,type VideoTab} from '../routes';
import {movesForward,stageReached} from '../video-plan';
import {isSceneRecorded} from '../scene-status';

/*
 * The rules of a video's workspace that need no screen: the tabs and their words, where Continue moves the card,
 * and when a tab's job is done (which ticks the tab and makes Continue the primary button).
 */

export const TAB_LABEL:Record<VideoTab,string>={board:'Board',plan:'Plan',record:'Record',edit:'Edit',publish:'Publish'};

/** The stage a card is in while a tab's job is being done. Nothing continues to Board. */
export const STAGE_OF_TAB:Record<VideoTab,VideoStage|undefined>={board:undefined,plan:'planning',record:'recording',edit:'editing',publish:'publishing'};

export const previousTab=(tab:VideoTab):VideoTab|undefined=>videoTabs[videoTabs.indexOf(tab)-1];
export const nextTab=(tab:VideoTab):VideoTab|undefined=>videoTabs[videoTabs.indexOf(tab)+1];

/** The stage Continue to `tab` moves a card from `stage` to, or nothing when it would not move forward (a card dragged further along stays). */
export function stageForContinue(stage:VideoStage,tab:VideoTab):VideoStage|undefined{
 const target=STAGE_OF_TAB[tab];
 return target&&movesForward(stage,target)?target:undefined;
}

/** What the workspace knows about a video when asking whether a tab is done. `scenes` is undefined while they are not known. */
export interface TabFacts{
 stage:VideoStage;
 scenes?:readonly Pick<VideoScene,'takes'>[];
 /** The recorder says every scene has a take (live, before the scenes are read again). */
 allRecorded?:boolean;
 /** The editor says the current edit has a finished export. */
 exported?:boolean;
}

/** True when every scene has a kept take. A video with no scenes has recorded nothing. */
export const allScenesKept=(scenes:readonly Pick<VideoScene,'takes'>[]|undefined)=>!!scenes?.length&&scenes.every(isSceneRecorded);

/**
 * Whether the tab's own job is done. Board and Plan: there are scenes. Record: every scene has a kept take.
 * Edit: the edit was exported, or the video moved on to publishing (a take on the timeline is not a finished edit). Publish: it is published.
 */
export function tabDone(tab:VideoTab,{stage,scenes,allRecorded,exported}:TabFacts):boolean{
 const hasScenes=!!scenes?.length;
 switch(tab){
  case 'board':return hasScenes;
  case 'plan':return hasScenes;
  case 'record':return !!allRecorded||allScenesKept(scenes);
  case 'edit':return !!exported||stageReached(stage,'publishing');
  case 'publish':return stage==='published';
 }
}

/** Continue is the primary button only once the tab's job is done and the tab has no primary of its own still waiting (one primary per view). */
export const continueIsPrimary=(done:boolean,ownPrimary:boolean)=>done&&!ownPrimary;

/** Recorder facts used by the workspace. They never restrict navigation. */
export interface LockFacts{
 stage:VideoStage;
 /** The video's scenes with their takes; undefined while they are not known (nothing is locked on a guess). */
 scenes?:readonly Pick<VideoScene,'takes'>[];
 /** The video has a recording project. */
 hasRecording:boolean;
}

/** A locked step: the one line that says what unlocks it, and the step that does. */
export type TabLock={reason:string;unlock:VideoTab};

/** Workspace navigation is always available, regardless of stage, outline or takes. */
export function tabLock(_tab:VideoTab,_facts:LockFacts):TabLock|undefined{return undefined;}

/** How a step shows in the step bar: done (ticked), the current one, the next one Continue goes to, locked, or open. */
export type TabState='done'|'current'|'next'|'open';

export function tabState(key:VideoTab,current:VideoTab,facts:TabFacts&LockFacts):TabState{
 if(key===current)return 'current';
 if(tabDone(key,facts))return 'done';
 return key===nextTab(current)?'next':'open';
}

/** "Continue to recording": every Continue names the step it opens by what you do there. */
export const CONTINUE_LABEL:Record<VideoTab,string>={board:'Continue to board',plan:'Continue to planning',record:'Continue to recording',edit:'Continue to editing',publish:'Continue to publishing'};

/** The bottom bar's Continue: what it says, whether it can go, the plain line that says why not, and whether it is the primary. */
export type ContinueButton={label:string;disabled:boolean;reason?:string;primary:boolean};

/**
 * Continue opens the next step without requiring earlier steps to be finished. While Claude writes it waits and says so.
 * It is the primary only once the step's job is done and the step shows no primary of its own (`ownPrimary`). The last step has none.
 */
export function continueFor(tab:VideoTab,facts:TabFacts&LockFacts,{busy=false,ownPrimary=false}:{busy?:boolean;ownPrimary?:boolean}={}):ContinueButton|undefined{
 const next=nextTab(tab);
 if(!next)return undefined;
 const label=CONTINUE_LABEL[next];
 if(busy)return {label,disabled:true,reason:'Claude is still writing',primary:false};
 // Edit and Publish can open with only some scenes recorded, but Continue says so and never pushes forward as the primary.
 const missing=(next==='edit'||next==='publish')&&facts.scenes&&!facts.allRecorded?facts.scenes.length-facts.scenes.filter(isSceneRecorded).length:0;
 if(missing>0)return {label,disabled:false,reason:missing===1?'1 scene isn\'t recorded yet':`${missing} scenes aren't recorded yet`,primary:false};
 return {label,disabled:false,primary:continueIsPrimary(tabDone(tab,facts),ownPrimary)};
}

/** The scene chips appear only where a scene is chosen to work on: Record and Edit. Board, Plan and Publish have their own scene lists or none. */

/** "5 scenes · 4:30", "1 scene · 0:45". */
export function scenesLine(scenes:readonly Pick<VideoScene,'seconds'>[],clock:(seconds:number)=>string):string{
 return `${scenes.length} ${scenes.length===1?'scene':'scenes'} · ${clock(scenes.reduce((sum,scene)=>sum+scene.seconds,0))}`;
}

/** What the page says when a take under review could not be added to the timeline on the way out of Record. */
export const TAKE_NOT_ADDED="Couldn't add your take to the timeline. Press Continue under the take to try again.";

/** The titles of scenes whose recorded take is not on the timeline and was not set aside on purpose. */
export function takesWaiting(scenes: Array<{title:string;takes:Array<{kept:boolean;retained:boolean}>}>|undefined):string[]{
 return (scenes??[]).filter(scene=>scene.takes.length>0&&!isSceneRecorded(scene)&&scene.takes.some(take=>!take.retained)).map(scene=>scene.title);
}
