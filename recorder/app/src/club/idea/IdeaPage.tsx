import {useCallback,useEffect,useRef,useState,type DragEvent} from 'react';
import type {PlanJobKind,ResearchTile,Video,VideoScene} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {isStartedJob,watchJob} from '../jobs';
import {ErrorLine} from '../ErrorLine';
import type {JobRun} from '../useJobRun';
import type {Notice,Plan,SaveStatus} from '../usePlan';
import {Button,Icon,MultChip,Spinner,Thumb,cn,useToast} from '../ui';
import {changedSceneLine} from '../video-plan';
import {ScriptScenes} from './ScriptScenes';
import type {Route} from '../routes';
import {Board,addFromText} from '../workspace/Board';
import {youtubeId} from '../board';
import {useAi,type ConnectedAi} from '../useAi';
import {CARD_DRAG,cardText,proofLine,type SectionKey} from './idea-logic';
import {publishIdeaSection,visibleIdeaSection,useIdeaView,type IdeaView} from './view';
export type {IdeaView} from './view';
import './idea.css';

const WHAT:Record<PlanJobKind,string>={package:'title, thumbnail and hook',outline:'scenes',script:'script',onepager:'one-pager'};


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
 if(state.phase==='running')return <div className="idea-line" role="status"><Spinner size={14} label="Working"/><span className="grow">{state.line??`Writing the ${what}…`}</span><Button variant="ghost" size="sm" onClick={onStop}>Stop</Button></div>;
 if(state.phase==='failed')return <ErrorLine message={state.message} onRetry={onRetry}/>;
 return null;
}
/** "Replaced the scenes · Undo", or "New scenes ready · Use it" when a run finished after you changed them. */
function NoticeLine({what,notice,onAct}:{what:string;notice?:Notice;onAct():void}){
 if(!notice)return null;
 const replaced=notice.type==='replaced';
 return <p className="idea-line small muted" role="status">{replaced?`Replaced the ${what}`:`New ${what} ready`} · <button type="button" className="linkish" onClick={onAct}>{replaced?'Undo':'Use it'}</button></p>;
}

/**
 * A video's Idea step, as one page you read and type into: what it's about, the title and the words on its thumbnail, what you say
 * first, the scenes. One button fills every part that is still empty, with the AI the person connected; the title offers its other
 * versions where it stands, and any part can be rewritten from its own line. The board is the other half: in Page view it is a list
 * beside the page (drag a card onto a scene to add it as a talking point), in Board view it is the canvas, with the page beside it.
 * Everything shown is the video's own: the package and scenes as saved, the board's cards and their numbers.
 */
