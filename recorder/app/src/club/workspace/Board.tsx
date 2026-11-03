import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ClipboardEvent,type DragEvent,type FormEvent,type PointerEvent as ReactPointerEvent,type KeyboardEvent} from 'react';
import {CHANNEL_BOARD,type BoardFrame,type ClubSettings,type ResearchTile,type StartedVideo,type Video,type VideoScene} from '../../../shared/club';
import {clubFetch,errorMessage,notifyVideosChanged} from '../api';
import {ErrorLine} from '../ErrorLine';
import {Icon,IconButton,Menu,Spinner,cn,useToast,type MenuItem} from '../ui';
import {tileFromText} from '../video-plan';
import {ZOOM,boxAt,boxOf,canvasSize,dragTo,edgePoint,frameAround,inFrame,inRect,keyMove,linkLine,moveBy,nearestFree,rectBetween,tileBox,type Box} from './board-layout';
import {BoardTip} from './BoardTip';
import {DEFAULT_VIEW,dotGrid,fitView,loadView,panBy,resizeNote,saveView,wheelIntent,wheelZoom,zoomAt,type View} from './board-view';
import {fitHeight} from './StickyNote';
import {ReplaceScenes} from './ReplaceScenes';
import {TileBody} from './TileBody';
import {useBoard} from './useBoard';
import {useCanvas} from './useCanvas';
import {useDraft} from './useDraft';
import {NotePanel} from './NotePanel';
import {NotesFolder} from './NotesFolder';
import {importMessage,isDocFile} from './board-files';
import {chooseNotesFolder,importNotes,pinNote,useBoardFiles} from './useBoardFiles';
import {boardBase} from './board-base';
import {useVideos} from '../useVideos';
import {BreakdownDrawer} from '../BreakdownDrawer';
import {useBreakdowns} from '../useBreakdowns';
import {youtubeId} from '../board';
import {IdeaDrawer} from '../IdeaDrawer';
import {useIdeaActions} from '../useIdeaActions';
import {openRoute} from '../production';
import type {Route} from '../routes';

const isImage=(file:File)=>/^image\//.test(file.type)||/\.(png|jpe?g|gif|webp|heic)$/i.test(file.name);
const NOT_SUPPORTED='Drop an image, a Markdown file, or paste a link.';
const INTERACTIVE='button,a,textarea,input,select,[role="button"],[contenteditable="true"]';
const TYPING='input,textarea,select,[contenteditable="true"]';
const KIND_NAME:Record<ResearchTile['kind'],string>={note:'Note',video:'Video',breakdown:'Breakdown',signal:'Post',link:'Link',image:'Image',text:'Text',idea:'The idea',mine:'Your video'};
const NO_NAVIGATE=()=>{};

/** Adds whatever text becomes: a video for YouTube and Instagram links, a link for other web addresses, otherwise a note. */
export async function addFromText(add:(body:{kind:ResearchTile['kind'];url?:string;text?:string})=>Promise<unknown>,text:string):Promise<boolean>{
 const found=tileFromText(text);
 if(!found)return false;
 if(found.kind==='text')await add({kind:'note',text:found.text});
 else await add({kind:found.kind,url:found.url});
 return true;
}

/** Whether a pointer landed on empty canvas (the window itself, the canvas, or the inside of a frame) and not on a card or a line. */
const isEmpty=(target:HTMLElement,scroller:HTMLElement)=>target===scroller||target.classList.contains('canvas')||target.classList.contains('bframe');

/** A gesture on the canvas in progress: moving cards, moving or resizing a frame, a selection rectangle, or a connection being drawn. */
type Gesture=
 |{kind:'tiles';sx:number;sy:number;starts:Map<string,{x:number;y:number}>;pressed:string;els:Map<string,HTMLElement>;moved:boolean;/** A note's text pressed while not being written in: a press without a drag starts writing. */write?:HTMLTextAreaElement}
 |{kind:'pan';sx:number;sy:number;view:View;moved:boolean;clears:boolean}
 |{kind:'note';id:string;sx:number;sy:number;start:{w:number;h:number};el:HTMLElement;size:{w:number;h:number}}
 |{kind:'frame';id:string;sx:number;sy:number;start:{x:number;y:number};members:Map<string,{x:number;y:number}>}
 |{kind:'resize';id:string;sx:number;sy:number;start:{w:number;h:number}}
 |{kind:'marquee';start:{x:number;y:number};add:string[]}
 |{kind:'connect';from:string};

export interface BoardProps{
 /** A video's Board. Without it, the Board is the one named by `board`. */
 video?:Video;
 /** The Board shown: a video's id (the default, `video.id`) or `CHANNEL_BOARD` for Research. */
 board?:string;
 scenes?:readonly VideoScene[];
 onDrafted?():void;
 /** The companion added or took off a tile, or grouped cards: the board reads itself again. */
 refreshKey?:number;
 /** Opens a screen: an idea's video page from a "your video" card, the idea started from a selection. */
 navigate?(route:Route):void;
 /** The cards selected now, for the companion. */
 onSelection?(ids:readonly string[]):void;
}

/**
 * A Board: a free canvas of cards, used by every video (its research) and by the channel (Research). Drag a card (or focus it and use the arrow keys)
 * and its place is saved; a new card lands in free space. Cards can be selected together (Shift-click, or drag a rectangle on the empty canvas),
 * connected with labelled lines (drag from a card's edge handle, or press C on a card and Enter on another), and grouped in a named frame that moves
 * them together. Delete removes what is selected, with Undo; Esc clears the selection. A video's Board has "Draft scenes from board" and shows how
 * the board works on the first visit; Research can start a new video from a selection.
 */
