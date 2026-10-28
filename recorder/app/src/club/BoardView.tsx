import {useRef,useState,type DragEvent,type ReactNode} from 'react';
import {VIDEO_STAGES,type Video,type VideoStage} from '../../shared/club';
import {STAGE_LABEL,dropIndex,groupByStage,type ProjectProgress} from './board';
import {VideoCard} from './VideoCard';

type Over={stage:VideoStage;beforeId:string|null};

/** Six columns. Cards drag between and within them (HTML5 drag); a line shows where the card will land. */
export function BoardView({videos,progress,onOpen,onMove,ideasTop}:{
 videos:readonly Video[];progress:Record<string,ProjectProgress>;onOpen(id:string):void;
 onMove(id:string,stage:VideoStage,beforeId:string|null):void;ideasTop?:ReactNode;
}){
 const groups=groupByStage(videos);
 const [dragId,setDragId]=useState<string|null>(null),[over,setOver]=useState<Over|null>(null);
 const columns=useRef(new Map<VideoStage,HTMLDivElement>());
 const reset=()=>{setDragId(null);setOver(null);};

 const target=(stage:VideoStage,event:DragEvent):Over=>{
  const cards=[...columns.current.get(stage)?.querySelectorAll<HTMLElement>('[data-card]')??[]].filter(card=>card.dataset.cardId!==dragId);
  const middles=cards.map(card=>{const box=card.getBoundingClientRect();return box.top+box.height/2;});
  return {stage,beforeId:cards[dropIndex(middles,event.clientY)]?.dataset.cardId??null};
 };
 const onDragOver=(stage:VideoStage)=>(event:DragEvent)=>{
  if(!dragId)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';
  const next=target(stage,event);
  setOver(current=>current&&current.stage===next.stage&&current.beforeId===next.beforeId?current:next);
 };
 const onDrop=(stage:VideoStage)=>(event:DragEvent)=>{
  if(!dragId)return;
  event.preventDefault();
  const id=dragId,{beforeId}=target(stage,event);
  reset();onMove(id,stage,beforeId);
 };
 const onDragLeave=(stage:VideoStage)=>(event:DragEvent)=>{
  if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOver(current=>current?.stage===stage?null:current);
 };

 return <div className="flex items-start gap-4 overflow-x-auto pb-4">
  {VIDEO_STAGES.map(stage=>{
   const cards=groups[stage],line=over?.stage===stage?over.beforeId:undefined;
   return <section key={stage} aria-label={STAGE_LABEL[stage]} className="flex w-[280px] shrink-0 flex-col gap-3">
    <header className="flex items-baseline gap-2 px-1">
     <h2 className="text-base font-semibold text-ink">{STAGE_LABEL[stage]}</h2>
     <span className="text-sm text-muted">{cards.length}</span>
    </header>
    {stage==='ideas'&&ideasTop}
    <div ref={element=>{if(element)columns.current.set(stage,element);else columns.current.delete(stage);}} data-column={stage}
     onDragOver={onDragOver(stage)} onDrop={onDrop(stage)} onDragLeave={onDragLeave(stage)}
     className="flex min-h-24 flex-col gap-2 rounded-lg">
      {cards.map(video=><div key={video.id} className="flex flex-col gap-2">
       {line===video.id&&video.id!==dragId&&<DropLine/>}
       <VideoCard video={video} progress={video.recorderProjectId?progress[video.recorderProjectId]:undefined} dragging={dragId===video.id}
        onOpen={()=>onOpen(video.id)} onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',video.id);setDragId(video.id);}} onDragEnd={reset}/>
      </div>)}
      {line===null&&<DropLine/>}
      {cards.length===0&&line===undefined&&<p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-muted">Nothing here yet.</p>}
    </div>
   </section>;
  })}
 </div>;
}

function DropLine(){return <div aria-hidden data-drop-line className="h-0.5 rounded-full bg-accent"/>;}
