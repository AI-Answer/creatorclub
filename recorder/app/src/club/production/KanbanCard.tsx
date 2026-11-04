import {useState,type DragEvent,type KeyboardEvent} from 'react';
import {VIDEO_STAGES,videoHumanId,type Video,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {videoThumbId} from '../ideas';
import {recordedCount,type SceneProgress} from '../scene-status';
import {Icon,Menu,type MenuItem} from '../ui';

/** The server resolves picked thumbnail → recording frame. A source/published thumbnail is the last image fallback. */
export function coverSources(video:Video):string[]{
 const thumb=videoThumbId(video);
 return [`/api/club/videos/${encodeURIComponent(video.id)}/cover?v=${encodeURIComponent(video.updatedAt)}`,...(thumb?[`https://i.ytimg.com/vi/${thumb}/mqdefault.jpg`]:[])];
}

function Cover({video}:{video:Video}){
 const sources=coverSources(video),[failed,setFailed]=useState<string[]>([]);
 const picture=sources.find(source=>!failed.includes(source));
 return <div className={`kcard-cover st-${video.stage}`}>
  <div className="kcard-placeholder" aria-hidden><Icon name={video.stage==='ideas'?'idea':'video'} size={25}/><span>{STAGE_LABEL[video.stage]}</span></div>
  {picture&&<img key={picture} src={picture} alt="" loading="lazy" decoding="async" onError={()=>setFailed(current=>[...current,picture])}/>}
 </div>;
}

export const relativeUpdated=(iso:string,now=Date.now())=>{
 const minutes=Math.max(0,Math.floor((now-Date.parse(iso))/60000));
 if(!Number.isFinite(minutes))return '';
 if(minutes<1)return 'Just now';
 if(minutes<60)return `${minutes}m ago`;
 if(minutes<1440)return `${Math.floor(minutes/60)}h ago`;
 return `${Math.floor(minutes/1440)}d ago`;
};

/** A cover-led video card with the same complete Move menu for mouse and keyboard users. */
export function KanbanCard({video,scenes,dragging,highlight,onOpen,onMove,onResearch,onDragStart,onDragEnd,onKeyDown}:{
 highlight?:boolean;video:Video;scenes:readonly SceneProgress[]|undefined;dragging:boolean;onOpen():void;onMove(stage:VideoStage):void;onResearch?():void;
 onDragStart(event:DragEvent):void;onDragEnd():void;onKeyDown?(event:KeyboardEvent<HTMLDivElement>):void;
}){
 const humanId=videoHumanId(video);
 const stages:MenuItem[]=[{header:'Move to'},...VIDEO_STAGES.map(stage=>({label:STAGE_LABEL[stage],check:video.stage===stage,fn:()=>{if(stage!==video.stage)onMove(stage);}})),
  ...(onResearch?['-' as const,{label:'Add to Research',icon:'research' as const,fn:onResearch}]:[])];
 return <div className="kwrap">
  <div id={video.stage==='ideas'?`idea-${video.id}`:undefined} className={`card kcard hov${highlight?' new':''}${dragging?' dragging':''}`} draggable data-card data-card-id={video.id} onDragStart={onDragStart} onDragEnd={onDragEnd}
   role="button" aria-label={`${humanId} ${video.title.trim()||'Untitled video'}`} aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Meta+ArrowLeft Meta+ArrowRight Control+ArrowLeft Control+ArrowRight"
   onClick={onOpen} tabIndex={0} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen();}else onKeyDown?.(event);}}>
   <div className="kcard-top"><span className="kcard-id">{humanId}</span>{highlight&&<span className="itag">New</span>}</div>
   <Cover video={video}/>
   <div className="tt clamp2">{video.title.trim()||'Untitled video'}</div>
   <div className="na">
    <span className={`col-dot st-${video.stage}`} role="img" aria-label={STAGE_LABEL[video.stage]}/>
    {scenes?<span>{recordedCount(scenes)}/{scenes.length} scenes</span>:<span>{STAGE_LABEL[video.stage]}</span>}
    {video.hidden&&<span>{video.hidden==='later'?'Later':'Skipped'}</span>}
    <time dateTime={video.updatedAt} title={`Updated ${new Date(video.updatedAt).toLocaleString()}`}>{relativeUpdated(video.updatedAt)}</time>
   </div>
  </div>
  <div className="kmove"><Menu align="right" label="Move to" items={stages} button={(toggle,open)=>
   <button type="button" className="btn sm icon-only" aria-label={`Move ${video.title} to…`} title="Move to another stage, or add to Research" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Icon name="more" size={15}/></button>}/></div>
 </div>;
}
