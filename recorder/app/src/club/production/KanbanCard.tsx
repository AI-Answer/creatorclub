import {useState,type DragEvent,type KeyboardEvent} from 'react';
import {VIDEO_STAGES,videoHumanId,type Video,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {videoThumbId} from '../ideas';
import {type SceneProgress} from '../scene-status';
import {Icon,Menu,StageBadge,type MenuItem} from '../ui';
import {useNearViewport} from '../near-viewport';

/** The server resolves picked thumbnail → recording frame. A published video's own YouTube thumbnail is the last fallback; an idea never borrows its source video's. */
export function coverSources(video:Video):string[]{
 const thumb=video.stage==='published'?videoThumbId(video):undefined;
 return [`/api/club/videos/${encodeURIComponent(video.id)}/cover?v=${encodeURIComponent(video.updatedAt)}`,...(thumb?[`https://i.ytimg.com/vi/${thumb}/mqdefault.jpg`]:[])];
}

/** Only a real picture earns a cover: nothing shows while it loads, and a card with no picture has no cover at all. */
function Cover({video}:{video:Video}){
 const {ref,near}=useNearViewport();
 const sources=coverSources(video),[failed,setFailed]=useState<string[]>([]),[loaded,setLoaded]=useState<string|null>(null);
 const picture=sources.find(source=>!failed.includes(source));
 return <><span ref={ref} hidden/>{near&&picture&&<div className="kcard-cover" hidden={loaded!==picture}>
  <img key={picture} src={picture} alt="" decoding="async" onLoad={()=>setLoaded(picture)} onError={()=>setFailed(current=>[...current,picture])}/>
 </div>}</>;
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
export function KanbanCard({video,dragging,highlight,onOpen,onMove,onResearch,onDragStart,onDragEnd,onKeyDown}:{
 highlight?:boolean;video:Video;scenes:readonly SceneProgress[]|undefined;dragging:boolean;onOpen():void;onMove(stage:VideoStage):void;onResearch?():void;
 onDragStart(event:DragEvent):void;onDragEnd():void;onKeyDown?(event:KeyboardEvent<HTMLDivElement>):void;
}){
 const humanId=videoHumanId(video);
 const stages:MenuItem[]=[{header:'Move to'},...VIDEO_STAGES.map(stage=>({label:STAGE_LABEL[stage],check:video.stage===stage,fn:()=>{if(stage!==video.stage)onMove(stage);}})),
  ...(onResearch?['-' as const,{label:'Add to Channel board',icon:'research' as const,fn:onResearch}]:[])];
 return <div className="kwrap">
  <div id={video.stage==='ideas'?`idea-${video.id}`:undefined} className={`card kcard hov${highlight?' new':''}${dragging?' dragging':''}`} draggable data-card data-card-id={video.id} onDragStart={onDragStart} onDragEnd={onDragEnd}
   title={video.title.trim()||'Untitled video'} role="button" aria-label={`${humanId} ${video.title.trim()||'Untitled video'}`} aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Meta+ArrowLeft Meta+ArrowRight Control+ArrowLeft Control+ArrowRight"
   onClick={onOpen} tabIndex={0} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen();}else onKeyDown?.(event);}}>
   <Cover video={video}/>
   <div className="tt">{video.title.trim()||'Untitled video'}</div>
   <div className="na">
    <StageBadge stage={video.stage} dotOnly/>
    {humanId&&<><span className="kcard-id">{humanId}</span><span aria-hidden>·</span></>}
    <time dateTime={video.updatedAt} title={`Updated ${new Date(video.updatedAt).toLocaleString()}`}>{relativeUpdated(video.updatedAt)}</time>

   </div>
  </div>
  <div className="kmove"><Menu align="right" label="Move to" items={stages} button={(toggle,open)=>
   <button type="button" className="btn sm icon-only" aria-label={`Move ${video.title} to…`} title="Move to another stage, or add to Channel board" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Icon name="more" size={18}/></button>}/></div>
 </div>;
}
