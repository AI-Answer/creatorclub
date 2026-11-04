import {useState,type DragEvent} from 'react';
import {VIDEO_STAGES,type Video,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {fmtDate} from '../format';
import {videoThumbId} from '../ideas';

import {scenesLine} from '../production';
import {recordedCount,type SceneProgress} from '../scene-status';
import {Icon,Menu,SceneDots,type MenuItem} from '../ui';

/** A compact draggable video: title, optional image and progress/date, with a separate Move to menu. */
export function KanbanCard({video,scenes,dragging,highlight,onOpen,onMove,onResearch,onDragStart,onDragEnd}:{
 highlight?:boolean;video:Video;scenes:readonly SceneProgress[]|undefined;dragging:boolean;onOpen():void;onMove(stage:VideoStage):void;onResearch?():void;
 onDragStart(event:DragEvent):void;onDragEnd():void;
}){
 const published=video.stage==='published';
 const [failed,setFailed]=useState(false);
 const thumb=videoThumbId(video);
 const picture=thumb?`https://i.ytimg.com/vi/${thumb}/mqdefault.jpg`:`/api/club/videos/${encodeURIComponent(video.id)}/cover`;
 const day=published?video.publishedAt:video.publishDate;
 const stages:MenuItem[]=[{header:'Move to'},...VIDEO_STAGES.map(stage=>({label:STAGE_LABEL[stage],check:video.stage===stage,fn:()=>{if(stage!==video.stage)onMove(stage);}})),
  ...(onResearch?['-' as const,{label:'Add to Research',icon:'research' as const,fn:onResearch}]:[])];
 return <div className="kwrap">
  <div id={video.stage==='ideas'?`idea-${video.id}`:undefined} className={`card kcard hov${highlight?' new':''}${dragging?' dragging':''}`} draggable data-card data-card-id={video.id} onDragStart={onDragStart} onDragEnd={onDragEnd}
   onClick={onOpen} tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onOpen();}}>
   <div className="tt clamp2">{video.title.trim()||'Untitled video'}{highlight&&<span className="itag">New</span>}</div>
   {!failed&&<img className="kcard-thumb" src={picture} alt="" loading="lazy" onError={()=>setFailed(true)}/>}
   <div className="na">
    {video.hidden&&<span>{video.hidden==='later'?'Later':'Skipped'} ·</span>}
    {scenes&&scenes.length>0?<><SceneDots scenes={scenes}/><span>{scenesLine(recordedCount(scenes),scenes.length)}</span></>:<span>{fmtDate(video.updatedAt)}</span>}
    {day&&<span className="faint" style={{marginLeft:'auto'}}>{fmtDate(day)}</span>}
   </div>
  </div>
  <div className="kmove"><Menu align="right" label="Move to" items={stages} button={(toggle,open)=>
   <button type="button" className="btn sm icon-only" aria-label={`Move ${video.title} to…`} title="Move to another stage, or add to Research" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Icon name="more" size={15}/></button>}/></div>
 </div>;
}
