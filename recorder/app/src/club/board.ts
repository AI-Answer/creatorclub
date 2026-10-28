import {VIDEO_STAGES,type Video,type VideoStage} from '../../shared/club';
import {arrangeColumn} from '../../shared/club-board';
import type {VideoStep} from './routes';

/** Column names, copied from PLAN.md. */
export const STAGE_LABEL:Record<VideoStage,string>={ideas:'Ideas',planning:'Planning',recording:'Recording',editing:'Editing',publishing:'Publishing',published:'Published'};

/** What SceneForge knows about a video's recording project. */
export type ProjectProgress={scenes:number;recorded:number;thumbnailMediaId?:string};

/** The step of a video's page that matches its stage. */
export const stepForStage=(stage:VideoStage):VideoStep=>({ideas:'plan',planning:'plan',recording:'record',editing:'edit',publishing:'publish',published:'publish'} as const)[stage];

const shortDate=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'});

// ---------------------------------------------------------------- status and thumbnails

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

/** A recording's own thumbnail, else the published video's. Undefined shows a plain tile. */
export function thumbnailUrl(video:Video,progress?:ProjectProgress):string|undefined{
 if(progress?.thumbnailMediaId)return `/api/media/${encodeURIComponent(progress.thumbnailMediaId)}/thumbnail`;
 const id=youtubeId(video.youtubeUrl);
 return id?`https://i.ytimg.com/vi/${id}/mqdefault.jpg`:undefined;
}

// ---------------------------------------------------------------- grouping and ordering

export type HiddenFilter={later:boolean;skipped:boolean};
export const noHidden:HiddenFilter={later:false,skipped:false};

/** Videos marked Later or Skipped stay out of view until their toggle is on. */
export const visibleVideos=(videos:readonly Video[],show:HiddenFilter)=>videos.filter(v=>!v.hidden||(v.hidden==='later'?show.later:show.skipped));

export const hiddenCounts=(videos:readonly Video[])=>({later:videos.filter(v=>v.hidden==='later').length,skipped:videos.filter(v=>v.hidden==='skipped').length});

const byOrder=(a:Video,b:Video)=>a.order-b.order||a.createdAt.localeCompare(b.createdAt);

/** One list per stage, each in board order. */
export function groupByStage(videos:readonly Video[]):Record<VideoStage,Video[]>{
 const groups=Object.fromEntries(VIDEO_STAGES.map(stage=>[stage,[] as Video[]])) as Record<VideoStage,Video[]>;
 for(const video of [...videos].sort(byOrder))groups[video.stage].push(video);
 return groups;
}

/** Every video, stage by stage and in board order. */
export const inBoardOrder=(videos:readonly Video[]):Video[]=>{const groups=groupByStage(videos);return VIDEO_STAGES.flatMap(stage=>groups[stage]);};

/** The most recently opened videos that still exist, up to `limit`. */
export function recentVideos(videos:readonly Video[],ids:readonly string[],limit=4):Video[]{
 const byId=new Map(videos.map(v=>[v.id,v]));
 return ids.flatMap(id=>byId.get(id)??[]).slice(0,limit);
}

/** Where a dragged card lands: the index of the first card whose middle is below the pointer, else the end. */
export const dropIndex=(middles:readonly number[],pointerY:number)=>{const at=middles.findIndex(middle=>pointerY<middle);return at<0?middles.length:at;};

/** True when putting the video there would change nothing. */
export function isSamePlace(videos:readonly Video[],id:string,stage:VideoStage,beforeId?:string|null):boolean{
 const video=videos.find(v=>v.id===id);
 if(!video||video.stage!==stage)return false;
 const current=videos.filter(v=>v.stage===stage).sort(byOrder).map(v=>v.id);
 const next=arrangeColumn(videos,id,stage,beforeId);
 return current.length===next.length&&current.every((value,i)=>value===next[i]);
}

/** The list after a move, numbered the way the server numbers it. */
export function applyMove(videos:readonly Video[],id:string,stage:VideoStage,beforeId:string|null|undefined,at:string,stageDates?:Video['stageDates']):Video[]{
 const column=arrangeColumn(videos,id,stage,beforeId);
 return videos.map(video=>{
  const order=column.indexOf(video.id);
  if(order<0)return video;
  if(video.id!==id)return video.order===order?video:{...video,order};
  return {...video,stage,order,updatedAt:at,stageDates:stageDates??(video.stage===stage?video.stageDates:{...video.stageDates,[stage]:at})};
 });
}

/** The video that follows `id` in its stage, used to put it back when a move is undone. */
export const nextInStage=(videos:readonly Video[],id:string):string|null=>{
 const video=videos.find(v=>v.id===id);if(!video)return null;
 const column=videos.filter(v=>v.stage===video.stage).sort(byOrder);
 return column[column.findIndex(v=>v.id===id)+1]?.id??null;
};

// ---------------------------------------------------------------- calendar

const pad=(n:number)=>String(n).padStart(2,'0');
const DAY=/^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-26" in local time. */
export const dayKey=(date:Date)=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;

/** The local date for a day key, at midday so daylight-saving shifts never change the day. */
export const parseDay=(key:string)=>{const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d,12);};

/** Oct 26 */
export const formatDay=(key:string)=>shortDate.format(parseDay(key));

/** The day a video sits on in the calendar: the day it was published, else the planned day. */
export function videoDayKey(video:Pick<Video,'publishedAt'|'publishDate'>):string|undefined{
 for(const value of [video.publishedAt,video.publishDate]){
  if(!value)continue;
  if(DAY.test(value))return value;
  const date=new Date(value);
  if(!Number.isNaN(date.getTime()))return dayKey(date);
 }
 return undefined;
}

export const videosByDay=(videos:readonly Video[]):Map<string,Video[]>=>{
 const days=new Map<string,Video[]>();
 for(const video of [...videos].sort(byOrder)){const key=videoDayKey(video);if(key)days.set(key,[...(days.get(key)??[]),video]);}
 return days;
};

export type Month={year:number;month:number};
export const monthOf=(date:Date):Month=>({year:date.getFullYear(),month:date.getMonth()});
export const shiftMonth=({year,month}:Month,by:number):Month=>{const date=new Date(year,month+by,1);return monthOf(date);};
export const monthTitle=({year,month}:Month)=>new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date(year,month,1));

export type CalendarDay={key:string;day:number;inMonth:boolean};
/** Whole weeks, Monday first, covering the month. */
export function monthGrid({year,month}:Month):CalendarDay[][]{
 const first=new Date(year,month,1,12),lead=(first.getDay()+6)%7;
 const total=Math.ceil((lead+new Date(year,month+1,0).getDate())/7)*7;
 const days=Array.from({length:total},(_,i)=>{const date=new Date(year,month,1-lead+i,12);return {key:dayKey(date),day:date.getDate(),inMonth:date.getMonth()===month};});
 return Array.from({length:total/7},(_,week)=>days.slice(week*7,week*7+7));
}

/** Videos past the idea stage that have no day yet and are not published. Further along first. */
export const unscheduled=(videos:readonly Video[]):Video[]=>
 videos.filter(v=>v.stage!=='ideas'&&v.stage!=='published'&&!videoDayKey(v)).sort((a,b)=>VIDEO_STAGES.indexOf(b.stage)-VIDEO_STAGES.indexOf(a.stage)||byOrder(a,b));
