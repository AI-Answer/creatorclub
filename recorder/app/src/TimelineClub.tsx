import {memo,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {AudioLines,Camera,Clapperboard,Layers,LayoutTemplate,Link2,Mic,Monitor,Music,Plus,Type,ZoomIn} from 'lucide-react';
import {motionLabel} from '../shared/motion/templates';
import type {Clip,Media,Project,TrackKind} from '../shared/types';
import {clipDuration,projectDuration} from '../shared/types';
import {clipLayerKind,clipLayerRowId,moveClipsToLayer,timelineRows,type TimelineLayerRow} from '../shared/timeline-layers';
import {filmstripCount} from '../shared/filmstrip';
import {hasWaveform,waveformMediaKey,waveformBars,waveformSpikesPath,timelineWaveformCache} from './timeline-waveform';
import {sameTimelineWindow,timelineWindow} from './timeline-viewport';
import {groupMove,hitLayerDrop,snapTargets,snapTimelineDelta,timelinePointerDelta,type LayerDrop,type SnapTarget} from './timeline-drag';
import {rectangleBetween,itemsInRectangle,type SelectionItem,type SelectionRect} from './timeline-selection';
import {takeSyncOffsets,snapBackToTake,secondsLabel,syncScenesToTakes,anchoredScroll,applyClipStarts,clampScale,ensureLinks,fitScale,freeDelta,linkGroups,linkedIds,moveEffects,moveMarker,planClipMove,removeMarker,resizeEffect,rowItems,rulerTicks,rulerLabel,lengthLabel,pointerScroll,showTenths,trimBounds,trimClips,trimGroup,DRAG_DEAD_ZONE_PX} from './timeline-edit';
import type {Playhead} from './playhead';
import {captionWordsByClip} from '../shared/caption-timing';
import {TAKE_ROW,takeClipViews,type TakeClipView} from './timeline-take-view';
import {isSoundTag} from '../shared/sound-tags';
import {baseLayout,insertLayout,layoutRoom} from '../shared/layouts';
import {makeId} from '../shared/types';
import {plainClone} from './project-draft';

/**
 * The embedded (Creator Compiler) timeline. Rows exist only when used; a take's screen, camera and audio are linked;
 * clips never overlap on a row (a drop slides to the nearest gap, or inserts and shifts the row); effect rows drag, resize and snap;
 * a delete closes the gap on every row; the ruler has ticks (frames at high zoom), scene tags and markers; zoom keeps the playhead in place.
 * A gesture is cancelled only by the person (Escape, pointer cancel, window blur), never by a save or a reload of the project.
 */
type Change=(fn:(project:Project)=>void,opts?:{coalesce?:string})=>void;
export interface TimelineControls {fit():void;width():number}
type Effect='motion'|'elements'|'captions'|'zooms'|'layouts';
interface Row {id:string;name:string;icon:typeof Camera;height:number;top:number;layer?:TimelineLayerRow;effect?:Effect;linked?:boolean;take?:boolean}
interface Preview {start:number;duration:number;sourceIn?:number;dy?:number}
interface Drag {items:Map<string,Preview>;ghosts:Array<{row:string;start:number;duration:number}>;guide:number|null;insert:number|null;label:string;markers?:Map<string,number>}
/** Snapping reaches 8 px on screen, whatever the zoom, so a short neighbour does not pull an edit away from where it was dropped. */
const RULER=30,SCENE_BAND=14,NOTES_LANE=22,SNAP_PX=8,STALE_DROP='The timeline changed during the drag, so nothing moved. Try again.',NOT_MOVED='Clips stay joined end to end. Drag a clip onto another one to change the order.';
const icons:Record<TrackKind,typeof Camera>={screen:Monitor,camera:Camera,audio:Mic,music:Music,overlay:Layers};
/** As in Borumi: media rows are tall blocks (52px), effect rows (graphics, text, layout, zooms, captions) Borumi's 32px lanes. */
// Borumi's rows (screens/borumi/40): a picture row about 50px, an audio row a little taller for its words band.
const ROW_H=32,MEDIA_H=52,AUDIO_H=60,TAKE_H=72;
const heights:Record<TrackKind,number>={screen:MEDIA_H,camera:MEDIA_H,audio:AUDIO_H,music:MEDIA_H,overlay:MEDIA_H};
/** In Borumi's order: overlays (graphics, text), then the control rows (layout, zoom, captions) under them. */
const effectRows:Array<{id:Effect;name:string;icon:typeof Camera}>=[{id:'motion',name:'Graphics',icon:Clapperboard},{id:'elements',name:'Text',icon:Type},{id:'layouts',name:'Layout',icon:LayoutTemplate},{id:'zooms',name:'Zoom',icon:ZoomIn},{id:'captions',name:'Captions',icon:AudioLines}];

/** The items on the effect rows (graphics, text, captions, zooms, layout stretches) with the words the timeline shows on them. */
const effectsOf=(p:Project)=>new Map<string,Array<{id:string;start:number;duration:number;name:string}>>([['motion',(p.motion??[]).map(m=>({id:m.id,start:m.start,duration:m.duration,name:motionLabel(m)}))],['elements',p.elements.map(e=>({id:e.id,start:e.start,duration:e.duration,name:e.text||e.type}))],['captions',p.captions.filter(c=>!isSoundTag(c.text)).map(c=>({id:c.id,start:c.start,duration:c.end-c.start,name:c.text}))],['zooms',p.zooms.map(z=>({id:z.id,start:z.start,duration:z.duration,name:`Zoom ${z.scale}×`}))],['layouts',(p.layouts??[]).map(l=>({id:l.id,start:l.start,duration:l.duration,name:l.preset}))]]);
type FxGhost={row:string;id:string;start:number;duration:number;name:string;kind:'new'|'changed'|'removed'};
/** What a previewed change would add, move, reword or remove on the effect rows, to draw over the timeline before it is applied. */
function fxGhosts(now:Project,after:Project):FxGhost[]{
 const before=effectsOf(now),next=effectsOf(after),out:FxGhost[]=[];
 for(const row of ['motion','elements','captions','zooms','layouts']){
  const was=new Map((before.get(row)??[]).map(i=>[i.id,i])),will=new Map((next.get(row)??[]).map(i=>[i.id,i]));
  for(const [id,i] of will){const old=was.get(id);if(!old)out.push({row,...i,kind:'new'});else if(Math.abs(old.start-i.start)>1e-6||Math.abs(old.duration-i.duration)>1e-6||old.name!==i.name)out.push({row,...i,kind:'changed'});}
  for(const [id,i] of was)if(!will.has(id))out.push({row,...i,kind:'removed'});
 }
 return out;
}

/** Rows that have something on them (custom layers always), in display order; an empty timeline shows Screen and Audio as drop targets. */
/** Scene labels sit under the times whenever the video has footage, as in Borumi ("• SCENE 1"), including a scene still waiting for its take. */
const sceneBand=(p:Project)=>p.scenes.length>0&&p.clips.length>0;
/** The ruler's height: the times, the scene names when there are several, and a lane on top for note pins once the video has notes. */
export const rulerHeight=(p:Project)=>RULER-(sceneBand(p)?0:SCENE_BAND)+(p.markers?.length?NOTES_LANE:0);
export function usedRows(p:Project):Row[]{
 const views=takeClipViews(p),counts=new Map<string,number>();for(const view of views){counts.set(view.row,(counts.get(view.row)??0)+1);}
 const custom=new Set(p.timelineLayers?.map(l=>l.id)),groups=linkGroups(p.clips),sizes=new Map<string,number>();for(const key of groups.values())sizes.set(key,(sizes.get(key)??0)+1);
 const layers=timelineRows(p).filter(l=>counts.has(l.id)||custom.has(l.id)||!p.clips.length&&(l.id==='role:screen'||l.id==='role:audio'));
 const rows:Row[]=[];let top=rulerHeight(p);
 if(counts.has(TAKE_ROW)){rows.push({id:TAKE_ROW,name:'Linked takes',icon:Link2,height:TAKE_H,top,take:true,linked:true,layer:{id:TAKE_ROW,name:'Linked takes',kind:'video',order:0,track:'screen'}});top+=TAKE_H;}
 const linkedRow=(id:string)=>p.clips.some(c=>clipLayerRowId(c,p)===id&&sizes.get(groups.get(c.id)!)!>1);
 for(const l of layers){const height=l.track?heights[l.track]:ROW_H;rows.push({id:l.id,name:l.track==='screen'?'Screen':l.name,icon:l.track?icons[l.track]:l.kind==='video'?Layers:Music,height,top,layer:l,linked:linkedRow(l.id)});top+=height;}
 // As in Borumi, captions spoken on an audio row show as its words, not as a row of their own; captions typed in (no word timings) keep their row.
 const owned=captionWordsByClip(p),seconds=(words:Array<{start:number;end:number}>)=>words.reduce((sum,w)=>sum+Math.max(0,w.end-w.start),0),wordsOnAudio=p.captions.length>0&&p.captions.every(c=>c.words?.length)&&Math.abs(seconds(p.captions.flatMap(c=>c.words??[]))-seconds(views.flatMap(v=>owned.get(v.clip.id)??[])))<1e-6;
 for(const e of effectRows){if(!(p[e.id]??[]).length||e.id==='captions'&&wordsOnAudio)continue;rows.push({id:e.id,name:e.name,icon:e.icon,height:ROW_H,top,effect:e.id});top+=ROW_H;}
 return rows;
}
export const rowsHeight=(rows:readonly Row[])=>(rows[0]?.top??RULER)+rows.reduce((n,r)=>n+r.height,0)+10;

function Playhead_({playhead,scale,follow,onPage}:{playhead:Playhead;scale:number;follow:boolean;onPage:(el:HTMLElement)=>void}){
 const line=useRef<HTMLDivElement>(null),lastSeen=useRef({time:NaN}); // Kept across rescales: a zoom keeps the playhead in place instead of paging.
 useLayoutEffect(()=>{const el=line.current?.closest<HTMLElement>('.timeline-scroll'),seen=lastSeen.current;const update=()=>{const time=playhead.get(),x=time*scale,ratio=window.devicePixelRatio||1;
  if(el&&follow&&time!==seen.time){seen.time=time;if(x<el.scrollLeft||x>el.scrollLeft+el.clientWidth-40){el.scrollLeft=Math.max(0,x-el.clientWidth*.25);onPage(el);}}
  if(line.current)line.current.style.transform=`translateX(${Math.round(x*ratio)/ratio}px)`;};update();return playhead.subscribe(update);},[playhead,scale,follow,onPage]);
 return <div className="playhead" ref={line}><span/></div>;
}

const fmtLen=lengthLabel;
/** The height of the band the spoken words sit on, along the top of an audio clip. */
const WORD_BAND=22;
const ClubClip=memo(function ClubClip({view,media,row,preview,selected,linked,relation,offset,label,peaks,words,scale,from,to,onBegin,onOpen,onHover,onSync}:{view:TakeClipView;media?:Media;row:Row;preview?:Preview;selected:boolean;linked:boolean;relation?:'linked'|'take';offset?:number;label:string;peaks?:readonly number[];words?:Array<{text:string;start:number;end:number}>;scale:number;from:number;to:number;onBegin:(e:React.PointerEvent,id:string,mode:'move'|'left'|'right')=>void;onOpen:(id:string)=>void;onHover:(id:string|null)=>void;onSync:(id:string)=>void}){
 const c=view.clip,start=preview?.start??c.start,duration=preview?.duration??clipDuration(c),width=Math.max(4,duration*scale),h=row.height-6;
 const geometry=preview?{...c,start,sourceIn:preview.sourceIn??c.sourceIn,sourceOut:(preview.sourceIn??c.sourceIn)+duration*c.speed}:c;
 const shownWords=(words??[]).flatMap(w=>{const map=(t:number)=>geometry.start+(c.sourceIn+(t-c.start)*c.speed-geometry.sourceIn)/geometry.speed,a=Math.max(start,map(w.start)),b=Math.min(start+duration,map(w.end));return b>a?[{...w,start:a,end:b}]:[];});
 const band=shownWords.length?WORD_BAND:0,waveH=h-band;
 const wave=useMemo(()=>media&&hasWaveform(media)&&peaks?.length?waveformSpikesPath(waveformBars(geometry,media,peaks,scale,from,to,4096,2),band+waveH/2,waveH/2-2):'',[media,peaks,geometry.start,geometry.sourceIn,geometry.sourceOut,geometry.speed,scale,from,to,band,waveH]);
 return <div data-clip-id={c.id} data-linked-clip-ids={view.grouped?view.members.map(m=>m.id).join(' '):undefined} className={`timeline-clip club-clip clip-${c.track} ${view.grouped?'club-take':''} ${selected?'selected':''} ${c.muted?'muted':''} ${preview?'clip-drag-preview':''} ${linked?'is-linked':'is-unlinked'} ${relation?`take-related take-related-${relation}`:''}`} data-take-id={c.recordingTakeId} style={{left:start*scale,width,top:3,height:h,transform:preview?.dy?`translateY(${preview.dy}px)`:undefined}}
  onPointerEnter={()=>onHover(c.id)} onPointerLeave={()=>onHover(null)} onPointerDown={e=>onBegin(e,c.id,'move')} onDoubleClick={()=>onOpen(c.id)} title={`${c.name} · ${fmtLen(duration)}${linked?' · linked':''}. Click to move the playhead, drag to move, edges to trim, double-click for settings.`}>
  {!view.grouped&&linked&&<span className="club-take-chain" title="Linked sources move and trim together" aria-label="Linked sources"><Link2 size={12}/></span>}
  {offset!==undefined&&Math.abs(offset)>.001&&<button type="button" className="club-sync-badge" aria-label={`Snap back in sync, ${offset>0?'+':''}${offset.toFixed(1)} seconds`} title="Out of sync · click to snap back" onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSync(c.id);}}>Out of sync {offset>0?'+':''}{offset.toFixed(1)} s</button>}
  {wave&&<svg className="club-wave" data-waveform-media={media?.id} viewBox={`0 0 ${width} ${h}`} preserveAspectRatio="none" aria-hidden><path d={wave}/></svg>}
  {band>0&&<div className="club-caption-pill" title={shownWords.map(w=>w.text).join(' ')} style={{height:WORD_BAND-6}} aria-hidden>{scale<90?<span className="club-caption-text">{shownWords.map(w=>w.text).join(' ')}</span>:shownWords.map((w,i)=><span key={i} className="club-word" style={{left:Math.max(0,(w.start-start)*scale-4),width:Math.max(0,(w.end-w.start)*scale)}}>{w.text}</span>)}</div>}
  {view.pictures.length>0&&width>=36&&<div className="club-take-pictures" style={{top:band+4}} aria-hidden>{view.pictures.map(picture=><i key={picture.id} className={`club-source-thumb is-${picture.track}`} style={{backgroundImage:`url(/api/media/${picture.mediaId}/thumbnail)`}}/>)}</div>}
  {media?.kind==='image'&&<div className="club-filmstrip is-image" aria-hidden style={{backgroundImage:`url(/api/media/${media.id}/thumbnail)`,backgroundSize:`auto ${h}px`}}/>}
  {label&&<span className="club-clip-label club-move-handle" title="Drag to move">{linked&&<Link2 size={11} aria-hidden/>}{label}</span>}
  {width>=18&&<><i className="trim-handle left" onPointerDown={e=>onBegin(e,c.id,'left')}/><i className="trim-handle right" onPointerDown={e=>onBegin(e,c.id,'right')}/></>}
 </div>;
});

