import {useRef,useState,type DragEvent} from 'react';
import type {Video,VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {COLUMN_EMPTY,beforeIdAt,boardColumns,dropIndex,type BoardColumn} from '../production';
import type {SceneProgress} from '../scene-status';
import {StagePill} from '../ui';
import {KanbanCard} from './KanbanCard';

type Over={stage:VideoStage;beforeId:string|null};
const NO_SCENES:readonly SceneProgress[]=[];

/** Six columns, Ideas to Published. Cards drag between and within them (HTML5 drag); a line shows where the card will land. */
export function Kanban({videos,scenes,onOpen,onMove,onAllIdeas}:{
 videos:readonly Video[];scenes:Record<string,SceneProgress[]>;onOpen(video:Video):void;
 onMove(id:string,stage:VideoStage,beforeId:string|null):void;onAllIdeas():void;
}){
 const columns=boardColumns(videos);
 const [dragId,setDragId]=useState<string|null>(null),[over,setOver]=useState<Over|null>(null);
 const elements=useRef(new Map<VideoStage,HTMLDivElement>());
 const reset=()=>{setDragId(null);setOver(null);};

 const target=(column:BoardColumn,dragged:string,event:DragEvent):Over=>{
  const cards=[...elements.current.get(column.stage)?.querySelectorAll<HTMLElement>('[data-card]')??[]].filter(card=>card.dataset.cardId!==dragged);
  const middles=cards.map(card=>{const box=card.getBoundingClientRect();return box.top+box.height/2;});
  return {stage:column.stage,beforeId:beforeIdAt(column,dragged,dropIndex(middles,event.clientY))};
 };
 const onDragOver=(column:BoardColumn)=>(event:DragEvent)=>{
  if(!dragId)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';
  const next=target(column,dragId,event);
  setOver(current=>current&&current.stage===next.stage&&current.beforeId===next.beforeId?current:next);
 };
 const onDrop=(column:BoardColumn)=>(event:DragEvent)=>{
  if(!dragId)return;
  event.preventDefault();
  const id=dragId,{beforeId}=target(column,id,event);
  reset();onMove(id,column.stage,beforeId);
 };
 const onDragLeave=(stage:VideoStage)=>(event:DragEvent)=>{
  if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOver(current=>current?.stage===stage?null:current);
 };

 return <div className="kanban">{columns.map(column=>{
  const {stage,all,shown}=column,here=over?.stage===stage;
  // The line goes before the card it is dropped ahead of, or at the end; Published has no order to show.
  const lineBefore=here&&stage!=='published'?(over.beforeId&&shown.some(video=>video.id===over.beforeId)?over.beforeId:'end'):undefined;
  return <section key={stage} aria-label={STAGE_LABEL[stage]} data-column={stage} className={`col${here?' over':''}`}
   onDragOver={onDragOver(column)} onDrop={onDrop(column)} onDragLeave={onDragLeave(stage)}>
   <div className="col-h"><StagePill stage={stage}/><span className="n">{all.length}</span></div>
   <div ref={element=>{if(element)elements.current.set(stage,element);else elements.current.delete(stage);}}>
    {shown.map(video=><div key={video.id}>
     {lineBefore===video.id&&video.id!==dragId&&<div aria-hidden data-drop-line className="drop-line"/>}
     <KanbanCard video={video} scenes={scenes[video.id]??NO_SCENES} dragging={dragId===video.id} onOpen={()=>onOpen(video)}
      onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',video.id);setDragId(video.id);}} onDragEnd={reset}/>
    </div>)}
    {lineBefore==='end'&&<div aria-hidden data-drop-line className="drop-line"/>}
   </div>
   {stage==='ideas'&&all.length>shown.length&&<button type="button" className="addscene" style={{height:34}} onClick={onAllIdeas}>View all {all.length} ideas</button>}
   {!shown.length&&<div className="col-empty">{COLUMN_EMPTY[stage]}</div>}
  </section>;
 })}</div>;
}
