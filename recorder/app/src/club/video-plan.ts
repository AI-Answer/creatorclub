import {VIDEO_STAGES,type VideoStage} from '../../shared/club';
import {looksLikeVideoLink} from './breakdown';

/*
 * The rules of a video's page that need no screen: where a Continue button moves the card, and what a pasted or dropped thing
 * becomes on the research board.
 */

const rank=(stage:VideoStage)=>VIDEO_STAGES.indexOf(stage);
/** A Continue only ever moves a card forward. A card dragged further along stays where it is. */
export const movesForward=(from:VideoStage,to:VideoStage)=>rank(to)>rank(from);

/** The stage is at or past `reached`. */
export const stageReached=(stage:VideoStage,reached:VideoStage)=>rank(stage)>=rank(reached);

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
