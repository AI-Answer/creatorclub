import {useMemo,useState,type DragEvent} from 'react';
import {Popover,PopoverContent,PopoverTrigger} from '@ui-sdk/react/popover';
import {useClubRoot} from '../ui/useClubRoot';
import type {Video} from '../../../shared/club';
import {STAGE_LABEL,dayKey,toDayKey} from '../board';
import {monthGrid,monthOf,monthTitle,shiftMonth} from '../production';
import {Dialog,Icon,StageBadge} from '../ui';

const WEEKDAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_LIMIT=1;

/** Only a publish date belongs on the calendar. Stage changes never invent a date. */
export function publishCalendarPlan(videos:readonly Video[]){
 const days=new Map<string,Video[]>(),unscheduled:Video[]=[];
 for(const video of videos){
  if(video.stage==='ideas'&&video.hidden)continue;
  const date=(video.stage==='published'?toDayKey(video.publishedAt):undefined)??toDayKey(video.publishDate);
  if(date)days.set(date,[...(days.get(date)??[]),video]);else unscheduled.push(video);
 }
 return {days,unscheduled};
}

/** A publish calendar with an explicit holding row for videos without a date. */
export function CalendarView({videos,onOpen,onSchedule,today=new Date()}:{
 videos:readonly Video[];onOpen(video:Video):void;onOpenPublish(video:Video):void;onSchedule(id:string,day:string):void;today?:Date;
}){
 const [month,setMonth]=useState(()=>monthOf(today)),[expanded,setExpanded]=useState<string|null>(null);
 const [dragId,setDragId]=useState<string|null>(null),[overKey,setOverKey]=useState<string|null>(null);
 const {days,unscheduled}=useMemo(()=>publishCalendarPlan(videos),[videos]);
 const todayKey=dayKey(today);
 const end=()=>{setDragId(null);setOverKey(null);};
 const dropOn=(key:string)=>({
  onDragOver:(event:DragEvent)=>{if(!dragId)return;event.preventDefault();event.dataTransfer.dropEffect='move';setOverKey(key);},
  onDragLeave:(event:DragEvent)=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOverKey(current=>current===key?null:current);},
  onDrop:(event:DragEvent)=>{if(!dragId)return;event.preventDefault();const id=dragId;end();onSchedule(id,key);},
 });
 const chip=(video:Video)=>{
  const draggable=video.stage!=='published';
  const open=()=>onOpen(video);
  return <div key={video.id} className="ev" role="button" tabIndex={0} draggable={draggable} title={`${video.title} · ${STAGE_LABEL[video.stage]}`}
   onClick={open} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}}}
   onDragStart={draggable?event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',video.id);setDragId(video.id);}:undefined} onDragEnd={end}>
   <StageBadge stage={video.stage} dotOnly decorative/><span className="calendar-title">{video.title}</span>
  </div>;
 };
 return <div className="calendar-view">
  <div className="row calendar-month">
   <h2 className="sec">{monthTitle(month)}</h2>
   <button type="button" className="btn sm icon-only" aria-label="Previous month" onClick={()=>setMonth(shiftMonth(month,-1))}><Icon name="back" size={15}/></button>
   <button type="button" className="btn sm icon-only" aria-label="Next month" onClick={()=>setMonth(shiftMonth(month,1))}><Icon name="forward" size={15}/></button>
   <button type="button" className="btn sm" onClick={()=>setMonth(monthOf(today))}>Today</button>
  </div>
  {unscheduled.length>0&&<section className="calendar-undated" aria-label="Unscheduled"><div className="calendar-undated-heading"><h3>Unscheduled</h3><p className="small muted calendar-hint">Set a publish date to place a video on the calendar.</p></div><div className="calendar-undated-list">{unscheduled.map(video=><div className="calendar-undated-item" key={video.id}>
   <UnscheduledChip video={video} onSchedule={onSchedule} onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',video.id);setDragId(video.id);}} onDragEnd={end}/>
  </div>)}</div></section>}
  {videos.length===0&&<p className="small muted" role="status">No videos yet. Use New video to make one, then set its publish date.</p>}
  <div className="cal">
   {WEEKDAYS.map(name=><div key={name} className="dow">{name}</div>)}
   {monthGrid(month).flat().map(cell=>{
    const entries=days.get(cell.key)??[];
    return <div key={cell.key} data-day={cell.key} {...dropOn(cell.key)} className={`day${cell.inMonth?'':' out'}${cell.key===todayKey?' today':''}${overKey===cell.key?' over':''}`}>
     <span className="dn">{cell.day}</span>{entries.slice(0,DAY_LIMIT).map(video=>chip(video))}
     {entries.length>DAY_LIMIT&&<button type="button" className="calendar-more" onClick={()=>setExpanded(cell.key)}>+{entries.length-DAY_LIMIT} more</button>}
    </div>;
   })}
  </div>
  {expanded&&<Dialog title={new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric'}).format(new Date(`${expanded}T12:00:00`))} onClose={()=>setExpanded(null)}><div className="calendar-day-list">{(days.get(expanded)??[]).map(video=>chip(video))}</div></Dialog>}
 </div>;
}


/** A date field appears only when requested; the tray stays compact and readable. */
function UnscheduledChip({video,onSchedule,onDragStart,onDragEnd}:{video:Video;onSchedule(id:string,day:string):void;onDragStart(event:DragEvent<HTMLButtonElement>):void;onDragEnd():void}){
 const [open,setOpen]=useState(false);
 const [anchor,root]=useClubRoot<HTMLSpanElement>();
 return <span ref={anchor} style={{display:'contents'}}><Popover open={open} onOpenChange={next=>setOpen(next)}>
  <PopoverTrigger className="ev calendar-unscheduled-chip" draggable={video.stage!=='published'} onDragStart={onDragStart} onDragEnd={onDragEnd} title={video.title} aria-label={`Set publish date for ${video.title}`}><StageBadge stage={video.stage} dotOnly decorative/><span className="calendar-title">{video.title}</span><Icon name="calendar" size={13} className="calendar-chip-icon"/></PopoverTrigger>
  <PopoverContent container={root} className="calendar-date-popover" aria-label={`Publish date for ${video.title}`} side="bottom" align="start" sideOffset={6} collisionPadding={8} initialFocus="content">
   <label className="small muted">Publish date<input type="date" className="input" aria-label={`Set publish date for ${video.title}`} onChange={event=>{if(event.target.value){onSchedule(video.id,event.target.value);setOpen(false);}}}/></label>
  </PopoverContent>
 </Popover></span>;
}
