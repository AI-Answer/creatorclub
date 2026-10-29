import type {Video,VideoStage} from '../../shared/club';
import type {VideoStep} from './routes';

/** Column names, copied from PLAN.md. */
export const STAGE_LABEL:Record<VideoStage,string>={ideas:'Ideas',planning:'Planning',recording:'Recording',editing:'Editing',publishing:'Publishing',published:'Published'};

/** What SceneForge knows about a video's recording project. */
export type ProjectProgress={scenes:number;recorded:number;thumbnailMediaId?:string};

/** The step of a video's page that matches its stage. */
export const stepForStage=(stage:VideoStage):VideoStep=>({ideas:'plan',planning:'plan',recording:'record',editing:'edit',publishing:'publish',published:'publish'} as const)[stage];

const shortDate=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'});

// ---------------------------------------------------------------- status

/** Short status under a card: "Planning · 2 of 3", "Recording · 2 of 5 scenes". Only counts what is known. */
export function statusLine(video:Video,progress?:ProjectProgress):string{
 switch(video.stage){
  case 'ideas':return 'Idea';
  case 'planning':return `Planning · ${Object.values(video.planning).filter(Boolean).length} of 3`;
  case 'recording':return progress&&progress.scenes>0?`Recording · ${progress.recorded} of ${progress.scenes} ${progress.scenes===1?'scene':'scenes'}`:'Recording';
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
