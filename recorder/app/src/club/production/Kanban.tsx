import {memo,useEffect,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent,type PointerEvent as ReactPointerEvent} from 'react';
import {flushSync} from 'react-dom';
import {VIDEO_STAGES,type Video,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {beforeIdAt,boardColumns} from '../production';
import type {IdeaHeld} from '../routes';
import type {SceneProgress} from '../scene-status';
import type {IdeaActionSet} from '../useIdeaActions';
import {Icon,StageBadge} from '../ui';
import {errorMessage} from '../api';
import {KanbanCard} from './KanbanCard';
import {CardDrag,DRAG_THRESHOLD,prefersReducedMotion,type DragTarget} from './kanban-drag';
import type {MutableRefObject} from 'react';

type CardActions={open(video:Video):void;move(id:string,stage:VideoStage,beforeId:string|null):void;research?(video:Video):void;key(event:KeyboardEvent<HTMLDivElement>,video:Video):void};
// Handler closures live in the small wrapper. A drag never re-renders a card: it runs on the DOM (see kanban-drag.ts).
const KanbanItem=memo(function KanbanItem({video,scenes,highlight,research,actions}:{video:Video;scenes:readonly SceneProgress[]|undefined;highlight:boolean;research:boolean;actions:MutableRefObject<CardActions>}){
 return <KanbanCard video={video} scenes={scenes} highlight={highlight} onOpen={()=>actions.current.open(video)} onMove={stage=>actions.current.move(video.id,stage,null)} onResearch={research?()=>actions.current.research?.(video):undefined} onKeyDown={event=>actions.current.key(event,video)}/>;
});

type Press={id:string;card:HTMLElement;pointerId:number;x:number;y:number};
const COLLAPSE_KEY='cc-kanban-published-collapsed';

/**
 * Cover-led lanes with independent scrolling, spatial keyboard navigation and pointer dragging.
 * A drag moves a copy of the card under the pointer and slides the other cards aside with transforms, all outside
 * React; the board re-renders once, when the card is dropped.
 */
export function Kanban({videos,scenes,ideas,onOpen,onMove,onResearch,onAdd}:{
 onAdd(title:string,stage:VideoStage):Promise<void>;
 videos:readonly Video[];scenes:Record<string,SceneProgress[]>;ideas:{newId?:string;openGroup?:IdeaHeld;actions:IdeaActionSet};onOpen(video:Video):void;
 onResearch?(video:Video):void;
 onMove(id:string,stage:VideoStage,beforeId:string|null):void;
}){
 const columns=useMemo(()=>boardColumns(videos),[videos]);
 const actions=useRef<CardActions>(null!);
 const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem(COLLAPSE_KEY)==='true';}catch{return false;}});
 const [announcement,setAnnouncement]=useState('');
 const [adding,setAdding]=useState<VideoStage|null>(null);
 const board=useRef<HTMLDivElement>(null),elements=useRef(new Map<VideoStage,HTMLDivElement>());
 const pendingFocus=useRef<string|null>(null),drag=useRef<CardDrag|null>(null),press=useRef<Press|null>(null),stopPress=useRef<(()=>void)|null>(null);
 const positions=useRef(new Map<string,DOMRect>());
 const toggleCollapsed=()=>setCollapsed(current=>!current);
 useEffect(()=>{try{localStorage.setItem(COLLAPSE_KEY,String(collapsed));}catch{/* session only */}},[collapsed]);
 // Animate neighbouring cards to their new places. Reduced-motion users get an immediate placement.
 useLayoutEffect(()=>{
  const next=new Map<string,DOMRect>();
  const dragging=!!drag.current,reduced=prefersReducedMotion();
  for(const card of board.current?.querySelectorAll<HTMLElement>('[data-card]')??[]){
   const id=card.dataset.cardId!,box=card.getBoundingClientRect(),old=positions.current.get(id);next.set(id,box);
   if(old&&!dragging&&!reduced){
    const x=old.left-box.left,y=old.top-box.top;
    if((Math.abs(x)>=1||Math.abs(y)>=1)&&card.animate)card.animate([{transform:`translate(${x}px, ${y}px)`},{transform:'translate(0, 0)'}],{duration:parseFloat(getComputedStyle(card).getPropertyValue('--cc-dur'))*1000||150,easing:getComputedStyle(card).getPropertyValue('--cc-ease').trim()||'ease-out'});
   }
   if(pendingFocus.current===id){card.focus({preventScroll:true});card.scrollIntoView?.({block:'nearest',inline:'nearest'});pendingFocus.current=null;}
  }
  positions.current=next;
  // The board changed under a drag (a reload, another window): measure again, or stop if the card is gone.
  if(dragging&&!drag.current!.measure())endDrag();
 },[videos,collapsed]);
 useLayoutEffect(()=>()=>{stopPress.current?.();endDrag();},[]);
 const focus=(id:string)=>{
  const card=[...board.current?.querySelectorAll<HTMLElement>('[data-card]')??[]].find(card=>card.dataset.cardId===id);
  card?.focus();card?.scrollIntoView?.({block:'nearest',inline:'nearest'});
 };
 useEffect(()=>{
  if(!ideas.openGroup)return;
  const first=videos.find(video=>video.stage==='ideas'&&video.hidden===ideas.openGroup);
  if(first)focus(first.id);
 },[ideas.openGroup]);
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
 actions.current={open:onOpen,move:onMove,research:onResearch,key:(event,video)=>keyboard(video)(event)};

 // ---- pointer dragging. Nothing here sets React state until the drop.
 function endDrag(){const current=drag.current;drag.current=null;current?.dispose();document.documentElement.classList.remove('cc-kanban-dragging');}
 /** The drop has settled. Start every card from where it is drawn now, then draw the new order in the same frame. */
 const settled=useRef<(current:CardDrag,result:DragTarget|null)=>void>(null!);
 // Read at drop time, so a drop uses the board as it is then, not as it was when the drag began.
 settled.current=(current,result)=>{
  if(drag.current!==current)return;
  const video=result&&videos.find(item=>item.id===current.id);
  if(result&&video){
   for(const card of board.current?.querySelectorAll<HTMLElement>('[data-card]')??[])positions.current.set(card.dataset.cardId!,card.getBoundingClientRect());
   const copy=board.current?.querySelector<HTMLElement>('.kanban-drag-copy');if(copy)positions.current.set(current.id,copy.getBoundingClientRect());
   current.release();
   const column=columns.find(column=>column.stage===result.stage)!;
   const beforeId=column.stage==='published'&&collapsed?null:beforeIdAt(column,current.id,result.index);
   pendingFocus.current=current.id;drag.current=null;
   flushSync(()=>{if(result.stage==='published'&&collapsed)setCollapsed(false);onMove(current.id,result.stage,beforeId);setAnnouncement(`${video.title} moved to ${STAGE_LABEL[result.stage]}`);});
   drag.current=current;
  }
  endDrag();
 };
 const onPointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
  if(event.button!==0||drag.current||press.current)return;
  const target=event.target as HTMLElement,card=target.closest<HTMLElement>('[data-card]');
  if(!card||!board.current?.contains(card)||target.closest('button,a,input,textarea,select,.menu'))return;
  press.current={id:card.dataset.cardId!,card,pointerId:event.pointerId,x:event.clientX,y:event.clientY};
  const doc=card.ownerDocument;
  const move=(e:PointerEvent)=>{
   const held=press.current;if(!held||e.pointerId!==held.pointerId)return;
   if(drag.current){drag.current.move(e.clientX,e.clientY);return;}
   if(Math.hypot(e.clientX-held.x,e.clientY-held.y)<DRAG_THRESHOLD||!board.current)return;
   try{held.card.setPointerCapture?.(held.pointerId);}catch{/* the pointer already went up */}
   doc.getSelection?.()?.removeAllRanges();doc.documentElement.classList.add('cc-kanban-dragging');
   const created:CardDrag=new CardDrag({board:board.current,layer:board.current,card:held.card,id:held.id,x:held.x,y:held.y,reduced:prefersReducedMotion(),onSettled:result=>settled.current(created,result)});
   drag.current=created;created.move(e.clientX,e.clientY);
  };
  const finish=(cancel:boolean)=>(e:Event)=>{
   const held=press.current;if(!held||('pointerId' in e&&(e as PointerEvent).pointerId!==held.pointerId))return;
   if(e.type==='keydown'&&(e as globalThis.KeyboardEvent).key!=='Escape')return;
   stopPress.current?.();
   const current=drag.current;if(!current)return;
   if(e.type==='keydown')e.preventDefault();
   // The click that follows a drag's pointerup is not a click on the card.
   if(e.type==='pointerup'){const swallow=(c:Event)=>{c.stopPropagation();c.preventDefault();};doc.addEventListener('click',swallow,{capture:true,once:true});setTimeout(()=>doc.removeEventListener('click',swallow,{capture:true}),0);}
   try{held.card.releasePointerCapture?.(held.pointerId);}catch{/* already released */}
   current.drop(cancel);
  };
  const up=finish(false),cancel=finish(true);
  doc.addEventListener('pointermove',move);doc.addEventListener('pointerup',up);doc.addEventListener('pointercancel',cancel);doc.addEventListener('keydown',cancel,true);
  stopPress.current=()=>{press.current=null;stopPress.current=null;doc.removeEventListener('pointermove',move);doc.removeEventListener('pointerup',up);doc.removeEventListener('pointercancel',cancel);doc.removeEventListener('keydown',cancel,true);};
 };
 return <><div className="sr-only" role="status" aria-live="polite">{announcement}</div>
 <div className={`kanban${collapsed?' published-collapsed':''}`} ref={board} aria-label="Video production board" onPointerDown={onPointerDown}>{columns.map(column=>{
  const {stage,all,shown}=column,isCollapsed=stage==='published'&&collapsed;
  return <section key={stage} aria-label={STAGE_LABEL[stage]} data-column={stage} className={`col${isCollapsed?' col-collapsed':''}`}>
   <div className="col-h"><StageBadge stage={stage} dotOnly decorative/><span className="col-name">{STAGE_LABEL[stage]}</span><span className="n">{all.length}</span>
    {stage==='published'&&<button type="button" className="lane-toggle" title={collapsed?'Expand Published':'Collapse Published'} aria-label={collapsed?'Expand Published':'Collapse Published'} aria-expanded={!collapsed} onClick={toggleCollapsed}><Icon name={collapsed?'panel-open':'panel-close'} size={14}/></button>}
    {!isCollapsed&&<button type="button" className="lane-plus" aria-label={`New video in ${STAGE_LABEL[stage]}`} onClick={()=>setAdding(stage)}><Icon name="add" size={15}/></button>}
   </div>
   {!isCollapsed&&<div className="lane-cards" ref={element=>{if(element)elements.current.set(stage,element);else elements.current.delete(stage);}}>
    {shown.map(video=><div key={video.id} data-slot={video.id}>
     <KanbanItem video={video} scenes={scenes[video.id]} highlight={ideas.newId===video.id} research={!!onResearch} actions={actions}/>
    </div>)}
    <LaneAdd stage={stage} onAdd={onAdd} open={adding===stage} empty={!shown.length} onClose={()=>setAdding(null)}/>
   </div>}
  </section>;
 })}</div></>;
}

