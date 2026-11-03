import {useRef,useState,type DragEvent} from 'react';
import type {Video,VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {COLUMN_EMPTY,beforeIdAt,boardColumns,dropIndex,unordered,type BoardColumn} from '../production';
import type {IdeaHeld} from '../routes';
import type {SceneProgress} from '../scene-status';
import {IdeaLane,type IdeaActionSet} from './IdeaLane';
import {KanbanCard} from './KanbanCard';

type Over={stage:VideoStage;beforeId:string|null};

/**
 * Six lanes, Ideas to Published, each the same width and as tall as the page, headed by its stage's dot, name and count. Ideas come first, in groups (`IdeaLane`); the others are in board order. Cards drag between lanes and within
 * the ordered ones (HTML5 drag); a line shows where the card will land. `ideas` carries what the Ideas lane needs: the idea just added,
 * a folded group to open, and the idea actions.
 */
export function Kanban({videos,scenes,ideas,onOpen,onMove,onResearch}:{
 videos:readonly Video[];scenes:Record<string,SceneProgress[]>;ideas:{newId?:string;openGroup?:IdeaHeld;actions:IdeaActionSet};onOpen(video:Video):void;
 /** "Add to Research" in a card's menu. */
 onResearch?(video:Video):void;
 onMove(id:string,stage:VideoStage,beforeId:string|null):void;
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
  // The line goes before the card it is dropped ahead of, or at the end; Ideas and Published have no order to show.
  const lineBefore=here&&!unordered(stage)?(over.beforeId&&shown.some(video=>video.id===over.beforeId)?over.beforeId:'end'):undefined;
  return <section key={stage} aria-label={STAGE_LABEL[stage]} data-column={stage} className={`col${here?' over':''}`}
   onDragOver={onDragOver(column)} onDrop={onDrop(column)} onDragLeave={onDragLeave(stage)}>
   <div className="col-h"><span className={`col-dot st-${stage}`} aria-hidden/><span className="col-name">{STAGE_LABEL[stage]}</span><span className="n">{all.length}</span></div>
   {stage==='ideas'?<IdeaLane videos={videos} newId={ideas.newId} openGroup={ideas.openGroup} dragId={dragId} actions={ideas.actions} onOpen={onOpen} onMove={(id,to)=>onMove(id,to,null)} onResearch={onResearch}
    onDragStart={(id,event)=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);setDragId(id);}} onDragEnd={reset}/>
   :<><div ref={element=>{if(element)elements.current.set(stage,element);else elements.current.delete(stage);}}>
    {shown.map(video=><div key={video.id}>
     {lineBefore===video.id&&video.id!==dragId&&<div aria-hidden data-drop-line className="drop-line"/>}
     <KanbanCard video={video} scenes={scenes[video.id]} dragging={dragId===video.id} onOpen={()=>onOpen(video)} onMove={to=>onMove(video.id,to,null)} onResearch={onResearch&&(()=>onResearch(video))}
      onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',video.id);setDragId(video.id);}} onDragEnd={reset}/>
    </div>)}
    {lineBefore==='end'&&<div aria-hidden data-drop-line className="drop-line"/>}
   </div>
   {!shown.length&&<div className="col-empty">{COLUMN_EMPTY[stage]}</div>}</>}
  </section>;
 })}</div>;
}
