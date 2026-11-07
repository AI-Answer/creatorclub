import {useCallback,useEffect,useRef,useState} from 'react';
import type {PlanJobKind,ResearchTile,Video,VideoScene} from '../../../shared/club';
import {clubFetch} from '../api';
import {isStartedJob,watchJob} from '../jobs';
import {ErrorLine} from '../ErrorLine';
import type {JobRun} from '../useJobRun';
import type {Notice,Plan,SaveStatus} from '../usePlan';
import {Button,Icon,Spinner,cn} from '../ui';
import {changedSceneLine} from '../video-plan';
import {ScriptScenes} from './ScriptScenes';
import {Sketch,sketchStarted} from './Sketch';
import {BrandLogo} from '../../BrandLogo';
import {AI_CONNECT_HINT,useAiAvailable} from '../ai-status';
import type {Route} from '../routes';
import {Board} from '../workspace/Board';
import {useAi,type ConnectedAi} from '../useAi';
import type {SectionKey} from './idea-logic';
import {publishIdeaSection,visibleIdeaSection,useIdeaView,type IdeaView} from './view';
export type {IdeaView} from './view';
import './idea.css';

const WHAT:Record<PlanJobKind,string>={package:'title, thumbnail and hook',outline:'scenes',script:'script',onepager:'sketch'};


/**
 * The board's cards, read again whenever the board changes elsewhere (a card added from here or by the companion). A video card is
 * read for its title, views and number as the board itself does it, so it is read even while only the list shows (Page view).
 */
function useBoardCards(videoId:string,key:number){
 const [cards,setCards]=useState<readonly ResearchTile[]|undefined>();
 const reading=useRef(new Map<string,()=>void>());
 const base=`/videos/${encodeURIComponent(videoId)}/research`;
 const readNew=useCallback((found:readonly ResearchTile[])=>{
  for(const card of found){
   if(card.kind!=='video'||card.title||reading.current.has(card.id))continue;
   reading.current.set(card.id,()=>{});
   clubFetch(`${base}/${encodeURIComponent(card.id)}/read`,{method:'POST'}).then(started=>{
    if(!isStartedJob(started)){reading.current.delete(card.id);return;}
    reading.current.set(card.id,watchJob(started.id,event=>{
     if(event.type==='done'){const read=event.data as ResearchTile;setCards(now=>now?.map(one=>one.id===read.id?{...read,pos:one.pos??read.pos}:one));}
     if(event.type==='done'||event.type==='failed'||event.type==='cancelled')reading.current.delete(card.id);
    }));
   },()=>{reading.current.delete(card.id);});
  }
 },[base]);
 useEffect(()=>{let alive=true;clubFetch<ResearchTile[]>(base).then(found=>{if(alive){setCards(found);readNew(found);}},()=>{if(alive)setCards(current=>current??[]);});return()=>{alive=false;};},[base,key,readNew]);
 useEffect(()=>()=>{for(const stop of reading.current.values())stop();},[]);
 const update=useCallback((next:readonly ResearchTile[])=>{setCards(next);readNew(next);},[readNew]);
 return [cards,update] as const;
}

/** A quiet line beside the heading: Saving…, Saved, or Couldn't save with Try again. Nothing before the first change. */
function SaveLine({status,onRetry}:{status?:SaveStatus;onRetry():void}){
 if(!status||status==='idle')return null;
 if(status==='error')return <span className="idea-save bad" role="alert">Couldn't save · <button type="button" className="linkish" onClick={onRetry}>Try again</button></span>;
 return <span className="idea-save" role="status">{status==='saving'?'Saving…':'Saved'}</span>;
}


