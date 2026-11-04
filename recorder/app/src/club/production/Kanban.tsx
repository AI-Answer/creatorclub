import {useRef,useState,type DragEvent} from 'react';
import type {Video,VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {beforeIdAt,boardColumns,dropIndex,unordered,type BoardColumn} from '../production';
import type {IdeaHeld} from '../routes';
import type {SceneProgress} from '../scene-status';
import type {IdeaActionSet} from './IdeaLane';
import {Icon} from '../ui';
import {errorMessage} from '../api';
import {KanbanCard} from './KanbanCard';

type Over={stage:VideoStage;beforeId:string|null};

/** Six flat stage lanes shared by Home and Videos, with compact draggable cards and inline creation. */
export function Kanban({videos,scenes,ideas,onOpen,onMove,onResearch,onAdd}:{
 onAdd(title:string,stage:VideoStage):Promise<void>;
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
   <div className="lane-cards" ref={element=>{if(element)elements.current.set(stage,element);else elements.current.delete(stage);}}>
    {shown.map(video=><div key={video.id}>
     {lineBefore===video.id&&video.id!==dragId&&<div aria-hidden data-drop-line className="drop-line"/>}
     <KanbanCard video={video} scenes={scenes[video.id]} highlight={ideas.newId===video.id} dragging={dragId===video.id} onOpen={()=>onOpen(video)} onMove={to=>onMove(video.id,to,null)} onResearch={onResearch&&(()=>onResearch(video))}
      onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',video.id);setDragId(video.id);}} onDragEnd={reset}/>
    </div>)}
    {lineBefore==='end'&&<div aria-hidden data-drop-line className="drop-line"/>}
   </div>
   <LaneAdd stage={stage} onAdd={onAdd}/>

  </section>;
 })}</div>;
}

function LaneAdd({stage,onAdd}:{stage:VideoStage;onAdd(title:string,stage:VideoStage):Promise<void>}){
 const [open,setOpen]=useState(false),[title,setTitle]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!open)return <button type="button" className="lane-add" aria-label={`Add video to ${STAGE_LABEL[stage]}`} onClick={()=>setOpen(true)}><Icon name="add" size={14}/><span>Add video</span></button>;
 return <form className="lane-add-form" onSubmit={async event=>{
  event.preventDefault();if(!title.trim()||busy)return;setBusy(true);setError('');
  try{await onAdd(title.trim(),stage);setTitle('');setOpen(false);}catch(reason){setError(errorMessage(reason,"Couldn't add video."));}finally{setBusy(false);}
 }}>
  <input autoFocus className="input" aria-label={`Video title for ${STAGE_LABEL[stage]}`} placeholder="Video title" value={title} maxLength={300} disabled={busy} onChange={event=>setTitle(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'&&!busy)setOpen(false);}}/>
  {error&&<div className="small muted" role="alert">{error}</div>}
  <div className="row"><button className="btn sm" type="submit" disabled={busy||!title.trim()}>{busy?'Adding…':'Add video'}</button><button className="btn sm ghost" type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button></div>
 </form>;
}
