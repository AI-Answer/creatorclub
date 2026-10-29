import {useEffect,useRef,useState,type ClipboardEvent,type DragEvent,type FormEvent,type PointerEvent,type KeyboardEvent} from 'react';
import type {ClubSettings,ResearchTile,Video,VideoScene} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {Button,Dialog,Icon,Spinner,cn,useToast} from '../ui';
import {tileFromText} from '../video-plan';
import {recordedCount} from '../scene-status';
import {toProgress} from '../scenes';
import {ZOOM,canvasSize,clampZoom,dragTo,keyMove,moveBy,nearestFree,tileBox} from './board-layout';
import {BoardTip} from './BoardTip';
import {ChatPanel} from './ChatPanel';
import {TileBody} from './TileBody';
import {useBoard} from './useBoard';
import {useDraft} from './useDraft';
import {useVideos} from '../useVideos';
import {BreakdownDrawer} from '../BreakdownDrawer';
import {useBreakdowns} from '../useBreakdowns';
import {youtubeId} from '../board';

const isImage=(file:File)=>/^image\//.test(file.type)||/\.(png|jpe?g|gif|webp|heic)$/i.test(file.name);
const NOT_SUPPORTED='Drop an image, or paste a link.';
const INTERACTIVE='button,a,textarea,input,select,[contenteditable="true"]';

/** Adds whatever text becomes: a video for YouTube and Instagram links, a link for other web addresses, otherwise a note. */
export async function addFromText(add:(body:{kind:ResearchTile['kind'];url?:string;text?:string})=>Promise<unknown>,text:string):Promise<boolean>{
 const found=tileFromText(text);
 if(!found)return false;
 if(found.kind==='text')await add({kind:'note',text:found.text});
 else await add({kind:found.kind,url:found.url});
 return true;
}

/**
 * The Board: a free canvas of tiles. Drag a tile (or focus it and use the arrow keys) and its place is saved; a new tile lands in free space.
 * "Ask Claude about this board" and "Draft scenes from board" sit over the canvas, and the first visit shows how the board works.
 */