/** A running job's line with Stop, or its failure with Try again. */
function JobLine({what,state,onRetry,onStop}:{what:string;state:JobRun;onRetry():void;onStop():void}){
 if((state.phase==='starting'||state.phase==='running'))return <div className="idea-line" role="status"><Spinner size={14} label="Working"/><span className="grow">{state.line??`Writing the ${what}…`}</span><Button variant="ghost" size="sm" disabled={state.stopping} onClick={onStop}>{state.stopping?'Stopping…':'Stop'}</Button></div>;
 if(state.phase==='failed')return <ErrorLine message={state.message} onRetry={onRetry}/>;
 if(state.phase==='cancelled')return <p className="idea-line small muted" role="status">Stopped · <button type="button" className="linkish" onClick={onRetry}>Try again</button></p>;
 return null;
}
/** "Replaced the scenes · Undo", or "New scenes ready · Use it" when a run finished after you changed them. */
function NoticeLine({what,notice,onAct}:{what:string;notice?:Notice;onAct():void}){
 if(!notice)return null;
 const replaced=notice.type==='replaced';
 return <p className="idea-line small muted" role="status">{replaced?`Replaced the ${what}`:`New ${what} ready`} · <button type="button" className="linkish" onClick={onAct}>{replaced?'Undo':'Use it'}</button></p>;
}

/**
 * A video's Idea step: one page you read and type into (Script view) or the video's board on its own (Board view). Script holds what it's
 * about, the title and the words on its thumbnail, what you say first, the scenes. One button fills every part that is still empty, with
 * the AI the person connected; the title offers its other versions where it stands, and any part can be rewritten from its own line.
 */
