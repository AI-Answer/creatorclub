import {VIDEO_STAGES,type Video,type VideoStage} from '../../shared/club';
import {arrangeColumn} from '../../shared/club-board';
import {STAGE_LABEL,dayKey,toDayKey} from './board';
import {fmtDate} from './format';
import {ACTIVE_STAGES} from './overview';
import {defaultTab,type Route,type VideoTab} from './routes';

/*
 * The logic behind Production: which videos each board column shows and where a dragged card lands, the order of the table,
 * and which day each video sits on in the calendar. Pure, so the screens only draw it.
 */

const byOrder=(a:Video,b:Video)=>a.order-b.order||a.createdAt.localeCompare(b.createdAt);
const byPublished=(a:Video,b:Video)=>(b.publishedAt??'').localeCompare(a.publishedAt??'')||byOrder(a,b);

/** Where a card opens: an idea in the Ideas drawer, any other video on the tab for its stage. */
export function openRoute(video:Video,tab?:VideoTab):Route{
 return video.stage==='ideas'?{name:'ideas',open:video.id}:{name:'video',id:video.id,tab:tab??defaultTab(video.stage)};
}

/** "2 of 5 scenes". */
export const scenesLine=(recorded:number,total:number)=>`${recorded} of ${total} ${total===1?'scene':'scenes'}`;

// ---------------------------------------------------------------- board

/** How many ideas the Ideas column shows before "View all". */
export const IDEAS_SHOWN=6;

/** What an empty column says. */
export const COLUMN_EMPTY:Record<VideoStage,string>={
 ideas:'Break down a video to get your first idea.',
 planning:'Start planning an idea to bring it here.',
 recording:'Videos land here once their scenes are planned.',
 editing:'Recorded videos land here.',
 publishing:'Nothing waiting to publish. Finish editing a video and it moves here.',
 published:'Videos land here once they are on YouTube.',
};

/** `all` is every video the column holds, `shown` the ones drawn (the first few ideas). Later and Skipped ideas are in neither. */
export interface BoardColumn{stage:VideoStage;all:Video[];shown:Video[]}

/** The six columns: board order, except Published, which has the latest first. */
export function boardColumns(videos:readonly Video[]):BoardColumn[]{
 return VIDEO_STAGES.map(stage=>{
  const all=videos.filter(video=>video.stage===stage&&!video.hidden).sort(stage==='published'?byPublished:byOrder);
  return {stage,all,shown:stage==='ideas'?all.slice(0,IDEAS_SHOWN):all};
 });
}

/** Where a dragged card lands: the index of the first card whose middle is below the pointer, else the end. */
export const dropIndex=(middles:readonly number[],pointerY:number)=>{const at=middles.findIndex(middle=>pointerY<middle);return at<0?middles.length:at;};

/**
 * The card a dropped card goes before, given the index it was dropped at among the column's drawn cards (without the dragged one).
 * Dropped at the end of a column that shows only part of its videos, it goes before the first one that is not drawn, so it stays in view.
 * Null means last. Published has no order of its own, so it is always last.
 */
export function beforeIdAt(column:BoardColumn,dragId:string,index:number):string|null{
 if(column.stage==='published')return null;
 const drawn=column.shown.filter(video=>video.id!==dragId);
 if(index<drawn.length)return drawn[index].id;
 return column.all.filter(video=>video.id!==dragId)[drawn.length]?.id??null;
}

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

/** What a move says in its toast and what Undo has to put back. */
export interface Move{message:string;previous:{stage:VideoStage;beforeId:string|null;stageDates:Video['stageDates']}}

/**
 * The move of `id` to `stage`, just before `beforeId` or last, or null when it would change nothing (a card dropped where it is, or reordered in Published).
 * Ideas put off or skipped are out of sight, so they do not count: a card dropped after the last one you see stays where it is.
 */
export function planMove(videos:readonly Video[],id:string,stage:VideoStage,beforeId:string|null):Move|null{
 const video=videos.find(v=>v.id===id);
 if(!video)return null;
 const within=video.stage===stage;
 if(within&&(stage==='published'||isSamePlace(videos.filter(v=>!v.hidden||v.id===id),id,stage,beforeId)))return null;
 const unrecorded=!within&&stage==='publishing'&&!video.recorderProjectId;
 return {message:within?`Moved in ${STAGE_LABEL[stage]}`:unrecorded?'Moved to Publishing, but nothing is recorded yet':`Moved to ${STAGE_LABEL[stage]}`,previous:{stage:video.stage,beforeId:nextInStage(videos,id),stageDates:video.stageDates}};
}

// ---------------------------------------------------------------- table

