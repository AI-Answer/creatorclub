import {useCallback,useMemo,useRef,useState} from 'react';
import {errorMessage} from '../api';
import {BreakdownDialog} from '../BreakdownDialog';
import type {BreakdownSource} from '../breakdown';
import {hiddenCounts,isSamePlace,noHidden,recentVideos,stepForStage,visibleVideos,type HiddenFilter} from '../board';
import type {VideoStep} from '../routes';
import {BoardView} from '../BoardView';
import {CalendarView} from '../CalendarView';
import {ErrorLine} from '../ErrorLine';
import {IdeaBox} from '../IdeaBox';
import {TableView} from '../TableView';
import {UndoToast,type ToastMessage} from '../UndoToast';
import {useBoard,type Undoable} from '../useBoard';
import {VideoCard} from '../VideoCard';
import {Button,Spinner,Tabs,cn,type Tab} from '../ui';

const VIEWS:readonly Tab<View>[]=[{id:'board',label:'Board'},{id:'table',label:'Table'},{id:'calendar',label:'Calendar'}];
type View='board'|'table'|'calendar';
const VIEW_KEY='creatorclub.boardView';
const savedView=():View=>{try{const value=localStorage.getItem(VIEW_KEY);return VIEWS.some(view=>view.id===value)?value as View:'board';}catch{return 'board';}};
const saveView=(view:View)=>{try{localStorage.setItem(VIEW_KEY,view);}catch{/* the view just resets next time */}};

/** The home screen: every video as a card moving from idea to published, as a board, a table or a calendar. */
export function BoardScreen({onOpenVideo}:{onOpenVideo(id:string,step:VideoStep):void}){
 const {state,reload,move,schedule,add,receive}=useBoard();
 const [breakdown,setBreakdown]=useState<{source:BreakdownSource;key:number}|null>(null);
 const [view,setView]=useState(savedView),[adding,setAdding]=useState(false),[show,setShow]=useState<HiddenFilter>(noHidden);
 const [toast,setToast]=useState<ToastMessage|null>(null),toastId=useRef(0);
 const videos=state.status==='ready'?state.videos:[];
 const shown=useMemo(()=>visibleVideos(videos,show),[videos,show]);
 const counts=hiddenCounts(videos);

 const say=useCallback((message:string,undo?:()=>void)=>setToast({id:++toastId.current,message,undo}),[]);
 const failed=useCallback((reason:unknown)=>say(errorMessage(reason,"Couldn't save that change.")),[say]);
 // Runs a change, then offers Undo for it. A failure shows one sentence in the same place.
 const run=useCallback((change:()=>Promise<Undoable|undefined>)=>{
  change().then(result=>{
   if(result)say(result.message,()=>{setToast(null);result.undo().catch(failed);});
  },failed);
 },[say,failed]);
 const dismiss=useCallback((id:number)=>setToast(current=>current?.id===id?null:current),[]);
 const changeView=(next:View)=>{setView(next);saveView(next);};

 if(state.status==='loading')return <div className="flex flex-1 items-center justify-center"><Spinner label="Loading your board" size={20}/></div>;
 if(state.status==='error')return <div className="flex flex-1 items-center justify-center p-8"><ErrorLine message={state.message} onRetry={reload} primary/></div>;

 const recent=recentVideos(videos,state.recent);
 const open=(id:string)=>{const video=videos.find(v=>v.id===id);if(video)onOpenVideo(id,stepForStage(video.stage));};
 return <>
  <header className="club-drag flex min-h-16 shrink-0 items-end justify-between gap-4 px-8 pb-2">
   <h1 className="min-w-0 truncate text-3xl font-bold tracking-tight text-ink">{state.workspace?.name??'Board'}</h1>
   <div className="flex shrink-0 items-center gap-3">
    <Tabs label="View" tabs={VIEWS} value={view} onChange={changeView}/>
    <Button variant="primary" onClick={()=>{changeView('board');setAdding(true);}}>+ New video</Button>
   </div>
  </header>
  <div className="min-h-0 flex-1 overflow-auto px-8 pt-4 pb-10">
   {recent.length>0&&<section aria-label="Recent videos" className="mb-8">
    <h2 className="mb-3 text-base font-semibold text-ink">Recent videos</h2>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
     {recent.map(video=><VideoCard key={video.id} variant="tile" video={video} progress={video.recorderProjectId?state.progress[video.recorderProjectId]:undefined} onOpen={()=>open(video.id)}/>)}
    </div>
   </section>}
   {(counts.later>0||counts.skipped>0)&&<div className="mb-3 flex justify-end gap-1" role="group" aria-label="Hidden videos">
    {(['later','skipped'] as const).map(kind=>counts[kind]>0&&<button key={kind} type="button" aria-pressed={show[kind]} onClick={()=>setShow({...show,[kind]:!show[kind]})}
     className={cn('h-7 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent',show[kind]?'bg-accent-soft text-accent':'text-muted hover:bg-subtle hover:text-ink')}>
      {kind==='later'?'Later':'Skipped'} {counts[kind]}
     </button>)}
   </div>}
   {view==='board'&&<BoardView videos={shown} progress={state.progress} onOpen={open} onMove={(id,stage,beforeId)=>{if(!isSamePlace(shown,id,stage,beforeId))run(()=>move(id,stage,beforeId));}}
    ideasTop={<IdeaBox adding={adding} onAddingChange={setAdding} onAdd={async title=>{try{await add(title);}catch(reason){failed(reason);throw reason;}}}
     onBreakDown={url=>setBreakdown(current=>({source:{kind:'link',url},key:(current?.key??0)+1}))} onBreakDownFile={file=>setBreakdown(current=>({source:{kind:'file',file},key:(current?.key??0)+1}))}/>}/>}
   {view==='table'&&<TableView videos={shown} progress={state.progress} onOpen={open}/>}
   {view==='calendar'&&<CalendarView videos={shown} onOpen={open} onSchedule={(id,day)=>run(()=>schedule(id,day))}/>}
  </div>
  {breakdown&&<BreakdownDialog key={breakdown.key} source={breakdown.source} onClose={()=>setBreakdown(null)} onAdded={receive}/>}
  <UndoToast toast={toast} onDone={dismiss}/>
 </>;
}
