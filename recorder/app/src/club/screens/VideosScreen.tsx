import {useCallback,useEffect,useState} from 'react';
import {clubFetch} from '../api';
import type {Video,VideoStage} from '../../../shared/club';
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
import {useAddToResearch} from '../useAddToResearch';

import {ScreenHeader} from './ScreenHeader';

type VideosRoute=Extract<Route,{name:'videos'}>;
const VIEWS:readonly Tab<VideosView>[]=[{id:'board',label:'Board',icon:'production'},{id:'table',label:'Table',icon:'table'},{id:'calendar',label:'Calendar',icon:'calendar'}];
const NONE:never[]=[];

/** Videos shares its flat board with Home and keeps alternate table/calendar views and explicit idea/breakdown drawers. */
export function VideosScreen({route,navigate,onNewVideo}:{route:VideosRoute;navigate(route:Route,options?:{replace?:boolean}):void;onNewVideo():void}){
 const {state,videos,reload,move,schedule}=useProduction();
 const scenes=useSceneProgress(videos??NONE);
 const actions=useIdeaActions(navigate);
 const addToResearch=useAddToResearch(navigate);
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

 const open=useCallback((video:Video)=>{if(view==='board')navigate({name:'video',id:video.id});else if(video.stage==='ideas')setDrawer(video.id);else navigate(openRoute(video));},[navigate,view]);

 const idea=drawer?videos?.find(video=>video.id===drawer&&video.stage==='ideas'):undefined;
 const newIdea=newId?videos?.find(video=>video.id===newId&&video.stage==='ideas'&&!video.hidden):undefined;
 const header=<ScreenHeader title="Video board" actions={<>
  <Tabs label="View" tabs={VIEWS} value={view} onChange={next=>navigate({name:'videos',view:next})}/>
  <button type="button" className={`btn${newIdea?'':' primary'}`} onClick={onNewVideo} title="New video · N"><Icon name="add" size={15}/>New video</button>
 </>}/>;
 if(state.status==='error')return <div className="page">{header}<ErrorLine message={state.message} fallback="Couldn't load Video board." onRetry={reload} primary/></div>;
 if(!videos)return <div className="page">{header}<div className="row small muted" role="status"><Spinner label="Loading your videos" size={20}/>Loading your videos…</div></div>;

 const closeDrawer=()=>{setDrawer(null);if(route.open){const {open:_open,...rest}=route;navigate(rest,{replace:true});}};
 const added=(id:string)=>{setLink(null);navigate({name:'videos',view:'board',new:id});};
 const wide=view==='board';
 return <div className={`page${wide?' wide video-board-page':''}`}>
  {header}

  {newIdea&&<div className="card next-idea">
   <Icon name="ai" size={18} style={{color:'var(--cc-text-2)'}}/>
   <div className="grow"><b>"{newIdea.title}" is in your ideas.</b><div className="small muted">Next: start planning it. You'll gather references on its board, then turn them into scenes.</div></div>
   <button type="button" className="btn primary" onClick={()=>void actions.startPlanning(newIdea)}><Icon name="next" size={15}/>Start planning</button>
  </div>}

  {view==='board'&&<Kanban onAdd={async(title:string,stage:VideoStage)=>{await clubFetch('/videos',{method:'POST',body:{title,stage}});reload();}} videos={videos} scenes={scenes} ideas={{newId,openGroup:group,actions}} onOpen={open} onMove={(id,stage,beforeId)=>void move(id,stage,beforeId)} onResearch={video=>void addToResearch({source:'video',id:video.id})}/>}
  {view==='table'&&<TableView videos={videos} scenes={scenes} onOpen={open}/>}
  {view==='calendar'&&<CalendarView videos={videos} onOpen={open} onOpenPublish={video=>navigate(openRoute(video,'publish'))} onSchedule={(id,day)=>void schedule(id,day)}/>}
  {idea&&<IdeaDrawer video={idea} actions={actions} onClose={closeDrawer} onRemove={video=>{closeDrawer();actions.remove(video);}}/>}
  {link&&<BreakdownDrawer key={link.key} videoId={youtubeId(link.url)} url={link.url} saved={saved} videos={videos} onAdded={added} onClose={()=>setLink(null)}/>}
 </div>;
}
