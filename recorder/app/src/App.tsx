import {addTimelineLayer,clipLayerRowId,moveClipsToLayer} from "../shared/timeline-layers";
import {createPortal} from "react-dom";
import {Activity,memo,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {ArrowLeft,ArrowRight,AudioLines,Camera,Check,ChevronDown,ChevronLeft,ChevronRight,Clock3,Clapperboard,Elements,Copy,Download,FileText,Film,FolderOpen,Grid2X2,History,Image,Layers,LayoutTemplate,LoaderCircle,Magnet,Maximize2,Mic,Minus,MoreHorizontal,MousePointer2,Music,Pause,Play,Plus,Redo2,Scissors,Search,Settings2,SkipBack,SkipForward,Sparkles,Subtitles,Trash2,Type,Undo2,Upload,Video,WandSparkles,X,ZoomIn} from './Icons';
import type {Clip,Media,Project,Scene,TrackKind} from '../shared/types';
import {clipDuration,makeId,projectDuration,type MotionTemplateId} from '../shared/types';
import {api,apiResult,projectRevision,insertMedia,timecode} from './api';
import {confirmTake,saveProjectTake,type ConfirmTakeOptions,type SavedTake} from './recorded-takes';
import {useStudio} from './useStudio';
import {Stage} from './Stage';
import {Transcript} from './Transcript';
import {cutWordsLabel,deleteTranscriptSelection,type WordSelection} from './transcript-editing';
import {Timeline} from './Timeline';
import {TimelineResize} from './TimelineResize';
import {Inspector,Panel,Field,type Change} from './Inspector';
import {MarkerNote} from './MarkerNote';
import {MOTION_TEMPLATES,motionText,newMotionBlock} from '../shared/motion/templates';
import {AgentChat} from './AgentChat';
import {QuickActionButtons,QuickActionDialog,TranscriptionStatus} from './QuickActions';
import {useProjectAutomation} from './useAutomation';
import {useAutomaticTranscription} from './AutomaticTranscription';
import type {AutomationJob,QuickActionRequest} from '../shared/automation';
import {AIDialog,HistoryDialog,Modal,SettingsDialog} from './Dialogs';
import {ExportDialog} from './ExportDialog';
import {BorumiExportDialog} from './BorumiExportDialog';
import {Recording,type RecordingProgress} from './Recording';
import {Teleprompter} from './Teleprompter';
import {Home} from './Home';
import {TrashDialog} from './TrashDialog';
import {MediaRecoveryBanner,MediaRecoveryDialog} from './MediaRecoveryDialog';
import {Onboarding,needsSetup} from './Onboarding';
import {ScriptEditor} from './ScriptEditor';
import {resolveShortcut,isEditableTarget,loadShortcutOverrides,shortcutLabel,type ShortcutAction} from './shortcuts';
import {splitAt,deleteSelection,trimSelection,copySelection,pasteSelection,type TimelineClipboard} from './editing';
import {clampToEnd,createPlayhead,usePlayheadSelector,type Playhead} from './playhead';
import {sceneAt} from './scene-at';
import {frameThrottle,sameStatusJobs} from './editor-view';
import {EditSuggestion} from './club/recorder/EditSuggestion';
import {ClubExport} from './club/recorder/ClubExport';
import {EditAutoSheet,type AutoOption,type EditPreview} from './club/recorder/EditAutoSheet';
import {cutReview,rangesSeconds} from './club/recorder/edit-auto';
import {applyEditAction,describeEditAction,editActionProblem,editEstimate,editRanges} from './editing-actions';
import {applyProjectChange} from './project-draft';
import {ACTION_TITLE,type EditAction,type SelectedItem} from '../shared/companion';
import type {EditOptions} from './editing-actions';
import {Menu,useToast,type MenuItem} from './club/ui';
import {CutPlayback} from './CutPlayback';
import {recallEditView,rememberEditView} from './edit-session';
import {timelineContextItems,timelineMoreItems,type TimelineMenuActions} from './edit-menus';
import {TimelineClub,rowsHeight,usedRows,type TimelineControls} from './TimelineClub';
import {type Deleted,secondsLabel,moveMarker,addMarker,addMotionBlock,noteMarker,removeMarker,applyClipStarts,clampScale,deleteItems,ensureLinks,freeDelta,insertGap,mergeRanges,moveEffects,rowItems,isLinked,linkClips,linkedIds,remapLinks,selectionCount,zoomSlider,syncScenesToTakes,rulerLabel,lengthLabel,showTenths,splitLinked,unlinkClips} from './timeline-edit';

const panels:Array<{name:Panel;icon:typeof Film}>=[{name:'Canvas',icon:Image},{name:'Layout',icon:LayoutTemplate},{name:'Clip',icon:Clapperboard},{name:'Zoom',icon:ZoomIn},{name:'Motion',icon:Sparkles},{name:'Elements',icon:Elements},{name:'Music',icon:Music},{name:'Captions',icon:Subtitles},{name:'Cursor',icon:MousePointer2},{name:'Automate',icon:WandSparkles}];
const MediaRecoveryNotice=memo(MediaRecoveryBanner),RecordingWorkspace=memo(Recording),ScriptWorkspace=memo(ScriptEditor);
/** A stable callback that runs the latest render's handler, so memoized panels skip unrelated App renders. */
function useEvent<A extends unknown[],R>(fn:(...args:A)=>R):(...args:A)=>R{const ref=useRef(fn);ref.current=fn;return useCallback((...args:A)=>ref.current(...args),[]);}
/** Mounts on first reveal, then keeps DOM and state while hidden. React tears the hidden effects down (media, listeners, playhead subscriptions). Hidden children stay frozen at their last visible props, so React skips the subtree until it is shown again. */
function Keep({visible,children}:{visible:boolean;children:React.ReactNode}){const [mounted,setMounted]=useState(visible),last=useRef(children);if(visible&&!mounted)setMounted(true);if(visible)last.current=children;return mounted?<Activity mode={visible?'visible':'hidden'}>{last.current}</Activity>:null;}
/** The companion panel docked beside Edit (CreatorClub): its keys are its own. */
const COMPANION_PANEL='.cmp';
const roundTime=(time:number)=>Math.round(time*1000)/1000;
function PlayheadField({playhead,duration,onSeek}:{playhead:Playhead;duration:number;onSeek:(time:number)=>void}){const value=usePlayheadSelector(playhead,roundTime);return <input aria-label="Playhead time in seconds" type="number" min={0} max={duration||3600} step={1/30} value={value} onChange={e=>onSeek(Number(e.target.value))}/>;}
const tenths=(time:number)=>Math.floor(Math.max(0,time)*10);
/** "10 s", "2.5 s", "1 min 4 s". */
const seconds=lengthLabel;
/** "1:05.3 / 6:18": the club timeline's clock, rendered only when the tenth of a second changes. */
/** Edit tells the club which scene the playhead is in, so the scene chips follow it (while playing, scrubbing or after a click on the timeline). Renders nothing. */
function SceneFollower({playhead,scenes,onScene}:{playhead:Playhead;scenes:Project['scenes'];onScene(sceneId:string):void}){
 const id=usePlayheadSelector(playhead,time=>sceneAt(scenes,time)),report=useRef(onScene);report.current=onScene;
 useEffect(()=>{if(id)report.current(id);},[id]);
 return null;
}
/** The playhead readout, in the timeline's one time format (tenths only when less than 10 s is in view). */
function ClubTime({playhead,duration,fine}:{playhead:Playhead;duration:number;fine:boolean}){const t=usePlayheadSelector(playhead,tenths)/10;return <span className="club-time tnum">{rulerLabel(t,fine)}<span> / {rulerLabel(duration,fine)}</span></span>;}
/** The timeline's actions at the pointer (right-click), the same list as the More menu. Drawn in the club's root like the club's menus. */
function ContextMenu({at,items,onClose}:{at:{x:number;y:number};items:readonly MenuItem[];onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null),[host]=useState(()=>document.querySelector('.club-root'));
 // Focus moves into the menu (arrow keys, Home and End move between items) and goes back where it was when the menu closes.
 useEffect(()=>{const before=document.activeElement as HTMLElement|null;ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const away=(event:Event)=>{if(!ref.current?.contains(event.target as Node))onClose();};
  const key=(event:KeyboardEvent)=>{const buttons=[...ref.current?.querySelectorAll<HTMLButtonElement>('button')??[]],i=buttons.indexOf(document.activeElement as HTMLButtonElement);
   if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();event.stopPropagation();onClose();return;}
   const next=event.key==='ArrowDown'?(i+1)%buttons.length:event.key==='ArrowUp'?(i-1+buttons.length)%buttons.length:event.key==='Home'?0:event.key==='End'?buttons.length-1:-1;
   if(next>=0){event.preventDefault();event.stopPropagation();buttons[next]?.focus();}};
  window.addEventListener('pointerdown',away,true);window.addEventListener('scroll',away,true);window.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('pointerdown',away,true);window.removeEventListener('scroll',away,true);window.removeEventListener('keydown',key,true);if(before?.isConnected)before.focus();};},[onClose]);
 const menu=<div ref={ref} className="menu" role="menu" aria-label="Timeline actions" style={{position:'fixed',left:Math.max(8,Math.min(at.x,window.innerWidth-260)),top:Math.max(8,Math.min(at.y,window.innerHeight-580)),maxHeight:window.innerHeight-16,overflowY:'auto',minWidth:240,zIndex:60}}>
  {items.map((item,index)=>item==='-'?<div key={index} className="sep"/>:'header' in item?<div key={index} className="hd">{item.header}</div>:<button key={index} type="button" role={item.check===undefined?'menuitem':'menuitemradio'} aria-checked={item.check} onClick={()=>{onClose();item.fn();}}><span className="grow">{item.label}</span>{item.check&&<Check size={14}/>}</button>)}
 </div>;
 return host?createPortal(menu,host):menu;
}
/** The "?" popover: it takes focus, Escape closes it and focus goes back to where it was. It fits above the timeline bar and scrolls, with a cue while more is below. */
export function ShortcutsPopover({onClose}:{onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null),[more,setMore]=useState(false),[room,setRoom]=useState<number|undefined>();
 const measure=useCallback(()=>{const el=ref.current;if(el)setMore(el.scrollHeight-el.clientHeight-el.scrollTop>4);},[]);
 useLayoutEffect(()=>{const bar=ref.current?.parentElement?.getBoundingClientRect();if(bar&&bar.top>0)setRoom(Math.max(160,Math.min(560,bar.top-24)));measure();},[measure]);
 useEffect(()=>{const before=document.activeElement as HTMLElement|null;ref.current?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'||event.key==='?'){event.preventDefault();event.stopPropagation();onClose();}};window.addEventListener('keydown',key,true);return()=>{window.removeEventListener('keydown',key,true);if(before?.isConnected)before.focus();};},[onClose]);
 return <div ref={ref} tabIndex={-1} className={`club-shortcuts ${more?'has-more':''}`} role="dialog" aria-label="Keyboard shortcuts" style={room?{maxHeight:room}:undefined} onScroll={measure}><header><b>Shortcuts</b><button type="button" className="club-sheet-close" aria-label="Close shortcuts" onClick={onClose}><X size={14}/></button></header><dl>{SHORTCUTS.map(([keys,what])=><div key={keys}><dt>{keys}</dt><dd>{what}</dd></div>)}</dl>{more&&<div className="club-shortcuts-more" aria-hidden>More below <ChevronDown size={13}/></div>}</div>;
}
const SHORTCUTS:Array<[string,string]>=[['Space','Play or pause'],['S','Split at the playhead'],['Delete','Delete and close the gap'],['Shift Delete','Delete, keep the gap'],['⌘D','Duplicate'],['⌘C / ⌘V','Copy / paste at the playhead'],['⌘A','Select all'],['M','Add a marker'],['N','Snapping on or off'],['B / A','Blade / select tool'],['⌘G','Link or unlink screen, camera and audio'],['← →','Nudge the selection a frame (Shift: 1 s), or move the playhead'],['↑ ↓','Previous / next cut'],['+ / −','Zoom at the playhead'],['⌘ scroll, pinch','Zoom at the pointer'],['Shift Z','Fit the whole video'],['Alt while trimming','Keep the gap'],['⌘Z / ⇧⌘Z','Undo / redo'],['?','These shortcuts']];
function Toasts({bind}:{bind:{current:(message:string)=>void}}){const [toast,setToast]=useState('');useLayoutEffect(()=>{bind.current=setToast;},[bind]);useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4200);return()=>clearTimeout(t);},[toast]);return toast?<div className="toast" role="status"><Check size={16}/>{toast}</div>:null;}
/** CreatorClub shows one recording project inside its video page: it opens that project, forces the mode and hides SceneForge's own Home and navigation. */
/** `onMode` receives SceneForge's own moves between recording and editing (the embed never switches by itself); `onOpenFailed` fires when the project cannot be opened;
 `onProgress` reports how many scenes have a take while recording; `onExported` says whether the current edit has a finished MP4 export. */
