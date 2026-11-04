import {AUDIENCE_LABELS,TOPIC_LABELS} from '../../shared/club';
import {formatMultiplier,outlierBand} from './outlier';

/** Display helpers, ported from the prototype's core.js. Pure, so the words and numbers they produce are tested once. */

/** 1.2K, 34K, 2.4M, 1.1B. Nothing known shows as a dash. */
export function fmtNum(n:number|null|undefined):string{
 if(n==null||Number.isNaN(n))return '—';
 const a=Math.abs(n);
 if(a>=1e9)return (n/1e9).toFixed(a>=1e10?0:1).replace(/\.0$/,'')+'B';
 if(a>=1e6)return (n/1e6).toFixed(a>=1e7?0:1).replace(/\.0$/,'')+'M';
 if(a>=1e3)return (n/1e3).toFixed(a>=1e4?0:1).replace(/\.0$/,'')+'K';
 return String(Math.round(n));
}

/** Two decimals under 10×, rounded from 10× up: "2.84×", "23×". */
export const fmtMult=formatMultiplier;

/** The chip class for an outlier multiplier: `b-grey` under 1×, then blue, green, amber, orange, and `b-red` from 50×. */
export const band=(multiplier:number)=>`b-${outlierBand(multiplier)}`;

/** "5h ago" under a day, "1 day ago", "9 days ago". */
export function fmtDays(days:number):string{
 if(days<1)return `${Math.max(1,Math.round(days*24))}h ago`;
 return Math.round(days)===1?'1 day ago':`${Math.round(days)} days ago`;
}

/** "20m", "5h", "3d": minutes under an hour, hours under two days, then days. */
export function fmtHours(hours:number):string{
 if(hours<1)return `${Math.round(hours*60)}m`;
 return hours<48?`${Math.round(hours)}h`:`${Math.round(hours/24)}d`;
}

/** Seconds as a clock: 75 is "1:15". */
export function fmtClock(seconds:number):string{
 const s=Math.max(0,Math.round(seconds));
 return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}

/** Seconds in words: "1m 15s", "2m", "45s". */
export function fmtMS(seconds:number):string{
 const s=Math.round(seconds),minutes=Math.floor(s/60),rest=s%60;
 return minutes?(rest?`${minutes}m ${rest}s`:`${minutes}m`):`${rest}s`;
}

/** "1:30" is 90 seconds; a bare number is minutes ("2" is 120). Anything else is nothing. */
export function parseClock(text:string):number|null{
 const clock=String(text).trim().match(/^(\d+):(\d{1,2})$/);
 if(clock)return +clock[1]*60+ +clock[2];
 const minutes=parseFloat(text);
 return Number.isNaN(minutes)?null:Math.round(minutes*60);
}

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** "Oct 29" from a day (`2026-10-29`) or a full ISO time. */
export function fmtDate(iso:string|null|undefined):string{
 if(!iso)return '—';
 const date=new Date(iso+(iso.length===10?'T12:00:00':''));
 return Number.isNaN(date.getTime())?'—':`${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** Two letters for an avatar: "Samin Yasar" is "SY", "r/ClaudeAI" is "CL", one word takes its first two letters. */
export function initials(name:string|null|undefined):string{
 const words=String(name||'?').replace(/^r\//,'').replace(/[^\p{L}\p{N} ]/gu,' ').trim().split(/\s+/);
 return ((words[0]||'?')[0]+(words[1]?words[1][0]:(words[0]||'')[1]||'')).toUpperCase();
}

/** The medium-size thumbnail YouTube serves for a video id. */
export const ytThumb=(id:string)=>`https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/** Upper-cases the first letter. */
export const sentence=(text:string)=>text?text.charAt(0).toUpperCase()+text.slice(1):text;

/** The creator's name in a channel title like "Duncan Rogoff | AI Automation": what is before the first bar. */
export const creatorName=(channel:string|null|undefined)=>String(channel||'').split('|')[0].trim();

/** A topic or audience as it is written to the person: the spelling Welcome offers when it is one of those ("ai agents" is "AI agents"), else with a capital first letter. */
export const topicLabel=(value:string)=>[...TOPIC_LABELS,...AUDIENCE_LABELS].find(label=>label.toLowerCase()===value.trim().toLowerCase())??sentence(value.trim());

/** A title without a trailing "(…)" note. */
export const cleanTitle=(title:string|null|undefined)=>String(title||'').replace(/\s*\([^)]*\)\s*$/,'').trim();

/** A stable number for a string, so the same name always gets the same colour. */
export function hashOf(text:string):number{
 let hash=0;
 for(const char of String(text))hash=(hash*31+char.charCodeAt(0))|0;
 return Math.abs(hash);
}

/** Avatars are neutral (the colour rule allows no extra hues): four greys from `ui/tokens.css`, told apart by their initials. */
const AVATAR_COLORS=[1,2,3,4].map(n=>`var(--cc-avatar-${n})`);
/** The background of an avatar for a name: the same name always gets the same token. */
export const avatarColor=(name:string)=>AVATAR_COLORS[hashOf(name)%AVATAR_COLORS.length];

/** Legacy draft-thumbnail colour pairs all read the neutral surface tokens. */
const THUMB_GRADIENTS:ReadonlyArray<readonly [string,string]>=[1,2,3,4].map(n=>[`var(--cc-thumb-${n}-from)`,`var(--cc-thumb-${n}-to)`] as const);
/** The two colours of a draft thumbnail for a seed (a video id), as token references. */
export const thumbGradient=(seed:string)=>THUMB_GRADIENTS[hashOf(seed)%THUMB_GRADIENTS.length];