function LaneAdd({stage,onAdd,open,empty,onClose}:{stage:VideoStage;onAdd(title:string,stage:VideoStage):Promise<void>;open:boolean;empty:boolean;onClose():void}){
 const [title,setTitle]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 // An empty lane says one line; new videos start from the + in its header.
 if(!open)return empty?<div className="lane-empty-state"><p>{stage==='published'?'Finished videos land here.':'Nothing here yet'}</p></div>:null;
 return <form className="lane-add-form" onSubmit={async event=>{
  event.preventDefault();if(!title.trim()||busy)return;setBusy(true);setError('');
  try{await onAdd(title.trim(),stage);setTitle('');onClose();}catch(reason){setError(errorMessage(reason,"Couldn't add video."));}finally{setBusy(false);}
 }}>
  <input autoFocus className="input" aria-label={`Video title for ${STAGE_LABEL[stage]}`} placeholder="Video title" value={title} maxLength={300} disabled={busy} onChange={event=>setTitle(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'&&!busy)onClose();}}/>
  {error&&<div className="small text-warn" role="alert">{error}</div>}
  <div className="row"><button className="btn sm" type="submit" disabled={busy||!title.trim()}>{busy?'Adding…':'New video'}</button><button className="btn sm ghost" type="button" disabled={busy} onClick={()=>onClose()}>Cancel</button></div>
 </form>;
}