export const TimelineClub=memo(function TimelineClub({project:p,playhead,scale,onScale,selectedIds,onSelectMany,onSeek,change,onDropMedia,tool,onSplit,follow,showWaveforms,previewAfter,onOpenMarker,previewRanges,cutMarks,onOpen,onContextMenu,onNotice,controls,autoFit=true}:{project:Project;playhead:Playhead;scale:number;onScale:(scale:number)=>void;selectedIds:ReadonlySet<string>;onSelectMany:(ids:string[])=>void;onSeek:(time:number)=>void;change:Change;onDropMedia:(id:string,track:TrackKind,time:number,layerId?:string)=>void;tool:'select'|'blade';onSplit:(id:string,time:number)=>void;follow:boolean;showWaveforms:boolean;previewRanges?:ReadonlyArray<readonly [number,number]>|null;/** The video as a previewed change would leave it: what it adds or moves on the effect rows is drawn as a dashed block. */previewAfter?:Project|null;/** A marker was clicked: its note opens beside it. */onOpenMarker?:(id:string,box:DOMRect)=>void;/** Where words were just cut from the transcript: a short-lived mark on the timeline. */cutMarks?:readonly number[];onOpen:(id:string)=>void;onContextMenu?:(x:number,y:number)=>void;/** One sentence when a drop could not be applied. */onNotice?:(message:string)=>void;controls?:React.MutableRefObject<TimelineControls|null>;/** False when Edit brings back this video's zoom from an earlier visit: the timeline keeps it and scrolls to the playhead instead of fitting (unless that zoom would leave empty room after the video). */autoFit?:boolean}){
 const ref=useRef<HTMLDivElement>(null),heads=useRef<HTMLDivElement>(null),[win,setWin]=useState(()=>timelineWindow(0,1000)),winRef=useRef(win),[drag,setDrag]=useState<Drag|null>(null),[marquee,setMarquee]=useState<SelectionRect|null>(null);
 const view=useCallback((left:number,width:number)=>{const next=timelineWindow(left,width);if(!sameTimelineWindow(next,winRef.current)){winRef.current=next;setWin(next);}},[]);
 const page=useCallback((el:HTMLElement)=>{queueMicrotask(()=>flushSync(()=>view(el.scrollLeft,el.clientWidth)));},[view]);
 const duration=useMemo(()=>projectDuration(p),[p]),extent=Math.max(duration+1,(ref.current?.clientWidth??1000)/scale),width=extent*scale;
 const ghosts=useMemo(()=>previewAfter?fxGhosts(p,previewAfter):[],[p,previewAfter]);
 // A previewed graphic on a row that does not exist yet (the first one) gets its row while it is previewed.
 const rowsNow=useMemo(()=>usedRows(p),[p]),rows=useMemo(()=>ghosts.some(g=>g.kind!=='removed'&&!rowsNow.some(r=>r.id===g.row))?usedRows(previewAfter!):rowsNow,[ghosts,rowsNow,previewAfter]),rowById=useMemo(()=>new Map(rows.map(r=>[r.id,r])),[rows]),contentHeight=rowsHeight(rows);
 const takeViews=useMemo(()=>takeClipViews(p),[p.clips,p.media,p.timelineLayers]),viewByClip=useMemo(()=>new Map(takeViews.flatMap(v=>v.members.map(c=>[c.id,v] as const))),[takeViews]);
 const displayRow=(c:Clip)=>viewByClip.get(c.id)?.row??clipLayerRowId(c,p);
 const mediaById=useMemo(()=>new Map(p.media.map(m=>[m.id,m])),[p.media]),groups=useMemo(()=>linkGroups(p.clips),[p.clips]);
 const groupSize=useMemo(()=>{const n=new Map<string,number>();for(const key of groups.values())n.set(key,(n.get(key)??0)+1);return n;},[groups]);
 const [hoverClip,setHoverClip]=useState<string|null>(null);
 const offsets=useMemo(()=>takeSyncOffsets(p),[p]);
 const related=p.clips.filter(c=>c.id===hoverClip||selectedIds.has(c.id));
 const syncPiece=(id:string)=>{let message='';change(d=>{message=snapBackToTake(d,id).message;});onNotice?.(message);};
 const start=win.left/scale,end=win.right/scale,tenths=showTenths(end-start),[hover,setHover]=useState<number|null>(null);
 /* The picture under the pointer, from the clip's filmstrip: the playhead stays where it is. */
 const hoverFrame=(t:number)=>{
  const c=p.clips.filter(x=>(x.track==='camera'||x.track==='screen')&&t>=x.start&&t<x.start+clipDuration(x)).sort((a,b)=>Number(b.track==='screen')-Number(a.track==='screen'))[0],m=c&&mediaById.get(c.mediaId);
  if(!c||!m||m.kind!=='video'||!m.duration)return null;
  const count=filmstripCount(m.duration),h=54,w=Math.round(h*(m.width>0&&m.height>0?Math.min(2.4,Math.max(.5,m.width/m.height)):16/9)),index=Math.max(0,Math.min(count-1,Math.floor((c.sourceIn+(t-c.start)*c.speed)/m.duration*count)));
  return <i className="club-hover-frame" style={{width:w,height:h,backgroundImage:`url(/api/media/${m.id}/filmstrip)`,backgroundSize:`${count*w}px ${h}px`,backgroundPosition:`${-index*w}px 0`}}/>;
 };
 const effects=useMemo(()=>effectsOf(p),[p.motion,p.elements,p.captions,p.zooms,p.layouts]);
 const ruler=rulerHeight(p);
 // A gesture lives in refs and closes over ids, not over project arrays: only the person ends it, and the drop applies to the project as it is then.
 const gesture=useRef<(()=>void)|null>(null),latest=useRef(p);latest.current=p;
 useEffect(()=>()=>gesture.current?.(),[]);
 useEffect(()=>{gesture.current?.();},[p.id]);
 // A zoom during a drag would change what the pointer means; the person zoomed, so the drag ends.
 useEffect(()=>{gesture.current?.();},[scale]);
 // Drag previews render at most once a frame, and only when what they show changed.
 const pendingDrag=useRef<Drag|null>(null),dragFrame=useRef(0),shownDrag=useRef('');
 const showDrag=(next:Drag)=>{const key=JSON.stringify([[...next.items],next.ghosts.length,next.guide,next.insert,next.label,next.markers?[...next.markers]:null]);if(key===shownDrag.current)return;shownDrag.current=key;pendingDrag.current=next;
  dragFrame.current||=requestAnimationFrame(()=>{dragFrame.current=0;const ready=pendingDrag.current;pendingDrag.current=null;if(ready&&gesture.current)setDrag(ready);});};

 // Zoom keeps the playhead where it is on screen (keys, buttons, slider); ⌘ scroll and pinch keep the time under the pointer; a fit starts at the beginning.
 const shownScale=useRef(scale),toStart=useRef(false),atPointer=useRef<{time:number;screen:number}|null>(null);
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;const pointer=atPointer.current;atPointer.current=null;if(toStart.current){toStart.current=false;el.scrollLeft=0;}else if(shownScale.current!==scale)el.scrollLeft=pointer?pointerScroll({...pointer,to:scale}):anchoredScroll({anchor:playhead.get(),from:shownScale.current,to:scale,scrollLeft:el.scrollLeft,viewport:el.clientWidth});shownScale.current=scale;view(el.scrollLeft,el.clientWidth);},[scale]);
 const fit=useCallback(()=>{const el=ref.current;if(!el)return;toStart.current=true;onScale(fitScale(projectDuration(latest.current),el.clientWidth));},[onScale]);
 useLayoutEffect(()=>{if(controls)controls.current={fit,width:()=>ref.current?.clientWidth??0};});
 // Fit once per project, but only once its clips are there: a fit on the still-empty project would keep the default zoom (Borumi opens on the whole video).
 const fitted=useRef('');useEffect(()=>{const el=ref.current;if(fitted.current===p.id||!el?.clientWidth||!(projectDuration(p)>0))return;fitted.current=p.id;if(autoFit||projectDuration(p)*scaleRef.current<el.clientWidth*.8){fit();return;}el.scrollLeft=Math.max(0,playhead.get()*scaleRef.current-el.clientWidth*.25);view(el.scrollLeft,el.clientWidth);});
 useEffect(()=>{const el=ref.current;if(!el)return;const ro=new ResizeObserver(()=>view(el.scrollLeft,el.clientWidth));ro.observe(el);return()=>ro.disconnect();},[view]);
 const scaleRef=useRef(scale);scaleRef.current=scale;
 useEffect(()=>{const el=ref.current;if(!el)return;let pending=0,frame=0;const apply=()=>{frame=0;const next=clampScale(scaleRef.current*Math.exp(-pending*.005));pending=0;if(next!==scaleRef.current)onScale(next);};
  const wheel=(event:WheelEvent)=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();const screen=event.clientX-el.getBoundingClientRect().left;atPointer.current={time:(el.scrollLeft+screen)/scaleRef.current,screen};pending+=event.deltaY;frame||=requestAnimationFrame(apply);};el.addEventListener('wheel',wheel,{passive:false});return()=>{cancelAnimationFrame(frame);el.removeEventListener('wheel',wheel);};},[onScale]);

 // Words and the chosen narration waveform belong to the take slice, including at overview zoom.
 const showWords=p.captions.some(c=>c.words?.length);
 const wordsByClip=useMemo(()=>captionWordsByClip(p),[p.clips,p.media,p.captions]);
 // Waveforms of the audio rows in view.
 const [waveforms,setWaveforms]=useState<Record<string,readonly number[]>>({});
 const visibleAudio=useMemo(()=>{const ids=new Set(takeViews.filter(v=>v.clip.start+clipDuration(v.clip)>=start&&v.clip.start<=end).flatMap(v=>v.sound?[v.sound.mediaId]:[]));return p.media.filter(m=>ids.has(m.id)&&hasWaveform(m));},[takeViews,p.media,start,end]);
 const waveKeys=visibleAudio.map(waveformMediaKey).sort().join('|');
 useEffect(()=>{if(!showWaveforms)return;let live=true;const stops=visibleAudio.map(m=>{const key=waveformMediaKey(m);return timelineWaveformCache.subscribe(m,peaks=>{if(live)setWaveforms(prev=>prev[key]===peaks?prev:{...prev,[key]:peaks});});});return()=>{live=false;stops.forEach(s=>s());};},[waveKeys,showWaveforms]);

 // Labels: the first piece of a scene on the screen row says which scene and take it is.
 const labels=useMemo(()=>{const out=new Map<string,string>();const scene=(t:number)=>p.scenes.findIndex(s=>t>=s.start-1e-3&&t<s.start+Math.max(s.duration,.001));
  // Only the topmost clip of a link group carries the label, so a take is named once.
  const top=new Map<string,number>();for(const c of p.clips){const row=rowById.get(displayRow(c)),key=groups.get(c.id)!;if(row)top.set(key,Math.min(top.get(key)??Infinity,row.top));}
  for(const c of p.clips){const row=rowById.get(displayRow(c));if(!row)continue;const take=c.recordingTakeId?p.recordedTakes?.find(t=>t.id===c.recordingTakeId):undefined,i=take?p.scenes.findIndex(s=>s.id===take.sceneId):scene(c.start);
   // A take cut into pieces, or a clip named after the video: each piece is named by its first words, so the pieces can be told apart.
   const end=c.start+(c.sourceOut-c.sourceIn)/c.speed,said=p.captions.find(x=>x.end>c.start+.05&&x.start<end&&!isSoundTag(x.text))?.text.trim();
   const pieces=take?p.clips.filter(x=>x.track===c.track&&x.recordingTakeId===c.recordingTakeId).length:0;
   const words=said?`“${said.length>42?said.slice(0,40).trimEnd()+'…':said}”`:'';
   out.set(c.id,top.get(groups.get(c.id)!)===row.top?(i>=0&&take?(pieces>1&&words?`${i+1} · ${words}`:`${i+1} · ${p.scenes[i].name}${take.name?` · ${take.name}`:''}`):(words&&c.name.startsWith(p.name)?words:c.name)):'');}
  return out;},[p.clips,p.scenes,p.recordedTakes,p.captions,p.name,rowById,groups]);

 const targets=(moving:ReadonlySet<string>):SnapTarget[]=>snapTargets(rowItems(latest.current).map(i=>({id:i.id,start:i.start,duration:i.duration})),moving,playhead.get(),latest.current.scenes.flatMap(s=>[s.start,s.start+s.duration]),(latest.current.markers??[]).filter(m=>!moving.has(m.id)).map(m=>m.time));
 const contentX=(clientX:number)=>{const el=ref.current!;return clientX-el.getBoundingClientRect().left+el.scrollLeft;};
 const snapTime=(time:number,moving:ReadonlySet<string>=new Set())=>{const el=ref.current;if(!el||!latest.current.settings.snap)return {time,guide:null as number|null};const r=snapTimelineDelta({delta:0,anchors:[time],targets:targets(moving),scale,thresholdPx:SNAP_PX});return {time:time+r.delta,guide:r.guide?.time??null};};

 /** Runs one pointer gesture: `move` on each pointer move (with scroll at the edges), `drop` on release. Escape, pointer cancel and window blur cancel it. */
 function run(e:React.PointerEvent,move:(x:number,y:number,ev:PointerEvent)=>void,drop:(moved:boolean,ev:PointerEvent)=>void,dead=3){
  gesture.current?.();const el=ref.current!;let last={x:e.clientX,y:e.clientY},moved=false,frame=0,closed=false,lastEvent:PointerEvent=e.nativeEvent as PointerEvent;const id=e.pointerId;
  const update=(ev:PointerEvent)=>{moved||=Math.abs(last.x-e.clientX)>=dead||Math.abs(last.y-e.clientY)>=dead;if(moved)move(last.x,last.y,ev);};
  const onMove=(ev:PointerEvent)=>{if(ev.pointerId!==id)return;last={x:ev.clientX,y:ev.clientY};lastEvent=ev;update(ev);};
  const close=()=>{if(closed)return;closed=true;cancelAnimationFrame(frame);window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',onUp);window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);cancelAnimationFrame(dragFrame.current);dragFrame.current=0;pendingDrag.current=null;shownDrag.current='';setDrag(null);setMarquee(null);gesture.current=null;};
  // Escape ends only the drag: it is caught before the editor's own keys (which would also close a sheet).
  const cancel=()=>close(),key=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();close();}};
  const onUp=(ev:PointerEvent)=>{if(ev.pointerId!==id)return;last={x:ev.clientX,y:ev.clientY};if(moved)move(last.x,last.y,ev);close();drop(moved,ev);};
  const edge=()=>{if(closed)return;const b=el.getBoundingClientRect();const dx=last.x<b.left+24?-Math.min(16,(b.left+24-last.x)/2):last.x>b.right-24?Math.min(16,(last.x-b.right+24)/2):0;if(dx&&moved&&b.width>48){const before=el.scrollLeft;el.scrollLeft+=dx;if(el.scrollLeft!==before)move(last.x,last.y,lastEvent);}frame=requestAnimationFrame(edge);};
  window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onUp);window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);gesture.current=close;frame=requestAnimationFrame(edge);
 }
 const sameClips=(ids:Iterable<string>,before:Project)=>{const now=new Map(latest.current.clips.map(c=>[c.id,c]));for(const id of ids){const a=before.clips.find(c=>c.id===id),b=now.get(id);if(a&&(!b||b.start!==a.start||b.sourceIn!==a.sourceIn||b.sourceOut!==a.sourceOut||b.speed!==a.speed))return false;}return true;};

 function begin(e:React.PointerEvent,id:string,mode:'move'|'left'|'right'){
  if(e.button!==0)return;e.stopPropagation();e.preventDefault();
  const base=latest.current,clip=base.clips.find(c=>c.id===id),items=rowItems(base).map(i=>({...i,row:viewByClip.get(i.id)?.row??i.row})),item=items.find(i=>i.id===id);if(!item)return;
  if(tool==='blade'&&clip){const at=snapTime(contentX(e.clientX)/scale).time;onSplit(id,at);return;}
  const group=clip?[...linkedIds(base.clips,[id])]:[id];
  if(e.shiftKey||e.metaKey||e.ctrlKey){const next=new Set(selectedIds);const on=next.has(id);for(const g of group)on?next.delete(g):next.add(g);onSelectMany([...next]);return;}
  // As in Borumi, a press always chooses (so the item's panel opens even when it was already selected); the pressed item comes first.
  const selection=selectedIds.has(id)?selectedIds:new Set(group);onSelectMany(selectedIds.has(id)?[id,...[...selectedIds].filter(x=>x!==id)]:group);
  const el=ref.current!,thresholdPx=SNAP_PX,x0=e.clientX,left0=el.scrollLeft,y0=e.clientY;
  if(mode==='move'){
   const ids=clip?linkedIds(base.clips,[...selection].filter(s=>base.clips.some(c=>c.id===s))):new Set([...selection].filter(s=>items.some(i=>i.id===s&&!base.clips.some(c=>c.id===s))));
   const moving=items.filter(i=>ids.has(i.id)),snaps=targets(ids);let plan:ReturnType<typeof planClipMove>|null=null,effectDelta=0,lastDelta=0,drop:LayerDrop|null=null;
   const measured=rows.filter(r=>r.layer&&!r.take).map(r=>({id:r.id,kind:r.layer!.kind,top:r.top,bottom:r.top+r.height}));
   run(e,(x,y,ev)=>{
    const raw=timelinePointerDelta(x0,x,left0,el.scrollLeft,scale),snap=groupMove(moving,raw,snaps,scale,base.settings.snap,thresholdPx),delta=snap.delta,pointer=contentX(x)/scale;
    lastDelta=delta;drop=null;let dy=0;
    if(clip&&Math.abs(y-y0)>=18&&Math.abs(y-y0)>Math.abs(x-x0)*1.25&&ids.size===1){const hit=hitLayerDrop(y-el.getBoundingClientRect().top+el.scrollTop,clipLayerKind(clip),measured);if(hit?.kind==='existing'&&hit.rowId!==item.row){drop=hit;dy=rowById.get(hit.rowId)!.top-rowById.get(item.row)!.top;}}
    const previews=new Map(moving.map(m=>[m.id,{start:m.start+(drop?0:delta),duration:m.duration,dy}]));let label='',insert:number|null=null;
    if(clip){plan=drop?null:planClipMove(base,ids,delta,pointer,{leaveGap:ev.altKey});if(plan?.kind==='insert'){insert=plan.at!;label='Drop to move it here · the rest shifts to make room';}else if(plan?.kind==='slide')label='Overlaps · it slides to the nearest gap';else if(plan?.kind==='none'&&plan.at!==undefined)label='Drop on the other half of a clip to change the order';else if(plan?.kind==='none'&&Math.abs(delta)>1e-6)label='The video starts here · drop it on another clip to move it';else if(drop)label=`Move to ${rowById.get((drop as {rowId:string}).rowId)?.name} · time unchanged`;else label=`${delta>=0?'+':'−'}${fmtLen(Math.abs(delta))}${ev.altKey?' · gap kept':''}`;}
    if(clip&&plan){previews.clear();for(const c of base.clips){const at=plan.starts.get(c.id);if(at!==undefined)previews.set(c.id,{start:at,duration:clipDuration(c),dy:0});}}
    else if(!clip){effectDelta=freeDelta(moving,delta,items);if(Math.abs(effectDelta-delta)>1e-6)label='Overlaps · it slides to the nearest gap';else label=`${delta>=0?'+':'−'}${fmtLen(Math.abs(delta))}`;}
    showDrag({items:previews,ghosts:moving.map(m=>({row:m.row,start:m.start,duration:m.duration})),guide:insert===null&&(!plan||Math.abs(plan.delta-delta)<1e-6)?snap.guide?.time??null:null,insert,label});
   },(moved,ev)=>{
    if(!moved){onSeek(contentX(ev.clientX)/scale);return;}
    if(clip){
     let changed=false;
     if(drop){const target=drop;change(d=>{if(!sameClips(ids,base)){changed=true;return;}moveClipsToLayer(d,ids,id,target);});if(changed)onNotice?.(STALE_DROP);return;}
     const chosen=plan;if(!chosen||chosen.kind==='none'){if(Math.abs(lastDelta)>1e-6)onNotice?.(NOT_MOVED);return;}
     // Every clip the plan moves (an insert shifts the rest of the row) must still be where it was when the drag began.
     change(d=>{if(!sameClips(chosen.starts.keys(),base)){changed=true;return;}ensureLinks(d);applyClipStarts(d,chosen.starts);syncScenesToTakes(d);});if(changed)onNotice?.(STALE_DROP);
    }else if(Math.abs(effectDelta)>1e-9){const d=effectDelta;change(draft=>moveEffects(draft,ids,d));}
   },DRAG_DEAD_ZONE_PX);
   return;
  }
  // Trims: every clip linked to the clip trims by the same amount (camera and audio stay together); ripple unless Alt is held.
  if(clip){
   const edge=mode==='left'?clip.start:clip.start+clipDuration(clip),ids=trimGroup(base.clips,id);
   const snaps=targets(ids);let delta=0,ripple=!e.altKey;
   run(e,(x,_y,ev)=>{
    ripple=!ev.altKey;const bounds=trimBounds(base,ids,mode,ripple),raw=timelinePointerDelta(x0,x,left0,el.scrollLeft,scale);
    // The edge snaps where the cut lands (in place; a ripple trim then closes or opens that time).
    const snap=snapTimelineDelta({delta:raw,anchors:[edge],targets:snaps,scale,minDelta:bounds.min,maxDelta:bounds.max,enabled:base.settings.snap,thresholdPx});
    delta=snap.delta;const trial=plainClone(base);trimClips(trial,ids,mode,delta,ripple);
    const previews=new Map<string,Preview>();for(const c of trial.clips){const was=base.clips.find(o=>o.id===c.id)!;if(c.start!==was.start||c.sourceIn!==was.sourceIn||c.sourceOut!==was.sourceOut)previews.set(c.id,{start:c.start,duration:clipDuration(c),sourceIn:c.sourceIn});}
    const length=clipDuration(trial.clips.find(c=>c.id===id)!);
    showDrag({items:previews,ghosts:[],guide:snap.guide?.time??null,insert:null,label:`${mode==='left'?'Start':'End'} ${delta>=0?'+':'−'}${fmtLen(Math.abs(delta))} · length ${fmtLen(length)}${ripple?'':' · gap kept'}`,markers:new Map((trial.markers??[]).map(m=>[m.id,m.time]))});
   },moved=>{if(!moved||!delta)return;const d=delta,r=ripple;let changed=false;change(draft=>{if(!sameClips(ids,base)){changed=true;return;}ensureLinks(draft);trimClips(draft,ids,mode,d,r);syncScenesToTakes(draft);});if(changed)onNotice?.(STALE_DROP);});
   return;
  }
  const edge=mode==='left'?item.start:item.start+item.duration,snaps=targets(new Set([id]));let delta=0;
  run(e,x=>{const raw=timelinePointerDelta(x0,x,left0,el.scrollLeft,scale),snap=snapTimelineDelta({delta:raw,anchors:[edge],targets:snaps,scale,enabled:base.settings.snap,thresholdPx});
   const trial=plainClone(base);resizeEffect(trial,id,mode,snap.delta);const after=rowItems(trial).find(i=>i.id===id)!;delta=mode==='left'?after.start-item.start:after.duration-item.duration;
   showDrag({items:new Map([[id,{start:after.start,duration:after.duration}]]),ghosts:[],guide:snap.guide?.time??null,insert:null,label:`Length ${fmtLen(after.duration)}`});
  },moved=>{if(!moved||!delta)return;const d=delta;change(draft=>resizeEffect(draft,id,mode,d));});
 }
 const beginRef=useRef(begin);useLayoutEffect(()=>{beginRef.current=begin;});
 const beginItem=useCallback((e:React.PointerEvent,id:string,mode:'move'|'left'|'right')=>beginRef.current(e,id,mode),[]);

 function beginEmpty(e:React.PointerEvent){
  if(e.button!==0)return;const el=ref.current!,content=el.firstElementChild as HTMLElement;
  if(tool==='blade'){onSeek(snapTime(contentX(e.clientX)/scale).time);return;}
  e.preventDefault();const r=content.getBoundingClientRect(),origin={x:e.clientX-r.left,y:e.clientY-r.top},base=e.shiftKey?[...selectedIds]:[];let box=rectangleBetween(origin,origin);
  const items:SelectionItem[]=rowItems(latest.current).flatMap(i=>{const row=rowById.get(viewByClip.get(i.id)?.row??i.row);return row?[{id:i.id,x:i.start*scale,y:row.top+2,width:Math.max(6,i.duration*scale),height:row.height-4}]:[];});
  run(e,(x,y)=>{const rr=content.getBoundingClientRect();box=rectangleBetween(origin,{x:Math.max(0,x-rr.left),y:Math.max(0,y-rr.top)});setMarquee(box);},moved=>{if(!moved){onSeek(origin.x/scale);if(!e.shiftKey)onSelectMany([]);return;}onSelectMany([...linkedIds(latest.current.clips,itemsInRectangle(box,items,base))]);});
 }
 /* Borumi's Layout row: over an empty part a "+ Layout" stretch follows the pointer; a click there makes it, a drag makes it as long as the drag.
    The new stretch takes the layout the clips have outside stretches and opens in the Layout panel, where its arrangement is chosen. */
 const [layoutGhost,setGhost]=useState<{start:number;stop:number}|null>(null),setLayoutGhost=(next:{start:number;stop:number}|null)=>setGhost(was=>was===next||was&&next&&was.start===next.start&&was.stop===next.stop?was:next);
 const layoutSpan=(origin:number,current:number)=>layoutRoom(latest.current,origin,current,Math.max(.5,(end-start)/10),projectDuration(latest.current));
 function beginLayout(e:React.PointerEvent){
  if(e.button!==0)return;if(tool==='blade'){onSeek(snapTime(contentX(e.clientX)/scale).time);return;}
  e.preventDefault();const origin=snapTime(contentX(e.clientX)/scale).time;let span=layoutSpan(origin,origin);setLayoutGhost(span);
  run(e,x=>{span=layoutSpan(origin,snapTime(contentX(x)/scale).time);setLayoutGhost(span);},()=>{setLayoutGhost(null);if(!span)return;const chosen=span,id=makeId(),preset=baseLayout(latest.current)??'Creator';let made=false;
   change(d=>{made=insertLayout(d,{...chosen,preset,id}).length>0;});if(made)onSelectMany([id]);});
 }
 function beginRuler(e:React.PointerEvent){
  if(e.button!==0)return;e.preventDefault();const seek=(x:number)=>onSeek(Math.max(0,contentX(x)/scale));seek(e.clientX);run(e,x=>seek(x),()=>{});
 }
 function beginMarker(e:React.PointerEvent,id:string){
  if(e.button!==0)return;e.stopPropagation();e.preventDefault();const box=(e.currentTarget as HTMLElement).getBoundingClientRect();const base=latest.current,m=base.markers?.find(x=>x.id===id);if(!m)return;let time=m.time;
  run(e,x=>{const raw=Math.max(0,m.time+timelinePointerDelta(e.clientX,x,0,0,scale)),s=snapTime(raw,new Set([id]));time=Math.round(s.time);showDrag({items:new Map(),ghosts:[],guide:s.guide,insert:null,label:`Note at ${secondsLabel(time)}`,markers:new Map([[id,time]])});},
   moved=>{if(!moved){onSeek(m.time);onOpenMarker?.(id,box);return;}const t=time;change(d=>moveMarker(d,id,t));});
 }
 const visible=(s:number,d:number)=>s+d>=start&&s<=end;
 const ticks=useMemo(()=>rulerTicks(start,end,scale),[start,end,scale]);
 const placeHeads=()=>{const el=ref.current;if(heads.current&&el)heads.current.style.transform=`translateY(${-el.scrollTop}px)`;};
 return <div className={`timeline club-timeline tool-${tool} ${drag?'timeline-dragging':''}`} onContextMenu={e=>{if(!onContextMenu)return;e.preventDefault();const hit=(e.target as HTMLElement).closest<HTMLElement>('[data-clip-id],[data-effect-id]'),id=hit?.dataset.clipId??hit?.dataset.effectId;
  if(id&&!selectedIds.has(id))onSelectMany(hit?.dataset.clipId?[...linkedIds(latest.current.clips,[id])]:[id]);onContextMenu(e.clientX,e.clientY);}}>
  <div className="club-tl-heads" aria-hidden><div ref={heads}><div className="club-tl-head is-ruler" style={{height:ruler}}/>{rows.map(r=><div key={r.id} className={`club-tl-head ${r.linked?'is-linked':''}`} data-kind={r.layer?.track??(r.layer?.kind==='video'?'camera':r.layer?'music':r.effect)} style={{height:r.height}} title={r.name}><r.icon size={13}/><span>{r.name}</span></div>)}</div></div>
  <div className="timeline-scroll" ref={ref} tabIndex={-1} onScroll={e=>{const el=e.currentTarget;placeHeads();view(el.scrollLeft,el.clientWidth);}}>
   <div className="timeline-content" style={{width,height:contentHeight}}>
    <div className={`club-ruler${p.markers?.length?' has-notes':''}`} style={{height:ruler}} onPointerDown={beginRuler} onPointerMove={e=>{if(e.buttons)return;const box=e.currentTarget.getBoundingClientRect();setHover(Math.max(0,(e.clientX-box.left)/scale));}} onPointerLeave={()=>setHover(null)} title="Click or drag to move the playhead">
     {hover!==null&&<span className={`club-hover${hover*scale>width-160?' flip':''}`} style={{left:hover*scale}} aria-hidden><b>{rulerLabel(hover,tenths)}</b>{hoverFrame(hover)}</span>}
     {ticks.map(t=><span key={t.time} className={t.major?'tick major':'tick'} style={{left:t.time*scale}}>{t.label&&<b>{t.label}</b>}</span>)}
     {sceneBand(p)&&p.scenes.map((s,i)=>s.duration>0&&visible(s.start,Math.max(1,s.duration))&&<div key={s.id} className={`club-scene-tag${i%2?' alt':''}`} style={{left:s.start*scale,width:Math.max(24,s.duration*scale-2)}} title={`Scene ${i+1}: ${s.name}`} onPointerDown={e=>{e.stopPropagation();onSeek(s.start);}}>Scene {i+1}</div>)}
     {/* A scene still waiting for its take: its label after the footage, over the hatched area. */}
     {sceneBand(p)&&(()=>{const i=p.scenes.findIndex(s=>s.duration<=0);return i>=0&&<div key="waiting" className="club-scene-tag is-waiting" style={{left:duration*scale+4}} title={`Scene ${i+1}: ${p.scenes[i].name} has no take yet`}>Scene {i+1}</div>;})()}
     {(p.markers??[]).map(m=>{const time=drag?.markers?.get(m.id)??m.time;return visible(time,0)&&<div key={m.id} data-marker-id={m.id} className={`club-marker${m.tag?` tag-${m.tag}`:''}${m.name?.trim()?' has-note':''}`} style={{left:Math.max(10,time*scale)}} title={`${m.name?.trim()?m.name.trim()+' · ':''}Note at ${secondsLabel(time)} · click to open, drag to move`} onPointerDown={e=>beginMarker(e,m.id)}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg></div>;})}
    </div>
    {rows.map(r=><div key={r.id} className={`timeline-row club-row row-${r.layer?.track??r.effect??'layer'}`} data-track={r.id} style={{top:r.top,height:r.height}} onPointerDown={e=>{if(e.target!==e.currentTarget)return;if(r.effect==='layouts')beginLayout(e);else beginEmpty(e);}}
     onPointerMove={r.effect==='layouts'?e=>{if(e.buttons||gesture.current)return;const t=contentX(e.clientX)/scale;setLayoutGhost(e.target===e.currentTarget?layoutSpan(t,t):null);}:undefined} onPointerLeave={r.effect==='layouts'?()=>{if(!gesture.current)setLayoutGhost(null);}:undefined}
     onDragOver={e=>{if(r.layer)e.preventDefault();}} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('application/sceneforge-media'),media=mediaById.get(id);if(media&&r.layer&&(media.kind==='audio'?'audio':'video')===r.layer.kind)onDropMedia(id,r.layer.track??(r.layer.kind==='audio'?'audio':'screen'),snapTime(Math.max(0,contentX(e.clientX)/scale)).time,r.take?undefined:r.id);}}>

     {r.layer&&takeViews.filter(v=>v.row===r.id).map(v=>{const c=v.clip,pv=drag?.items.get(c.id),s=pv?.start??c.start,d=pv?.duration??clipDuration(c);if(!pv&&!visible(c.start,clipDuration(c)))return null;const sound=v.sound??c,m=mediaById.get(sound.mediaId);
      return <ClubClip key={c.id} view={v} media={m} row={r} preview={pv} selected={v.members.some(c=>selectedIds.has(c.id))} linked={(groupSize.get(groups.get(c.id)!)??1)>1} relation={c.recordingTakeId&&related.some(o=>o.recordingTakeId===c.recordingTakeId)?related.some(o=>groups.get(o.id)===groups.get(c.id))?'linked':'take':undefined} offset={offsets.get(c.id)} label={labels.get(c.id)??''} peaks={showWaveforms&&m?waveforms[waveformMediaKey(m)]:undefined} words={showWords?wordsByClip.get(sound.id):undefined} scale={scale} from={Math.max(start,s)} to={Math.min(end,s+d)} onBegin={beginItem} onOpen={onOpen} onHover={setHoverClip} onSync={syncPiece}/>;})}
     {r.effect&&(effects.get(r.id)??[]).map(i=>{const pv=drag?.items.get(i.id),s=pv?.start??i.start,d=pv?.duration??i.duration;if(!pv&&!visible(i.start,i.duration))return null;
      const name=i.name;
      return <div key={i.id} data-effect-id={i.id} className={`timeline-effect club-effect ${r.effect==='layouts'?'is-layout':''} ${selectedIds.has(i.id)?'selected':''} ${pv?'clip-drag-preview':''}`} style={{left:s*scale,width:Math.max(6,d*scale)}} title={`${r.effect==='layouts'?`Layout: ${name}`:name} · drag to move, edges to resize, double-click to edit`} onPointerDown={e=>beginItem(e,i.id,'move')} onDoubleClick={()=>onOpen(i.id)}>
       {/* Too narrow for a readable word: a plain block, with the words on hover. A layout stretch is centred, with its icon, as in Borumi. */}
       {r.effect==='layouts'&&d*scale>=20&&<LayoutTemplate size={14} aria-hidden/>}{d*scale>=(r.effect==='layouts'?70:64)&&<span>{name}</span>}{d*scale>=14&&<><i className="trim-handle left" onPointerDown={e=>beginItem(e,i.id,'left')}/><i className="trim-handle right" onPointerDown={e=>beginItem(e,i.id,'right')}/></>}</div>;})}
     {r.effect==='layouts'&&layoutGhost&&<div className="club-layout-ghost" style={{left:layoutGhost.start*scale,width:Math.max(8,(layoutGhost.stop-layoutGhost.start)*scale)}} aria-hidden><Plus size={13}/>{(layoutGhost.stop-layoutGhost.start)*scale>=70&&<span>Layout</span>}</div>}
     {ghosts.filter(g=>g.row===r.id).map(g=><div key={`${g.kind}:${g.id}`} className={`club-fx-ghost ${g.kind}`} style={{left:g.start*scale,width:Math.max(8,g.duration*scale)}} aria-hidden><span>{g.name}</span></div>)}
     {drag?.ghosts.filter(g=>g.row===r.id).map((g,i)=><div key={i} className="club-ghost" style={{left:g.start*scale,width:Math.max(4,g.duration*scale)}}/>)}
    </div>)}
    {(p.markers??[]).filter(m=>m.tag||m.name?.trim()).map(m=>{const time=drag?.markers?.get(m.id)??m.time;return visible(time,0)&&<div key={`note-${m.id}`} className={`club-note-line${m.tag?` tag-${m.tag}`:''}`} style={{left:time*scale,top:ruler,height:contentHeight-ruler}} aria-hidden/>;})}
    {sceneBand(p)&&p.scenes.some(s=>s.duration<=0)&&<div className="club-empty-scene" aria-hidden style={{left:duration*scale,width:Math.max(0,width-duration*scale),top:ruler,height:contentHeight-ruler}}/>}
    {previewRanges?.map(([a,b],i)=><div key={i} className="club-preview-cut" style={{left:a*scale,width:Math.max(1,(b-a)*scale),top:ruler,height:contentHeight-ruler}}/>)}
    {cutMarks?.map((t,i)=><div key={`cut${i}`} className="club-cut-mark" style={{left:t*scale,top:ruler,height:contentHeight-ruler}} title="Words were cut here" aria-label="Cut here"/>)}
    {drag?.guide!==null&&drag?.guide!==undefined&&<div className="timeline-snap-guide club-snap" style={{left:drag.guide*scale}}/>}
    {drag?.insert!==null&&drag?.insert!==undefined&&<div className="club-insert-line" style={{left:drag.insert*scale}}/>}
    {drag?.label&&<div className="club-drag-label" role="status">{drag.label}</div>}
    {marquee&&<div className="timeline-marquee" style={{left:marquee.x,top:marquee.y,width:marquee.width,height:marquee.height}}/>}
    <Playhead_ playhead={playhead} scale={scale} follow={follow} onPage={page}/>
   </div>
  </div>
 </div>;
});
