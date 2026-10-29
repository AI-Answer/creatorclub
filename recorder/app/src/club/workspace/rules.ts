import type {VideoScene,VideoStage} from '../../../shared/club';
import {videoTabs,type VideoTab} from '../routes';
import {movesForward,stageReached} from '../video-plan';

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
export const allScenesKept=(scenes:readonly Pick<VideoScene,'takes'>[]|undefined)=>!!scenes?.length&&scenes.every(scene=>scene.takes.some(take=>take.kept));

/**
 * Whether the tab's own job is done. Board and Plan: there are scenes. Record: every scene has a kept take.
 * Edit: the edit was exported, or the video moved on to publishing. Publish: it is published.
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

/** Picking a scene in the strip only jumps to Plan from the Board, as in the prototype; on any other tab it focuses the scene there. */
export const pickJumpsToPlan=(tab:VideoTab)=>tab==='board';

/** "5 scenes · 4:30", "1 scene · 0:45". */
export function scenesLine(scenes:readonly Pick<VideoScene,'seconds'>[],clock:(seconds:number)=>string):string{
 return `${scenes.length} ${scenes.length===1?'scene':'scenes'} · ${clock(scenes.reduce((sum,scene)=>sum+scene.seconds,0))}`;
}

/** What the page says when a take under review could not be added to the timeline on the way out of Record. */
export const TAKE_NOT_ADDED="Couldn't add your take to the timeline. Press Continue under the take to try again.";

/** The titles of scenes whose recorded take is not on the timeline and was not set aside on purpose. */
export function takesWaiting(scenes: Array<{title:string;takes:Array<{kept:boolean;retained:boolean}>}>|undefined):string[]{
 return (scenes??[]).filter(scene=>scene.takes.length>0&&!scene.takes.some(take=>take.kept)&&scene.takes.some(take=>!take.retained)).map(scene=>scene.title);
}
