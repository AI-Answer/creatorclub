import type {Video,VideoStage} from '../../shared/club';

/** Column names, copied from PLAN.md. */
export const STAGE_LABEL:Record<VideoStage,string>={ideas:'Ideas',planning:'Planning',recording:'Recording',editing:'Editing',publishing:'Publishing',published:'Published'};

const shortDate=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'});

// ---------------------------------------------------------------- status

/** Short status under a card: "Planning · 1 of 2" (package, scenes). */
export function statusLine(video:Video):string{
 switch(video.stage){
  case 'ideas':return 'Idea';
  case 'planning':return `Planning · ${[video.planning.package,video.planning.outline].filter(Boolean).length} of 2`;
  case 'published':{const day=videoDayKey(video);return day?`Published · ${formatDay(day)}`:'Published';}
  default:return STAGE_LABEL[video.stage];
 }
}

/** The 11-character id in a YouTube link: watch, youtu.be, shorts, live and embed forms. */
export function youtubeId(url:string|undefined):string|undefined{
 if(!url)return undefined;
 let parsed:URL;try{parsed=new URL(url);}catch{return undefined;}
 const host=parsed.hostname.replace(/^(www|m)\./,'');
 const id=host==='youtu.be'?parsed.pathname.split('/')[1]:host==='youtube.com'?(parsed.searchParams.get('v')??parsed.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1]):undefined;
 return id&&/^[\w-]{11}$/.test(id)?id:undefined;
}

// ---------------------------------------------------------------- days

const pad=(n:number)=>String(n).padStart(2,'0');
const DAY=/^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-26" in local time. */
export const dayKey=(date:Date)=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;

/** The local date for a day key, at midday so daylight-saving shifts never change the day. */
export const parseDay=(key:string)=>{const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d,12);};

/** Oct 26 */
export const formatDay=(key:string)=>shortDate.format(parseDay(key));

/** The day a stored date falls on, in local time: a day (`2026-10-26`) as it is, a full time as the day it was in this timezone. */
export function toDayKey(value:string|undefined):string|undefined{
 if(!value)return undefined;
 if(DAY.test(value))return value;
 const date=new Date(value);
 return Number.isNaN(date.getTime())?undefined:dayKey(date);
}

/** The day a video was published, else the day planned for it. */
export const videoDayKey=(video:Pick<Video,'publishedAt'|'publishDate'>):string|undefined=>toDayKey(video.publishedAt)??toDayKey(video.publishDate);
