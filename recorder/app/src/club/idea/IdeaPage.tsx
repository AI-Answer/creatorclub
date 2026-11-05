import {useCallback,useEffect,useRef,useState,type DragEvent,type ReactNode} from 'react';
import {AI_CONNECT_HINT,useAiAvailable} from '../ai-status';
import {BrandLogo} from '../../BrandLogo';
import type {ConceptRating,Package,PlanJobKind,ResearchTile,Video,VideoScene} from '../../../shared/club';
import {choosePair,chosenIndex,pairThumbs,withThumb} from '../../../shared/package-rules';
import {clubFetch,clubUpload,errorMessage} from '../api';
import {isStartedJob,watchJob} from '../jobs';
import {ErrorLine} from '../ErrorLine';
import type {JobRun} from '../useJobRun';
import type {Notice,Plan,SaveStatus} from '../usePlan';
import {Button,Ed,Icon,MultChip,Spinner,Thumb,cn,useToast} from '../ui';
import {changedSceneLine} from '../video-plan';
import {EMPTY_PACKAGE,blankScene,sceneCardId} from '../plan/plan-logic';
import {ScenesColumn} from '../plan/ScenesColumn';
import type {Route} from '../routes';
import {Board,addFromText} from '../workspace/Board';
import {youtubeId} from '../board';
import {useAi,type ConnectedAi} from '../useAi';
import {ThumbnailStudio} from './ThumbnailStudio';
import {CARD_DRAG,cardText,emptyParts,pairChecks,proofCards,proofLine,type SectionKey} from './idea-logic';
import {OnePager} from './OnePagerCard';
import {publishIdeaSection,visibleIdeaSection,useIdeaView,type IdeaView} from './view';
export type {IdeaView} from './view';
import './onepager.css';
import './idea.css';

const WHAT:Record<PlanJobKind,string>={package:'title, thumbnail and hook',outline:'scenes',script:'script',onepager:'one-pager'};
const LEVEL_WORD:Record<ConceptRating['level'],string>={high:'Strong',mid:'Okay',low:'Weak'};

/** The thumbnail picture you added for the video, when there is one: the only picture the page shows (never a made-up one). */
function useThumbnail(videoId:string){
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{
  let alive=true;
  const path=`/api/club/videos/${encodeURIComponent(videoId)}/thumbnail`;
  void fetch(path).then(response=>{if(alive&&response.status===200&&response.headers.get('content-type')?.startsWith('image/'))setUrl(`${path}?v=${Date.now()}`);},()=>{});
  return()=>{alive=false;};
 },[videoId]);
 return url;
}

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

