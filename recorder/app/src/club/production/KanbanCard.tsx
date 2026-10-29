import type {DragEvent} from 'react';
import type {Video} from '../../../shared/club';
import {fmtDate} from '../format';
import {videoThumbId} from '../ideas';
import {nextAction} from '../overview';
import {scenesLine} from '../production';
import {recordedCount,type SceneProgress} from '../scene-status';
import {Icon,SceneDots,Thumb} from '../ui';

/** A video on the board: its picture, title, scene dots, the next thing to do and its day. Drag it to another column; press it to open it. */
export function KanbanCard({video,scenes,dragging,onOpen,onDragStart,onDragEnd}:{
 video:Video;scenes:readonly SceneProgress[];dragging:boolean;onOpen():void;
 onDragStart(event:DragEvent):void;onDragEnd():void;
}){
 const next=nextAction(video,scenes),published=video.stage==='published';
 const day=published?video.publishedAt:video.publishDate;
 return <div className={`card kcard hov${dragging?' dragging':''}`} draggable data-card data-card-id={video.id} onDragStart={onDragStart} onDragEnd={onDragEnd}
  onClick={onOpen} tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onOpen();}}>
  <Thumb videoId={videoThumbId(video)} text={video.title} seed={video.id}/>
  <div className="tt clamp2">{video.title}</div>
  {scenes.length>0&&<div className="na"><SceneDots scenes={scenes}/><span>{scenesLine(recordedCount(scenes),scenes.length)}</span></div>}
  <div className="na" style={{color:published?'var(--cc-text-2)':'var(--cc-accent-text)',fontWeight:550}}>
   <Icon name={next.icon} size={13}/>{next.label}
   {day&&<span className="faint" style={{marginLeft:'auto',fontWeight:500}}>{fmtDate(day)}</span>}
  </div>
 </div>;
}
