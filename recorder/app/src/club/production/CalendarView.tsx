import {useMemo,useState,type DragEvent} from 'react';
import type {Video} from '../../../shared/club';
import {STAGE_LABEL,dayKey} from '../board';
import {calendarPlan,isSetDay,monthGrid,monthOf,monthTitle,shiftMonth} from '../production';
import {videoThumbId} from '../ideas';
import {Icon,Thumb} from '../ui';

const WEEKDAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

/**
 * A month, Monday first. A video sits on the day it was published, the day set for it, or the day it entered its stage;
 * videos in production with no day to go by are listed above. Drag a video that is not out yet onto a day to plan it for that day.
 */
export function CalendarView({videos,onOpen,onOpenPublish,onSchedule,today=new Date()}:{
 videos:readonly Video[];onOpen(video:Video):void;onOpenPublish(video:Video):void;onSchedule(id:string,day:string):void;today?:Date;
}){
 const [month,setMonth]=useState(()=>monthOf(today));
 const [dragId,setDragId]=useState<string|null>(null),[overKey,setOverKey]=useState<string|null>(null);
 const {days,unscheduled}=useMemo(()=>calendarPlan(videos),[videos]);
 const todayKey=dayKey(today);
 const end=()=>{setDragId(null);setOverKey(null);};
 const dropOn=(key:string)=>({
  onDragOver:(event:DragEvent)=>{if(!dragId)return;event.preventDefault();event.dataTransfer.dropEffect='move';setOverKey(key);},
  onDragLeave:(event:DragEvent)=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOverKey(current=>current===key?null:current);},
  onDrop:(event:DragEvent)=>{if(!dragId)return;event.preventDefault();const id=dragId;end();onSchedule(id,key);},
 });
 return <div>
  <div className="row" style={{marginBottom:12}}>
   <h2 className="sec" style={{fontSize:17}}>{monthTitle(month)}</h2>
   <button type="button" className="btn sm icon-only" aria-label="Previous month" onClick={()=>setMonth(shiftMonth(month,-1))}><Icon name="back" size={15}/></button>
   <button type="button" className="btn sm icon-only" aria-label="Next month" onClick={()=>setMonth(shiftMonth(month,1))}><Icon name="forward" size={15}/></button>
   <button type="button" className="btn sm" onClick={()=>setMonth(monthOf(today))}>Today</button>
   <span className="grow"/>
   {unscheduled.length>0&&<span className="small muted row" style={{flexWrap:'wrap',justifyContent:'flex-end'}} role="group" aria-label="Not scheduled">Not scheduled:{' '}{unscheduled.map(video=><span key={video.id} className="row" style={{gap:6}}>
    <button type="button" className="linkish" onClick={()=>onOpenPublish(video)}>{video.title}</button>
    <input type="date" className="input" style={{height:26,width:132,padding:'0 6px',fontSize:12.5}} aria-label={`Set publish date for ${video.title}`} value="" onChange={event=>{if(event.target.value)onSchedule(video.id,event.target.value);}}/>
   </span>)}</span>}
  </div>
  <div className="cal">
   {WEEKDAYS.map(name=><div key={name} className="dow">{name}</div>)}
   {monthGrid(month).flat().map(cell=><div key={cell.key} data-day={cell.key} {...dropOn(cell.key)}
    className={`day${cell.inMonth?'':' out'}${cell.key===todayKey?' today':''}${overKey===cell.key?' over':''}`}>
     <span className="dn">{cell.day}</span>
     {(days.get(cell.key)??[]).map(video=>{
      const draggable=video.stage!=='published';
      return <div key={video.id} className={`ev st-${video.stage}`} role="button" tabIndex={0} draggable={draggable}
       title={`${video.title} · ${STAGE_LABEL[video.stage]}${isSetDay(video)?'':` · Moved to ${STAGE_LABEL[video.stage]} this day`}`}
       onClick={()=>onOpen(video)} onKeyDown={event=>{if(event.key==='Enter')onOpen(video);}}
       onDragStart={draggable?event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',video.id);setDragId(video.id);}:undefined} onDragEnd={end}>
       <Thumb videoId={videoThumbId(video)} text={video.title} seed={video.id} className="mini" style={{width:30,height:17,aspectRatio:'auto',borderRadius:3,flex:'none'}}/>
       <span className="ellipsis">{video.title}</span>
      </div>;
     })}
   </div>)}
  </div>
 </div>;
}
