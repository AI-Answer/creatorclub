import {useCallback,useEffect,useState} from 'react';
import type {Video} from '../../../shared/club';
import {youtubeId} from '../board';
import {BreakdownDrawer} from '../BreakdownDrawer';
import {ErrorLine} from '../ErrorLine';
import {breakdownUrl} from '../ideas';
import {IdeaDrawer} from '../IdeaDrawer';
import {CalendarView} from '../production/CalendarView';
import {Kanban} from '../production/Kanban';
import {TableView} from '../production/TableView';
import {openRoute} from '../production';
import type {Route,VideosView} from '../routes';
import {useSceneProgress} from '../scenes';
import {Icon,Spinner,Tabs,type Tab} from '../ui';
import {useBreakdowns} from '../useBreakdowns';
import {useIdeaActions} from '../useIdeaActions';
import {useProduction} from '../useProduction';

type VideosRoute=Extract<Route,{name:'videos'}>;
const VIEWS:readonly Tab<VideosView>[]=[{id:'board',label:'Board',icon:'SquareKanban'},{id:'table',label:'Table',icon:'Table'},{id:'calendar',label:'Calendar',icon:'Calendar'}];
const NONE:never[]=[];

/**
 * Videos: every video from idea to published, in one pipeline. Ideas are its first lane (grouped Timely, Evergreen, Later, Skipped), then Planning,
 * Recording, Editing, Publishing and Published, as a board you drag cards across, a table or a calendar. An idea opens in its drawer, any other
 * video on its page. A link from New video (`bd`) is broken down in a drawer; a new idea (`new`) is marked and offered for planning.
 */
export function VideosScreen({route,navigate,onNewVideo}:{route:VideosRoute;navigate(route:Route,options?:{replace?:boolean}):void;onNewVideo():void}){
 const {state,videos,reload,move,schedule}=useProduction();
 const scenes=useSceneProgress(videos??NONE);
 const actions=useIdeaActions(navigate);
 const saved=useBreakdowns();
 const {view,group,bd,new:newId}=route;
 const [drawer,setDrawer]=useState<string|null>(route.open??null);
 // The link being broken down; `key` starts a new run for each link sent, even while a drawer is open.
 const [link,setLink]=useState<{url:string;key:number}|null>(null);

 // A link from New video starts its breakdown once and leaves the address, so a reload does not run it again.
 useEffect(()=>{
  if(!bd)return;
  setLink(current=>({url:breakdownUrl(bd),key:(current?.key??0)+1}));
  navigate({name:'videos',view,...(group&&{group})},{replace:true});
 },[bd,view,group,navigate]);
 useEffect(()=>{if(route.open)setDrawer(route.open);},[route.open]);
 const loaded=!!videos;
 useEffect(()=>{
  if(!newId||!loaded)return;
  const timer=setTimeout(()=>document.getElementById(`idea-${newId}`)?.scrollIntoView?.({behavior:'smooth',block:'center'}),120);
  return()=>clearTimeout(timer);
 },[newId,loaded]);

 const open=useCallback((video:Video)=>{if(video.stage==='ideas')setDrawer(video.id);else navigate(openRoute(video));},[navigate]);

 if(state.status==='error')return <div className="page"><ErrorLine message={state.message} onRetry={reload} primary/></div>;
 if(!videos)return <div className="page"><Spinner label="Loading your videos" size={20}/></div>;

 const idea=drawer?videos.find(video=>video.id===drawer&&video.stage==='ideas'):undefined;
 const newIdea=newId?videos.find(video=>video.id===newId&&video.stage==='ideas'&&!video.hidden):undefined;
 const closeDrawer=()=>{setDrawer(null);if(route.open){const {open:_open,...rest}=route;navigate(rest,{replace:true});}};
 const added=(id:string)=>{setLink(null);navigate({name:'videos',view:'board',new:id});};
 const wide=view==='board';
 return <div className={`page${wide?' wide':''}`} style={wide?{maxWidth:'none',paddingLeft:24,paddingRight:24}:undefined}>
  <div className="page-head"><div><h1>Videos</h1><div className="lede">Every video from idea to published. Drag a card to move it.</div></div>
   <div className="actions">
    <Tabs label="View" tabs={VIEWS} value={view} onChange={next=>navigate({name:'videos',view:next})}/>
    <button type="button" className={`btn${newIdea?'':' primary'}`} onClick={onNewVideo}><Icon name="Plus" size={15}/>New video</button>
   </div></div>

  {newIdea&&<div className="card next-idea">
   <Icon name="Sparkles" size={18} style={{color:'var(--cc-accent)'}}/>
   <div className="grow"><b>"{newIdea.title}" is in your ideas.</b><div className="small muted">Next: start planning it. You'll gather references on its board, then turn them into scenes.</div></div>
   <button type="button" className="btn primary" onClick={()=>void actions.startPlanning(newIdea)}><Icon name="ArrowRight" size={15}/>Start planning</button>
  </div>}

  {view==='board'&&<Kanban videos={videos} scenes={scenes} ideas={{newId,openGroup:group,actions}} onOpen={open} onMove={(id,stage,beforeId)=>void move(id,stage,beforeId)}/>}
  {view==='table'&&<TableView videos={videos} scenes={scenes} onOpen={open}/>}
  {view==='calendar'&&<CalendarView videos={videos} onOpen={open} onOpenPublish={video=>navigate(openRoute(video,'publish'))} onSchedule={(id,day)=>void schedule(id,day)}/>}
  {idea&&<IdeaDrawer video={idea} actions={actions} onClose={closeDrawer} onRemove={video=>{closeDrawer();actions.remove(video);}}/>}
  {link&&<BreakdownDrawer key={link.key} videoId={youtubeId(link.url)} url={link.url} saved={saved} videos={videos} onAdded={added} onClose={()=>setLink(null)}/>}
 </div>;
}