export type TableKey='title'|'stage'|'scenes'|'date'|'views';
/** `dir` 1 is the first click on a column: most advanced, latest or most first, and A to Z for titles. */
export interface TableSort{key:TableKey;dir:1|-1}
export const TABLE_HEAD:ReadonlyArray<readonly [TableKey,string]>=[['title','Video'],['stage','Stage'],['scenes','Scenes recorded'],['date','Publish date'],['views','Views']];

/** The sort after a click on a column: a new column starts at 1, the same one turns around. */
export const clickSort=(sort:TableSort,key:TableKey):TableSort=>({key,dir:sort.key===key?(sort.dir===1?-1:1):1});

/** True when the column reads from the biggest or latest down (everything but titles at `dir` 1). It sets the arrow and `aria-sort`. */
export const isDescending=({key,dir}:TableSort)=>key==='title'?dir<0:dir>0;

/** The day shown in the table's date column and the text sorted on: when it was published, else the day planned. */
const tableDate=(video:Video)=>toDayKey(video.publishedAt)??toDayKey(video.publishDate)??'';

/** The table's rows: every video that is not put off or skipped, in the order of the sort. `recorded` is how many scenes of a video have a kept take. */
export function tableRows(videos:readonly Video[],sort:TableSort,recorded:(video:Video)=>number):Video[]{
 return videos.filter(video=>!video.hidden).sort((a,b)=>{
  let result=0;
  switch(sort.key){
   case 'stage':result=VIDEO_STAGES.indexOf(b.stage)-VIDEO_STAGES.indexOf(a.stage)||a.order-b.order;break;
   case 'title':result=a.title.localeCompare(b.title);break;
   case 'views':result=(b.views??0)-(a.views??0);break;
   case 'date':result=tableDate(b).localeCompare(tableDate(a));break;
   case 'scenes':result=recorded(b)-recorded(a);break;
  }
  return result*sort.dir;
 });
}

/** The words in the table's date column: "Oct 14", "Oct 31 · planned" or nothing. */
export function tableDateText(video:Video):{text:string;planned:boolean}|null{
 const published=toDayKey(video.publishedAt);
 if(published)return {text:fmtDate(published),planned:false};
 const planned=toDayKey(video.publishDate);
 return planned?{text:`${fmtDate(planned)} · planned`,planned:true}:null;
}

// ---------------------------------------------------------------- calendar

/**
 * The day a video sits on: when it was published, else the day set for it, else the day it entered its current stage.
 * An idea has only the day set for it. Nothing for a video that has no day to go by.
 */
export function calendarDay(video:Video):string|undefined{
 if(video.hidden)return undefined;
 if(video.stage==='ideas')return toDayKey(video.publishDate);
 return (video.stage==='published'?toDayKey(video.publishedAt):undefined)??toDayKey(video.publishDate)??toDayKey(video.stageDates[video.stage]);
}

/** True when the day is the one the video was given, not one worked out from its stage. */
export const isSetDay=(video:Video)=>video.stage==='published'?!!toDayKey(video.publishedAt):!!toDayKey(video.publishDate);

export interface CalendarPlan{days:Map<string,Video[]>;unscheduled:Video[]}
/** Videos by day, and the ones in production that have no day to go by, the furthest along first. */
export function calendarPlan(videos:readonly Video[]):CalendarPlan{
 const days=new Map<string,Video[]>(),unscheduled:Video[]=[];
 for(const video of [...videos].sort(byOrder)){
  const key=calendarDay(video);
  if(key)days.set(key,[...(days.get(key)??[]),video]);
  else if(!video.hidden&&ACTIVE_STAGES.includes(video.stage))unscheduled.push(video);
 }
 return {days,unscheduled:unscheduled.sort((a,b)=>VIDEO_STAGES.indexOf(b.stage)-VIDEO_STAGES.indexOf(a.stage))};
}

export type Month={year:number;month:number};
export const monthOf=(date:Date):Month=>({year:date.getFullYear(),month:date.getMonth()});
export const shiftMonth=({year,month}:Month,by:number):Month=>monthOf(new Date(year,month+by,1));
export const monthTitle=({year,month}:Month)=>new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date(year,month,1));

export type CalendarCell={key:string;day:number;inMonth:boolean};
/** Whole weeks, Monday first, covering the month. */
export function monthGrid({year,month}:Month):CalendarCell[][]{
 const first=new Date(year,month,1,12),lead=(first.getDay()+6)%7;
 const total=Math.ceil((lead+new Date(year,month+1,0).getDate())/7)*7;
 const cells=Array.from({length:total},(_,i)=>{const date=new Date(year,month,1-lead+i,12);return {key:dayKey(date),day:date.getDate(),inMonth:date.getMonth()===month};});
 return Array.from({length:total/7},(_,week)=>cells.slice(week*7,week*7+7));
}
