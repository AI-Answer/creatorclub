import {useState,type DragEvent} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import type {Video} from '../../shared/club';
import {dayKey,monthGrid,monthOf,monthTitle,shiftMonth,unscheduled,videosByDay,STAGE_LABEL} from './board';
import {Button,Card,cn} from './ui';

const WEEKDAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function Chip({video,onOpen,onDragStart,onDragEnd}:{video:Video;onOpen():void;onDragStart?(event:DragEvent<HTMLButtonElement>):void;onDragEnd?():void}){
 return <button type="button" draggable={!!onDragStart} onClick={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} title={`${video.title} · ${STAGE_LABEL[video.stage]}`}
  className={cn('block w-full truncate rounded-md bg-accent-soft px-2 py-1 text-left text-xs font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent',onDragStart&&'cursor-grab active:cursor-grabbing')}>{video.title}</button>;
}

/** A month grid, Monday first. Drag a video onto a day to plan it for that day; drag it to the list below to clear the day. */
export function CalendarView({videos,onOpen,onSchedule,today=new Date()}:{videos:readonly Video[];onOpen(id:string):void;onSchedule(id:string,day:string|null):void;today?:Date}){
 const [month,setMonth]=useState(()=>monthOf(today));
 const [dragId,setDragId]=useState<string|null>(null),[overKey,setOverKey]=useState<string|null>(null);
 const days=videosByDay(videos),todayKey=dayKey(today),pending=unscheduled(videos);
 const end=()=>{setDragId(null);setOverKey(null);};
 const start=(video:Video)=>(event:DragEvent)=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',video.id);setDragId(video.id);};
 const dropOn=(key:string|null)=>({
  onDragOver:(event:DragEvent)=>{if(!dragId)return;event.preventDefault();event.dataTransfer.dropEffect='move';setOverKey(key??'tray');},
  onDragLeave:(event:DragEvent)=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOverKey(current=>current===(key??'tray')?null:current);},
  onDrop:(event:DragEvent)=>{if(!dragId)return;event.preventDefault();const id=dragId;end();onSchedule(id,key);},
 });
 const draggable=(video:Video)=>!video.publishedAt;
 return <div className="flex flex-col gap-4">
  <div className="flex items-center gap-2">
   <h2 className="min-w-40 text-lg font-semibold text-ink">{monthTitle(month)}</h2>
   <Button size="sm" variant="ghost" aria-label="Previous month" onClick={()=>setMonth(shiftMonth(month,-1))}><ChevronLeft/></Button>
   <Button size="sm" variant="ghost" aria-label="Next month" onClick={()=>setMonth(shiftMonth(month,1))}><ChevronRight/></Button>
   <Button size="sm" onClick={()=>setMonth(monthOf(today))}>Today</Button>
  </div>
  <div aria-label="Not scheduled" {...dropOn(null)} className={cn('flex flex-col gap-2 rounded-lg border border-dashed border-line p-3',overKey==='tray'&&'border-accent bg-accent-soft')}>
   <p className="text-sm font-medium text-muted">Not scheduled</p>
   {pending.length===0?<p className="text-sm text-muted">Videos in Planning or later appear here until they have a day.</p>
    :<div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">{pending.map(video=><div key={video.id} className="max-w-60"><Chip video={video} onOpen={()=>onOpen(video.id)} onDragStart={start(video)} onDragEnd={end}/></div>)}</div>}
  </div>
  <Card className="overflow-hidden">
   <div className="grid grid-cols-7 border-b border-line">{WEEKDAYS.map(name=><div key={name} className="px-2 py-2 text-sm font-medium text-muted">{name}</div>)}</div>
   {monthGrid(month).map(week=><div key={week[0].key} className="grid grid-cols-7 border-b border-line last:border-b-0">
    {week.map(day=><div key={day.key} data-day={day.key} {...dropOn(day.key)}
     className={cn('flex min-h-28 min-w-0 flex-col gap-1 border-r border-line p-1.5 last:border-r-0',!day.inMonth&&'bg-subtle/60',overKey===day.key&&'bg-accent-soft')}>
      <span className={cn('flex size-6 items-center justify-center self-start rounded-full text-sm',day.key===todayKey?'bg-primary font-semibold text-primary-ink':day.inMonth?'text-ink':'text-muted')}>{day.day}</span>
      {(days.get(day.key)??[]).map(video=><Chip key={video.id} video={video} onOpen={()=>onOpen(video.id)} onDragStart={draggable(video)?start(video):undefined} onDragEnd={end}/>)}
    </div>)}
   </div>)}
  </Card>
 </div>;
}
