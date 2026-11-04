import {BrandLogo} from '../../BrandLogo';
import {useState,type DragEvent} from 'react';
import {VIDEO_STAGES,type Video,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {IDEA_GROUPS,SKIP_REASONS,ideaGroups,ideaSourceVideoId,ideaWhy,type IdeaGroup} from '../ideas';
import {COLUMN_EMPTY} from '../production';
import type {IdeaHeld} from '../routes';
import {Icon,Menu,type MenuItem} from '../ui';
import type {useIdeaActions} from '../useIdeaActions';

export type IdeaActionSet=ReturnType<typeof useIdeaActions>;

/** How many ideas Timely and Evergreen show before "Show all". */
export const GROUP_SHOWN=5;

/**
 * An idea on the board: its title, why it could work and where it came from. Start planning (Restore for one put aside) is always shown;
 * the "..." menu beside it (Later, Skip with a reason, Move to, Delete) shows under the pointer or on focus. Press the card to open its drawer.
 */
export function IdeaCard({video,highlight,dragging,actions,onOpen,onMove,onResearch,onDragStart,onDragEnd}:{
 video:Video;highlight?:boolean;dragging:boolean;actions:IdeaActionSet;onOpen():void;onMove(stage:VideoStage):void;onResearch?():void;onDragStart(event:DragEvent):void;onDragEnd():void;
}){
 const source=video.idea?.sources?.[0],why=ideaWhy(video),held=!!video.hidden;
 const remove:MenuItem={label:'Delete idea',icon:'delete',danger:true,fn:()=>actions.remove(video)};
 const items:MenuItem[]=held?[remove]:[
  {label:'Later',icon:'save',fn:()=>void actions.later(video)},
  ...(onResearch?[{label:'Add to channel board',icon:'research' as const,fn:onResearch}]:[]),'-',
  {header:'Skip it because…'},...SKIP_REASONS.map(reason=>({label:reason,fn:()=>void actions.skip(video,reason)})),'-',
  {header:'Move to'},...VIDEO_STAGES.filter(stage=>stage!=='ideas').map(stage=>({label:STAGE_LABEL[stage],fn:()=>onMove(stage)})),'-',
  remove,
 ];
 return <div className="kwrap">
  <div id={`idea-${video.id}`} className={['card','kcard','icard','hov',highlight&&'new',held&&'held',dragging&&'dragging'].filter(Boolean).join(' ')} draggable={!held} data-card data-card-id={video.id}
   onDragStart={held?undefined:onDragStart} onDragEnd={onDragEnd} onClick={onOpen} tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onOpen();}}>
   <div className="tt clamp2">{video.title}{highlight&&<span className="itag">New</span>}</div>
   {why&&<div className="why clamp2">{why}</div>}
   {(source||video.idea?.dropReason)&&<div className="src">
    {video.idea?.dropReason?<span>Skipped · {video.idea.dropReason}</span>:source&&<>{ideaSourceVideoId(video)?<BrandLogo brand="youtube" size={14}/>:<Icon name="link" size={12}/>}<span className="ellipsis">{source.label}</span></>}
   </div>}
   <div className="acts" onClick={event=>event.stopPropagation()}>
    {held
     ?<button type="button" className="btn sm ghost" onClick={()=>void actions.restore(video)}><Icon name="retry" size={14}/>Restore</button>
     :<button type="button" className="btn sm ghost" onClick={()=>void actions.startPlanning(video)}><Icon name="next" size={14}/>Start planning</button>}
   </div>
  </div>
  <div className="kmove"><Menu align="right" label={`More about ${video.title}`} items={items} restoreFocus button={(toggle,open)=>
   <button type="button" className={`btn sm icon-only${open?' menu-open':''}`} aria-label={`More about ${video.title}`} aria-haspopup="menu" aria-expanded={open} title={onResearch?'Later, Add to Research, Skip, Move to, Delete':'Later, Skip, Move to, Delete'} onClick={toggle}><Icon name="more" size={15}/></button>}/></div>
 </div>;
}

/**
 * The Ideas lane of the board, in groups: Timely (news, newest first) and Evergreen (best rated first) show their first few with "Show all";
 * Later and Skipped are folded until you open them, and do not show at all while they are empty. Each group says how many it holds.
 * `openGroup` is a folded group to open at first (a link to Later or Skipped). `newId` is the idea just added: it leads its group and is marked.
 */
export function IdeaLane({videos,newId,openGroup,dragId,actions,onOpen,onMove,onResearch,onDragStart,onDragEnd}:{
 videos:readonly Video[];newId?:string;openGroup?:IdeaHeld;dragId:string|null;actions:IdeaActionSet;
 onOpen(video:Video):void;onMove(id:string,stage:VideoStage):void;onResearch?(video:Video):void;onDragStart(id:string,event:DragEvent):void;onDragEnd():void;
}){
 const groups=ideaGroups(videos,newId);
 const [open,setOpen]=useState<Partial<Record<IdeaGroup,boolean>>>(()=>openGroup?{[openGroup]:true}:{});
 const toggle=(group:IdeaGroup)=>setOpen(current=>({...current,[group]:!current[group]}));
 if(!IDEA_GROUPS.some(([group])=>groups[group].length))return <div className="col-empty">{COLUMN_EMPTY.ideas}</div>;
 const card=(video:Video)=><IdeaCard key={video.id} video={video} highlight={video.id===newId} dragging={dragId===video.id} actions={actions} onOpen={()=>onOpen(video)} onMove={stage=>onMove(video.id,stage)} onResearch={onResearch&&(()=>onResearch(video))}
  onDragStart={event=>onDragStart(video.id,event)} onDragEnd={onDragEnd}/>;
 return <>{IDEA_GROUPS.map(([group,label])=>{
  const list=groups[group],folded=group==='later'||group==='skipped';
  if(!list.length)return null;
  if(folded)return <div key={group} className="igroup" data-group={group}>
   <button type="button" className="igroup-h toggle" aria-expanded={!!open[group]} onClick={()=>toggle(group)}><span>{label}</span> <span className="n">{list.length}</span><Icon name={open[group]?'expand':'forward'} size={14} className="faint"/></button>
   {open[group]&&list.map(card)}
  </div>;
  const shown=open[group]?list:list.slice(0,GROUP_SHOWN);
  return <div key={group} className="igroup" data-group={group}>
   <div className="igroup-h"><span>{label}</span> <span className="n">{list.length}</span></div>
   {shown.map(card)}
   {list.length>GROUP_SHOWN&&<button type="button" className="linkish igroup-more" onClick={()=>toggle(group)}>{open[group]?'Show fewer':`Show all ${list.length}`}</button>}
  </div>;
 })}</>;
}
