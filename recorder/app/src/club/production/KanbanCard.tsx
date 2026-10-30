import type {DragEvent} from 'react';
import {VIDEO_STAGES,type Video,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {fmtDate} from '../format';
import {videoThumbId} from '../ideas';
import {nextAction} from '../overview';
import {scenesLine} from '../production';
import {recordedCount,type SceneProgress} from '../scene-status';
import {Icon,Menu,SceneDots,Thumb,type MenuItem} from '../ui';

/**
 * A video on the board: its picture, title, scene dots, the next thing to do and its day. Drag it to another column, or use its Move to menu; press it to open it.
 * `scenes` is undefined while they are not known. The menu sits beside the card, not in it, because the card moves a pixel on hover and that would throw off the menu's fixed placement.
 */
export function KanbanCard({video,scenes,dragging,onOpen,onMove,onDragStart,onDragEnd}:{
 video:Video;scenes:readonly SceneProgress[]|undefined;dragging:boolean;onOpen():void;onMove(stage:VideoStage):void;
 onDragStart(event:DragEvent):void;onDragEnd():void;
}){
 const next=nextAction(video,scenes),published=video.stage==='published';
 const day=published?video.publishedAt:video.publishDate;
 const stages:MenuItem[]=[{header:'Move to'},...VIDEO_STAGES.map(stage=>({label:STAGE_LABEL[stage],check:video.stage===stage,fn:()=>{if(stage!==video.stage)onMove(stage);}}))];
 return <div className="kwrap">
  <div className={`card kcard hov${dragging?' dragging':''}`} draggable data-card data-card-id={video.id} onDragStart={onDragStart} onDragEnd={onDragEnd}
   onClick={onOpen} tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onOpen();}}>
   <Thumb videoId={videoThumbId(video)} text={video.title} seed={video.id}/>
   <div className="tt clamp2">{video.title}</div>
   {scenes&&scenes.length>0&&<div className="na"><SceneDots scenes={scenes}/><span>{scenesLine(recordedCount(scenes),scenes.length)}</span></div>}
   <div className="na" style={{color:published?'var(--cc-text-2)':'var(--cc-accent-text)',fontWeight:550}}>
    <Icon name={next.icon} size={13}/>{next.label}
    {day&&<span className="faint" style={{marginLeft:'auto',fontWeight:500}}>{fmtDate(day)}</span>}
   </div>
  </div>
  <div className="kmove"><Menu align="right" label="Move to" items={stages} button={(toggle,open)=>
   <button type="button" className="btn sm icon-only" aria-label={`Move ${video.title} to…`} title="Move to another stage" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Icon name="more" size={15}/></button>}/></div>
 </div>;
}
