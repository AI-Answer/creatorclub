import {PLAN_STEPS,VIDEO_STAGES,type PlanStep,type Video,type VideoStage} from '../../shared/club';
import {looksLikeVideoLink} from './breakdown';

/*
 * The rules of a video's page that need no screen: which step belongs to which stage, where a Continue button moves the
 * card, which steps show a tick, which Plan step is open, and what a pasted or dropped thing becomes on the research board.
 */

/** The steps the Plan tab still shows. Research is the Board tab now. */
export const PLAN_TAB_STEPS=['package','outline'] as const;
export type PlanTabStep=typeof PLAN_TAB_STEPS[number];

const rank=(stage:VideoStage)=>VIDEO_STAGES.indexOf(stage);
/** A Continue only ever moves a card forward. A card dragged further along stays where it is. */
export const movesForward=(from:VideoStage,to:VideoStage)=>rank(to)>rank(from);

/** The stage is at or past `reached`. */
export const stageReached=(stage:VideoStage,reached:VideoStage)=>rank(stage)>=rank(reached);

/** PLAN.md's copy for the Plan steps, word for word. */
export const PLAN_COPY:Record<PlanTabStep,{title:string;help:string;action:string}>={
 package:{title:'Package',help:'Decide why this video gets clicked.',action:'Package it'},
 outline:{title:'Create outline',help:"Turn this into scenes. You'll talk through each one when you record.",action:'Create outline'},
};

export const WRITE_SCRIPT='Write full script instead';

/** The Plan step that opens first: the first one not completed yet, else the outline. */
export function openPlanStep(planning:Video['planning']):PlanTabStep{
 return PLAN_TAB_STEPS.find(step=>!planning[step])??'outline';
}

/** The step after this one inside Plan, or nothing after the outline (Continue to record leaves Plan). */
export const nextPlanStep=(step:PlanStep):PlanStep|undefined=>PLAN_STEPS[PLAN_STEPS.indexOf(step)+1];

/** "Your outline changed after you recorded scene 3." */
export const changedSceneLine=(scene:number)=>`Your outline changed after you recorded scene ${scene}.`;

/** What a pasted or dropped piece of text becomes: a video for YouTube and Instagram links, a link for other web addresses, otherwise text. */
export function tileFromText(input:string):{kind:'video'|'link';url:string}|{kind:'text';text:string}|undefined{
 const text=input.trim();
 if(!text)return undefined;
 if(looksLikeVideoLink(text))return {kind:'video',url:/^[a-z][a-z0-9+.-]*:\/\//i.test(text)?text:`https://${text}`};
 if(!/\s/.test(text)&&/^(https?:\/\/|www\.)\S+\.\S+/i.test(text))return {kind:'link',url:/^https?:\/\//i.test(text)?text:`https://${text}`};
 return {kind:'text',text};
}

/** "youtube.com", for a link tile's heading. */
export function linkHost(url:string):string{
 try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url;}
}

/** "0:00", "12:05", "1:02:03". */
export function clockTime(seconds:number):string{
 const whole=Math.max(0,Math.round(seconds)),h=Math.floor(whole/3600),m=Math.floor(whole%3600/60),s=whole%60;
 return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;
}
