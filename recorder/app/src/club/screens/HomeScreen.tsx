import {useMemo,useState} from 'react';
import type {TrendingEntry,Video} from '../../../shared/club';
import {BreakdownDrawer} from '../BreakdownDrawer';
import {ProgressLine} from '../ProgressLine';
import {TrendCard} from '../TrendCards';
import {SCAN_ESTIMATE} from '../welcome';
import {useIdeaActions} from '../useIdeaActions';
import {ErrorLine} from '../ErrorLine';
import {FirstSteps} from '../FirstSteps';
import {fmtDate} from '../format';
import {videoThumbId} from '../ideas';
import {qualifies} from '../trending-view';
import {greeting,greetingName,isFresh,nextAction,overviewLede,progressText,resumeVideos,standing} from '../overview';
import type {Route,VideoTab} from '../routes';
import type {SceneProgress} from '../scene-status';
import {useSceneProgress} from '../scenes';
import {Empty,Icon,SceneDots,Spinner,Thumb} from '../ui';
import {savedBreakdown} from '../useBreakdowns';
import {useBreakdowns} from '../useBreakdowns';
import {useTrending} from '../useFeed';
import {useProfile} from '../useProfile';
import {useVideos} from '../useVideos';

/** Home: the next thing to do, then the other videos in production. A channel with nothing in production yet gets the first-video checklist instead. */
export function HomeScreen({navigate,onNewVideo}:{navigate(route:Route):void;onNewVideo():void}){
 const {state,reload}=useVideos();
 const profile=useProfile();
 const videos=state.status==='ready'?state.videos:[];
 const recent=state.status==='ready'?state.recent:[];
 const now=useMemo(()=>standing(videos),[videos]);
 const inProduction=useMemo(()=>resumeVideos(videos,recent,now.active.length),[videos,recent,now.active.length]);
 const scenes=useSceneProgress(inProduction);

 if(state.status==='error')return <div className="page"><ErrorLine message={state.message} onRetry={reload} primary/></div>;
 if(state.status==='loading'||profile===undefined)return <div className="page"><Spinner label="Loading" size={20}/></div>;

 const fresh=isFresh(now);
 const openVideo=(id:string,tab?:VideoTab)=>navigate({name:'video',id,...(tab&&{tab})});
 const [next,...others]=inProduction;
 // One primary per view: the first-video card and the next-up card each carry their own once there is something to start or continue.
 const newIsPrimary=fresh&&!now.ideas.length;

 return <div className="page">
  <div className="page-head greet">
   <div><h1>{greetingName(profile)?`${greeting()}, ${greetingName(profile)}`:greeting()}</h1><div className="lede">{overviewLede(now)}</div></div>
   <div className="actions"><button type="button" className={`btn${newIsPrimary?' primary':''}`} onClick={onNewVideo}><Icon name="add" size={15}/>New video</button></div>
  </div>

  {fresh
   ?<FirstVideo ideas={now.ideas} videos={videos} hasTopics={!!profile?.topics.length} navigate={navigate}/>
   :<>
    {!next
     ?<div className="card"><Empty icon="video" title="Nothing in production" action={<button type="button" className="btn primary" onClick={()=>navigate({name:'videos',view:'board'})}>Pick an idea</button>}>Start planning an idea to bring it here.</Empty></div>
     :<>
      <div className="sec-head"><h2 className="sec">Next up</h2></div>
      <NextUp video={next} progress={scenes[next.id]} onOpen={openVideo}/>
      {others.length>0&&<>
       <div className="sec-head"><h2 className="sec">Also in production</h2></div>
       <div className="card list-card">{others.map(video=><ProductionRow key={video.id} video={video} progress={scenes[video.id]} onOpen={openVideo}/>)}</div>
      </>}
     </>}
    <TrendPicks videos={videos} navigate={navigate}/>
   </>}
 </div>;
}

/** Working now, read for Home: the picks and the breakdown drawer they open. Both Home states use it, so the first video's checklist and the picks after it are the same cards. */
function usePicks(videos:readonly Video[],navigate:(route:Route)=>void){
 const feed=useTrending();
 const saved=useBreakdowns();
 const [breakdown,setBreakdown]=useState<TrendingEntry|null>(null);
 // Null while the list is still loading, so the screen does not say "nothing" for a moment first.
 const waiting=feed.data===null&&feed.loadError===null;
 const picks=(feed.data?.items??[]).filter(qualifies).slice(0,3);
 const searching=feed.seeding?{line:feed.job.phase==='running'?feed.job.line:undefined}:null;
 const drawer=breakdown&&<BreakdownDrawer videoId={breakdown.videoId} title={breakdown.title} channel={breakdown.channel} multiplier={breakdown.mult} saved={saved} videos={videos} onAdded={id=>navigate({name:'videos',view:'board',new:id})} onClose={()=>setBreakdown(null)}/>;
 return {feed,picks,waiting,searching,drawer,open:setBreakdown,hasBreakdown:(videoId:string)=>!!saved&&!!savedBreakdown(saved,videoId)};
}

