import {useEffect,useLayoutEffect,useRef,useState,type DragEvent,type KeyboardEvent} from 'react';
import {VIDEO_STAGES,type Video,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {beforeIdAt,boardColumns,dropIndex,isSamePlace,type BoardColumn} from '../production';
import type {IdeaHeld} from '../routes';
import type {SceneProgress} from '../scene-status';
import type {IdeaActionSet} from './IdeaLane';
import {Icon} from '../ui';
import {errorMessage} from '../api';
import {KanbanCard} from './KanbanCard';

type Over={stage:VideoStage;beforeId:string|null};
const COLLAPSE_KEY='cc-kanban-published-collapsed';

/** Cover-led lanes with independent scrolling, spatial keyboard navigation and a real insertion gap. */
export function Kanban({videos,scenes,ideas,onOpen,onMove,onResearch,onAdd}:{
 onAdd(title:string,stage:VideoStage):Promise<void>;
 videos:readonly Video[];scenes:Record<string,SceneProgress[]>;ideas:{newId?:string;openGroup?:IdeaHeld;actions:IdeaActionSet};onOpen(video:Video):void;
 onResearch?(video:Video):void;
 onMove(id:string,stage:VideoStage,beforeId:string|null):void;
}){
 const columns=boardColumns(videos);
 const [dragId,setDragId]=useState<string|null>(null),[over,setOver]=useState<Over|null>(null);
 const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem(COLLAPSE_KEY)==='true';}catch{return false;}});
 const [announcement,setAnnouncement]=useState('');
 const board=useRef<HTMLDivElement>(null),elements=useRef(new Map<VideoStage,HTMLDivElement>());
 const dragSize=useRef(220),pendingFocus=useRef<string|null>(null),preview=useRef<HTMLElement|null>(null);
 const positions=useRef(new Map<string,DOMRect>());
 const reset=()=>{setDragId(null);setOver(null);preview.current?.remove();preview.current=null;};
 const toggleCollapsed=()=>setCollapsed(current=>!current);
 useEffect(()=>{try{localStorage.setItem(COLLAPSE_KEY,String(collapsed));}catch{/* session only */}},[collapsed]);
 // Animate neighbouring cards to their new places. Reduced-motion users get an immediate placement.
 useLayoutEffect(()=>{
  const next=new Map<string,DOMRect>();
  for(const card of board.current?.querySelectorAll<HTMLElement>('[data-card]')??[]){
   const id=card.dataset.cardId!,box=card.getBoundingClientRect(),old=positions.current.get(id);next.set(id,box);
   if(old&&id!==dragId&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
    const x=old.left-box.left,y=old.top-box.top;
    if((x||y)&&card.animate)card.animate([{transform:`translate(${x}px, ${y}px)`},{transform:'translate(0, 0)'}],{duration:180,easing:'ease-out'});
   }
   if(pendingFocus.current===id){card.focus({preventScroll:true});card.scrollIntoView?.({block:'nearest',inline:'nearest'});pendingFocus.current=null;}
  }
  positions.current=next;
 },[videos,over,collapsed,dragId]);
 useLayoutEffect(()=>()=>{preview.current?.remove();},[]);
 const focus=(id:string)=>{
  const card=[...board.current?.querySelectorAll<HTMLElement>('[data-card]')??[]].find(card=>card.dataset.cardId===id);
  card?.focus();card?.scrollIntoView?.({block:'nearest',inline:'nearest'});
 };
 const keyboard=(video:Video)=>(event:KeyboardEvent<HTMLDivElement>)=>{
  const direction=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0;
  if(direction&&(event.metaKey||event.ctrlKey)){
   event.preventDefault();const stage=VIDEO_STAGES[VIDEO_STAGES.indexOf(video.stage)+direction];
   if(stage){if(stage==='published'&&collapsed)toggleCollapsed();pendingFocus.current=video.id;onMove(video.id,stage,null);setAnnouncement(`${video.title} moved to ${STAGE_LABEL[stage]}`);}
   return;
  }
  if(event.altKey||event.metaKey||event.ctrlKey)return;
  const column=columns.find(column=>column.stage===video.stage)!,index=column.shown.findIndex(item=>item.id===video.id);
  let target:Video|undefined;
  if(event.key==='ArrowUp'||event.key==='ArrowDown')target=column.shown[index+(event.key==='ArrowUp'?-1:1)];
  else if(direction){
   for(let i=columns.indexOf(column)+direction;i>=0&&i<columns.length;i+=direction){
    if(columns[i].stage==='published'&&collapsed)continue;
    if(columns[i].shown.length){target=columns[i].shown[Math.min(index,columns[i].shown.length-1)];break;}
   }
  }else return;
  event.preventDefault();if(target)focus(target.id);
 };
 const target=(column:BoardColumn,dragged:string,event:DragEvent):Over=>{
  // A collapsed lane shows no cards, so a drop there goes last, like Cmd/Ctrl+arrow.
  if(column.stage==='published'&&collapsed)return {stage:column.stage,beforeId:null};
  const cards=[...elements.current.get(column.stage)?.querySelectorAll<HTMLElement>('[data-card]')??[]].filter(card=>card.dataset.cardId!==dragged);
  const middles=cards.map(card=>{const box=card.getBoundingClientRect();return box.top+box.height/2;});
  return {stage:column.stage,beforeId:beforeIdAt(column,dragged,dropIndex(middles,event.clientY))};
 };
 const onDragOver=(column:BoardColumn)=>(event:DragEvent)=>{
  if(!dragId)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';
  const next=target(column,dragId,event);
  // Auto-scroll a lane and the horizontal board when dragging near their edges.
  const lane=elements.current.get(column.stage),box=lane?.getBoundingClientRect();
  if(lane&&box&&event.clientY<box.top+44)lane.scrollTop-=18;
  else if(lane&&box&&event.clientY>box.bottom-44)lane.scrollTop+=18;
  const bounds=board.current?.getBoundingClientRect();
  if(board.current&&bounds){if(event.clientX<bounds.left+48)board.current.scrollLeft-=20;else if(event.clientX>bounds.right-48)board.current.scrollLeft+=20;}
  setOver(current=>current&&current.stage===next.stage&&current.beforeId===next.beforeId?current:next);
 };
 const onDrop=(column:BoardColumn)=>(event:DragEvent)=>{
  if(!dragId)return;
  event.preventDefault();const id=dragId,{beforeId}=over?.stage===column.stage?over:target(column,id,event);
  if(column.stage==='published'&&collapsed)toggleCollapsed();
  pendingFocus.current=id;reset();onMove(id,column.stage,beforeId);
 };
 const gap=<div aria-hidden data-drop-line className="drop-gap" style={{height:dragSize.current}}/>;
 return <><div className="sr-only" role="status" aria-live="polite">{announcement}</div>
 <div className={`kanban${collapsed?' published-collapsed':''}`} ref={board} aria-label="Video production board">{columns.map(column=>{
  const {stage,all,shown}=column,here=over?.stage===stage,isCollapsed=stage==='published'&&collapsed;
  const lineBefore=here&&dragId&&!isSamePlace(videos,dragId,stage,over.beforeId)?(over.beforeId&&shown.some(video=>video.id===over.beforeId)?over.beforeId:'end'):undefined;
  return <section key={stage} aria-label={STAGE_LABEL[stage]} data-column={stage} className={`col${here?' over':''}${isCollapsed?' col-collapsed':''}`}
   onDragOver={onDragOver(column)} onDrop={onDrop(column)} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOver(current=>current?.stage===stage?null:current);}}>
   <div className="col-h"><span className={`col-dot st-${stage}`} aria-hidden/><span className="col-name">{STAGE_LABEL[stage]}</span><span className="n">{all.length}</span>
    {stage==='published'&&<button type="button" className="lane-toggle" aria-label={collapsed?'Expand Published':'Collapse Published'} aria-expanded={!collapsed} onClick={toggleCollapsed}><Icon name={collapsed?'back':'forward'} size={14}/></button>}
    {!isCollapsed&&<button type="button" className="lane-plus" aria-label={`New video in ${STAGE_LABEL[stage]}`} onClick={()=>{elements.current.get(stage)?.querySelector<HTMLButtonElement>('.lane-add')?.click();}}><Icon name="add" size={15}/></button>}
   </div>
   {!isCollapsed&&<div className="lane-cards" ref={element=>{if(element)elements.current.set(stage,element);else elements.current.delete(stage);}}>
    {shown.map(video=><div key={video.id} className={dragId===video.id?'drag-source':undefined}>
     {lineBefore===video.id&&video.id!==dragId&&gap}
     <KanbanCard video={video} scenes={scenes[video.id]} highlight={ideas.newId===video.id} dragging={dragId===video.id} onOpen={()=>onOpen(video)} onMove={to=>onMove(video.id,to,null)} onResearch={onResearch&&(()=>onResearch(video))} onKeyDown={keyboard(video)}
      onDragStart={event=>{
       event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',video.id);
       const card=event.currentTarget as HTMLElement;dragSize.current=card.getBoundingClientRect().height||220;
       if(event.dataTransfer.setDragImage){const clone=card.cloneNode(true) as HTMLElement;clone.classList.add('kanban-drag-preview');clone.style.width=`${card.getBoundingClientRect().width}px`;(board.current?.closest('.club-root')??document.body).append(clone);event.dataTransfer.setDragImage(clone,24,24);preview.current=clone;}
       setDragId(video.id);setOver({stage:video.stage,beforeId:shown[shown.findIndex(item=>item.id===video.id)+1]?.id??null});
      }} onDragEnd={reset}/>
    </div>)}
    {lineBefore==='end'&&gap}
    {!shown.length&&!here&&<div className="lane-empty"><Icon name="video" size={18}/><span>No videos yet. Use New video below.</span></div>}
    <LaneAdd stage={stage} onAdd={onAdd}/>
   </div>}
  </section>;
 })}</div></>;
}

function LaneAdd({stage,onAdd}:{stage:VideoStage;onAdd(title:string,stage:VideoStage):Promise<void>}){
 const [open,setOpen]=useState(false),[title,setTitle]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!open)return <button type="button" className="lane-add" aria-label={`New video in ${STAGE_LABEL[stage]}`} onClick={()=>setOpen(true)}><Icon name="add" size={14}/><span>New video</span></button>;
 return <form className="lane-add-form" onSubmit={async event=>{
  event.preventDefault();if(!title.trim()||busy)return;setBusy(true);setError('');
  try{await onAdd(title.trim(),stage);setTitle('');setOpen(false);}catch(reason){setError(errorMessage(reason,"Couldn't add video."));}finally{setBusy(false);}
 }}>
  <input autoFocus className="input" aria-label={`Video title for ${STAGE_LABEL[stage]}`} placeholder="Video title" value={title} maxLength={300} disabled={busy} onChange={event=>setTitle(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'&&!busy)setOpen(false);}}/>
  {error&&<div className="small text-warn" role="alert">{error}</div>}
  <div className="row"><button className="btn sm" type="submit" disabled={busy||!title.trim()}>{busy?'Adding…':'New video'}</button><button className="btn sm ghost" type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button></div>
 </form>;
}