export function IdeaPage({video,plan,known,focusId,boardKey,navigate,onOpen,show:showPart,onFocus,onTitle,onTarget,onRecordScene,onVideo,onBoardChanged,onSelection}:{
 video:Video;plan:Plan;known:readonly VideoScene[]|undefined;focusId:string|null;boardKey:number;navigate(route:Route):void;
 /** The part being worked on now, for the companion; and a part to bring into view (a card applied there), again for a new `n`. */
 onOpen?(part:SectionKey|null):void;show?:{key:SectionKey;n:number};
 onFocus(sceneId:string):void;onTitle(title:string):void;onTarget(seconds:number):void;onRecordScene(sceneId:string):void;onVideo(video:Video):void;
 /** A card was added to the board from here: the board reads itself again. */
 onBoardChanged():void;
 /** The cards selected on the board, for the companion. */
 onSelection?(ids:readonly string[]):void;
}){
 const ai=useAi();
 const [view,setView]=useIdeaView();
 const [scrolled,setScrolled]=useState(false);
 const planScroller=useRef<HTMLElement>(null);
 const readSection=()=>{const scroller=planScroller.current;if(scroller){setScrolled(scroller.scrollTop>0);publishIdeaSection(visibleIdeaSection(scroller));}};
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
 const [selected,setSelected]=useState<readonly string[]>([]);
 const choose=(next:IdeaView)=>{setView(next);setScrolled(false);if(next==='page'){setSelected([]);onSelection?.([]);}};
 const [cards,setCards]=useBoardCards(video.id,boardKey);
 const [showCard,setShowCard]=useState<{id:string;n:number}|undefined>();
 const selectCard=(id:string)=>{choose('board');setSelected([id]);setShowCard(now=>({id,n:(now?.n??0)+1}));};
 const ready=plan.load.status==='ready';
 const pkg=plan.pkg;


 const lines=[
  plan.changedScene!==undefined&&<p key="changed" className="idea-warn" role="status">{changedSceneLine(plan.changedScene)}</p>,
  plan.continueError&&<ErrorLine key="continue" message={plan.continueError} onRetry={()=>plan.continueAction?.run()}/>,
  plan.scenesSaveError&&<ErrorLine key="save" message={plan.scenesSaveError} onRetry={plan.retrySave}/>,
  plan.noticeError&&<ErrorLine key="notice" message={plan.noticeError} onRetry={()=>{for(const kind of ['package','outline','script','onepager'] as const)if(plan.notices[kind]){void plan.resolveNotice(kind);break;}}}/>,
  <JobLine key="package-job" what={WHAT.package} state={plan.packageJob} onRetry={()=>plan.writePackage()} onStop={()=>plan.stop('package')}/>,
  <JobLine key="outline-job" what={WHAT.outline} state={plan.outlineJob} onRetry={plan.createOutline} onStop={()=>plan.stop('outline')}/>,
  <JobLine key="script-job" what={WHAT.script} state={plan.scriptJob} onRetry={()=>plan.writeScript(plan.scriptScene)} onStop={()=>plan.stop('script')}/>,
  ...(['package','outline','script'] as const).map(kind=><NoticeLine key={`${kind}-notice`} what={WHAT[kind]} notice={plan.notices[kind]} onAct={()=>void plan.resolveNotice(kind)}/>),
 ].filter(Boolean);

 const page=!ready
  ?plan.load.status==='error'?<ErrorLine message={plan.load.message} onRetry={plan.reload}/>:<div className="idea-loading" role="status"><Spinner label="Loading your video" size={18}/><span className="small muted">Loading your video…</span></div>
  :<PlanPage video={video} plan={plan} known={known} focusId={focusId} cards={cards} ai={ai} showPart={showPart}
    onOpen={onOpen} onFocus={onFocus} onTitle={onTitle} onTarget={onTarget} onRecordScene={onRecordScene} onVideo={onVideo}
    onBoardChanged={onBoardChanged} onShowCard={selectCard} onDiscover={()=>navigate({name:'discover'})} onStartRecording={()=>navigate({name:'video',id:video.id,tab:'record'})}/>;

 return <div className={cn('idea-page',view==='page'?'idea-plan-view':'idea-board-view')}>
  <div className={cn("idea-top",scrolled&&"idea-top-scrolled")}>
   <div className="idea-views" role="group" aria-label="View">
    <button type="button" aria-pressed={view==='page'} className={cn(view==='page'&&'on')} onClick={()=>choose('page')}><Icon name="script" size={14}/>Script</button>
    <button type="button" aria-pressed={view==='board'} className={cn(view==='board'&&'on')} onClick={()=>choose('board')}><Icon name="layout" size={14}/>Board</button>
   </div>
   <SaveLine status={plan.packageSave} onRetry={plan.retrySave}/>
   <span className="grow"/>
  </div>
  {lines.length>0&&<div className="idea-lines">{lines}</div>}
  <div className="idea-body">
   {view==='page'
    ?<main className="idea-doc" ref={planScroller} onScroll={readSection}>{page}</main>
    :<><BoardList selected={selected} onSelect={selectCard} videoId={video.id} cards={cards} onCards={setCards} onAdded={onBoardChanged} showDragHint={false} summary={{video,logline:plan.onepager?.logline??'',idea:pkg?.angle||video.idea?.angle||video.idea?.why||'',research:()=>navigate({name:'discover'}),open:()=>choose('page')}}/><div className="idea-board"><Board video={video} refreshKey={boardKey} navigate={navigate} onSelection={ids=>{setSelected(ids);onSelection?.(ids);}} onTiles={setCards} show={showCard}/></div></>}
  </div>
 </div>;
}