export function IdeaPage({video,plan,known,focusId,boardKey,navigate,onOpen,show:showPart,onFocus,onTitle,onTarget,onRecordScene,onVideo,onSelection,onBoardChanged}:{
 video:Video;plan:Plan;known:readonly VideoScene[]|undefined;focusId:string|null;boardKey:number;navigate(route:Route):void;
 /** The part being worked on now, for the companion; and a part to bring into view (a card applied there), again for a new `n`. */
 onOpen?(part:SectionKey|null):void;show?:{key:SectionKey;n:number};
 onFocus(sceneId:string):void;onTitle(title:string):void;onTarget(seconds:number):void;onRecordScene(sceneId:string):void;onVideo(video:Video):void;
 /** The cards selected on the board, for the companion. */
 onSelection?(ids:readonly string[]):void;
 /** The sketch's start added cards to the board: the board reads itself again. */
 onBoardChanged?():void;
}){
 const ai=useAi(),aiAvailable=useAiAvailable();
 const [view,setView]=useIdeaView();
 const [scrolled,setScrolled]=useState(false);
 const planScroller=useRef<HTMLElement>(null);
 const readSection=()=>{const scroller=planScroller.current;if(scroller){setScrolled(scroller.scrollTop>0);publishIdeaSection(view==='sketch'?'Sketch':visibleIdeaSection(scroller));}};
 useEffect(()=>{
  const scroller=planScroller.current;if(!scroller)return;
  const header=scroller.closest('.idea-page')?.querySelector<HTMLElement>('.idea-top');
  const footer=scroller.closest('.ws')?.querySelector<HTMLElement>('.ws-foot');
  const measure=()=>{
   scroller.style.scrollPaddingTop=`${header?.getBoundingClientRect().height||57}px`;
   const clearance=(footer?.getBoundingClientRect().height||64)+24;
   scroller.style.paddingBottom=`${clearance}px`;scroller.style.scrollPaddingBottom=`${clearance}px`;
   readSection();
  };
  measure();
  if(typeof ResizeObserver==='undefined')return()=>publishIdeaSection(null);
  const observer=new ResizeObserver(measure);if(header)observer.observe(header);if(footer)observer.observe(footer);
  return()=>{observer.disconnect();publishIdeaSection(null);};
 },[view,video.id,plan.load.status]);
 const choose=(next:IdeaView)=>{setView(next);setScrolled(false);if(next!=='board')onSelection?.([]);};
 const ready=plan.load.status==='ready';
 const hasScenes=!!plan.outline?.scenes.length;
 // A video with no scenes yet opens on its sketch: the first thing to get right.
 const opened=useRef<string|null>(null);
 // A video with scenes and no sketch (made before there was one) opens on its script.
 useEffect(()=>{
  if(!ready||opened.current===video.id)return;opened.current=video.id;
  if(!hasScenes&&view==='page')setView('sketch');
  else if(hasScenes&&view==='sketch'&&!sketchStarted(plan.onepager))setView('page');
 },[ready,video.id,hasScenes,view,setView,plan.onepager]);
 // A card applied in the companion shows the view that holds what it changed. A title or thumbnail change keeps the Sketch: it has
 // its own title and thumbnail, and leaving it for the Script while the creator works on the sketch makes no sense.
 useEffect(()=>{if(!showPart)return;if(showPart.key==='sketch')setView('sketch');else if(view==='sketch'&&showPart.key!=='package')setView('page');
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[showPart]);
 const next=()=>{choose('page');if(!hasScenes&&plan.outlineJob.phase!=='running')plan.createOutline();};
 const [cards,setCards]=useBoardCards(video.id,boardKey);

 const lines=[
  view==='page'&&plan.changedScene!==undefined&&<p key="changed" className="idea-changed" role="status">{changedSceneLine(plan.changedScene)}</p>,
  plan.continueError&&<ErrorLine key="continue" message={plan.continueError} onRetry={()=>plan.continueAction?.run()}/>,
  plan.scenesSaveError&&<ErrorLine key="save" message={plan.scenesSaveError} onRetry={plan.retrySave}/>,
  plan.noticeError&&<ErrorLine key="notice" message={plan.noticeError} onRetry={()=>{for(const kind of ['package','outline','script','onepager'] as const)if(plan.notices[kind]){void plan.resolveNotice(kind);break;}}}/>,
  <JobLine key="package-job" what={WHAT.package} state={plan.packageJob} onRetry={()=>plan.writePackage()} onStop={()=>plan.stop('package')}/>,
  <JobLine key="outline-job" what={WHAT.outline} state={plan.outlineJob} onRetry={plan.createOutline} onStop={()=>plan.stop('outline')}/>,
  <JobLine key="script-job" what={WHAT.script} state={plan.scriptJob} onRetry={()=>plan.writeScript(plan.scriptScene)} onStop={()=>plan.stop('script')}/>,
  <JobLine key="sketch-job" what={WHAT.onepager} state={plan.onepagerJob} onRetry={plan.writeOnepager} onStop={()=>plan.stop('onepager')}/>,
  ...(['package','outline','script','onepager'] as const).map(kind=><NoticeLine key={`${kind}-notice`} what={WHAT[kind]} notice={plan.notices[kind]} onAct={()=>void plan.resolveNotice(kind)}/>),
 ].filter(Boolean);

 const page=!ready
  ?plan.load.status==='error'?<ErrorLine message={plan.load.message} onRetry={plan.reload}/>:<div className="idea-loading" role="status"><Spinner label="Loading your video" size={18}/><span className="small muted">Loading your video…</span></div>
  :view==='sketch'?<div onFocusCapture={()=>onOpen?.('sketch')}><Sketch video={video} plan={plan} ai={ai} hasScenes={hasScenes} onTitle={onTitle} onBoardChanged={()=>onBoardChanged?.()} onNext={next}/></div>
  :<PlanPage video={video} plan={plan} known={known} focusId={focusId} cards={cards} ai={ai} showPart={showPart}
    onOpen={onOpen} onFocus={onFocus} onTitle={onTitle} onTarget={onTarget} onRecordScene={onRecordScene} onVideo={onVideo}
    onStartRecording={()=>navigate({name:'video',id:video.id,tab:'record'})}/>;

 return <div className={cn('idea-page',view==='board'?'idea-board-view':'idea-plan-view')}>
  <div className={cn("idea-top",scrolled&&"idea-top-scrolled")}>
   <div className="idea-views" role="group" aria-label="View">
    <button type="button" aria-pressed={view==='sketch'} className={cn(view==='sketch'&&'on')} onClick={()=>choose('sketch')}><Icon name="idea" size={14}/>Sketch</button>
    <button type="button" aria-pressed={view==='page'} className={cn(view==='page'&&'on')} onClick={()=>choose('page')}><Icon name="script" size={14}/>Script</button>
    <button type="button" aria-pressed={view==='board'} className={cn(view==='board'&&'on')} onClick={()=>choose('board')}><Icon name="layout" size={14}/>Board</button>
   </div>
   <SaveLine status={view==='sketch'?plan.onepagerSave:plan.packageSave} onRetry={plan.retrySave}/>
   <span className="grow"/>
   {view==='sketch'&&ready&&sketchStarted(plan.onepager)&&<Button variant="ghost" size="sm" disabled={!aiAvailable||(plan.onepagerJob.phase==='starting'||plan.onepagerJob.phase==='running')} title={!aiAvailable?AI_CONNECT_HINT:`Write a new sketch with ${ai.name}. You can undo it.`} onClick={plan.writeOnepager}><BrandLogo brand={ai.brand} size={14}/>Suggest again</Button>}
  </div>
  {lines.length>0&&<div className="idea-lines">{lines}</div>}
  <div className="idea-body">
   {view!=='board'
    ?<main className="idea-doc" ref={planScroller} onScroll={readSection}>{page}</main>
    :<div className="idea-board"><Board video={video} refreshKey={boardKey} navigate={navigate} onSelection={onSelection} onTiles={setCards}/></div>}
  </div>
 </div>;
}


function PlanPage({video,plan,known,focusId,ai,showPart,onOpen,onFocus,onTarget,onRecordScene,onStartRecording}:{
 video:Video;plan:Plan;known:readonly VideoScene[]|undefined;focusId:string|null;cards:readonly ResearchTile[]|undefined;ai:ConnectedAi;showPart?:{key:SectionKey;n:number};
 onOpen?(part:SectionKey|null):void;onFocus(sceneId:string):void;onTitle(title:string):void;onTarget(seconds:number):void;onRecordScene(sceneId:string):void;onVideo(video:Video):void;onStartRecording():void;
}){
 const drafting=(plan.outlineJob.phase==='starting'||plan.outlineJob.phase==='running'),scripting=(plan.scriptJob.phase==='starting'||plan.scriptJob.phase==='running');
 // A card applied in the companion brings the script into view for a moment.
 const [flash,setFlash]=useState<SectionKey|null>(null);
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!showPart)return;
  root.current?.querySelector(`[data-part="${showPart.key}"]`)?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
  setFlash(showPart.key);const off=setTimeout(()=>setFlash(null),1600);return()=>clearTimeout(off);
 },[showPart]);
 // Borumi's Script step, with no heading over it (the Script view says what it is).
 return <div className={cn('doc doc-script',flash==='scenes'&&'flash')} ref={root} data-part="scenes" onFocusCapture={()=>onOpen?.('scenes')}>
  <ScriptScenes aiName={ai.name} aiBrand={ai.brand} hasRecording={!!video.recorderProjectId} outline={plan.outline} known={known} focusId={focusId}
   drafting={drafting} draftLine={(plan.outlineJob.phase==='starting'||plan.outlineJob.phase==='running')?plan.outlineJob.line:undefined} scripting={scripting} scriptingScene={plan.scriptScene}
   onEdit={plan.editOutline} onFocus={onFocus} onDraft={plan.createOutline} onWriteScene={sceneId=>plan.writeScript(sceneId)} onSceneScript={plan.saveSceneScript}
   onRecord={onRecordScene} onSaveNow={()=>plan.flush()} onStartRecording={onStartRecording}/>
 </div>;
}