export function Board({video,board:boardProp,scenes,onDrafted=()=>{},refreshKey=0,navigate=NO_NAVIGATE,onSelection}:BoardProps){
 const boardId=boardProp??video?.id??CHANNEL_BOARD;
 const research=boardId===CHANNEL_BOARD;
 const board=useBoard(boardId);
 // The companion added or took off a tile: read the board again.
 const reloadBoard=board.reload;
 useEffect(()=>{if(refreshKey)reloadBoard();},[refreshKey,reloadBoard]);
 const toast=useToast();
 const [view,setView]=useState<View>(()=>loadView(boardProp??video?.id??CHANNEL_BOARD)??DEFAULT_VIEW);
 const zoom=view.z;
 const [sel,setSel]=useState<string[]>([]),[dragId,setDragId]=useState<string|null>(null);
 const [selLink,setSelLink]=useState<string|null>(null),[selFrame,setSelFrame]=useState<string|null>(null);
 const [editLink,setEditLink]=useState<string|null>(null),[editFrame,setEditFrame]=useState<string|null>(null);
 const [marquee,setMarquee]=useState<Box|null>(null),[drawing,setDrawing]=useState<{from:string;to:{x:number;y:number}}|null>(null),[connectFrom,setConnectFrom]=useState<string|null>(null);
 const [heights,setHeights]=useState<Record<string,number>>({});
 const [linkOpen,setLinkOpen]=useState(false),[link,setLink]=useState('');
 const [tip,setTip]=useState<null|'first'|'again'>(null),[fresh,setFresh]=useState<string|null>(null);
 const [breakdown,setBreakdown]=useState<string|null>(null),[openNote,setOpenNote]=useState<string|null>(null),[madeNote,setMadeNote]=useState<string|null>(null),[folderOpen,setFolderOpen]=useState(false),[filesTick,setFilesTick]=useState(0);
 const [drawer,setDrawer]=useState<string|null>(null),[starting,setStarting]=useState(false);
 const [focusNote,setFocusNote]=useState<string|null>(null),[spaceHeld,setSpaceHeld]=useState(false);
 const space=useRef(false);
 const wrap=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null),fileInput=useRef<HTMLInputElement>(null),canvasEl=useRef<HTMLDivElement>(null);
 const gesture=useRef<Gesture|null>(null);
 const viewNow=useRef(view);viewNow.current=view;

 // The view is remembered for this Board, a moment after it stops changing.
 useEffect(()=>{const saveLater=setTimeout(()=>saveView(boardId,view),300);return()=>clearTimeout(saveLater);},[boardId,view]);
 const loaded=!!board.tiles;
 // Wheel: scrolling and pinching zoom towards the pointer; Shift + scroll or a sideways swipe pans.
 useEffect(()=>{
  const el=scroller.current;if(!el)return;
  const onWheel=(event:WheelEvent)=>{
   if(!event.ctrlKey&&(event.target as HTMLElement).closest?.('[data-wheel="own"]'))return;
   event.preventDefault();
   const rect=el.getBoundingClientRect();
   if(wheelIntent(event)==='zoom')
    setView(current=>zoomAt(current,wheelZoom(current.z,event.deltaY,event.deltaMode,event.ctrlKey),event.clientX-rect.left,event.clientY-rect.top));
   else setView(current=>event.shiftKey&&!event.deltaX?panBy(current,-event.deltaY,0):panBy(current,-event.deltaX,-event.deltaY));
  };
  el.addEventListener('wheel',onWheel,{passive:false});
  return()=>el.removeEventListener('wheel',onWheel);
 },[loaded]);
 // Space held: the next drag pans, wherever it starts.
 useEffect(()=>{
  const typing=(event:globalThis.KeyboardEvent)=>!!(event.target as HTMLElement|null)?.closest?.(`${TYPING},button,a,[role="button"]`);
  const down=(event:globalThis.KeyboardEvent)=>{if(event.code!=='Space'||typing(event)||!wrap.current?.contains(document.activeElement)&&document.activeElement!==document.body)return;event.preventDefault();space.current=true;setSpaceHeld(true);};
  const up=(event:globalThis.KeyboardEvent)=>{if(event.code!=='Space')return;space.current=false;setSpaceHeld(false);};
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',()=>{space.current=false;setSpaceHeld(false);});
  return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);};
 },[]);
 const tiles=board.tiles;
 const count=tiles?.length??0;
 const canvas=useCanvas(boardId,refreshKey+board.changes);
 const {links,frames}=canvas.canvas;
 const files=useBoardFiles(boardId,filesTick+board.changes);
 const draft=useDraft({video:video??({id:boardId} as Video),tiles:count,scenes,onDrafted});
 const videos=useVideos();
 const saved=useBreakdowns();
 const ideaActions=useIdeaActions(navigate);
 const listed=videos.state.status==='ready'?videos.state.videos:[];
 const ready=videos.state.status==='ready';

 // The first visit to a video's Board shows the tip once; closing it saves that in the channel's settings.
 useEffect(()=>{if(research)return;clubFetch<ClubSettings>('/settings').then(settings=>{if(!(settings.helpSeen??[]).includes('board'))setTip(current=>current??'first');},()=>{});},[research]);
 const closeTip=()=>{if(tip==='first')clubFetch('/settings/help/board',{method:'POST'}).catch(()=>{});setTip(null);};

 // The drawn height of every card, so lines, frames and the selection rectangle fit the cards as they are drawn.
 useLayoutEffect(()=>{
  const root=canvasEl.current;if(!root)return;
  let changed=false;const next:Record<string,number>={};
  for(const element of root.querySelectorAll<HTMLElement>('[data-tile]')){
   const id=element.dataset.tile!,height=element.offsetHeight;
   if(height>0){next[id]=height;if(heights[id]!==height)changed=true;}
  }
  if(changed||Object.keys(next).length!==Object.keys(heights).length)setHeights(next);
 });
 const boxes=useMemo(()=>new Map((tiles??[]).map(tile=>[tile.id,boxOf(tile,heights)])),[tiles,heights]);
 const shownLinks=useMemo(()=>links.filter(each=>boxes.has(each.from)&&boxes.has(each.to)),[links,boxes]);

 // Selected cards that are gone (removed, or taken off by the companion) leave the selection.
 useEffect(()=>{if(tiles)setSel(current=>{const kept=current.filter(id=>boxes.has(id));return kept.length===current.length?current:kept;});},[tiles,boxes]);
 const selectionNow=useRef(onSelection);selectionNow.current=onSelection;
 useEffect(()=>{selectionNow.current?.(sel);},[sel]);
 const clear=()=>{setSel([]);setSelLink(null);setSelFrame(null);setConnectFrom(null);setEditLink(null);};

 /** A point on the canvas, in canvas pixels, from a point on screen. */
 const toCanvas=(clientX:number,clientY:number)=>{const rect=canvasEl.current?.getBoundingClientRect();return {x:(clientX-(rect?.left??0))/zoom,y:(clientY-(rect?.top??0))/zoom};};

 /** Follows the pointer until it is let go: one gesture at a time, wherever the pointer goes. */
 const follow=(start:Gesture)=>{
  gesture.current=start;
  const move=(event:PointerEvent)=>{
   const now=gesture.current;if(!now)return;
   if(now.kind==='tiles'){
    if(!now.moved&&Math.abs(event.clientX-now.sx)+Math.abs(event.clientY-now.sy)<=3)return;
    now.moved=true;
    // A card follows the pointer by a transform on the card itself: no render per pixel; the new place is set when it is let go.
    for(const [id,from] of now.starts){const at=dragTo(from,event.clientX-now.sx,event.clientY-now.sy,zoom);const el=now.els.get(id);if(el)el.style.transform=`translate3d(${at.x-from.x}px,${at.y-from.y}px,0)`;}
   }else if(now.kind==='pan'){
    const dx=event.clientX-now.sx,dy=event.clientY-now.sy;
    if(Math.abs(dx)+Math.abs(dy)>3)now.moved=true;
    setView(panBy(now.view,dx,dy));
   }else if(now.kind==='note'){
    now.size=resizeNote(now.start,event.clientX-now.sx,event.clientY-now.sy,zoom);
    now.el.style.width=`${now.size.w}px`;now.el.style.minHeight=`${now.size.h}px`;
    fitHeight(now.el.querySelector('textarea'));
   }else if(now.kind==='frame'){
    const at=dragTo(now.start,event.clientX-now.sx,event.clientY-now.sy,zoom),dx=at.x-now.start.x,dy=at.y-now.start.y;
    canvas.changeFrame(now.id,at,false);
    for(const [id,from] of now.members)board.preview(id,moveBy(from,{dx,dy}));
   }else if(now.kind==='resize')canvas.changeFrame(now.id,{w:Math.max(120,Math.round(now.start.w+(event.clientX-now.sx)/zoom)),h:Math.max(100,Math.round(now.start.h+(event.clientY-now.sy)/zoom))},false);
   else if(now.kind==='marquee')setMarquee(rectBetween(now.start,toCanvas(event.clientX,event.clientY)));
   else setDrawing({from:now.from,to:toCanvas(event.clientX,event.clientY)});
  };
  const up=(event:PointerEvent)=>{
   window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);
   const now=gesture.current;gesture.current=null;setDragId(null);
   if(!now)return;
   const dx=event.clientX-(('sx' in now)?now.sx:event.clientX),dy=event.clientY-(('sy' in now)?now.sy:event.clientY);
   if(now.kind==='pan'){
    if(!now.moved&&now.clears)clear();
   }else if(now.kind==='note'){
    if(now.size.w!==now.start.w||now.size.h!==now.start.h)board.resize(now.id,now.size);
   }else if(now.kind==='tiles'){
    let moved=false;
    for(const el of now.els.values())el.style.transform='';
    if(now.moved)for(const [id,from] of now.starts){const at=dragTo(from,dx,dy,zoom);if(at.x!==from.x||at.y!==from.y){moved=true;board.place(id,at,'now');}}
    if(!moved&&now.write){const area=now.write;area.focus({preventScroll:true});area.setSelectionRange(area.value.length,area.value.length);return;}
    // A press on one card of a selection that did not move it picks that card alone.
    if(!moved&&now.starts.size>1)setSel([now.pressed]);
   }else if(now.kind==='frame'){
    const at=dragTo(now.start,dx,dy,zoom);
    if(at.x!==now.start.x||at.y!==now.start.y){
     canvas.changeFrame(now.id,at);
     for(const [id,from] of now.members)board.place(id,moveBy(from,{dx:at.x-now.start.x,dy:at.y-now.start.y}),'now');
    }
   }else if(now.kind==='resize'){
    const frame=framesNow.current.find(each=>each.id===now.id);
    if(frame&&(frame.w!==now.start.w||frame.h!==now.start.h))canvas.changeFrame(now.id,{w:frame.w,h:frame.h});
   }else if(now.kind==='marquee'){
    const rect=rectBetween(now.start,toCanvas(event.clientX,event.clientY));
    setMarquee(null);
    if(rect.w<4&&rect.h<4){if(!now.add.length)clear();return;}
    setSel([...new Set([...now.add,...inRect(rect,tilesNow.current??[],heightsNow.current)])]);setSelLink(null);setSelFrame(null);
   }else{
    setDrawing(null);
    const to=boxAt(toCanvas(event.clientX,event.clientY),[...boxesNow.current].map(([id,box])=>({...box,id})));
    if(to&&to!==now.from)void canvas.connect(now.from,to).then(made=>{if(made){setSelLink(made.id);setSel([]);setEditLink(made.id);}});
   }
  };
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
 };
 const tilesNow=useRef(tiles);tilesNow.current=tiles;
 const heightsNow=useRef(heights);heightsNow.current=heights;
 const boxesNow=useRef(boxes);boxesNow.current=boxes;
 const framesNow=useRef(frames);framesNow.current=frames;
 const selNow=useRef(sel);selNow.current=sel;
 const pointing=useRef(false);

 const onTileDown=(event:ReactPointerEvent<HTMLDivElement>,id:string)=>{
  // A note's text not being written in drags the note like the rest of the card; a press that does not move starts writing.
  const area=(event.target as HTMLElement).closest<HTMLTextAreaElement>('textarea.sticky-text');
  const write=area&&area!==document.activeElement&&!event.shiftKey&&!event.metaKey&&!event.ctrlKey?area:undefined;
  if(event.button!==0||space.current||!write&&(event.target as HTMLElement).closest(INTERACTIVE))return;
  if(write)event.preventDefault();
  // The pointer picks the selection here; the focus that follows the press must not pick it again.
  pointing.current=true;setTimeout(()=>{pointing.current=false;},0);
  setSelLink(null);setSelFrame(null);
  // Connecting (after the card's connect button, or C): the card pressed next is the other end.
  if(connectFrom&&connectFrom!==id){const from=connectFrom;setConnectFrom(null);void canvas.connect(from,id).then(made=>{if(made){setSelLink(made.id);setSel([]);setEditLink(made.id);}});return;}
  if(event.shiftKey||event.metaKey||event.ctrlKey){setSel(current=>current.includes(id)?current.filter(each=>each!==id):[...current,id]);return;}
  const moving=selNow.current.includes(id)?selNow.current:[id];
  if(!selNow.current.includes(id))setSel([id]);
  setDragId(id);
  try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* a pointer that is already gone */}
  const els=new Map(moving.flatMap(each=>{const el=canvasEl.current?.querySelector<HTMLElement>(`[data-tile="${each}"]`);return el?[[each,el] as const]:[];}));
  follow({kind:'tiles',sx:event.clientX,sy:event.clientY,pressed:id,els,moved:false,write,starts:new Map(moving.flatMap(each=>{const tile=tiles?.find(item=>item.id===each);return tile?[[each,{x:tileBox(tile).x,y:tileBox(tile).y}] as const]:[];}))});
 };
 const onCanvasDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
  const target=event.target as HTMLElement;
  const empty=isEmpty(target,event.currentTarget);
  // Space + drag, the middle button, or a drag on the empty canvas (or the inside of a frame) pans; Shift + drag draws a selection rectangle.
  if(event.button===1||(event.button===0&&space.current)){event.preventDefault();follow({kind:'pan',sx:event.clientX,sy:event.clientY,view:viewNow.current,moved:false,clears:false});return;}
  if(event.button!==0||!empty)return;
  setEditLink(null);
  // Keys (Delete, Esc, arrows) go to the Board from here on.
  wrap.current?.focus({preventScroll:true});
  if(event.shiftKey)follow({kind:'marquee',start:toCanvas(event.clientX,event.clientY),add:selNow.current});
  else follow({kind:'pan',sx:event.clientX,sy:event.clientY,view:viewNow.current,moved:false,clears:true});
 };
 const onFrameDown=(event:ReactPointerEvent<HTMLElement>,frame:BoardFrame)=>{
  if(event.button!==0||(event.target as HTMLElement).closest('button,input'))return;
  event.stopPropagation();
  setSelFrame(frame.id);setSelLink(null);setSel([]);
  const members=new Map(inFrame(frame,tiles??[]).map(id=>[id,{x:boxes.get(id)!.x,y:boxes.get(id)!.y}] as const));
  follow({kind:'frame',id:frame.id,sx:event.clientX,sy:event.clientY,start:{x:frame.x,y:frame.y},members});
 };
 const onResizeDown=(event:ReactPointerEvent<HTMLElement>,frame:BoardFrame)=>{
  if(event.button!==0)return;
  event.stopPropagation();event.preventDefault();
  setSelFrame(frame.id);
  follow({kind:'resize',id:frame.id,sx:event.clientX,sy:event.clientY,start:{w:frame.w,h:frame.h}});
 };
 const onNoteResizeDown=(event:ReactPointerEvent<HTMLElement>,id:string)=>{
  if(event.button!==0)return;
  event.stopPropagation();event.preventDefault();
  const el=(event.currentTarget.closest('[data-tile]') as HTMLElement|null);if(!el)return;
  const start={w:el.offsetWidth,h:el.offsetHeight};
  setSel([id]);
  follow({kind:'note',id,sx:event.clientX,sy:event.clientY,start,el,size:start});
 };
 const onHandleDown=(event:ReactPointerEvent<HTMLElement>,id:string)=>{
  if(event.button!==0)return;
  event.stopPropagation();event.preventDefault();
  follow({kind:'connect',from:id});
 };

 /** Moves the selected cards (or the focused frame and its cards) by a key press; saved a moment after the last one. */
 const moveSelection=(move:{dx:number;dy:number},ids:readonly string[])=>{
  for(const id of ids){const tile=tiles?.find(item=>item.id===id);if(tile)board.place(id,moveBy(tileBox(tile),move),'soon');}
 };
 const onTileKey=(event:KeyboardEvent<HTMLDivElement>,tileId:string)=>{
  if(event.target!==event.currentTarget)return;
  if(event.key==='Enter'&&connectFrom&&connectFrom!==tileId){
   event.preventDefault();const from=connectFrom;setConnectFrom(null);
   void canvas.connect(from,tileId).then(made=>{if(made)setSelLink(made.id);});
   return;
  }
  if((event.key==='c'||event.key==='C')&&!event.metaKey&&!event.ctrlKey){event.preventDefault();setConnectFrom(tileId);toast('Pick the card to connect to: focus it and press Enter. Esc cancels.');return;}
  const move=keyMove(event.key,event.shiftKey);if(!move)return;
  event.preventDefault();
  moveSelection(move,sel.includes(tileId)?sel:[tileId]);
 };
 const onFrameKey=(event:KeyboardEvent<HTMLElement>,frame:BoardFrame)=>{
  if(event.target!==event.currentTarget)return;
  if(event.key==='Enter'){event.preventDefault();setEditFrame(frame.id);return;}
  const move=keyMove(event.key,event.shiftKey);if(!move)return;
  event.preventDefault();
  const at=moveBy(frame,move);
  canvas.changeFrame(frame.id,at);
  moveSelection(move,inFrame(frame,tiles??[]));
 };

 /** Delete: whatever is selected goes, with Undo. Esc: the selection is cleared (and a connection being made is let go). */
 const onBoardKey=(event:KeyboardEvent<HTMLDivElement>)=>{
  const target=event.target as HTMLElement;
  // Only keys pressed on the canvas or its selection bar: never while typing, nor in a panel opened over the Board.
  if(event.defaultPrevented||target.closest(TYPING)||!(target===event.currentTarget||target.closest('.canvas-scroll,.board-selbar')))return;
  if(event.key==='Escape'){
   if(!sel.length&&!selLink&&!selFrame&&!connectFrom)return;
   event.preventDefault();clear();return;
  }
  if(event.key!=='Delete'&&event.key!=='Backspace')return;
  if(selLink){event.preventDefault();canvas.unlink(selLink);setSelLink(null);return;}
  if(selFrame){event.preventDefault();canvas.removeFrame(selFrame);setSelFrame(null);return;}
  if(sel.length){event.preventDefault();board.removeMany(sel);setSel([]);}
 };

 /** Adds a tile where the person is looking: the free place nearest the middle of the view, scrolled to and marked for a moment. */
 const addHere=async(body:Parameters<typeof board.add>[0],at?:{x:number;y:number})=>{
  const tile=await board.add(body);
  const holder=scroller.current;
  if(!tile||!holder)return tile;
  const {x:vx,y:vy,z}=viewNow.current,width=holder.clientWidth,height=holder.clientHeight;
  const centre={x:(width/2-vx)/z,y:(height/2-vy)/z};
  const box=tileBox(tile);
  const others=(tilesNow.current??[]).filter(other=>other.id!==tile.id).map(tileBox);
  const spot=at?{x:Math.max(0,Math.round(at.x)),y:Math.max(0,Math.round(at.y))}:nearestFree(others,box.w,centre);
  if(spot.x!==box.x||spot.y!==box.y)board.place(tile.id,spot,'now');
  setSel([tile.id]);setFresh(tile.id);setTimeout(()=>setFresh(current=>current===tile.id?null:current),1600);
  // A card placed out of sight is brought into view.
  const left=vx+spot.x*z,top=vy+spot.y*z;
  if(left<0||top<0||left+box.w*z>width||top+200*z>height)setView(current=>({...current,x:Math.round(width/2-(spot.x+box.w/2)*z),y:Math.round(height/2-(spot.y+120)*z)}));
  return tile;
 };
 /** A new note to type in right away, where the person is looking (or at `at`). Left empty, it goes again. */
 const addNote=async(text='',at?:{x:number;y:number})=>{const tile=await addHere({kind:'note',text},at);if(tile&&!text){setMadeNote(tile.id);setFocusNote(tile.id);}};
 const noteLeftEmpty=(id:string)=>{
  if(madeNote!==id)return;
  setMadeNote(null);
  void clubFetch(`${boardBase(boardId)}/research/${encodeURIComponent(id)}`,{method:'DELETE'}).then(()=>board.refresh(),()=>{});
 };
 const submitLink=async(event:FormEvent)=>{
  event.preventDefault();
  const text=link.trim();if(!text)return;
  if(!(await addFromText(addHere,text))){toast("Couldn't add that.");return;}
  // The new card shows up and flashes where it landed: no toast to cover the board.
  setLink('');setLinkOpen(false);
 };
 const addImage=(file:File)=>{const form=new FormData();form.append('kind','image');form.append('title',file.name);form.append('file',file);return addHere(form);};
 const takeNotes=async(docs:File[],others:File[])=>{
  try{
   const result=await importNotes(boardId,docs);
   board.adopt(result.tiles);
   const left=others.map(file=>({name:file.name,reason:'Only Markdown and text files can be dropped here.'}));
   toast(importMessage(result.tiles.length,[...result.skipped,...left]));
  }catch(reason){toast(errorMessage(reason,"Couldn't add those files."));}
 };
 const takeFiles=(picked:File[])=>{
  const images=picked.filter(isImage),docs=picked.filter(file=>!isImage(file)&&isDocFile(file)),others=picked.filter(file=>!isImage(file)&&!isDocFile(file));
  if(!images.length&&!docs.length){toast(NOT_SUPPORTED);return;}
  for(const file of images)void addImage(file);
  if(docs.length)void takeNotes(docs,others);
  else if(others.length)toast(importMessage(0,others.map(file=>({name:file.name,reason:'Only images and Markdown or text files can be dropped here.'}))));
 };
 const paste=(event:ClipboardEvent<HTMLDivElement>)=>{
  if((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]'))return;
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
 const showHidden=async()=>{
  try{await clubFetch(`${boardBase(boardId)}/board/hidden/show`,{method:'POST'});board.refresh();setFilesTick(tick=>tick+1);}
  catch(reason){toast(errorMessage(reason,"Couldn't show those files."));}
 };
 const copyPath=(text:string,message:string)=>{navigator.clipboard?.writeText(text).then(()=>toast(message),()=>toast("Couldn't copy that."));};

 /** Groups the selected cards in a frame drawn around them, and opens its name to type. */
 const group=async()=>{
  const chosen=sel.flatMap(id=>boxes.get(id)??[]);if(!chosen.length)return;
  const made=await canvas.addFrame({title:'Group',...frameAround(chosen)});
  if(made){setSelFrame(made.id);setSel([]);setEditFrame(made.id);}
 };
 /** Research: a new idea whose Board holds copies of the selected cards (a selected frame's cards, named after the frame). */
 const startVideo=async(ids:readonly string[],frameId?:string)=>{
  if(!ids.length||starting)return;
  setStarting(true);
  try{
   const started=await clubFetch<StartedVideo>('/channel/research/start-video',{body:{tileIds:ids,...(frameId?{frameId}:{})}});
   notifyVideosChanged();
   toast(`Started “${started.video.title}” with ${started.tiles} ${started.tiles===1?'card':'cards'}`,{action:{label:'Open',fn:()=>navigate({name:'video',id:started.video.id,tab:'board'})}});
  }catch(reason){toast(errorMessage(reason,"Couldn't start a video from those cards."));}
  finally{setStarting(false);}
 };
 const openVideo=(target:Video)=>{if(target.stage==='ideas')setDrawer(target.id);else navigate(openRoute(target));};

 const noteOpen=openNote?tiles?.find(tile=>tile.id===openNote&&tile.doc):undefined;
 /** Shows every card and frame; an empty Board goes back to its start. */
 const fit=()=>{
  const holder=scroller.current;if(!holder)return;
  const parts=[...boxes.values(),...frames.map(frame=>({x:frame.x,y:frame.y,w:frame.w,h:frame.h}))];
  if(!parts.length){setView(DEFAULT_VIEW);return;}
  const left=Math.min(...parts.map(box=>box.x)),top=Math.min(...parts.map(box=>box.y));
  setView(fitView({x:left,y:top,w:Math.max(...parts.map(box=>box.x+box.w))-left,h:Math.max(...parts.map(box=>box.y+box.h))-top},holder.clientWidth,holder.clientHeight));
 };
 /** Zooms by a step around the middle of the window (the buttons). */
 const zoomBy=(step:number)=>{const holder=scroller.current;setView(current=>zoomAt(current,Math.round((current.z+step)*100)/100,(holder?.clientWidth??0)/2,(holder?.clientHeight??0)/2));};
 const grid=dotGrid(view);
 const size=canvasSize(tiles??[],heights);
 const frameSize=frames.reduce((most,frame)=>({width:Math.max(most.width,frame.x+frame.w+240),height:Math.max(most.height,frame.y+frame.h+240)}),size);
 const shown=breakdown?tiles?.find(tile=>youtubeId(tile.url)===breakdown):undefined;
 const frameNow=selFrame?frames.find(frame=>frame.id===selFrame):undefined;
 const frameMembers=frameNow?inFrame(frameNow,tiles??[]):[];
 const drawerVideo=drawer?listed.find(each=>each.id===drawer&&each.stage==='ideas'):undefined;

 const addItems:MenuItem[]=[
  {label:'Note',icon:'note',fn:()=>void addNote()},
  {label:'Link',icon:'link',fn:()=>setLinkOpen(true)},
  {label:'Image or Markdown file',icon:'image',fn:()=>fileInput.current?.click()},
  '-',
  {label:'Notes folder',icon:'folder',fn:()=>setFolderOpen(true)},
  ...(files?.folder.hidden?[{label:`Show hidden files (${files.folder.hidden})`,icon:'preview' as const,fn:()=>void showHidden()}]:[]),
 ];
 const addMenu=(primary=false)=><Menu label="Add to the board" items={addItems} button={(toggle,open)=><button type="button" className={cn('btn sm',primary&&'primary')} aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Icon name="add" size={15}/>Add to board</button>}/>;
 const emptyResearch=research&&tiles?.length===0&&!frames.length;

 return <div className="board-wrap" ref={wrap} tabIndex={-1} onPaste={paste} onDragOver={event=>event.preventDefault()} onDrop={drop} onKeyDown={onBoardKey} onClick={event=>{if(event.target===event.currentTarget)clear();}}>
  {board.loadError?<div style={{padding:24}}><ErrorLine message={board.loadError} onRetry={board.reload}/></div>:!tiles?<div className="flex flex-1 items-center justify-center"><Spinner label="Loading the board" size={20}/></div>:
  <div className={cn('canvas-scroll',spaceHeld&&'pan-ready')} ref={scroller} style={{backgroundSize:`${grid.size}px ${grid.size}px`,backgroundPosition:`${grid.x}px ${grid.y}px`}} onPointerDown={onCanvasDown} onDoubleClick={event=>{if(isEmpty(event.target as HTMLElement,event.currentTarget))void addNote('',toCanvas(event.clientX,event.clientY));}}>
    <div className={cn('canvas',connectFrom&&'connecting')} ref={canvasEl} style={{width:frameSize.width,height:frameSize.height,transform:`translate3d(${view.x}px,${view.y}px,0) scale(${zoom})`}}>
     {tiles.length===0&&!research&&<p className="muted" style={{position:'absolute',left:60,top:70,maxWidth:380,fontSize:14,lineHeight:1.55}}>Drop links, screenshots, notes and Markdown files here. Claude reads the whole board when it drafts your scenes. Anything saved in this video's folder shows up here too.</p>}
     {frames.map(frame=><div key={frame.id} className={cn('bframe',selFrame===frame.id&&'sel')} style={{left:frame.x,top:frame.y,width:frame.w,height:frame.h}} data-frame={frame.id}>
      <div className="bframe-h" role="group" tabIndex={0} aria-label={`Frame ${frame.title}. Arrow keys move it and its cards. Enter renames it.`} onPointerDown={event=>onFrameDown(event,frame)} onKeyDown={event=>onFrameKey(event,frame)} onFocus={()=>{setSelFrame(frame.id);setSel([]);setSelLink(null);}} onDoubleClick={()=>setEditFrame(frame.id)}>
       <Icon name="frame" size={13}/>
       {editFrame===frame.id
        ?<input className="bframe-name" autoFocus defaultValue={frame.title} aria-label="Frame name" maxLength={80}
          onBlur={event=>{const title=event.target.value.trim()||frame.title;if(title!==frame.title)canvas.changeFrame(frame.id,{title});setEditFrame(null);}}
          onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){event.preventDefault();event.stopPropagation();event.currentTarget.value=frame.title;event.currentTarget.blur();}}}/>
        :<span className="ellipsis">{frame.title}</span>}
      </div>
      <span className="bframe-resize" aria-hidden onPointerDown={event=>onResizeDown(event,frame)}/>
     </div>)}
     <svg className="blinks" width={frameSize.width} height={frameSize.height} aria-hidden={shownLinks.length?undefined:true}>
      {shownLinks.map(each=>{
       const line=linkLine(boxes.get(each.from)!,boxes.get(each.to)!);
       const name=`Connection from ${cardName(tiles,each.from)} to ${cardName(tiles,each.to)}${each.label?`: ${each.label}`:''}. Enter edits its label, Delete removes it.`;
       return <g key={each.id} className={cn('blink',selLink===each.id&&'sel')} role="button" tabIndex={0} aria-label={name}
        onPointerDown={event=>{event.stopPropagation();setSelLink(each.id);setSel([]);setSelFrame(null);}} onDoubleClick={()=>setEditLink(each.id)}
        onFocus={()=>{setSelLink(each.id);setSel([]);setSelFrame(null);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();setEditLink(each.id);}}}>
        <line className="hit" x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y}/>
        <line className="ln" x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y} markerEnd={selLink===each.id?'url(#blink-end-sel)':'url(#blink-end)'}/>
       </g>;
      })}
      {drawing&&boxes.get(drawing.from)&&(()=>{const start=edgePoint(boxes.get(drawing.from)!,drawing.to);return <line className="ln drawing" x1={start.x} y1={start.y} x2={drawing.to.x} y2={drawing.to.y}/>;})()}
      <defs>
       <marker id="blink-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" className="blink-head"/></marker>
       <marker id="blink-end-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" className="blink-head sel"/></marker>
      </defs>
     </svg>
     {shownLinks.map(each=>{
      const line=linkLine(boxes.get(each.from)!,boxes.get(each.to)!);
      if(editLink===each.id)return <input key={each.id} className="blink-label editing" style={{left:line.mid.x,top:line.mid.y}} autoFocus defaultValue={each.label??''} placeholder="Label" aria-label="Connection label" maxLength={120}
       onBlur={event=>{const text=event.target.value.trim();if(text!==(each.label??''))canvas.label(each.id,text);setEditLink(null);}}
       onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){event.preventDefault();event.stopPropagation();event.currentTarget.value=each.label??'';event.currentTarget.blur();}}}/>;
      return each.label?<span key={each.id} className={cn('blink-label',selLink===each.id&&'sel')} style={{left:line.mid.x,top:line.mid.y}} onDoubleClick={()=>setEditLink(each.id)}
       onPointerDown={event=>{event.stopPropagation();setSelLink(each.id);setSel([]);}}>{each.label}</span>:null;
     })}
     {tiles.map(tile=>{const box={...tileBox(tile),h:tile.pos?.h};const selected=sel.includes(tile.id);return <div key={tile.id} data-tile={tile.id} tabIndex={0} role="group" aria-label={`${KIND_NAME[tile.kind]} card${tile.title?`: ${tile.title}`:''}. Arrow keys move it, C connects it.`}
      className={cn('tile',tile.kind,selected&&'sel',dragId===tile.id&&'drag',fresh===tile.id&&'fresh',connectFrom===tile.id&&'connect-from')} style={{left:box.x,top:box.y,width:box.w,...(tile.kind==='note'&&box.h?{minHeight:box.h}:{})}}
      onPointerDown={event=>onTileDown(event,tile.id)} onKeyDown={event=>onTileKey(event,tile.id)} onFocus={()=>{if(pointing.current){pointing.current=false;return;}if(!sel.includes(tile.id))setSel([tile.id]);setSelLink(null);setSelFrame(null);}}>
      <TileBody tile={tile} videoId={boardId} reading={board.reading[tile.id]} onRemove={()=>board.remove(tile)} onOpen={()=>setOpenNote(tile.id)} onSaveText={tile.kind==='idea'||tile.kind==='text'?text=>board.saveNote(tile.id,text):undefined}
       onSaveNote={tile.kind==='note'?(text,base)=>board.saveNote(tile.id,text,base):undefined} autoFocus={focusNote===tile.id} onBlurEmpty={()=>noteLeftEmpty(tile.id)}
       onRetryRead={()=>board.read(tile)} onBreakdown={setBreakdown} mine={tile.kind==='mine'?(ready?listed.find(each=>each.id===tile.meta.videoId)??null:undefined):undefined} onOpenVideo={openVideo}/>
      {tile.kind==='note'&&<span className="note-resize" aria-hidden onPointerDown={event=>onNoteResizeDown(event,tile.id)}/>}
      <span className="connect-handle" onPointerDown={event=>onHandleDown(event,tile.id)}>
       <IconButton icon="connect" iconSize={12} label="Connect to another card (C)" onClick={()=>{setConnectFrom(tile.id);toast('Pick the card to connect to: drag to it, or focus it and press Enter. Esc cancels.');}}/>
      </span>
     </div>;})}
     {marquee&&<div className="bmarquee" style={{left:marquee.x,top:marquee.y,width:marquee.w,height:marquee.h}} aria-hidden/>}
    </div>
  </div>}
  {emptyResearch&&<div className="board-empty" role="note">
   <p>Put what might become a video here: posts and videos from Discover, your ideas, links, notes and Markdown files.</p>
   {addMenu(true)}
  </div>}
  {!research&&<div className="board-actions">
   <IconButton icon="help" label="How the board works" size="md" onClick={()=>setTip('again')}/>
   <button type="button" className={cn('btn',scenes&&scenes.length?'':'primary')} disabled={draft.running} onClick={draft.request}>
    {draft.running?<><span className="spin"/>{draft.line}</>:<><Icon name="draft" size={15}/>Draft scenes from board</>}
   </button>
  </div>}
  {(sel.length>0||frameNow)&&<div className="board-selbar" role="toolbar" aria-label="Selection">
   <span className="small muted">{frameNow?`Frame “${frameNow.title}” · ${frameMembers.length} ${frameMembers.length===1?'card':'cards'}`:`${sel.length} ${sel.length===1?'card':'cards'} selected`}</span>
   {!frameNow&&sel.length>1&&<button type="button" className="btn sm" onClick={()=>void group()}><Icon name="frame" size={14}/>Group in a frame</button>}
   {research&&(frameNow?frameMembers.length>0:sel.length>0)&&<button type="button" className="btn sm primary" disabled={starting} onClick={()=>void(frameNow?startVideo(frameMembers,frameNow.id):startVideo(sel))}>{starting?<span className="spin"/>:<Icon name="video" size={14}/>}Start a video from this {frameNow?'frame':'selection'}</button>}
   <IconButton icon="delete" label={frameNow?'Remove the frame (its cards stay) (Delete)':'Remove from the board (Delete)'} onClick={()=>{if(frameNow){canvas.removeFrame(frameNow.id);setSelFrame(null);}else{board.removeMany(sel);setSel([]);}}}/>
   <IconButton icon="close" label="Clear the selection (Esc)" onClick={clear}/>
  </div>}
  {draft.failed&&<div className="board-actions" style={{top:'auto',bottom:70,right:18}}><ErrorLine message={draft.failed} onRetry={draft.start}/></div>}
  <div className="btoolbar">
   {!emptyResearch&&<>{addMenu()}<span className="sep"></span></>}
   <input ref={fileInput} type="file" accept="image/*,.md,.markdown,.txt" multiple hidden aria-label="Choose files to add" onChange={event=>{takeFiles([...event.target.files??[]]);event.target.value='';}}/>
   <IconButton icon="zoom-out" label="Zoom out" onClick={()=>zoomBy(-ZOOM.step)}/>
   <span className="zoom">{Math.round(zoom*100)}%</span>
   <IconButton icon="zoom-in" label="Zoom in" onClick={()=>zoomBy(ZOOM.step)}/>
   <IconButton icon="fit" label="Fit the whole board" onClick={fit}/>
  </div>
  {linkOpen&&<form className="menu board-link" onSubmit={event=>void submitLink(event)}>
   <input className="input" autoFocus value={link} onChange={event=>setLink(event.target.value)} placeholder="YouTube, Instagram, X or any link" style={{height:32}} onKeyDown={event=>{if(event.key==='Escape')setLinkOpen(false);}} aria-label="Link to add"/>
   <button className="btn sm primary" type="submit" style={{height:32}}>Add link</button></form>}
  {/* The files on disk are one click away in Finder; the path itself is not something to read. */}
  {files&&window.sceneForge?.reveal&&<button type="button" className="board-folder" title={files.folder.path} onClick={()=>void window.sceneForge!.reveal(files.folder.path).catch(()=>toast("Couldn't open the folder."))}>
   <Icon name="folder-open" size={14}/>Show files in Finder
  </button>}
  {!research&&draft.confirm&&<ReplaceScenes scenes={scenes??[]} action="Drafting again" undoLine="You can undo it from the message that follows." onKeep={()=>draft.setConfirm(false)} onReplace={draft.start}/>}
  {noteOpen&&<NotePanel key={noteOpen.id} tile={noteOpen} save={(text,base)=>board.saveNote(noteOpen.id,text,base)} isNew={madeNote===noteOpen.id} onClose={discard=>{setOpenNote(null);setMadeNote(null);if(discard)void clubFetch(`${boardBase(boardId)}/research/${encodeURIComponent(noteOpen.id)}`,{method:'DELETE'}).then(()=>board.refresh(),()=>{});}} onCopyPath={name=>copyPath(name,'Copied the file name')}/>}
  {folderOpen&&<NotesFolder notes={files?.notes??null} onClose={()=>setFolderOpen(false)}
   onChoose={async path=>{const result=await chooseNotesFolder(path);if('error' in result)return result.error;setFilesTick(tick=>tick+1);board.refresh();return undefined;}}
   onPin={async path=>{try{const tile=await pinNote(boardId,path);board.adopt([tile]);setFilesTick(tick=>tick+1);toast('Pinned to the board');}catch(reason){toast(errorMessage(reason,"Couldn't pin that file."));}}}/>}
  {tip&&<BoardTip onClose={closeTip}/>}
  {breakdown&&<BreakdownDrawer videoId={breakdown} title={shown?.title??''} channel={shown?.meta.channel??''} multiplier={shown?.meta.multiplier??null} saved={saved} videos={listed} onAdded={()=>{}} onClose={()=>setBreakdown(null)}/>}
  {drawerVideo&&<IdeaDrawer video={drawerVideo} actions={ideaActions} onClose={()=>setDrawer(null)} onRemove={target=>{setDrawer(null);ideaActions.remove(target);}}/>}
 </div>;
}

/** A card's name for a connection's label: its title, else its kind. */
function cardName(tiles:readonly ResearchTile[],id:string){
 const tile=tiles.find(each=>each.id===id);
 return tile?(tile.title||KIND_NAME[tile.kind]):'a card';
}