/** Page view's board: the cards as a list you can read, add to, and drag onto a scene. Board view shows the same cards as a canvas. */
function BoardList({videoId,cards,onCards,onAdded,showDragHint,summary,selected,onSelect}:{selected:readonly string[];onSelect(id:string):void;videoId:string;cards:readonly ResearchTile[]|undefined;onCards(cards:readonly ResearchTile[]):void;onAdded():void;showDragHint:boolean;summary?:{video:Video;logline:string;idea:string;research():void;open():void}}){
 const toast=useToast(),ai=useAi();
 const [expanded,setExpanded]=useState(false);
 const [pane,setPane]=useState<'plan'|'items'>('plan');
 const [text,setText]=useState(''),[adding,setAdding]=useState(false);
 const add=async()=>{
  if(!text.trim()||adding)return;
  setAdding(true);
  try{
   const added=await addFromText(body=>clubFetch<ResearchTile>(`/videos/${encodeURIComponent(videoId)}/research`,{body}).then(card=>{onCards([...(cards??[]),card]);return card;}),text.trim());
   if(added){setText('');onAdded();}
  }catch(reason){toast(errorMessage(reason,"Couldn't add that to the board."));}
  finally{setAdding(false);}
 };
 const drag=(event:DragEvent,card:ResearchTile)=>{event.dataTransfer.setData(CARD_DRAG,cardText(card));event.dataTransfer.effectAllowed='copy';};
 return <aside className={cn("idea-list",expanded&&"idea-list-expanded")} aria-label="Board">
  <button type="button" className="idea-list-rail" aria-label={expanded?"Hide board items":"Show board items"} title={expanded?"Hide board items":"Show board items"} onClick={()=>{setExpanded(!expanded);if(!expanded)setPane('items');}}><Icon name="layout" size={16}/><span>Items</span></button>
  <div className="idea-list-content">
  {summary&&<div className="idea-pane-switch" role="group" aria-label="Board sidebar">
   <button type="button" aria-pressed={pane==='plan'} onClick={()=>setPane('plan')}>Summary</button>
   <button type="button" aria-pressed={pane==='items'} onClick={()=>setPane('items')}>Items{cards?.length?` · ${cards.length}`:''}</button>
  </div>}
  {summary&&pane==='plan'?<div className="idea-summary">
   <dl><dt>Video title</dt><dd className="idea-summary-title">{summary.video.title}</dd>
    <dt>Logline</dt><dd className={!summary.logline.trim()?'idea-placeholder':undefined}>{summary.logline.trim()||'Describe the video in one sentence.'}</dd>
    {/* Same name as on Plan, and only when it says something the logline doesn't. */}
    {summary.idea.trim()&&summary.idea.trim()!==summary.logline.trim()&&<><dt>What it's about</dt><dd>{summary.idea}</dd></>}</dl>
   <p className="idea-summary-proof">{proofLine(cards).text.replace(/\.$/,'')}{!cards?.some(card=>card.kind==='video')&&<> · <button type="button" className="idea-text-link" onClick={summary.research}>Find one in Research</button></>}</p>
   <Button variant="ghost" size="sm" onClick={summary.open}><Icon name="script" size={14}/>Open the script</Button>
  </div>:<>
  {!summary&&<div className="idea-list-h"><b>Board</b>{!!cards?.length&&<span className="muted small">· {cards.length} {cards.length===1?'item':'items'}</span>}</div>}
  <form className="idea-list-add" onSubmit={event=>{event.preventDefault();void add();}}>
   <input className="input" value={text} onChange={event=>setText(event.target.value)} placeholder="Paste a link or a note" aria-label="Add to the board"/><button type="submit" className="btn ghost sm" disabled={!text.trim()||adding} aria-label="Add to board" title="Add"><Icon name="add" size={14}/></button>
  </form>
  {cards===undefined?<div className="idea-loading"><Spinner size={14} label="Loading the board"/></div>
   :cards.length===0?<p className="idea-hint">{ai.name} reads these when it fills in your video.</p>
   :<ul className="idea-list-cards">{cards.map(card=><li key={card.id} className={cn(selected.includes(card.id)&&'selected')} draggable onDragStart={event=>drag(event,card)} title="Drag onto a scene to add it as a talking point"><button type="button" className="idea-list-card" aria-pressed={selected.includes(card.id)} onClick={()=>onSelect(card.id)}>
     {card.kind==='video'
      ?<Thumb seed={card.id} videoId={youtubeId(card.url)} src={card.meta.thumbnail} className="idea-card-thumb" fallback={<span className="board-video-placeholder"><Icon name="play" size={18}/></span>}/>
      :<span className="idea-list-ico" aria-hidden><Icon name={card.kind==='note'?'note':card.kind==='link'?'link':'image'} size={14}/></span>}
     <span className="grow"><span className="idea-card-t">{cardText(card)||'Reading…'}</span>{card.meta.channel&&<span className="idea-card-c">{card.meta.channel}</span>}</span>
     {card.kind==='video'&&<MultChip m={card.meta.multiplier}/>}
    </button></li>)}</ul>}
  {showDragHint&&cards&&cards.length>0&&<p className="idea-hint">Drag a card onto a scene to add it there.</p>}
  </>}
  </div>
 </aside>;
}


function PlanPage({video,plan,known,focusId,ai,showPart,onOpen,onFocus,onTarget,onRecordScene,onStartRecording}:{
 video:Video;plan:Plan;known:readonly VideoScene[]|undefined;focusId:string|null;cards:readonly ResearchTile[]|undefined;ai:ConnectedAi;showPart?:{key:SectionKey;n:number};
 onOpen?(part:SectionKey|null):void;onFocus(sceneId:string):void;onTitle(title:string):void;onTarget(seconds:number):void;onRecordScene(sceneId:string):void;onVideo(video:Video):void;onShowCard(id:string):void;onDiscover():void;onBoardChanged():void;onStartRecording():void;
}){
 const drafting=plan.outlineJob.phase==='running',scripting=plan.scriptJob.phase==='running';
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
   drafting={drafting} draftLine={plan.outlineJob.phase==='running'?plan.outlineJob.line:undefined} scripting={scripting} scriptingScene={plan.scriptScene}
   onEdit={plan.editOutline} onFocus={onFocus} onDraft={plan.createOutline} onWriteScene={sceneId=>plan.writeScript(sceneId)} onSceneScript={plan.saveSceneScript}
   onRecord={onRecordScene} onSaveNow={()=>plan.flush()} onStartRecording={onStartRecording}/>
 </div>;
}

