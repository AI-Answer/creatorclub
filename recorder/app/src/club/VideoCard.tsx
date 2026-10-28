import {useState,type DragEvent} from 'react';
import {Clapperboard} from 'lucide-react';
import type {Video} from '../../shared/club';
import {statusLine,thumbnailUrl,type ProjectProgress} from './board';
import {Badge,cn} from './ui';

function Thumbnail({video,progress,className}:{video:Video;progress?:ProjectProgress;className?:string}){
 const url=thumbnailUrl(video,progress),[failed,setFailed]=useState(false);
 return <span aria-hidden className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle text-muted',className)}>
  {url&&!failed?<img src={url} alt="" loading="lazy" draggable={false} onError={()=>setFailed(true)} className="size-full object-cover"/>:<Clapperboard size={16}/>}
 </span>;
}

/**
 * A video on the board. `compact` sits in a column (thumbnail beside the text) and can be dragged;
 * `tile` is the larger card of the Recent videos row.
 */
export function VideoCard({video,progress,variant='compact',dragging=false,onOpen,onDragStart,onDragEnd}:{
 video:Video;progress?:ProjectProgress;variant?:'compact'|'tile';dragging?:boolean;onOpen():void;
 onDragStart?(event:DragEvent<HTMLButtonElement>):void;onDragEnd?(event:DragEvent<HTMLButtonElement>):void;
}){
 const tile=variant==='tile',status=statusLine(video,progress);
 return <button type="button" data-card data-card-id={video.id} draggable={!!onDragStart} onClick={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd}
  className={cn('w-full rounded-lg border border-line bg-card text-left transition-shadow hover:shadow-sm focus-visible:outline-2 focus-visible:outline-accent',
   tile?'flex flex-col gap-3 p-3':'flex gap-3 p-2.5',dragging&&'opacity-40',onDragStart&&'cursor-grab active:cursor-grabbing')}>
  <Thumbnail video={video} progress={progress} className={tile?'aspect-video w-full':'h-12 w-[72px]'}/>
  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
   <span className="line-clamp-2 text-base font-medium text-ink">{video.title}</span>
   <span className="flex items-center gap-1.5 text-sm text-muted">
    <span className="truncate">{status}</span>
    {video.hidden&&<Badge className="h-5 px-2">{video.hidden==='later'?'Later':'Skipped'}</Badge>}
   </span>
  </span>
 </button>;
}