/**
 * What the companion docked beside Edit is told with a message: the playhead, the selected clips, the selected captions, texts, zooms and
 * markers, and the time they all span. The scenes and the timeline itself are read from the saved project.
 */
export type EditorContext={playhead:number;selection:string[];items?:SelectedItem[];range?:{start:number;end:number}};
/** What the editor shows the companion as it changes: how many items are selected, which card's preview is on the stage, and the timeline's version (cards re-measure on it). */
export type EditorState={selected:number;previewKey?:string;version?:string;/** Moments the creator marked as not liked. */notes?:number};
/** The editor, as the companion uses it: what it is looking at, saving before a question, a card's preview on the stage, and a server change taken as one undo step. */
export interface EditorBridge{
 context():EditorContext;
 flush():Promise<unknown>;
 /** Shows what a card would do on the stage (cuts as a before/after playback, other changes as the frame after it), or clears it with null. Returns why it cannot be previewed. */
 preview(action:EditAction|null,key:string,options?:EditOptions):string|undefined;
 /** One line on what a card would do now (cuts and seconds, the share of the video, the zoom it replaces), or why it cannot. */
 estimate(action:EditAction,options?:EditOptions):{text:string;warn?:boolean}|undefined;
 /** One plain sentence for what a card would do, naming the graphic it refers to. */
 describe(action:EditAction):string;
 commit<T extends {project?:Project;revision?:string}>(run:(revision:string)=>Promise<T>):Promise<T>;
}
export type EmbeddedRecorder={projectId:string;mode:'Record'|'Edit';onBack():void;onMode?(mode:'Record'|'Edit'):void;onOpenFailed?():void;onProgress?(progress:RecordingProgress):void;onExported?(exported:boolean):void;/** The recording project's scene to select while recording (the strip's choice). */sceneId?:string;/** Changes on every strip click, so choosing the scene that is already chosen applies it again. */sceneNonce?:number;/** The recorder's own scene choice (its scene cards, or the next scene after Continue). */onSceneChange?(sceneId:string):void;/** The club asks this before it leaves Record for Edit: a take still under review is added to the timeline first. It resolves false when that failed, and the club stays. */registerLeaveGuard?(guard:(()=>Promise<boolean>)|null):void;/** Pauses were removed or put back, so the scenes' state changed. */onChanged?():void;/** Edit registers itself for the companion while it is open (null when it closes). */onEditor?(editor:EditorBridge|null):void;/** Edit's selection and stage preview, as they change. */onEditState?(state:EditorState):void};
export default function App({embedded}:{embedded?:EmbeddedRecorder}={}){
 const studio=useStudio(),p=studio.project,change:Change=studio.change;
 useEffect(()=>{if(embedded&&studio.project?.id!==embedded.projectId)void studio.open(embedded.projectId);},[embedded?.projectId]);
 // The club unmounts an embedded editor when you change step; save what the autosave debounce has not written yet.
 useEffect(()=>embedded?()=>{const view=keptView.current;if(view.id)rememberEditView(view.id,{zoom:view.zoom,playhead:playhead.get(),selectedIds:[...view.ids],selected:view.selected});void studio.flush().catch(e=>console.error(e));}:undefined,[Boolean(embedded),studio.flush]);
 // Playback time lives outside React state: a tick re-renders only the components that read the playhead.
 const [playhead]=useState(createPlayhead);
 const [recoveryRefresh,setRecoveryRefresh]=useState(0);
 const [showWaveforms,setShowWaveforms]=useState(()=>{try{return localStorage.getItem('sceneforge.timeline-waveforms.v1')!=='false';}catch{return true;}});
 useEffect(()=>{try{localStorage.setItem('sceneforge.timeline-waveforms.v1',String(showWaveforms));}catch{}},[showWaveforms]);
 const [quickSceneId,setQuickSceneId]=useState<string|undefined>();
 const [scriptSceneId,setScriptSceneId]=useState<string|undefined>();
 const openSceneAction=useEvent((sceneId:string,kind:'auto-cut'|'visualize')=>{setQuickSceneId(sceneId);openModal(kind);});
 const automation=useProjectAutomation(p?.id,p?.updatedAt),automaticTranscription=useAutomaticTranscription();
 const [mode,setModeState]=useState<'Script'|'Record'|'Edit'>('Edit'),[panel,setPanel]=useState<Panel|null>(null),[modal,setModal]=useState<string|null>(()=>!embedded&&needsSetup()?'setup':null),[selected,setSelected]=useState<string|null>(null),[playing,setPlaying]=useState(false),[zoom,setZoom]=useState(55),[showTranscript,setShowTranscript]=useState(false),[showLibrary,setShowLibrary]=useState(false),[newName,setNewName]=useState(''),[importPaths,setImportPaths]=useState(''),[importBusy,setImportBusy]=useState(false),[importTrack,setImportTrack]=useState<TrackKind|undefined>(),[aiKind,setAIKind]=useState('transcribe');
 // Embedded, the club owns the mode: SceneForge's own moves to recording or editing are handed to it instead.
 const setMode=useEvent((next:'Script'|'Record'|'Edit')=>{if(embedded&&next!==embedded.mode){if(next!=='Script')embedded.onMode?.(next);return;}setModeState(next);});
 const [tool,setTool]=useState<'select'|'blade'>('select'),[scrubbing,setScrubbing]=useState(false),[selectedIds,setSelectedIds]=useState<Set<string>>(new Set()),[playbackRate,setPlaybackRate]=useState(1),[shortcutOverrides,setShortcutOverrides]=useState(loadShortcutOverrides);
 const [selectedRange,setSelectedRange]=useState<{start:number;end:number}|null>(null),[chatOpen,setChatOpen]=useState(()=>!embedded&&localStorage.getItem('sceneforge.agent-chat.open')==='true');
 // Standalone SceneForge keeps its editor chat; CreatorClub's Edit has the docked companion instead.
 useEffect(()=>{if(!embedded)localStorage.setItem('sceneforge.agent-chat.open',String(chatOpen));},[chatOpen]);
 // CreatorClub's Edit: the right side shows the transcript, a panel sheet, the Auto-edit and style sheet or the media; the stage can show a preview of a choice (the sheet's, or a companion card's).
 const [follow,setFollow]=useState(()=>{try{return localStorage.getItem('creatorclub.timeline-follow')!=='false';}catch{return true;}});
 useEffect(()=>{try{localStorage.setItem('creatorclub.timeline-follow',String(follow));}catch{/* A blocked store only forgets the switch. */}},[follow]);
 const [side,setSide]=useState<'transcript'|'auto'|'media'|null>(null),[autoInitial,setAutoInitial]=useState<AutoOption|undefined>(),[preview,setPreview]=useState<EditPreview|null>(null),[previewPhase,setPreviewPhase]=useState<'before'|'after'>('after');
 const timelineControls=useRef<TimelineControls|null>(null),[shortcutsOpen,setShortcutsOpen]=useState(false),[contextAt,setContextAt]=useState<{x:number;y:number}|null>(null);
 const closeShortcuts=useCallback(()=>setShortcutsOpen(false),[]),closeContext=useCallback(()=>setContextAt(null),[]),openContext=useCallback((x:number,y:number)=>setContextAt({x,y}),[]);
 // The note being written on a marker, and where it opens.
 const [note,setNote]=useState<{id:string;left:number;top:number}|null>(null);
 const openNote=useCallback((id:string,box:DOMRect)=>setNote({id,left:box.left+box.width/2,top:box.top}),[]);
 const showPreview=useCallback((next:EditPreview|null)=>{setPreview(next);setPreviewPhase('after');},[]);
 const clipboard=useRef<TimelineClipboard|null>(null),initialProjectMode=useRef<{id:string;mode:'Record'|'Edit'}|null>(null);
 // Pick a newly opened project's workspace in the same render, so the previous mode's workspace never mounts for it. The project effect clears the ref.
 const [modeFor,setModeFor]=useState<string>();
 // Edit's zoom, playhead and selection for this video, from an earlier visit in this session.
 const kept=useMemo(()=>embedded&&p?recallEditView(p.id):undefined,[p?.id]);
 if(p?.id!==modeFor){setModeFor(p?.id);if(p)setModeState(embedded?embedded.mode:initialProjectMode.current?.id===p.id?initialProjectMode.current.mode:p.clips.length?'Edit':'Script');if(kept){setZoom(kept.zoom);playhead.set(kept.playhead);}}
 else if(embedded&&mode!==embedded.mode)setModeState(embedded.mode);
 // An embedded project that cannot be opened is reported to the club, which shows one sentence and Try again.
 const openFailed=Boolean(embedded&&studio.error&&(!p||p.id!==embedded.projectId));
 useEffect(()=>{if(openFailed)embedded?.onOpenFailed?.();},[openFailed]);
 const leaveProject=()=>{setPlaying(false);if(embedded)void studio.flush().then(()=>embedded.onBack(),e=>studio.setError(e.message));else void studio.close();};
 // The recorder sends people straight to the capture-access step; other entry points start at the welcome.
 const [setupStep,setSetupStep]=useState(0);
 const openModal=(kind:string)=>{setPlaying(false);setModal(kind);};
 useEffect(()=>{const update=()=>setShortcutOverrides(loadShortcutOverrides());window.addEventListener('sceneforge-shortcuts-changed',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('sceneforge-shortcuts-changed',update);window.removeEventListener('storage',update);};},[]);
 const importScene=useRef<{projectId:string;sceneId:string}|null>(null);
 const fileInput=useRef<HTMLInputElement>(null),projectId=useRef('');
 const duration=p?projectDuration(p):0;
 const [cutMarks,setCutMarks]=useState<number[]>([]);useEffect(()=>{if(!cutMarks.length)return;const t=setTimeout(()=>setCutMarks([]),6000);return()=>clearTimeout(t);},[cutMarks]);
 const clubToast=useToast(),toastRef=useRef<(message:string)=>void>(()=>{}),notify=useCallback((s:string)=>{toastRef.current(s);},[]);
 /** Why something was not done: in the club a toast without the check mark that means done. */
 const inClub=Boolean(embedded),refuse=useCallback((s:string)=>{if(inClub)clubToast(s,{refused:true});else toastRef.current(s);},[inClub,clubToast]);
 useEffect(()=>{if(p?.id!==projectId.current){projectId.current=p?.id||'';setModal(value=>value==='media-recovery'?null:value);timelineSeek.cancel();setSelectedRange(null);playhead.set(kept?.playhead??0);setPlaying(false);setSelected(kept?.selected??null);setSelectedIds(new Set(kept?.selectedIds.filter(id=>p&&[...p.clips,...p.elements,...p.captions,...p.zooms,...(p.markers??[])].some(x=>x.id===id))??[]));setTool('select');setScrubbing(false);setPlaybackRate(1);setPanel(null);setSide(null);setPreview(null);if(p)initialProjectMode.current=null;}},[p?.id]);
 // The clock advances from the stored playhead every frame, so unrelated renders can never rewind it.
 useEffect(()=>{if(!playing)return;let frame=0,last=performance.now();const tick=(now:number)=>{const elapsed=(now-last)/1000;last=now;const next=playhead.get()+elapsed*playbackRate;if(next>=duration){playhead.set(duration);setPlaying(false);return;}playhead.set(next);frame=requestAnimationFrame(tick);};if(playhead.get()>=duration)playhead.set(0);frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing,duration,playbackRate,playhead]);
 const seek=useEvent((n:number)=>{playhead.set(Math.max(0,Math.min(duration,n)));});
 // A click on a scene chip moves the Edit playhead to the start of that scene. The nonce changes on every click; a pick made earlier (on Record) does nothing here.
 const pickedScene=useRef(embedded?.sceneNonce);
 useEffect(()=>{
  if(!embedded||embedded.sceneNonce===pickedScene.current)return;
  pickedScene.current=embedded.sceneNonce;
  if(mode!=='Edit')return;
  const scene=p?.scenes.find(s=>s.id===embedded.sceneId);
  if(scene&&scene.duration>0){setPlaying(false);seek(scene.start);}
 },[embedded?.sceneNonce,mode]);
 // Ruler drags and hover scrubs arrive at pointer rate; apply at most one seek per frame.
 const [timelineSeek]=useState(()=>frameThrottle<number>(time=>seek(time)));
 const select=useEvent((id:string,additive:boolean=false)=>{if(additive){const next=new Set(selectedIds);next.has(id)?next.delete(id):next.add(id);setSelectedIds(next);setSelected(next.has(id)?id:[...next].at(-1)||null);}else{setSelected(id);setSelectedIds(new Set([id]));}if(embedded&&!panel)return;if(p?.motion?.some(m=>m.id===id))setPanel('Motion');else if(p?.elements.some(e=>e.id===id))setPanel('Elements');else if(p?.zooms.some(z=>z.id===id))setPanel('Zoom');else if(p?.captions.some(c=>c.id===id))setPanel('Captions');else if(p?.clips.some(c=>c.id===id))setPanel('Clip');});
 // A delete or trim that shortens the video brings the playhead back onto its last frame (never past the end, where the stage is black).
 const shownDuration=useRef(duration);
 useEffect(()=>{const before=shownDuration.current;shownDuration.current=duration;if(duration<before||playhead.get()>duration){const next=clampToEnd(playhead.get(),duration,p?.canvas.fps??30);if(next!==playhead.get()){playhead.set(next);setPlaying(false);}}},[duration,playhead]);
 const selection=selectedIds.size?selectedIds:new Set(selected?[selected]:[]);
 const keptView=useRef({id:'',zoom,ids:selectedIds as ReadonlySet<string>,selected});keptView.current={id:p?.id??'',zoom,ids:selectedIds,selected};
 const split=(at=playhead.get(),onlyId?:string)=>{if(!p)return;if(!p.clips.some(c=>(!onlyId||c.id===onlyId)&&c.start+.0001<at&&c.start+clipDuration(c)-.0001>at)){notify(embedded?'Move the playhead over a clip to split it.':'Place the playhead inside a clip to split it.');return;}studio.change(p=>{if(embedded)splitLinked(p,at,selection,onlyId);else splitAt(p,at,selection,onlyId);});};
 // In the club a delete takes the linked clips along and closes the gap on every track; Shift keeps the gap.
 const deleteSelected=(ripple=embedded?true:p?.settings.ripple??true)=>{if(!p)return;if(!selection.size){if(embedded)notify('Select a clip first.');return;}let done:Deleted|undefined;studio.change(p=>{if(embedded){done=deleteItems(p,selection,ripple);syncScenesToTakes(p);}else deleteSelection(p,selection,ripple);});setSelected(null);setSelectedIds(new Set());
  // A ripple delete takes that time out of every track; say how much (and which other clips went with it), with Undo.
  const closed=done?.closed.reduce((n,[a,b])=>n+b-a,0)??0;if(embedded&&closed>0){const swept=done!.swept.length;clubToast(`Removed ${seconds(closed)} from every track${swept?` and ${swept} ${swept===1?'clip':'clips'} inside it`:''}.`,{undo:studio.undo});}};
 /** Arrow keys nudge the selection by a frame (Shift: a second), sliding against neighbours instead of overlapping; a run of nudges is one undo step. */
 const nudge=(direction:-1|1,big:boolean)=>{if(!p)return;const want=direction*(big?1:1/p.canvas.fps),clipIds=linkedIds(p.clips,[...selection].filter(id=>p.clips.some(c=>c.id===id))),effectIds=new Set([...selection].filter(id=>!p.clips.some(c=>c.id===id)&&!p.markers?.some(m=>m.id===id)));
  studio.change(d=>{const items=rowItems(d);if(clipIds.size){const moving=items.filter(i=>clipIds.has(i.id)),delta=freeDelta(moving,want,items);if(delta){ensureLinks(d);applyClipStarts(d,new Map(moving.map(m=>[m.id,m.start+delta])));syncScenesToTakes(d);}}
   if(effectIds.size){const moving=items.filter(i=>effectIds.has(i.id)),delta=freeDelta(moving,want,items);if(delta)moveEffects(d,effectIds,delta);}},{coalesce:'timeline.nudge'});};
 const addMarkerAtPlayhead=()=>{if(!p)return;const time=Math.round(playhead.get());let id='';studio.change(d=>{id=addMarker(d,time);});requestAnimationFrame(()=>requestAnimationFrame(()=>{const box=document.querySelector(`[data-marker-id="${id}"]`)?.getBoundingClientRect();if(box)openNote(id,box);}));};
 const selectionLinked=Boolean(p&&[...selection].some(id=>isLinked(p.clips,id)));
 const toggleLink=()=>{if(!p)return;const clips=[...selection].filter(id=>p.clips.some(c=>c.id===id));if(selectionLinked){studio.change(d=>{unlinkClips(d,clips);});notify('Unlinked. Move or trim them separately.');}else if(clips.length>1){let linked=false;studio.change(d=>{linked=linkClips(d,clips);});notify(linked?'Linked. They move and trim together.':'They no longer line up, so they cannot be linked.');}else notify('Select two or more clips to link them.');};
 const copy=()=>{if(!p)return;const ids=embedded?linkedIds(p.clips,selection):selection;clipboard.current=copySelection(p,ids);if(clipboard.current)notify(`Copied ${ids.size} timeline items.`);};
 const paste=()=>{if(!p||!clipboard.current)return;let ids:string[]=[];const data=clipboard.current;
  // The club inserts the copy at the playhead (after the clip under it) and moves the rest later, so nothing overlaps.
  studio.change(p=>{if(!embedded){ids=pasteSelection(p,data,playhead.get());return;}ensureLinks(p);const t=playhead.get(),at=Math.max(t,...p.clips.filter(c=>c.track!=='music'&&c.start<t&&c.start+clipDuration(c)>t).map(c=>c.start+clipDuration(c))),length=Math.max(...data.clips.map(c=>c.start+clipDuration(c)),...data.elements.map(e=>e.start+e.duration),...data.captions.map(c=>c.end),...data.zooms.map(z=>z.start+z.duration))-data.start;insertGap(p,at,length,new Set(data.clips.map(c=>clipLayerRowId(c,p))));ids=pasteSelection(p,data,at);remapLinks(p,new Set(ids));});setSelectedIds(new Set(ids));setSelected(ids[0]||null);};
 const duplicateSelected=()=>{if(!p)return;if(embedded){duplicateLinked();return;}const data=copySelection(p,selection);if(!data)return;const end=Math.max(...data.clips.map(c=>c.start+clipDuration(c)),...data.elements.map(e=>e.start+e.duration),...data.captions.map(c=>c.end),...data.zooms.map(z=>z.start+z.duration));let ids:string[]=[];studio.change(p=>{ids=pasteSelection(p,data,end);});setSelectedIds(new Set(ids));setSelected(ids[0]||null);};
 /** The club's duplicate puts a copy of the selection (with its linked clips) right after it and moves the rest of the video later, so nothing overlaps. */
 const duplicateLinked=()=>{if(!p)return;const ids=linkedIds(p.clips,selection),data=copySelection(p,ids);if(!data){notify('Select a clip first.');return;}
  const end=Math.max(...data.clips.map(c=>c.start+clipDuration(c)),...data.elements.map(e=>e.start+e.duration),...data.captions.map(c=>c.end),...data.zooms.map(z=>z.start+z.duration)),length=end-data.start;let added:string[]=[];
  studio.change(d=>{ensureLinks(d);insertGap(d,end,length,new Set(data.clips.map(c=>clipLayerRowId(c,d))));added=pasteSelection(d,data,end);remapLinks(d,new Set(added));});setSelectedIds(new Set(added));setSelected(added[0]||null);};
 const trim=(side:'left'|'right')=>{if(!p)return;const time=playhead.get();if(!p.clips.some(c=>selection.has(c.id)&&c.start<time&&c.start+clipDuration(c)>time)){notify('Select a clip crossing the playhead before trimming.');return;}studio.change(p=>trimSelection(p,selection,time,side));};
 const boundary=(direction:-1|1)=>{if(!p)return;const time=playhead.get();const times=[...new Set([0,duration,...p.clips.flatMap(c=>[c.start,c.start+clipDuration(c)]),...p.elements.flatMap(e=>[e.start,e.start+e.duration])])].sort((a,b)=>a-b);setPlaying(false);seek(direction<0?[...times].reverse().find(t=>t<time-.1)??0:times.find(t=>t>time+.1)??duration);};
 const actions:Partial<Record<ShortcutAction,()=>void>>={undo:studio.undo,redo:studio.redo,closeProject:leaveProject,saveProject:()=>{void studio.flush().then(()=>notify(embedded?'Video saved.':'Project saved.')).catch(e=>studio.setError(e.message));}};
 if(p&&mode==='Edit')Object.assign(actions,{copy,paste,cut:()=>{copy();deleteSelected(false);},selectAll:()=>{const ids=[...p.clips,...p.elements,...p.captions,...p.zooms].map(x=>x.id);setSelectedIds(new Set(ids));setSelected(ids[0]||null);},deselectAll:()=>{setSelectedIds(new Set());setSelected(null);},playPause:()=>setPlaying(v=>!v),pauseReset:()=>{setPlaying(false);setPlaybackRate(1);},playFaster:()=>{setPlaybackRate(playing?Math.min(4,playbackRate*2):1);setPlaying(true);},selectTool:()=>setTool('select'),bladeTool:()=>setTool('blade'),frameBackward:()=>{setPlaying(false);seek(Math.max(0,playhead.get()-1/30));},frameForward:()=>{setPlaying(false);seek(Math.min(duration,playhead.get()+1/30));},previousEdit:()=>boundary(-1),nextEdit:()=>boundary(1),zoomOut:()=>setZoom(v=>embedded?clampScale(v/1.4):Math.max(8,v/1.5)),zoomIn:()=>setZoom(v=>embedded?clampScale(v*1.4):Math.min(200,v*1.5)),deleteRipple:()=>deleteSelected(true),deleteLeaveGap:()=>deleteSelected(false),split:()=>split(),trimLeft:()=>trim('left'),trimRight:()=>trim('right'),toggleSnapping:()=>studio.change(p=>{p.settings.snap=!p.settings.snap;}),toggleScrubbing:()=>setScrubbing(v=>!v),toggleWaveforms:()=>setShowWaveforms(v=>!v)});
 if(p&&mode==='Record')for(const action of ['record','stopRecord','pauseRecord','recordingPresets']as const)actions[action]=()=>window.dispatchEvent(new CustomEvent('sceneforge-shortcut',{detail:{action}}));
 if(modal==='teleprompter')for(const action of ['previousSentence','nextSentence','previousWord','nextWord']as const)actions[action]=()=>window.dispatchEvent(new CustomEvent('sceneforge-shortcut',{detail:{action}}));
 const actionMap=useRef(actions);actionMap.current=actions;
 const nativeContext=useRef<{workspace:'home'|'script'|'record'|'edit'|'teleprompter';availableActions:string[];bindings:typeof shortcutOverrides}>({workspace:'home',availableActions:[],bindings:shortcutOverrides});
 nativeContext.current={workspace:modal==='teleprompter'?'teleprompter':modal||!p?'home':mode==='Record'?'record':mode==='Edit'?'edit':'script',availableActions:Object.keys(actions),bindings:shortcutOverrides};
 useEffect(()=>{const bridge=window.sceneForge;if(!bridge?.onShortcutAction)return;const stop=bridge.onShortcutAction(action=>actionMap.current[action as ShortcutAction]?.());return stop;},[]);
 useEffect(()=>{const bridge=window.sceneForge;if(!bridge?.setShortcutContext)return;const update=()=>{const current=nativeContext.current,editable=isEditableTarget(document.activeElement)||Boolean(document.activeElement?.closest?.(COMPANION_PANEL));void bridge.setShortcutContext!({...current,editable,timelineFocused:current.workspace==='edit'&&!editable&&!document.activeElement?.closest('[data-transcript-editor]')}).catch(()=>{});};update();window.addEventListener('focusin',update);window.addEventListener('focusout',update);return()=>{window.removeEventListener('focusin',update);window.removeEventListener('focusout',update);};},[mode,p?.id,modal,shortcutOverrides]);
 useEffect(()=>window.sceneForge?.onShortcutStatus?.(status=>{if(status.conflicts.length)notify(`Shortcut unavailable: ${status.conflicts.map(c=>c.accelerator).join(', ')}. Change its binding in Settings.`);}),[notify]);
 // Edit keys that are not in SceneForge's shortcut catalog: ⌘D duplicates; in the club S splits, M adds a marker, Shift+Z fits and + / − zoom.
 const editKey=(e:KeyboardEvent):(()=>void)|null=>{
  if(!p||mode!=='Edit'||modal||isEditableTarget(e.target as Element))return null;const key=e.key,mod=e.metaKey||e.ctrlKey;
  if(mod&&!e.shiftKey&&!e.altKey&&key.toLowerCase()==='d')return duplicateSelected;
  if(embedded&&mod&&!e.altKey&&key.toLowerCase()==='g')return toggleLink;
  if(!embedded||mod||e.altKey)return null;
  if(key==='s'||key==='S'&&!e.shiftKey)return ()=>split();
  if(key==='m'||key==='M')return addMarkerAtPlayhead;
  if(key==='Z'&&e.shiftKey)return ()=>timelineControls.current?.fit();
  if(key==='='||key==='+')return ()=>setZoom(v=>clampScale(v*1.4));
  if(key==='-')return ()=>setZoom(v=>clampScale(v/1.4));
  if((key==='ArrowLeft'||key==='ArrowRight')&&selection.size)return ()=>nudge(key==='ArrowLeft'?-1:1,e.shiftKey);
  if((key==='ArrowLeft'||key==='ArrowRight')&&e.shiftKey)return ()=>{setPlaying(false);seek(playhead.get()+(key==='ArrowLeft'?-1:1));};
  if(key==='?')return ()=>setShortcutsOpen(v=>!v);
  if(key==='Escape'&&(preview||side==='auto'))return ()=>{if(side==='auto')setSide('transcript');setPreview(null);};
  return null;
 };
 const keyboard=useRef<(e:KeyboardEvent)=>void>(()=>{});keyboard.current=(e)=>{if((e.target as Element)?.closest?.('[data-transcript-editor]'))return;
  // Keys pressed in the companion panel are the panel's: Delete, S, ⌘Z, arrows and Esc never reach the timeline from there.
  if((e.target as Element)?.closest?.(COMPANION_PANEL))return;const own=editKey(e);if(own){e.preventDefault();own();return;}const context={modal:Boolean(modal),availableActions:Object.keys(actions)as ShortcutAction[]};const resolved=resolveShortcut(e,{...context,scope:mode==='Record'?'recorder':mode==='Edit'?'edit':'script'},shortcutOverrides)??(mode==='Record'?resolveShortcut(e,{...context,scope:'record'},shortcutOverrides):null);if(!resolved)return;e.preventDefault();actions[resolved.id]?.();};
 useEffect(()=>{const handle=(e:KeyboardEvent)=>keyboard.current(e);window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[]);
 const openAuto=useEvent((option?:AutoOption)=>{setPanel(null);setAutoInitial(option);setSide('auto');});
 const openAI=useEvent((kind:string='transcribe')=>{if(kind==='mcp'){openModal('settings-mcp');return;}if(embedded&&(kind==='silence'||kind==='fillers')){openAuto(kind==='silence'?'pauses':'fillers');return;}if(kind==='silence'){setQuickSceneId(undefined);openModal('auto-cut');return;}setScriptSceneId(undefined);setAIKind(kind);openModal('ai');});
 const beginImport=useEvent((track?:TrackKind)=>{importScene.current=null;setImportTrack(track);setImportPaths('');openModal('import');});
 const startWith=async(destination:'Record'|'Edit',fresh=false)=>{if(!p||fresh){await studio.flush();const project=await api<Project>('/projects',{name:destination==='Record'?`Recording, ${new Date().toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'My new story'});initialProjectMode.current={id:project.id,mode:destination};studio.select(project);void studio.refresh().catch(e=>studio.setError(e.message));}setPlaying(false);setMode(destination);if(destination==='Record')setModal(null);else beginImport();};
 const addImported=async(medias:Media[],track=importTrack)=>{const target=importScene.current;if(target){await commitRecordingChange(draft=>{if(draft.id!==target.projectId||!draft.scenes.some(scene=>scene.id===target.sceneId))throw new Error('The import scene changed. Choose the scene and import again.');for(const media of medias){const take:SavedTake={id:makeId(),createdAt:new Date().toISOString(),sceneId:target.sceneId,name:media.name,media:[media],tracks:[track||(media.kind==='audio'?'audio':'screen')],offsets:[0],clipIds:[makeId()],retained:true};saveProjectTake(draft,take);confirmTake(draft,{...take,mode:'keep-both'});}});setMode('Record');}else{studio.change(p=>insertMedia(p,medias,track==='music'||track==='overlay'?playhead.get():undefined,track));setMode('Edit');}importScene.current=null;setModal(null);notify(`Imported ${medias.length} media ${medias.length===1?'file':'files'}.`);};
 const uploadFiles=async(files:FileList|File[])=>{setImportBusy(true);try{const arr=Array.from(files);if(arr.length===1&&arr[0].name.endsWith('.json')){const imported=await api<Project>('/import/project',JSON.parse(await arr[0].text()));await studio.flush();studio.select(imported);setModal(null);}else{const data=new FormData();for(const file of arr)data.append('files',file);await addImported(await api<Media[]>('/media/upload',data));}}catch(e){studio.setError((e as Error).message);}finally{setImportBusy(false);if(fileInput.current)fileInput.current.value='';}};
 const localImport=async(kind:'media'|'borumi')=>{setImportBusy(true);try{let paths=importPaths.split('\n').map(s=>s.trim()).filter(Boolean);if(window.sceneForge){if(kind==='borumi'){const path=await window.sceneForge.chooseBorumi();paths=path?[path]:[];}else paths=await window.sceneForge.chooseMedia();}if(!paths.length){notify('Choose a file or enter its local path.');return;}if(kind==='borumi'){await studio.flush();const imported=await api<Project>('/import/borumi',{path:paths[0]});studio.select(imported);setModal(null);notify('Imported an independent copy of your Borumi project.');}else await addImported(await api<Media[]>('/media/import',{paths}));}catch(e){studio.setError((e as Error).message);}finally{setImportBusy(false);}};
 const commitRecordingChange=useEvent(async(fn:(draft:Project)=>void)=>{const id=p?.id;if(!id)throw new Error('Open the recording project first.');const before=await studio.flush();if(before?.id!==id)throw new Error('The project changed. Reopen the saved take in its original project.');studio.change(draft=>{if(draft.id!==id)throw new Error('The project changed before this take could be saved.');fn(draft);});const saved=await studio.flush();if(saved?.id!==id)throw new Error('The project changed while saving. Reopen the recording project to continue.');});
 const onRecorded=useEvent(async(medias:Media[],tracks:TrackKind[],offsets:number[]=[],options?:ConfirmTakeOptions)=>{const projectId=p?.id;if(!projectId)throw new Error('Open the recording project before confirming.');const before=await studio.flush();if(before?.id!==projectId)throw new Error('The active project changed. Reopen this saved take in its recording project.');let result={start:duration,nextSceneId:''};studio.change(project=>{if(project.id!==projectId)throw new Error('The active project changed before confirmation.');result=confirmTake(project,{media:medias,tracks,offsets:medias.map((_,i)=>Math.max(0,offsets[i]||0)),sceneId:options?.sceneId||project.scenes[0]?.id||'',clipIds:options?.clipIds,takeId:options?.takeId,mode:options?.mode});});const saved=await studio.flush();if(saved?.id!==projectId)return result.nextSceneId;setMode(options?.destination==='edit'?'Edit':'Record');seek(result.start);notify(options?.destination==='edit'?'Take confirmed. Ready to edit.':'Take confirmed. Saved in this scene.');return result.nextSceneId;});
 const addScene=useEvent(()=>studio.change(p=>p.scenes.push({id:makeId(),name:`Scene ${p.scenes.length+1}`,script:'',notes:'',start:projectDuration(p),duration:0})));
 const importMedia=useEvent(()=>beginImport()),openScriptAI=useEvent((sceneId:string)=>{setScriptSceneId(sceneId);setAIKind('script');openModal('ai');}),recordFromScript=useCallback(()=>setMode('Record'),[]),openSetup=useEvent(()=>{setSetupStep(1);openModal('setup');}),openRecovery=useEvent(()=>openModal('media-recovery')),autoCutScene=useEvent((id:string)=>openSceneAction(id,'auto-cut')),visualizeScene=useEvent((id:string)=>openSceneAction(id,'visualize')),importForScene=useEvent((sceneId?:string)=>{beginImport();if(sceneId&&p)importScene.current={projectId:p.id,sceneId};});
 const openQuickAction=useEvent((kind:QuickActionRequest['kind'])=>{setQuickSceneId(undefined);openModal(kind);}),closeChat=useCallback(()=>setChatOpen(false),[]),clearSelection=useCallback(()=>{setSelectedIds(new Set());setSelected(null);},[]);
 const seekTranscript=useEvent((t:number)=>{setPlaying(false);seek(t);}),deleteTranscript=useEvent((selection:WordSelection)=>{setPlaying(false);let start=0;const label=p?cutWordsLabel(p,selection):'Cut';studio.change(draft=>{start=deleteTranscriptSelection(draft,selection).start;});seek(start);setSelected(null);setSelectedIds(new Set());setSelectedRange(null);
  // The cut is named, can be undone from the toast, and shows where it happened on the timeline for a few seconds.
  if(embedded){clubToast(label,{undo:()=>{studio.undo();setCutMarks([]);}});setCutMarks([start]);}else notify(label);});
 const retryTranscription=useEvent(async()=>{const id=p?.id,snapshot=await studio.flush();if(!snapshot||snapshot.id!==id)throw new Error('The project changed before transcription.');automation.merge(await api<AutomationJob>(`/projects/${id}/transcribe`,{force:true}));}),cancelTranscription=useEvent(async(job:AutomationJob)=>{automation.merge(await api<AutomationJob>(`/automation/${job.id}`,undefined,'DELETE'));});
 const toggleWaveforms=useCallback(()=>setShowWaveforms(v=>!v),[]),selectMany=useEvent((ids:string[])=>{setSelectedIds(new Set(ids));setSelected(ids[0]||null);if(!embedded&&ids.length&&p?.clips.some(c=>c.id===ids[0]))setPanel('Clip');}),splitClip=useEvent((id:string,at:number)=>split(at,id));
 const dropMedia=useEvent((id:string,track:TrackKind,at:number,layerId?:string)=>{const media=p?.media.find(m=>m.id===id);if(media)studio.change(p=>{const before=p.clips.length;insertMedia(p,[media],at,track);if(layerId){const ids=p.clips.slice(before).map(c=>c.id);if(ids.length)moveClipsToLayer(p,new Set(ids),ids[0],{kind:'existing',rowId:layerId});}});});
 const statusJobs=useRef(automation.jobs);if(!sameStatusJobs(statusJobs.current,automation.jobs))statusJobs.current=automation.jobs;
 const transcriptOpen=showTranscript&&!chatOpen;
 // Club Edit: the right side, the "Style & more" menu that replaces the panel rail, and the timeline's More menu.
 const sideView=panel?'panel':side==='auto'?'auto':side??'transcript';
 const openPanel=(name:Panel)=>{setPanel(name);},openSide=(next:'transcript'|'media')=>{setPanel(null);setSide(next);};
 /** A camera or screen dragged on the picture: every piece of that shot (same row, same place) moves with it, as one undo step. */
 const moveOnStage=useEvent((id:string,box:{x:number;y:number;width:number;height:number})=>studio.change(d=>{const c=d.clips.find(x=>x.id===id);if(!c)return;const o={...c.transform};for(const x of d.clips)if(x.track===c.track&&x.transform.x===o.x&&x.transform.y===o.y&&x.transform.width===o.width&&x.transform.height===o.height)Object.assign(x.transform,box);},{coalesce:`stage:${id}`}));
 const aimZoom=useEvent((id:string,where:{x:number;y:number;scale:number})=>studio.change(d=>{const z=d.zooms.find(x=>x.id===id);if(z)Object.assign(z,where);},{coalesce:`zoom-aim:${id}`}));
 const openItem=useEvent((id:string)=>{if(!p)return;select(id);setPanel(p.motion?.some(m=>m.id===id)?'Motion':p.elements.some(e=>e.id===id)?'Elements':p.zooms.some(z=>z.id===id)?'Zoom':p.captions.some(c=>c.id===id)?'Captions':'Clip');});
 const styleItems:MenuItem[]=[{header:'Style'},...panels.filter(({name})=>name!=='Automate').map(({name})=>({label:name,fn:()=>openPanel(name)})),'-',{label:'Transcript',fn:()=>openSide('transcript')},{label:'Media in this video',fn:()=>openSide('media')},{label:'Import media',icon:'Upload',fn:()=>beginImport()},'-',{label:'Settings…',icon:'Settings',fn:()=>openModal('settings')}];
 /* The Edit tool rail: named tools, each opens one panel on the right. Canvas and Cursor, which few videos need, sit behind More. */
 const railTools:Array<{id:string;label:string;tip:string;icon:typeof Film;open:()=>void}>=[
  {id:'transcript',label:'Transcript',tip:'Read the words and cut them from the video',icon:FileText,open:()=>openSide('transcript')},
  {id:'cut',label:'Cut',tip:'Find pauses, filler words and repeated lines to cut',icon:Scissors,open:()=>openAuto()},
  {id:'Captions',label:'Captions',tip:'Words on the picture as they are spoken',icon:Subtitles,open:()=>openPanel('Captions')},
  {id:'Layout',label:'Layout',tip:'How the camera and the screen share the picture',icon:LayoutTemplate,open:()=>openPanel('Layout')},
  {id:'Clip',label:'Clip',tip:'Speed, volume and look of the selected clip',icon:Film,open:()=>openPanel('Clip')},
  {id:'Zoom',label:'Zoom',tip:'Move in on part of the picture for a few seconds',icon:ZoomIn,open:()=>openPanel('Zoom')},
  {id:'Motion',label:'Graphics',tip:'Animated titles, lower thirds and labels',icon:Sparkles,open:()=>openPanel('Motion')},
  {id:'Music',label:'Music',tip:'A soundtrack under your voice',icon:Music,open:()=>openPanel('Music')}];
 const railActive=panel??(side==='auto'?'cut':side??'transcript');
 const moreItems:MenuItem[]=[{label:'Text and shapes',fn:()=>openPanel('Elements')},{label:'Media in this video',fn:()=>openSide('media')},'-',{label:'Canvas background',fn:()=>openPanel('Canvas')},{label:'Cursor',fn:()=>openPanel('Cursor')},'-',{label:'Import media',icon:'Upload',fn:()=>beginImport()}];
 const menuActions:TimelineMenuActions|null=p?{split:()=>split(),deleteClose:()=>deleteSelected(true),deleteKeepGap:()=>deleteSelected(false),duplicate:duplicateSelected,copy,paste,selectAll:()=>{const ids=[...p.clips,...p.elements,...p.captions,...p.zooms].map(x=>x.id);setSelectedIds(new Set(ids));setSelected(ids[0]||null);},
  addMarker:addMarkerAtPlayhead,previousCut:()=>boundary(-1),nextCut:()=>boundary(1),toggleLink,linked:selectionLinked,blade:tool==='blade',toggleBlade:()=>setTool(v=>v==='blade'?'select':'blade'),waveforms:showWaveforms,toggleWaveforms:()=>setShowWaveforms(v=>!v),
  addVideoLayer:()=>studio.change(d=>{addTimelineLayer(d,'video');}),addAudioLayer:()=>studio.change(d=>{addTimelineLayer(d,'audio');})}:null;
 const timelineItems:MenuItem[]=menuActions?timelineMoreItems(menuActions):[],contextItems:MenuItem[]=menuActions?timelineContextItems(menuActions):[];
 const viewItems:MenuItem[]=p?[{label:'Snap to edges',check:p.settings.snap,fn:()=>studio.change(d=>{d.settings.snap=!d.settings.snap;})},{label:'Follow the playhead while playing',check:follow,fn:()=>setFollow(v=>!v)},'-',{header:'Timeline actions'},...timelineItems,'-',{label:'Keyboard shortcuts',fn:()=>setShortcutsOpen(v=>!v)}]:[];
 /* The companion docked beside Edit: it reads the playhead and the selection when a message is sent, previews a card on the stage
    (cuts with the same before/after playback as Auto-edit, other changes as the frame after them) and applies a card as one undo step. */
 const editorContext=useEvent(():EditorContext=>{
  const chosen=p?p.clips.filter(c=>selection.has(c.id)):[];
  const items:SelectedItem[]=p?[...p.captions.filter(c=>selection.has(c.id)).map(c=>({id:c.id,kind:'caption' as const,start:c.start,end:c.end,text:c.text.slice(0,200)})),
   ...p.elements.filter(e=>selection.has(e.id)).map(e=>({id:e.id,kind:'text' as const,start:e.start,end:e.start+e.duration,...(e.text?{text:e.text.slice(0,200)}:{})})),
   ...p.zooms.filter(z=>selection.has(z.id)).map(z=>({id:z.id,kind:'zoom' as const,start:z.start,end:z.start+z.duration})),
   ...(p.motion??[]).filter(m=>selection.has(m.id)).map(m=>({id:m.id,kind:'motion' as const,start:m.start,end:m.start+m.duration,text:`${MOTION_TEMPLATES[m.template]?.label??'Motion'}: ${motionText(m)}`.slice(0,200)})),
   ...(p.markers??[]).filter(m=>selection.has(m.id)).map(m=>({id:m.id,kind:'marker' as const,start:m.time,end:m.time}))].slice(0,100).map(i=>({...i,start:roundTime(i.start),end:roundTime(i.end)})):[];
  const spans=[...chosen.map(c=>[c.start,c.start+clipDuration(c)]),...items.map(i=>[i.start,i.end])];
  return {playhead:roundTime(playhead.get()),selection:chosen.map(c=>c.id),...(items.length?{items}:{}),...(spans.length?{range:{start:roundTime(Math.min(...spans.map(s=>s[0]))),end:roundTime(Math.max(...spans.map(s=>s[1])))}}:{})};
 });
 const previewEdit=useEvent((action:EditAction|null,key:string,options:EditOptions={}):string|undefined=>{
  if(!action){setPreview(current=>current?.key===key?null:current);return;}
  if(!p)return 'Open the video first.';
  const problem=editActionProblem(p,action,options);if(problem)return problem;
  setPanel(null);if(side==='auto')setSide('transcript');setPlaying(false);
  const label=ACTION_TITLE[action.type],ranges=editRanges(p,action,options);
  if(ranges){const merged=mergeRanges(ranges),total=rangesSeconds(merged);showPreview({key,label,summary:`${merged.length} ${merged.length===1?'cut':'cuts'} · ${seconds(total)} shorter`,ranges:merged,review:cutReview(p,merged,label)});return;}
  let after:Project;try{after=applyProjectChange(p,d=>{applyEditAction(d,action,options);});}catch(e){return (e as Error).message;}
  // A motion block is shown a second in, once its way in has played; anything else just after it starts.
  const at='time' in action?action.time:'start' in action&&action.start!==undefined?action.start:'at' in action?action.at:undefined;const motion=action.type==='add_motion_block'||action.type==='update_motion_block';if(at!==undefined)seek(at+(motion?Math.min(1,(('duration' in action&&action.duration)||2)/2):action.type==='remove_motion_block'?0:.05));
  showPreview({key,label,summary:describeEditAction(action,p),after});return;
 });
 /** Pointing at a graphic in the Graphics panel shows it on the video at the playhead (a second in, once its way in has played); moving away puts the playhead back. */
 // The timeline opens fitted to the whole video, once per video, so it does not run on empty past the end.
 const fittedFor=useRef<string|null>(null);
 useEffect(()=>{if(!p||!embedded||duration<=0||fittedFor.current===p.id)return;fittedFor.current=p.id;const frame=requestAnimationFrame(()=>timelineControls.current?.fit());return()=>cancelAnimationFrame(frame);},[p?.id,embedded,duration>0]);
 const hoverFrom=useRef<number|null>(null);
 const hoverMotion=useEvent((template:MotionTemplateId|null)=>{
  if(!template||!p){setPreview(current=>{if(current?.key.startsWith('hover:')&&hoverFrom.current!==null){seek(hoverFrom.current);hoverFrom.current=null;return null;}return current?.key.startsWith('hover:')?null:current;});return;}
  const start=playhead.get(),spec=MOTION_TEMPLATES[template];
  let after:Project;try{after=applyProjectChange(p,d=>{const r=addMotionBlock(d,newMotionBlock(template,start,makeId()),true,true);if('problem' in r)throw Error(r.problem);});}catch{return;}
  if(hoverFrom.current===null)hoverFrom.current=start;
  setPlaying(false);seek(start+Math.min(1,spec.defaultDuration/2));
  showPreview({key:`hover:${template}`,label:spec.label,summary:'How it looks at the playhead. Click to add it.',after});
 });
 const describeEdit=useEvent((action:EditAction)=>describeEditAction(action,p??undefined));
 const estimateEdit=useEvent((action:EditAction,options:EditOptions={})=>p?editEstimate(p,action,options):undefined);
 const editorFlush=useEvent(()=>studio.flush());
 const onEditor=embedded?.onEditor,editOpen=Boolean(p&&embedded&&mode==='Edit'&&p.id===embedded.projectId);
 useEffect(()=>{if(!onEditor||!editOpen)return;onEditor({context:editorContext,flush:editorFlush,preview:previewEdit,estimate:estimateEdit,describe:describeEdit,commit:studio.commitServer});return()=>onEditor(null);},[onEditor,editOpen,studio.commitServer]);
 const onEditState=embedded?.onEditState,selectedCount=p?selectionCount(p.clips,selection):selection.size,previewKey=preview?.key,timelineVersion=p?.updatedAt;
 const dislikes=p?.markers?.filter(m=>m.tag==='dislike').length??0;
 useEffect(()=>{if(editOpen)onEditState?.({selected:selectedCount,previewKey,version:timelineVersion,notes:dislikes});},[onEditState,editOpen,selectedCount,previewKey,timelineVersion,dislikes]);
 // Undo, redo and history sit in the video's header, beside the steps; the header leaves a slot for them while Edit is open.
 const [toolsHost,setToolsHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{setToolsHost(editOpen?document.getElementById('ws-edit-tools'):null);},[editOpen]);
  const clubEditView=()=>{if(!p||!embedded)return null;const zoomRange=zoomSlider(timelineControls.current?.width()||1000,duration);const stageProject=preview?.after&&previewPhase==='after'?preview.after:p;return <div className={`edit-workspace club-edit ${sideView?'has-side':''}`}>
  <nav className="club-rail" aria-label="Edit tools">
   {railTools.map(({id,label,tip,icon:Icon,open})=><button key={id} data-tool={id} type="button" aria-pressed={railActive===id} title={tip} onClick={open}><Icon size={20}/>{label}</button>)}
   <span className="club-rail-grow"/>
   <Menu label="More edit tools" align="left" width={210} items={moreItems} button={(toggle,open)=><button type="button" data-tool="more" aria-haspopup="menu" aria-expanded={open} aria-pressed={['Elements','Canvas','Cursor','media'].includes(railActive)} title="Text and shapes, media, background and cursor" onClick={toggle}><MoreHorizontal size={20}/>More</button>}/>
  </nav>
  <main className="club-edit-stage">
   {/* The player always stays; a preview is a badge over it, and a cut's before/after plays in a small inset in the corner. */}
   <Stage project={stageProject} playhead={playhead} playing={playing} playbackRate={playbackRate} onSelect={select} onImport={importMedia} selected={selected} onTransform={moveOnStage} onZoom={aimZoom}/>
   {preview?.review&&<div className="club-preview-inset" role="region" aria-label="Before and after this cut"><CutPlayback key={preview.key} review={preview.review} labels={{before:'Before',after:'After'}} note="This preview does not change your video."/></div>}
   {preview&&<div className="club-preview-badges" role="status"><span className="club-pill">Previewing at lower quality</span><span className="club-pill">{preview.label} · {preview.summary}</span>
    {preview.after&&<span className="club-seg" role="group" aria-label="Before or after">{(['before','after'] as const).map(v=><button key={v} type="button" aria-pressed={previewPhase===v} onClick={()=>setPreviewPhase(v)}>{v==='before'?'Before':'After'}</button>)}</span>}</div>}
  </main>
  <div className="club-edit-side" hidden={!sideView}>
   {sideView==='panel'&&panel&&<Inspector project={p} panel={panel} selected={selected} playhead={playhead} change={studio.change} select={select} onImport={beginImport} onAI={openAI} club onClose={()=>setPanel(null)} onNotice={refuse} onHoverMotion={hoverMotion}/>}
   {sideView==='auto'&&<EditAutoSheet key={`${p.id}:${autoInitial??''}`} project={p} jobs={automation.jobs} merge={automation.merge} reload={automation.reload} flush={studio.flush} change={studio.change} refresh={studio.reload} onPreview={showPreview} onClose={()=>setSide('transcript')} onChanged={embedded.onChanged} notify={notify} initial={autoInitial}/>}
   {sideView==='media'&&<aside className="club-sheet club-media"><header><b>Media in this video</b><button type="button" className="club-sheet-close" aria-label="Close media" onClick={()=>setSide('transcript')}><X size={16}/></button></header><p className="club-sheet-hint">Drag onto a row of the timeline, or click to add at the playhead.</p>
    <div className="media-grid">{p.media.map(m=><button className="media-card" key={m.id} draggable onDragStart={e=>e.dataTransfer.setData('application/sceneforge-media',m.id)} onClick={()=>studio.change(d=>insertMedia(d,[m],playhead.get()))}>{m.kind==='audio'?<div className="media-audio"><AudioLines/></div>:<img src={`/api/media/${m.id}/thumbnail`} alt="" loading="lazy"/>}<b>{m.name}</b><small>{rulerLabel(m.duration)} · {m.kind}</small></button>)}</div>
    <footer><button type="button" className="button compact" onClick={()=>openModal('media-recovery')}>Locate media</button><button type="button" className="button compact" onClick={()=>beginImport()}><Plus size={13}/>Import</button></footer></aside>}
   <Keep visible={sideView==='transcript'}><aside className="transcript-panel club-sheet"><header><b>Transcript</b><span className="club-sheet-sub">Select words to cut them · double-click a caption to fix it</span><button type="button" className="club-sheet-close" aria-label="Close transcript" onClick={()=>setSide(null)}><X size={16}/></button></header>
    <TranscriptionStatus jobs={statusJobs.current} enabled={automaticTranscription.enabled} error={automation.error} onRetry={retryTranscription} onCancel={cancelTranscription} onSetup={()=>openModal('settings-ai')} captionCount={p.captions.length}/>
    {p.captions.length?<Transcript project={p} playhead={playhead} onSeek={seekTranscript} onUndo={studio.undo} onRedo={studio.redo} onDelete={deleteTranscript}/>:<div className="empty-state"><Subtitles/><h3>Edit spoken words</h3><p>A transcript lets you find words and cut them out of the video.</p></div>}</aside></Keep>
  </div>
  <div className="club-timeline-bar" role="toolbar" aria-label="Timeline">
   <button type="button" className="club-play" aria-label={playing?'Pause':'Play'} title="Play or pause (Space)" disabled={duration<=0} onClick={()=>setPlaying(v=>!v)}>{playing?<Pause size={16} fill="currentColor"/>:<Play size={16} fill="currentColor"/>}</button>
   <ClubTime playhead={playhead} duration={duration} fine={showTenths((timelineControls.current?.width()||1000)/zoom)}/>
   <span className="club-bar-sep" aria-hidden/>
   <button type="button" className="club-tool" title="Split at the playhead (S)" onClick={()=>split()}><Scissors size={15}/>Split</button>
   <button type="button" className="club-tool" title="Delete and close the gap (Delete). Shift+Delete keeps the gap." disabled={!selection.size} onClick={()=>deleteSelected(true)}><Trash2 size={15}/>Delete</button>
   <button type="button" className="club-tool" title="Leave a note for yourself or Claude at the playhead (M)" onClick={addMarkerAtPlayhead}><Plus size={15}/>Note</button>
   <span className="club-bar-grow"/>
   {/* The timeline's zoom, always in sight: out, the slider, in, and Fit the whole video. ⌘-scroll on the timeline works too. */}
   <div className="club-zoom" role="group" aria-label="Timeline zoom">
    <button type="button" className="club-zoom-step" aria-label="Zoom out" title="Zoom out (⌘ −)" onClick={()=>setZoom(v=>clampScale(v/1.5))}><Minus size={14}/></button>
    <input type="range" aria-label="Timeline zoom" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step} value={zoomRange.fromScale(zoom)} onChange={e=>setZoom(zoomRange.toScale(Number(e.target.value)))}/>
    <button type="button" className="club-zoom-step" aria-label="Zoom in" title="Zoom in (⌘ +)" onClick={()=>setZoom(v=>clampScale(v*1.5))}><Plus size={14}/></button>
    <button type="button" className="club-tool" title="Fit the whole video" onClick={()=>timelineControls.current?.fit()}><Maximize2 size={14}/>Fit</button>
   </div>
   <Menu label="View" align="right" width={260} items={viewItems} button={(toggle,open)=><button type="button" className="club-tool" aria-haspopup="menu" aria-expanded={open} title="Snapping, following the playhead, shortcuts and more timeline actions" onClick={toggle}>View<ChevronDown size={13}/></button>}/>
   {shortcutsOpen&&<ShortcutsPopover onClose={closeShortcuts}/>}
  </div>
  {note&&(()=>{const m=p.markers?.find(x=>x.id===note.id);return m?<MarkerNote time={secondsLabel(m.time)} onNudge={seconds=>studio.change(d=>moveMarker(d,note.id,Math.max(0,Math.min(Math.round(projectDuration(d)),Math.round(m.time)+seconds))))} name={m.name??''} tag={m.tag} anchor={note} onChange={patch=>studio.change(d=>noteMarker(d,note.id,patch),{coalesce:`note:${note.id}`})} onDelete={()=>{studio.change(d=>removeMarker(d,note.id));setNote(null);}} onClose={()=>setNote(null)}/>:null;})()}
  <TimelineResize storageKey="creatorclub.timeline-height" auto={timelineAuto}/>
  <TimelineClub project={p} playhead={playhead} scale={zoom} autoFit={!kept} onScale={setZoom} selectedIds={selection} onSelectMany={selectMany} onSeek={timelineSeek.run} change={studio.change} onDropMedia={dropMedia} tool={tool} onSplit={splitClip} follow={follow} showWaveforms={showWaveforms} previewRanges={preview?.ranges} previewAfter={preview?.after&&previewPhase==='after'?preview.after:null} onOpenMarker={openNote} cutMarks={cutMarks} onOpen={openItem} onContextMenu={openContext} onNotice={notify} controls={timelineControls}/>
  {contextAt&&<ContextMenu at={contextAt} items={contextItems} onClose={closeContext}/>}
  {toolsHost&&createPortal(<>
   <button type="button" aria-label="Undo" title="Undo (⌘Z)" disabled={!studio.canUndo} onClick={studio.undo}><Undo2 size={17}/></button>
   <button type="button" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!studio.canRedo} onClick={studio.redo}><Redo2 size={17}/></button>
   <button type="button" aria-label="Version history" title="Earlier versions of this video" onClick={()=>{void studio.flush().then(()=>openModal('history')).catch(e=>studio.setError(e.message));}}><History size={17}/></button></>,toolsHost)}
 </div>;};
 const timelineAuto=useMemo(()=>p&&embedded?Math.min(420,rowsHeight(usedRows(p))):undefined,[p?.clips,p?.elements,p?.captions,p?.zooms,p?.timelineLayers,p?.markers,embedded]);
 const clubEdit=clubEditView();
 useEffect(()=>{setShowTranscript(Boolean(p?.captions.length));},[p?.id,Boolean(p?.captions.length)]);

 return <div className={`app-shell ${p?'has-project':''} ${window.sceneForge?'desktop':''}`} data-mode={p?mode:undefined}>
  <header className="titlebar">{!embedded&&<button className="brand" onClick={()=>{setPlaying(false);void studio.close();}} aria-label="SceneForge home"><span className="brand-symbol"><span/><span/><span/></span><strong>SceneForge</strong></button>}
   {p&&<div className="document-tab"><input aria-label="Project name" value={p.name} onChange={e=>change(p=>{p.name=e.target.value;},{coalesce:'project.name'})}/><span className="document-save" title={studio.saveState} aria-label={studio.saveState}>{studio.saveState==='Saved locally'?<Check size={12}/>:<Clock3 size={12}/>}</span><button className="icon-button" aria-label="Close project" onClick={leaveProject}><X size={13}/></button></div>}
   <div className="titlebar-actions"><button className="icon-button" aria-label="Settings" onClick={()=>openModal('settings')}><Settings2 size={18}/></button></div>
  </header>
  {p&&<header className="project-header">{mode==='Edit'&&(embedded?<div hidden><EditSuggestion key={p.id} onChanged={embedded.onChanged} project={p} jobs={automation.jobs} merge={automation.merge} reload={automation.reload} flush={studio.flush} refresh={studio.reload} onReview={()=>openAuto('pauses')}/></div>:<QuickActionButtons jobs={statusJobs.current} onOpen={openQuickAction}/>)}{mode==='Record'&&<div id="recording-presets-slot"/>}{!(embedded&&mode==='Edit')&&<div className="project-header-controls"><button className="icon-button" aria-label="Undo" title="Undo (⌘Z)" disabled={!studio.canUndo} onClick={studio.undo}><Undo2 size={17}/></button><button className="icon-button" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!studio.canRedo} onClick={studio.redo}><Redo2 size={17}/></button><button className="icon-button" aria-label="Version history" onClick={()=>{void studio.flush().then(()=>openModal('history')).catch(e=>studio.setError(e.message));}}><History size={17}/></button>{embedded?mode==='Edit'&&<>
   <ClubExport key={p.id} project={p} flush={studio.flush} onExported={embedded.onExported}/></>:<button className="button primary export-button" onClick={()=>openModal('export')}>Export</button>}</div>}</header>}
  {!p||embedded&&p.id!==embedded.projectId?!embedded&&<Home onTrash={()=>openModal('trash')} onError={studio.setError} onRecovered={async media=>{const project=await api<Project>('/projects',{name:`Recovered ${media.name}`});studio.select(project);studio.change(p=>insertMedia(p,[media]));setMode('Edit');notify('Recording recovered into a new project.');}} projects={studio.projects} loading={studio.loading} onNew={()=>{setNewName('');openModal('new');}} onQuick={()=>{void startWith('Record',true).catch(e=>studio.setError(e.message));}} onOpen={id=>void studio.open(id)} onImport={()=>openModal('import-borumi')} onImportMedia={()=>{void startWith('Edit',true).then(()=>beginImport()).catch(e=>studio.setError(e.message));}} onDuplicate={id=>void api<Project>(`/projects/${id}/duplicate`,{}).then(()=>studio.refresh()).then(()=>notify('Project duplicated.')).catch(e=>studio.setError(e.message))} onDelete={id=>void api(`/projects/${id}`,undefined,'DELETE').then(()=>studio.refresh()).then(()=>notify('Project moved to local trash.')).catch(e=>studio.setError(e.message))}/>:<>
  <div className="workspace-nav"><div className="workspace-back">{!embedded&&<button className="back-link" onClick={()=>{setPlaying(false);void studio.close();}}><ChevronLeft size={16}/>Projects</button>}{mode==='Edit'&&!embedded&&<button className={`button subtle agent-chat-toggle ${chatOpen?'is-active':''}`} aria-label="Edit with Claude" aria-expanded={chatOpen} onClick={()=>setChatOpen(v=>!v)}><Sparkles size={15}/>Ask Claude</button>}</div>{!embedded&&<div className="workflow-tabs" role="tablist" aria-label="Workspace">{(['Script','Record','Edit'] as const).map((m,i)=>{const Icon=[FileText,Video,Scissors][i];return <button role="tab" aria-selected={mode===m} className={mode===m?'active':''} key={m} onClick={()=>{setMode(m);setPlaying(false);}}><span className="workflow-icon"><Icon size={22}/></span>{m}<ChevronRight className="workflow-chevron" size={14}/></button>;})}</div>}<div className="workspace-nav-right">{mode!=='Edit'&&<button className="button subtle" onClick={()=>openModal('teleprompter')}><FileText size={14}/>Teleprompter</button>}{!(embedded&&mode==='Edit')&&<button className="button subtle" onClick={()=>beginImport()}><Upload size={14}/>Import</button>}</div></div>
  {studio.conflicted&&<div className="import-warning"><span>{embedded?'This video':'This project'} changed in another window. Autosave is paused to protect those edits.</span><button onClick={()=>void studio.reload().catch(e=>studio.setError(e.message))}>Reload server version <ArrowRight size={13}/></button></div>}
  <MediaRecoveryNotice project={p} refreshKey={recoveryRefresh} onOpen={openRecovery}/>
  {(p.importWarnings?.length??0)>0&&<div className="import-warning"><span>{p.importWarnings!.length} import {p.importWarnings!.length===1?'notice':'notices'}. Some original features need manual review.</span><button onClick={()=>openModal('import-notices')}>View details <ArrowRight size={13}/></button></div>}
  <Keep visible={mode==='Script'}><ScriptWorkspace project={p} onError={studio.setError} change={studio.change} onAdd={addScene} onAI={openScriptAI} onRecord={recordFromScript}/></Keep>
  {embedded?.onSceneChange&&mode==='Edit'&&p&&<SceneFollower playhead={playhead} scenes={p.scenes} onScene={embedded.onSceneChange}/>}
  {mode==='Record'&&<RecordingWorkspace key={p.id} registerLeaveGuard={embedded?.registerLeaveGuard} onAutoCut={autoCutScene} onVisualize={visualizeScene} onSetup={openSetup} onEdit={embedded?undefined:()=>{setPlaying(false);setMode('Edit');}} club={Boolean(embedded)} selectSceneId={embedded?.sceneId} selectNonce={embedded?.sceneNonce} onSceneChange={embedded?.onSceneChange} onProgress={embedded?.onProgress} project={p} change={studio.change} commit={commitRecordingChange} onRecorded={onRecorded} onError={studio.setError} onImport={importForScene}/>}
  {embedded?<Keep visible={mode==='Edit'}>{clubEdit}</Keep>:<Keep visible={mode==='Edit'}><div className={`edit-workspace ${transcriptOpen?'has-transcript':''} ${panel?'has-inspector':''}`}>
   <div className="editor-upper"><nav className="panel-rail">{panels.map(({name,icon:Icon})=><button key={name} className={panel===name?'active':''} aria-expanded={panel===name} onClick={()=>setPanel(panel===name?null:name)}><span className="nav-icon"><Icon size={18}/></span><span>{name}</span></button>)}</nav>{panel&&<Inspector project={p} panel={panel} selected={selected} playhead={playhead} change={studio.change} select={select} onImport={beginImport} onAI={openAI} club={Boolean(embedded)}/>}<main className="preview-workspace"><div className="preview-toolbar"><span><span className="preview-status"/>PREVIEW</span><div><button className={`button subtle compact ${showLibrary?'is-active':''}`} onClick={()=>setShowLibrary(v=>!v)}><FolderOpen size={14}/>Media <small>{p.media.length}</small></button><button className={`button subtle compact ${showTranscript?'is-active':''}`} onClick={()=>setShowTranscript(v=>!v)}><Subtitles size={14}/>Transcript</button></div></div>{showLibrary&&<div className="media-library"><div className="library-title"><h3>{embedded?'Media in this video':'Project media'}</h3><button className="button compact" onClick={()=>openModal('media-recovery')}>Locate media</button><button className="button primary compact" onClick={()=>beginImport()}><Plus size={13}/>Import</button></div><p className="hint">Drag files onto a timeline track, or click to add them.</p><div className="media-grid">{p.media.map(m=><button className="media-card" key={m.id} draggable onDragStart={e=>e.dataTransfer.setData('application/sceneforge-media',m.id)} onClick={()=>studio.change(p=>insertMedia(p,[m],playhead.get()))}>{m.kind==='audio'?<div className="media-audio"><AudioLines/></div>:<img src={`/api/media/${m.id}/thumbnail`} alt="" loading="lazy"/>}<b>{m.name}</b><small>{timecode(m.duration)} · {m.kind}</small></button>)}</div>{!p.media.length&&<div className="empty-state"><Film/><h3>A home for your footage.</h3><p>Import your first clip to begin.</p></div>}</div>}<Keep visible={!showLibrary}><Stage project={p} playhead={playhead} playing={playing} playbackRate={playbackRate} onSelect={select} onImport={importMedia}/></Keep><div className="transport"><div className="transport-time"><PlayheadField playhead={playhead} duration={duration} onSeek={seek}/><span>/ {timecode(duration)}</span></div><div className="transport-buttons"><button className="icon-button" aria-label="Go to start" onClick={()=>seek(0)}><SkipBack size={16}/></button><button className="play-button" aria-label={playing?'Pause':'Play'} disabled={duration<=0} onClick={()=>setPlaying(v=>!v)}>{playing?<Pause size={19} fill="currentColor"/>:<Play size={19} fill="currentColor"/>}</button><button className="icon-button" aria-label="Go to end" onClick={()=>{setPlaying(false);seek(Math.max(0,duration-.04));}}><SkipForward size={16}/></button></div><button className="playback-rate" aria-label="Playback speed" title="Playback speed (L faster, K pause and reset)" onClick={()=>setPlaybackRate(v=>v>=4?.5:v*2)}>{playbackRate}×</button><span className="transport-shortcut"><kbd>space</kbd> to play</span></div></main><AgentChat key={p.id} project={p} selectedIds={selectedIds} range={selectedRange} onRange={setSelectedRange} getPlayhead={playhead.get} visible={chatOpen} onClose={closeChat} onClearSelection={clearSelection} flush={studio.flush} onError={studio.setError}/><Keep visible={transcriptOpen}><aside className="transcript-panel"><header><h3>Transcript</h3><button className="icon-button" aria-label="Close transcript" onClick={()=>setShowTranscript(false)}><X size={15}/></button></header><TranscriptionStatus jobs={statusJobs.current} enabled={automaticTranscription.enabled} error={automation.error} onRetry={retryTranscription} onCancel={cancelTranscription} onSetup={()=>openModal('settings-ai')} captionCount={p.captions.length}/>{p.captions.length?<Transcript project={p} playhead={playhead} onSeek={seekTranscript} onUndo={studio.undo} onRedo={studio.redo} onDelete={deleteTranscript}/>:<div className="empty-state"><Subtitles/><h3>Edit spoken words</h3><p>Create a transcript to find words and remove them from the video. Caption appearance is controlled separately in Captions.</p></div>}</aside></Keep></div>
   <div className="timeline-toolbar"><div><span className="timeline-title">TIMELINE</span><span className="divider"/><button className={`icon-button ${tool==='select'?'selected-tool':''}`} aria-label="Select tool" aria-pressed={tool==='select'} title={`Select tool (${shortcutLabel('selectTool',shortcutOverrides)})`} onClick={()=>setTool('select')}><MousePointer2 size={16}/></button><button className={`icon-button ${tool==='blade'?'selected-tool':''}`} aria-label="Blade tool" aria-pressed={tool==='blade'} title={`Blade tool (${shortcutLabel('bladeTool',shortcutOverrides)}); click a clip to split`} onClick={()=>setTool('blade')}><Scissors size={16}/></button><button className="icon-button" aria-label="Duplicate" title="Duplicate selected (⌘D)" disabled={!selected} onClick={duplicateSelected}><Copy size={15}/></button><button className="icon-button" aria-label="Delete" title="Delete selected (Delete)" disabled={!selected} onClick={()=>deleteSelected()}><Trash2 size={15}/></button><span className="divider"/><button className={`icon-button ${p.settings.snap?'is-active':''}`} aria-label="Toggle snapping" aria-pressed={p.settings.snap} title={`Toggle snapping (${shortcutLabel('toggleSnapping',shortcutOverrides)})`} onClick={()=>studio.change(p=>{p.settings.snap=!p.settings.snap;})}><Magnet size={16}/></button><button className={`scrub-toggle ${scrubbing?'active':''}`} aria-label="Toggle scrubbing" aria-pressed={scrubbing} title={`Toggle scrubbing (${shortcutLabel('toggleScrubbing',shortcutOverrides)})`} onClick={()=>setScrubbing(v=>!v)}>Scrub</button><label className="ripple-toggle"><input type="checkbox" checked={p.settings.ripple} onChange={e=>studio.change(p=>{p.settings.ripple=e.target.checked;})}/>Ripple</label></div><div><button className="icon-button" title="Zoom timeline out" onClick={()=>setZoom(v=>Math.max(8,v/1.5))}><Minus size={15}/></button><input aria-label="Timeline zoom" type="range" min={8} max={200} step="any" value={zoom} onChange={e=>setZoom(+e.target.value)}/><button className="icon-button" title="Zoom timeline in" onClick={()=>setZoom(v=>Math.min(200,v*1.5))}><Plus size={15}/></button><button className="icon-button" title="Fit timeline" onClick={()=>setZoom(Math.max(8,Math.min(150,(window.innerWidth-220)/Math.max(10,duration+2))))}><Maximize2 size={15}/></button></div></div>
   <TimelineResize/>
   <Timeline showWaveforms={showWaveforms} onToggleWaveforms={toggleWaveforms} onSceneAction={openSceneAction} selectedRange={selectedRange} onRange={setSelectedRange} onSelectMany={selectMany} tool={tool} scrubbing={scrubbing&&!playing} selectedIds={selectedIds} onSplit={splitClip} onZoom={setZoom} project={p} playhead={playhead} zoom={zoom} selected={selected} onSelect={select} onSeek={timelineSeek.run} change={studio.change} onDropMedia={dropMedia}/>
   <footer className="editor-status"><span><Check size={12}/>{studio.saveState}</span><span>{p.clips.length} clips · {p.scenes.length} scenes · {timecode(duration)}<span className="status-key">{p.canvas.fps} FPS</span></span></footer>
  </div></Keep>}
  </>}
  <input className="hidden" ref={fileInput} aria-label="Import media files" type="file" multiple accept="video/*,audio/*,image/*,.json" onChange={e=>{if(e.target.files?.length)void uploadFiles(e.target.files);}}/>
  {modal==='trash'&&<TrashDialog onClose={()=>setModal(null)} onRestored={result=>{void studio.refresh().catch(e=>studio.setError(e.message));notify(result.restoredAsCopy?'Restored a separate project copy.':'Project restored.');}} onOpen={id=>{setModal(null);void studio.open(id);}}/>}
  {modal==='media-recovery'&&p&&<MediaRecoveryDialog key={p.id} project={p} flush={studio.flush} runOperation={studio.runProjectOperation} onClose={()=>{setModal(null);setRecoveryRefresh(v=>v+1);}} onChanged={()=>setRecoveryRefresh(v=>v+1)}/>}
  {modal==='new'&&<Modal title="A new story" subtitle="Give your next project a name. You can change it anytime." onClose={()=>setModal(null)}><form onSubmit={e=>{e.preventDefault();void studio.create(newName.trim()||'Untitled story').then(()=>setModal(null));}}><Field label="Project name"><input autoFocus placeholder="My next great video" value={newName} onChange={e=>setNewName(e.target.value)}/></Field><footer className="modal-actions"><button type="button" className="button" onClick={()=>setModal(null)}>Cancel</button><button className="button primary" type="submit">Create project<ArrowRight size={15}/></button></footer></form></Modal>}
  {(modal==='import'||modal==='import-borumi')&&<Modal title={modal==='import-borumi'?'Bring your project over':'Add to your story'} subtitle="Import a copy. Your original files stay untouched." onClose={()=>setModal(null)}><div className={`upload-area ${importBusy?'busy':''}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(p&&e.dataTransfer.files.length)void uploadFiles(e.dataTransfer.files);}}>{importBusy?<LoaderCircle className="spin" size={29}/>:<Upload size={29}/>}<h3>{importBusy?'Preparing your media…':modal==='import-borumi'?'Import a Borumi project':'Drop your files here'}</h3><p>{modal==='import-borumi'?'Choose a .bmprojbundle directory or .bmproj file.':embedded?'Video, audio or images.':'Video, audio, images, or a SceneForge project JSON.'}</p>{modal==='import'&&<button className="button primary" disabled={importBusy} onClick={()=>fileInput.current?.click()}>Choose files</button>}</div><Field label={modal==='import-borumi'?'Local Borumi project path':'Or import absolute file paths (one per line)'}><textarea rows={2} value={importPaths} placeholder={modal==='import-borumi'?'/Users/you/Borumi Projects/My Video.bmprojbundle':'/Users/you/Movies/recording.mp4'} onChange={e=>setImportPaths(e.target.value)}/></Field><footer className="modal-actions"><button className="button" onClick={()=>setModal(null)}>Cancel</button>{modal==='import'&&!embedded&&<button className="button" disabled={importBusy} onClick={()=>{openModal('import-borumi');setImportPaths('');}}>Borumi project</button>}<button className="button primary" disabled={importBusy||(!importPaths&&!window.sceneForge)} onClick={()=>void localImport(modal==='import-borumi'?'borumi':'media')}><FolderOpen size={15}/>{window.sceneForge?'Choose locally':'Import path'}</button></footer></Modal>}
  {modal==='setup'&&<Onboarding brand={embedded?'CreatorClub':'SceneForge'} initialStep={setupStep} onClose={()=>{setModal(null);setSetupStep(0);}} onRecord={()=>startWith('Record')} onImport={()=>startWith('Edit')}/>}
  {(modal==='settings'||modal==='settings-mcp'||modal==='settings-ai')&&<SettingsDialog onSetup={()=>openModal('setup')} initialTab={modal==='settings-mcp'?'AI control · MCP':modal==='settings-ai'?'AI & transcription':'General'} project={p} change={studio.change} capabilities={studio.capabilities} onClose={()=>setModal(null)} onError={studio.setError}/>}
  {modal==='export'&&p&&<ExportDialog key={p.id} project={p} flush={studio.flush} onBorumi={embedded?undefined:()=>openModal('export-borumi')} onClose={()=>setModal(null)} onError={studio.setError}/>}
  {modal==='export-borumi'&&p&&<BorumiExportDialog key={p.id} project={p} flush={studio.flush} onClose={()=>setModal(null)} onBack={()=>openModal('export')} onImport={()=>{setImportPaths('');openModal('import-borumi');}}/>}
  {modal==='history'&&p&&<HistoryDialog key={p.id} project={p} onRestore={async(historyId,reviewedRevision)=>{await studio.runProjectOperation(p.id,async(_snapshot,revision)=>{if(revision.replaceAll('"','')!==reviewedRevision.replaceAll('"',''))throw new Error('The project changed after history opened. Refresh history before restoring.');const restored=await apiResult<Project>(`/projects/${p.id}/restore`,{historyId},'POST',{'If-Match':revision});return {project:restored.data,revision:restored.etag||await projectRevision(restored.data)};});}} onClose={()=>setModal(null)} onError={studio.setError}/>}
  {modal==='ai'&&p&&<AIDialog key={`${p.id}:${aiKind}:${scriptSceneId??"project"}`} project={p} sceneId={scriptSceneId} kind={aiKind} change={studio.change} flush={studio.flush} onClose={()=>setModal(null)} onError={studio.setError}/>}
  {(modal==='auto-cut'||modal==='visualize')&&p&&<QuickActionDialog key={`${p.id}:${modal}:${quickSceneId??'project'}`} project={p} kind={modal} sceneId={quickSceneId} jobs={automation.jobs} merge={automation.merge} flush={studio.flush} reload={automation.reload} club={Boolean(embedded)} onClose={()=>setModal(null)}/>}
  {modal==='teleprompter'&&p&&<Teleprompter project={p} change={studio.change} sceneId={embedded?.sceneId} onClose={()=>setModal(null)}/>}
  {modal==='import-notices'&&p&&<Modal title="Import details" subtitle="Supported edits were converted into a new independent project." onClose={()=>setModal(null)} wide><div className="import-notices-list">{p.importWarnings?.map((w,i)=><p key={i}>{w}</p>)}</div></Modal>}
  {studio.error&&!openFailed&&<div className="error-toast" role="alert"><span><b>Something needs your attention</b>{studio.error}</span><button className="icon-button" aria-label="Dismiss error" onClick={()=>studio.setError('')}><X size={17}/></button></div>}
  <Toasts bind={toastRef}/>
 </div>;
}