/** What the AI fills from, in real counts: the idea and the cards on the board. */
function sourcesLine(cards:readonly ResearchTile[]|undefined,video:Video){
 const count=(kind:ResearchTile['kind'])=>(cards??[]).filter(card=>card.kind===kind).length;
 const parts=[count('video')&&`${count('video')} ${count('video')===1?'video':'videos'}`,count('note')&&`${count('note')} ${count('note')===1?'note':'notes'}`,count('link')&&`${count('link')} ${count('link')===1?'link':'links'}`].filter(Boolean);
 const idea=!!(video.idea?.why||video.idea?.angle);
 if(!parts.length)return idea?'From your idea.':'From the title and your channel: the board is empty.';
 return `From ${idea?'your idea and ':''}the ${parts.join(', ')} on your board.`;
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
 const ai=useAi(),aiAvailable=useAiAvailable();
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
 const packaging=plan.packageJob.phase==='running',drafting=plan.outlineJob.phase==='running';

 // Fill: one press writes every part that is empty. The package first (the scenes open with its hook), then the scenes.
 const empty=emptyParts(pkg&&{...pkg,angle:pkg.angle||plan.onepager?.logline||''},plan.outline);
 const [chain,setChain]=useState(false);
 const fill=()=>{
  if(empty.package){plan.writePackage();setChain(empty.scenes);}
  else if(empty.scenes)plan.createOutline();
 };
 const packagePhase=plan.packageJob.phase;
 useEffect(()=>{
  if(!chain||packagePhase==='running'||packagePhase==='idle')return;
  setChain(false);
  if(packagePhase==='done'&&!plan.outline?.scenes.length)plan.createOutline();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[chain,packagePhase]);

 const lines=[
  video.quickRecording&&!plan.outline?.scenes.length&&<p key="quick" className="idea-line" role="status">This video started as a quick recording. Add a plan whenever you need one.</p>,
  plan.changedScene!==undefined&&<p key="changed" className="idea-warn" role="status">{changedSceneLine(plan.changedScene)}</p>,
  plan.continueError&&<ErrorLine key="continue" message={plan.continueError} onRetry={()=>plan.continueAction?.run()}/>,
  plan.scenesSaveError&&<ErrorLine key="save" message={plan.scenesSaveError} onRetry={plan.retrySave}/>,
  plan.noticeError&&<ErrorLine key="notice" message={plan.noticeError} onRetry={()=>{for(const kind of ['package','outline','script','onepager'] as const)if(plan.notices[kind]){void plan.resolveNotice(kind);break;}}}/>,
  <JobLine key="package-job" what={WHAT.package} state={plan.packageJob} onRetry={()=>plan.writePackage()} onStop={()=>{setChain(false);plan.stop('package');}}/>,
  <JobLine key="outline-job" what={WHAT.outline} state={plan.outlineJob} onRetry={plan.createOutline} onStop={()=>plan.stop('outline')}/>,
  <JobLine key="script-job" what={WHAT.script} state={plan.scriptJob} onRetry={()=>plan.writeScript(plan.scriptScene)} onStop={()=>plan.stop('script')}/>,
  ...(['package','outline','script'] as const).map(kind=><NoticeLine key={`${kind}-notice`} what={WHAT[kind]} notice={plan.notices[kind]} onAct={()=>void plan.resolveNotice(kind)}/>),
 ].filter(Boolean);

 const page=!ready
  ?plan.load.status==='error'?<ErrorLine message={plan.load.message} onRetry={plan.reload}/>:<div className="idea-loading" role="status"><Spinner label="Loading your video" size={18}/><span className="small muted">Loading your video…</span></div>
  :<PlanPage video={video} plan={plan} known={known} focusId={focusId} cards={cards} ai={ai} showPart={showPart}
    onOpen={onOpen} onFocus={onFocus} onTitle={onTitle} onTarget={onTarget} onRecordScene={onRecordScene} onVideo={onVideo}
    onBoardChanged={onBoardChanged} onShowCard={selectCard} onDiscover={()=>navigate({name:'discover'})}/>;

 return <div className={cn('idea-page',view==='page'?'idea-plan-view':'idea-board-view')}>
  <div className={cn("idea-top",scrolled&&"idea-top-scrolled")}>
   <div className="idea-views" role="group" aria-label="View">
    <button type="button" aria-pressed={view==='page'} className={cn(view==='page'&&'on')} onClick={()=>choose('page')}><Icon name="script" size={14}/>Plan</button>
    <button type="button" aria-pressed={view==='board'} className={cn(view==='board'&&'on')} onClick={()=>choose('board')}><Icon name="layout" size={14}/>Board</button>
   </div>
   <SaveLine status={plan.packageSave} onRetry={plan.retrySave}/>
   <span className="grow"/>
   {ready&&(empty.package||empty.scenes)&&<div className="idea-fill">
    <Button size="sm" title={!aiAvailable?AI_CONNECT_HINT:sourcesLine(cards,video)} disabled={!aiAvailable||packaging||drafting||chain} onClick={fill}><BrandLogo brand={ai.brand} size={16}/>Fill the empty parts with {ai.name}</Button>
   </div>}
  </div>
  {lines.length>0&&<div className="idea-lines">{lines}</div>}
  <div className="idea-body">
   {view==='page'
    ?<><BoardList selected={selected} onSelect={selectCard} videoId={video.id} cards={cards} onCards={setCards} onAdded={onBoardChanged} showDragHint={true}/><main className="idea-doc" ref={planScroller} onScroll={readSection}>{page}</main></>
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
    <dt>The idea</dt><dd className={!summary.idea.trim()?'idea-placeholder':undefined}>{summary.idea||'What will viewers take away?'}</dd></dl>
   <p className="idea-summary-proof">{proofLine(cards).text.replace(/\.$/,'')}{!cards?.some(card=>card.kind==='video')&&<> · <button type="button" className="idea-text-link" onClick={summary.research}>Find one in Research</button></>}</p>
   <Button variant="ghost" size="sm" onClick={summary.open}><Icon name="script" size={14}/>Open in Plan</Button>
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

/** A part of the page: its heading, and the companion is told it is the part being worked on while you are in it. */
function Part({part,title,flash,onOpen,children}:{part:SectionKey;title:string;flash:boolean;onOpen?(part:SectionKey):void;children:ReactNode}){
 return <section className={cn('doc-part',flash&&'flash')} data-part={part} aria-label={title} onFocusCapture={()=>onOpen?.(part)} onPointerDown={()=>onOpen?.(part)}>
  <h3 className="doc-part-h">{title}</h3>{children}
 </section>;
}
/** A line you type into, with what you can do to it showing on hover (and when you are in it). */
const Line=({className,actions,children}:{className?:string;actions?:ReactNode;children:ReactNode})=><div className={cn('dline',className)}>{children}{actions&&<span className="dline-act">{actions}</span>}</div>;

function PlanPage({video,plan,known,focusId,cards,ai,showPart,onOpen,onFocus,onTitle,onTarget,onRecordScene,onVideo,onShowCard,onDiscover,onBoardChanged}:{
 video:Video;plan:Plan;known:readonly VideoScene[]|undefined;focusId:string|null;cards:readonly ResearchTile[]|undefined;ai:ConnectedAi;showPart?:{key:SectionKey;n:number};
 onOpen?(part:SectionKey|null):void;onFocus(sceneId:string):void;onTitle(title:string):void;onTarget(seconds:number):void;onRecordScene(sceneId:string):void;onVideo(video:Video):void;onShowCard(id:string):void;onDiscover():void;onBoardChanged():void;
}){
 const toast=useToast(),aiAvailable=useAiAvailable();
 const value=plan.pkg??EMPTY_PACKAGE;
 const edit=(next:Package)=>plan.editPackage(next);
 const save=()=>plan.flushPackage();
 const packaging=plan.packageJob.phase==='running',drafting=plan.outlineJob.phase==='running',scripting=plan.scriptJob.phase==='running';
 // A card applied in the companion brings its part into view for a moment.
 const [flash,setFlash]=useState<SectionKey|null>(null);
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!showPart)return;
  root.current?.querySelector(`[data-part="${showPart.key}"]`)?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
  setFlash(showPart.key);const off=setTimeout(()=>setFlash(null),1600);return()=>clearTimeout(off);
 },[showPart]);
 const [asking,setAsking]=useState<null|'pairs'|'hook'>(null);
 const [editingTitle,setEditingTitle]=useState(false),[editingIdea,setEditingIdea]=useState(false);
 const ideaText=value.angle||plan.onepager?.logline||'';
 const usesLogline=!!plan.onepager?.logline.trim()&&ideaText.trim()===plan.onepager.logline.trim();
 const usesOnepagerTitle=!!plan.onepager?.title.trim()&&video.title.trim()===plan.onepager.title.trim();

 // The idea
 const typed=useRef<string|null>(null);
 const saveWhy=(why:string)=>{
  if(why.trim()===(video.idea?.why??'').trim())return;
  clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}`,{method:'PUT',body:{idea:{why:why.trim()||null}}}).then(onVideo,reason=>toast(errorMessage(reason,"Couldn't save that.")));
 };
 const proof=proofLine(cards),strong=proofCards(cards).slice(0,3);
 const ratings=([['Demand','demand'],['Gap','gap'],['Easy to show','show']] as const).filter(([,key])=>value[key]);

 // The title: the pair in use, or the video's own title while none is; its other versions are the other pairs.
 const thumbs=pairThumbs(value,video.title);
 const inUse=chosenIndex(value.titles,video.title);
 const versions=[0,1,2].filter(index=>value.titles[index].trim());
 const others=versions.filter(index=>index!==inUse);
 const nextVersion=()=>{
  const at=inUse<0?versions[0]:versions[(versions.indexOf(inUse)+1)%versions.length];
  const title=value.titles[at].trim();
  edit(choosePair({...value,thumbs},title,video.title));onTitle(title);
 };
 const setTitle=(text:string)=>{
  const title=text.trim();if(!title||title===video.title)return;
  if(inUse>=0){const titles=[...value.titles] as Package['titles'];titles[inUse]=title;edit({...value,titles,thumbs});}
  onTitle(title);
 };
 const pairAt=inUse<0?0:inUse;
 const checks=pairChecks(inUse<0?video.title:value.titles[inUse],thumbs[pairAt]);
 const hookWritten=Object.values(value.hook).some(part=>part.trim());

 const confirm=(what:'pairs'|'hook',run:()=>void)=><div className="idea-confirm" role="group" aria-label={what==='hook'?'Rewrite the hook?':'Rewrite the titles?'}>
  <span>{what==='hook'?'This replaces your hook.':'This replaces all three titles and their thumbnail words.'} You can undo it afterwards.</span>
  <div className="row" style={{gap:8}}><Button size="sm" variant="primary" onClick={()=>{setAsking(null);run();}}>Rewrite</Button><Button size="sm" onClick={()=>setAsking(null)}>Keep mine</Button></div>
 </div>;

 return <div className="doc" ref={root}>
  <Part part="idea" title="What it's about" flash={flash==='idea'} onOpen={onOpen}>
   <div className="idea-intro">{usesLogline&&!editingIdea?<p className="idea-reuse">Uses the one-pager logline · <button type="button" className="idea-text-link" onClick={()=>setEditingIdea(true)}>Change</button></p>:<Line className="big"><Ed multiline live autoFocus={editingIdea} value={ideaText} ph="Add what this video does for the viewer, in one sentence" label="What it's about" onChange={angle=>edit({...value,angle})} onLeave={()=>{save();setEditingIdea(false);}}/></Line>}</div>
   <Line><span className="dline-k">Your twist</span><Ed multiline live value={value.twist} ph="Add what you show or do differently" label="Your twist" onChange={twist=>edit({...value,twist})} onLeave={save}/></Line>
   <Line><span className="dline-k">Why it could work</span><Ed multiline live value={video.idea?.why??''} ph="Add what tells you people want this" label="Why it could work" onChange={text=>{typed.current=text;}} onLeave={()=>{if(typed.current!==null)saveWhy(typed.current);typed.current=null;}}/></Line>
   <div className="doc-proof">
    <span className={cn('idea-proof',proof.proven&&'ok')}>{proof.text.startsWith('Reading ')?<Spinner size={16} label="Reading reference videos"/>:<Icon name={proof.proven?'done':'video'} size={14}/>}{proof.text}</span>
    {strong.map(card=><button key={card.id} type="button" className="doc-proof-card" onClick={()=>onShowCard(card.id)} title={`${card.title??''}: show it on the board`}><MultChip m={card.meta.multiplier}/><span className="ellipsis">{card.title}</span></button>)}
    {!cards?.some(card=>card.kind==='video')&&<Button variant="ghost" size="sm" onClick={onDiscover}><Icon name="search" size={14}/>Find one in Research</Button>}
    {strong.length>0&&<span className="idea-hint" title="How many times a video beat its channel's usual views">× = times its channel's usual views</span>}
   </div>
   {ratings.length>0&&<p className="idea-hint">Rating ({ai.name}'s judgment, not a measurement): {ratings.map(([label,key])=>`${label} ${LEVEL_WORD[value[key]!.level].toLowerCase()}`).join(' · ')}</p>}
  </Part>

  <OnePager video={video} plan={plan} onTitle={onTitle} onBoardChanged={onBoardChanged}/>

  <Part part="package" title="Title and thumbnail" flash={flash==='package'} onOpen={onOpen}>
   {usesOnepagerTitle&&!editingTitle?<p className="idea-reuse idea-title-source">Uses the one-pager title · <button type="button" className="idea-text-link" onClick={()=>setEditingTitle(true)}>Change</button></p>:<Line className="title" actions={!packaging&&<>
    {versions.length>0&&(inUse<0||others.length>0)&&<button type="button" className="dline-btn" onClick={nextVersion}>{inUse<0?`Use one of ${versions.length} versions`:`Other version (${others.length})`}</button>}
    {versions.length>0&&<button type="button" className="dline-btn" disabled={!aiAvailable} title={!aiAvailable?AI_CONNECT_HINT:undefined} onClick={()=>setAsking('pairs')}>Rewrite</button>}
   </>}>
    <span className="dline-k">Video title</span>
    <Ed autoFocus={editingTitle} value={inUse<0?video.title:value.titles[inUse]} ph="Add a title" label="Video title" onChange={setTitle} onLeave={()=>setEditingTitle(false)}/>
   </Line>}
   {asking==='pairs'&&confirm('pairs',()=>plan.writePackage('titles'))}
   <Line actions={!packaging&&versions.length>0&&<button type="button" className="dline-btn" disabled={!aiAvailable} title={!aiAvailable?AI_CONNECT_HINT:undefined} onClick={()=>plan.writePackage('thumbnail')}>Rewrite the words</button>}>
    <span className="dline-k">On the thumbnail</span>
    <Ed value={thumbs[pairAt]} ph="Add 2 to 5 words" label="Words on the thumbnail" onChange={text=>{edit(withThumb({...value,thumbs},pairAt,text,video.title));}} onLeave={save}/>
   </Line>
   {(versions.length>0||thumbs[pairAt].trim())&&checks.length>0&&<ul className="idea-checks">{checks.map(check=><li key={check.text} className={check.ok?'ok':'no'}><Icon name={check.ok?'check':'warning'} size={13}/>{check.text}</li>)}</ul>}
   <ThumbnailStudio key={video.id} video={video} thumbnailText={thumbs[pairAt].trim()||plan.onepager?.thumbnail.headline||''} brief={plan.onepager?{visual:plan.onepager.thumbnail.visual,closer:plan.onepager.thumbnail.closer,layout:plan.onepager.thumbnail.template}:undefined} cards={cards}><ThumbnailImage videoId={video.id}/></ThumbnailStudio>
  </Part>

  <Part part="hook" title="What you say first" flash={flash==='hook'} onOpen={onOpen}>
   <Line className="big" actions={!packaging&&hookWritten&&<button type="button" className="dline-btn" disabled={!aiAvailable} title={!aiAvailable?AI_CONNECT_HINT:undefined} onClick={()=>setAsking('hook')}>Rewrite</button>}>
    <Ed multiline live value={value.hook.spoken} ph="Add the first line you say: it should confirm the title's promise" label="What you say first" onChange={text=>edit({...value,hook:{...value.hook,spoken:text}})} onLeave={save}/>
   </Line>
   {asking==='hook'&&confirm('hook',()=>plan.writePackage('hook'))}
   <Line><span className="dline-k">On screen first</span><Ed multiline live value={value.hook.visual} ph="Add what is on screen first" label="What they see first" onChange={text=>edit({...value,hook:{...value.hook,visual:text}})} onLeave={save}/></Line>
   <Line><span className="dline-k">Words on screen</span><Ed multiline live value={value.hook.text} ph="Add words on screen" label="Words on screen" onChange={text=>edit({...value,hook:{...value.hook,text}})} onLeave={save}/></Line>
  </Part>

  <Part part="scenes" title="Scenes" flash={flash==='scenes'} onOpen={onOpen}>
   {plan.outline?.scenes.length||drafting
    ?<ScenesColumn bare acceptDrops target={video.targetSeconds??0} onTarget={onTarget} hasRecording={!!video.recorderProjectId} outline={plan.outline} known={known} focusId={focusId}
      drafting={drafting} draftLine={plan.outlineJob.phase==='running'?plan.outlineJob.line:undefined} scripting={scripting} scriptingScene={plan.scriptScene} aiName={ai.name} aiBrand={ai.brand}
      onEdit={plan.editOutline} onFocus={onFocus} onDraft={plan.createOutline} onWriteScene={sceneId=>plan.writeScript(sceneId)} onWriteAll={()=>plan.writeScript()} onSceneScript={plan.saveSceneScript} onRecord={onRecordScene} onSaveNow={()=>void plan.flush().catch(()=>{})}/>
    :<div className="doc-empty"><span className="idea-hint">No scenes yet.</span><button type="button" className="btn ghost sm" onClick={()=>{const scene=blankScene();plan.editOutline({scenes:[scene]});onFocus(scene.id!);requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById(sceneCardId(scene.id!))?.scrollIntoView?.({block:'center',behavior:'smooth'})));}}><Icon name="add" size={14}/>Add scene</button><Button variant="ghost" size="sm" disabled={!aiAvailable} title={!aiAvailable?AI_CONNECT_HINT:undefined} onClick={plan.createOutline}><BrandLogo brand={ai.brand} size={14}/>Write with {ai.name}</Button></div>}
  </Part>
 </div>;
}

/** Your thumbnail picture, the same one Publish sends to YouTube. Only a picture you add is shown: none is made up. */
function ThumbnailImage({videoId}:{videoId:string}){
 const found=useThumbnail(videoId);
 const [url,setUrl]=useState<string|null>(null),[error,setError]=useState('');
 const input=useRef<HTMLInputElement>(null);
 const shown=url??found;
 const choose=async(file:File|undefined)=>{
  if(!file)return;
  setError('');
  const form=new FormData();form.append('file',file);
  try{await clubUpload(`/videos/${encodeURIComponent(videoId)}/thumbnail`,form);setUrl(`/api/club/videos/${encodeURIComponent(videoId)}/thumbnail?v=${Date.now()}`);}
  catch(reason){setError(errorMessage(reason,"Couldn't use that image."));}
 };
 return <div className="doc-thumb">
  {shown&&<img className="idea-thumb" src={shown} alt="Your thumbnail"/>}
  <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Choose a thumbnail image" onChange={event=>{void choose(event.target.files?.[0]);event.target.value='';}}/>
  <button type="button" className="linkish idea-image-link" onClick={()=>input.current?.click()}><Icon name="image" size={14}/>{shown?'Replace your thumbnail image':'Add your thumbnail image'}</button>
  {error&&<p className="idea-error" role="alert">{error}</p>}
 </div>;
}