export function Board({video,scenes,onDrafted}:{video:Video;scenes:readonly VideoScene[]|undefined;onDrafted():void}){
 const board=useBoard(video.id);
 const toast=useToast();
 const [zoom,setZoom]=useState(1),[sel,setSel]=useState<string|null>(null),[dragId,setDragId]=useState<string|null>(null);
 const [chat,setChat]=useState(false),[linkOpen,setLinkOpen]=useState(false),[link,setLink]=useState('');
 const [tip,setTip]=useState<null|'first'|'again'>(null),[fresh,setFresh]=useState<string|null>(null);
 const [breakdown,setBreakdown]=useState<string|null>(null);
 const scroller=useRef<HTMLDivElement>(null),fileInput=useRef<HTMLInputElement>(null);
 const dragging=useRef<{id:string;sx:number;sy:number;x:number;y:number}|null>(null);
 const tiles=board.tiles;
 const count=tiles?.length??0;
 const draft=useDraft({video,tiles:count,scenes,onDrafted});
 const videos=useVideos();
 const saved=useBreakdowns();
 const listed=videos.state.status==='ready'?videos.state.videos:[];

 // The first visit shows the tip once; closing it saves that in the channel's settings.
 useEffect(()=>{clubFetch<ClubSettings>('/settings').then(settings=>{if(!(settings.helpSeen??[]).includes('board'))setTip(current=>current??'first');},()=>{});},[]);
 const closeTip=()=>{if(tip==='first')clubFetch('/settings/help/board',{method:'POST'}).catch(()=>{});setTip(null);};

 const onDown=(event:PointerEvent<HTMLDivElement>,id:string)=>{
  if(event.button!==0||(event.target as HTMLElement).closest(INTERACTIVE))return;
  const box=tileBox(tiles!.find(tile=>tile.id===id)!);
  dragging.current={id,sx:event.clientX,sy:event.clientY,x:box.x,y:box.y};
  setSel(id);setDragId(id);
  event.currentTarget.setPointerCapture?.(event.pointerId);
 };
 const onMove=(event:PointerEvent<HTMLDivElement>)=>{
  const drag=dragging.current;if(!drag)return;
  board.preview(drag.id,dragTo({x:drag.x,y:drag.y},event.clientX-drag.sx,event.clientY-drag.sy,zoom));
 };
 const onUp=(event:PointerEvent<HTMLDivElement>)=>{
  const drag=dragging.current;dragging.current=null;setDragId(null);
  if(!drag)return;
  const at=dragTo({x:drag.x,y:drag.y},event.clientX-drag.sx,event.clientY-drag.sy,zoom);
  if(at.x!==drag.x||at.y!==drag.y)board.place(drag.id,at,'now');
 };
 const onKey=(event:KeyboardEvent<HTMLDivElement>,tileId:string)=>{
  if(event.target!==event.currentTarget)return;
  const move=keyMove(event.key,event.shiftKey);if(!move)return;
  event.preventDefault();
  const tile=tiles!.find(item=>item.id===tileId);if(!tile)return;
  board.place(tileId,moveBy(tileBox(tile),move),'soon');
 };
 const tilesNow=useRef(tiles);tilesNow.current=tiles;
 /** Adds a tile where the person is looking: the free place nearest the middle of the view (clear of the chat panel), scrolled to and marked for a moment. */
 const addHere=async(body:Parameters<typeof board.add>[0])=>{
  const tile=await board.add(body);
  const view=scroller.current;
  if(!tile||!view)return tile;
  const width=view.clientWidth-(chat?398:0);
  const centre={x:(view.scrollLeft+width/2)/zoom,y:(view.scrollTop+view.clientHeight/2)/zoom};
  const box=tileBox(tile);
  const others=(tilesNow.current??[]).filter(other=>other.id!==tile.id).map(tileBox);
  const spot=nearestFree(others,box.w,centre);
  if(spot.x!==box.x||spot.y!==box.y)board.place(tile.id,spot,'now');
  setSel(tile.id);setFresh(tile.id);setTimeout(()=>setFresh(current=>current===tile.id?null:current),1600);
  view.scrollTo?.({left:Math.max(0,(spot.x+box.w/2)*zoom-width/2),top:Math.max(0,(spot.y+190)*zoom-view.clientHeight/2),behavior:'smooth'});
  return tile;
 };
 const addNote=async(text='')=>{await addHere({kind:'note',text});};
 const submitLink=async(event:FormEvent)=>{
  event.preventDefault();
  const text=link.trim();if(!text)return;
  if(!(await addFromText(addHere,text))){toast("Couldn't add that.");return;}
  setLink('');setLinkOpen(false);toast(tileFromText(text)?.kind==='video'?'Added the video to the board':'Added the link to the board');
 };
 const addImage=(file:File)=>{const form=new FormData();form.append('kind','image');form.append('title',file.name);form.append('file',file);return addHere(form);};
 const takeFiles=(files:File[])=>{
  const images=files.filter(isImage);
  if(!images.length){toast(NOT_SUPPORTED);return;}
  for(const file of images)void addImage(file);
 };
 const paste=(event:ClipboardEvent<HTMLDivElement>)=>{
  if((event.target as HTMLElement).closest('input,textarea'))return;
  const files=[...event.clipboardData.files];
  if(files.length){event.preventDefault();takeFiles(files);return;}
  const text=event.clipboardData.getData('text/plain');
  if(text.trim()){event.preventDefault();void addFromText(addHere,text);}
 };
 const drop=(event:DragEvent<HTMLDivElement>)=>{
  event.preventDefault();
  const files=[...event.dataTransfer.files];
  if(files.length){takeFiles(files);return;}
  const text=event.dataTransfer.getData('text/uri-list').split('\n').find(line=>line&&!line.startsWith('#'))||event.dataTransfer.getData('text/plain');
  if(text.trim())void addFromText(addHere,text);
 };
 const scrollTop=()=>{setZoom(ZOOM.fit);scroller.current?.scrollTo({left:0,top:0,behavior:'smooth'});};
 const size=canvasSize(tiles??[]);
 const shiftChat=chat?{right:398}:undefined;
 const shown=breakdown?tiles?.find(tile=>youtubeId(tile.url)===breakdown):undefined;

 return <div className="board-wrap" onPaste={paste} onDragOver={event=>event.preventDefault()} onDrop={drop} onClick={event=>{if(event.target===event.currentTarget)setSel(null);}}>
  {board.loadError?<div style={{padding:24}}><ErrorLine message={board.loadError} onRetry={board.reload}/></div>:!tiles?<div className="flex flex-1 items-center justify-center"><Spinner label="Loading the board" size={20}/></div>:
  <div className="canvas-scroll" ref={scroller}>
   <div style={{width:size.width*zoom,height:size.height*zoom,position:'relative'}}>
    <div className="canvas" style={{width:size.width,height:size.height,transform:`scale(${zoom})`}}>
     {tiles.length===0&&<p className="muted" style={{position:'absolute',left:60,top:60,maxWidth:360,fontSize:14,lineHeight:1.55}}>Drop links, screenshots and notes here. Claude reads the whole board when it drafts your scenes.</p>}
     {tiles.map(tile=>{const box=tileBox(tile);return <div key={tile.id} data-tile={tile.id} tabIndex={0} role="group" aria-label={`${tile.kind} tile. Arrow keys move it.`}
      className={cn('tile',tile.kind,sel===tile.id&&'sel',dragId===tile.id&&'drag',fresh===tile.id&&'fresh')} style={{left:box.x,top:box.y,width:box.w}}
      onPointerDown={event=>onDown(event,tile.id)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={event=>onKey(event,tile.id)} onFocus={()=>setSel(tile.id)}>
      <TileBody tile={tile} videoId={video.id} reading={board.reading[tile.id]} onRemove={()=>board.remove(tile)} onSaveText={text=>void board.saveText(tile.id,text)}
       onRetryRead={()=>board.read(tile)} onBreakdown={setBreakdown}/>
     </div>;})}
    </div>
   </div>
  </div>}
  <div className="board-actions" style={shiftChat}>
   <button type="button" className={cn('btn',!chat&&'ai')} onClick={()=>setChat(open=>!open)} aria-pressed={chat}><Icon name="Sparkles" size={15}/>Ask Claude about this board</button>
   <button type="button" className="btn ghost icon-only" aria-label="How the board works" onClick={()=>setTip('again')}><Icon name="CircleHelp" size={15}/></button>
   <button type="button" className={cn('btn',scenes&&scenes.length?'':'primary')} disabled={draft.running} onClick={draft.request}>
    {draft.running?<><span className="spin"/>{draft.line}</>:<><Icon name="Wand2" size={15}/>Draft scenes from board</>}
   </button>
  </div>
  {draft.failed&&<div className="board-actions" style={{top:'auto',bottom:70,right:18}}><ErrorLine message={draft.failed} onRetry={draft.start}/></div>}
  <div className="btoolbar" style={chat?{left:'calc(50% - 190px)'}:undefined}>
   <button type="button" className="btn ghost sm" onClick={()=>void addNote()}><Icon name="StickyNote" size={15}/>Add note</button>
   <span style={{position:'relative'}}>
    <button type="button" className="btn ghost sm" onClick={()=>setLinkOpen(open=>!open)}><Icon name="Link" size={15}/>Paste link</button>
    {linkOpen&&<form className="menu" style={{bottom:'calc(100% + 10px)',left:-60,width:360,padding:8,display:'flex',gap:6}} onSubmit={event=>void submitLink(event)}>
     <input className="input" autoFocus value={link} onChange={event=>setLink(event.target.value)} placeholder="YouTube, Instagram, X or any link" style={{height:32}} onKeyDown={event=>{if(event.key==='Escape')setLinkOpen(false);}} aria-label="Link to add"/>
     <button className="btn sm primary" type="submit" style={{height:32}}>Add</button></form>}
   </span>
   <button type="button" className="btn ghost sm" onClick={()=>fileInput.current?.click()}><Icon name="Image" size={15}/>Add image</button>
   <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={event=>{takeFiles([...event.target.files??[]]);event.target.value='';}}/>
   <span className="sep"></span>
   <button type="button" className="btn ghost sm icon-only" aria-label="Zoom out" onClick={()=>setZoom(current=>clampZoom(current-ZOOM.step))}><Icon name="ZoomOut" size={15}/></button>
   <span className="zoom">{Math.round(zoom*100)}%</span>
   <button type="button" className="btn ghost sm icon-only" aria-label="Zoom in" onClick={()=>setZoom(current=>clampZoom(current+ZOOM.step))}><Icon name="ZoomIn" size={15}/></button>
   <button type="button" className="btn ghost sm" onClick={scrollTop}><Icon name="Maximize2" size={14}/>Fit</button>
  </div>
  {chat&&<ChatPanel video={video} tileCount={count} onClose={()=>setChat(false)} onAddNote={text=>addHere({kind:'note',text}).then(tile=>{if(tile)toast('Added to the board');return !!tile;})}/>}
  {draft.confirm&&<Dialog title="Replace the scenes?" onClose={()=>draft.setConfirm(false)} footer={<><Button variant="ghost" onClick={()=>draft.setConfirm(false)}>Keep my scenes</Button><Button variant="primary" onClick={draft.start}>Replace {scenes?.length??0} scenes</Button></>}>
   <p className="muted" style={{margin:0,lineHeight:1.55}}>This video already has {scenes?.length??0} scenes{scenes&&recordedCount(toProgress(scenes))?`, and ${recordedCount(toProgress(scenes))} are recorded`:''}. Drafting again replaces them. You can undo it from the message that follows.</p>
  </Dialog>}
  {tip&&<BoardTip onClose={closeTip}/>}
  {breakdown&&<BreakdownDrawer videoId={breakdown} title={shown?.title??''} channel={shown?.meta.channel??''} multiplier={shown?.meta.multiplier??null} saved={saved} videos={listed} onAdded={()=>{}} onClose={()=>setBreakdown(null)}/>}
 </div>;
}