/** After the first video: the picks stay, under what to do next, so there is always a next idea in sight. */
function TrendPicks({videos,navigate}:{videos:readonly Video[];navigate:(route:Route)=>void}){
 const {feed,picks,searching,drawer,open,hasBreakdown}=usePicks(videos,navigate);
 if(feed.loadError&&!feed.data)return null;
 if(searching)return <><div className="sec-head"><h2 className="sec">Working in your topics</h2></div><div className="card" style={{padding:18}}><ProgressLine label="Searching YouTube for your topics" line={searching.line??'Starting the search on your topics…'} estimate={SCAN_ESTIMATE} note="You don't have to wait."/></div></>;
 if(!picks.length)return null;
 return <>
  <div className="sec-head"><h2 className="sec">Working in your topics</h2><a className="linkish small more" href="#/discover">More in Discover</a></div>
  <div className="grid g3" style={{gap:12}}>{picks.map(item=><TrendCard key={item.videoId} item={item} saved={hasBreakdown(item.videoId)} onBreak={open}/>)}</div>
  {drawer}
 </>;
}

/** The checklist of a channel with nothing in production, with the videos working now to start from. Only here and in the picks after it is Working now read. */
function FirstVideo({ideas,videos,hasTopics,navigate}:{ideas:readonly Video[];videos:readonly Video[];hasTopics:boolean;navigate(route:Route):void}){
 const {feed,picks,waiting,searching,drawer,open,hasBreakdown}=usePicks(videos,navigate);
 const actions=useIdeaActions(navigate);
 return <>
  <FirstSteps ideas={ideas} hasTopics={hasTopics} start={waiting?null:picks} searching={searching} hasBreakdown={hasBreakdown}
   error={feed.loadError&&!feed.data?feed.loadError:null} onRetry={feed.reload} onBreak={open}
   onStartIdea={video=>void actions.startPlanning(video)} onOpenStep={(video,tab)=>navigate({name:'video',id:video.id,tab})}
   onSettings={()=>navigate({name:'settings'})} onFollow={()=>navigate({name:'settings',section:'followed'})} onDiscover={()=>navigate({name:'discover'})}/>
  {drawer}
 </>;
}

type OpenVideo=(id:string,tab?:VideoTab)=>void;
const onEnter=(open:()=>void)=>(event:{key:string;target:unknown;currentTarget:unknown})=>{if(event.key==='Enter'&&event.target===event.currentTarget)open();};

/** The video to work on next, with the one button that does it. */
function NextUp({video,progress,onOpen}:{video:Video;progress:readonly SceneProgress[]|undefined;onOpen:OpenVideo}){
 const action=nextAction(video,progress);
 return <div className="card nextup hov" onClick={()=>onOpen(video.id)} tabIndex={0} onKeyDown={onEnter(()=>onOpen(video.id))}>
  <Thumb videoId={videoThumbId(video)} seed={video.id}/>
  <div className="body">
   {video.publishDate&&<div className="faint small"><Icon name="calendar" size={12}/> {fmtDate(video.publishDate)}</div>}
   <div className="title clamp2">{video.title}</div>
   <div className="row small muted"><SceneDots scenes={progress??[]}/><span>{progressText(video,progress)}</span></div>
   <div className="row" style={{marginTop:'auto',paddingTop:6}}>
    {/* The button waits for the scenes, so its words are the real next step and never change a moment later. */}
    {progress===undefined&&(video.stage==='planning'||video.stage==='recording'||video.stage==='editing')
     ?<span className="btn primary is-waiting" aria-busy="true"><span className="spin"/>Next step</span>
     :<button type="button" className="btn primary" onClick={event=>{event.stopPropagation();onOpen(video.id,action.tab);}}><Icon name={action.icon} size={15}/>{action.label}</button>}
   </div>
  </div>
 </div>;
}

/** A video in production on one line: where it stands and the button for its next step. */
function ProductionRow({video,progress,onOpen}:{video:Video;progress:readonly SceneProgress[]|undefined;onOpen:OpenVideo}){
 const action=nextAction(video,progress);
 return <div className="li" onClick={()=>onOpen(video.id)} tabIndex={0} onKeyDown={onEnter(()=>onOpen(video.id))}>
  <Thumb className="lt" videoId={videoThumbId(video)} seed={video.id}/>
  <div className="grow" style={{minWidth:0}}>
   <div className="tt clamp2">{video.title}</div>
   <div className="row small muted" style={{marginTop:4}}><SceneDots scenes={progress??[]}/><span>{progressText(video,progress)}</span></div>
  </div>
  {progress===undefined&&(video.stage==='planning'||video.stage==='recording'||video.stage==='editing')
   ?<span className="btn sm is-waiting" aria-busy="true"><span className="spin"/></span>
   :<button type="button" className="btn sm" onClick={event=>{event.stopPropagation();onOpen(video.id,action.tab);}}><Icon name={action.icon} size={14}/>{action.label}</button>}
 </div>;
}
