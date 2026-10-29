import {useMemo,useState} from 'react';
import type {TrendingEntry,Video} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {BreakdownDrawer} from '../BreakdownDrawer';
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

 return <div className="page">
  <div className="page-head greet">
   <div><h1>{greetingName(profile)?`${greeting()}, ${greetingName(profile)}`:greeting()}</h1><div className="lede">{overviewLede(now)}</div></div>
   <div className="actions"><button type="button" className="btn" onClick={onNewVideo}><Icon name="Plus" size={15}/>New video</button></div>
  </div>

  {fresh
   ?<FirstVideo ideas={now.ideas} videos={videos} hasTopics={!!profile?.topics.length} navigate={navigate}/>
   :!next
    ?<div className="card"><Empty icon="Clapperboard" title="Nothing in production" action={<button type="button" className="btn primary" onClick={()=>navigate({name:'videos',view:'board'})}>Pick an idea</button>}>Start planning an idea to bring it here.</Empty></div>
    :<>
     <div className="sec-head"><h2 className="sec">Next up</h2></div>
     <NextUp video={next} progress={scenes[next.id]} onOpen={openVideo}/>
     {others.length>0&&<>
      <div className="sec-head"><h2 className="sec">Also in production</h2></div>
      <div className="card list-card">{others.map(video=><ProductionRow key={video.id} video={video} progress={scenes[video.id]} onOpen={openVideo}/>)}</div>
     </>}
    </>}
 </div>;
}

/** The checklist of a channel with nothing in production, with the videos working now to start from. Only here is Working now read. */
function FirstVideo({ideas,videos,hasTopics,navigate}:{ideas:readonly Video[];videos:readonly Video[];hasTopics:boolean;navigate(route:Route):void}){
 const feed=useTrending();
 const saved=useBreakdowns();
 const [breakdown,setBreakdown]=useState<TrendingEntry|null>(null);
 // Null while the list is still loading, so the checklist does not say "nothing" for a moment first.
 const waiting=feed.data===null&&feed.loadError===null;
 const picks=(feed.data?.items??[]).filter(qualifies).slice(0,3);
 return <>
  <FirstSteps ideas={ideas} hasTopics={hasTopics} start={waiting||feed.seeding?null:picks} error={feed.loadError&&!feed.data?feed.loadError:null} onRetry={feed.reload} onBreak={setBreakdown} onOpenIdea={video=>navigate({name:'videos',view:'board',new:video.id})} onIdeas={()=>navigate({name:'discover'})}/>
  {breakdown&&<BreakdownDrawer videoId={breakdown.videoId} title={breakdown.title} channel={breakdown.channel} multiplier={breakdown.mult} saved={saved} videos={videos} onAdded={id=>navigate({name:'videos',view:'board',new:id})} onClose={()=>setBreakdown(null)}/>}
 </>;
}

type OpenVideo=(id:string,tab?:VideoTab)=>void;
const onEnter=(open:()=>void)=>(event:{key:string;target:unknown;currentTarget:unknown})=>{if(event.key==='Enter'&&event.target===event.currentTarget)open();};

/** The video to work on next, with the one button that does it. */
function NextUp({video,progress,onOpen}:{video:Video;progress:readonly SceneProgress[]|undefined;onOpen:OpenVideo}){
 const action=nextAction(video,progress);
 return <div className="card nextup hov" onClick={()=>onOpen(video.id)} tabIndex={0} onKeyDown={onEnter(()=>onOpen(video.id))}>
  <Thumb videoId={videoThumbId(video)} text={video.title} seed={video.id}/>
  <div className="body">
   <div className="faint small">{STAGE_LABEL[video.stage]}{video.publishDate&&<> · <Icon name="Calendar" size={12}/> {fmtDate(video.publishDate)}</>}</div>
   <div className="title clamp2">{video.title}</div>
   <div className="row small muted"><SceneDots scenes={progress??[]}/><span>{progressText(video,progress)}</span></div>
   <div className="row" style={{marginTop:'auto',paddingTop:6}}>
    <button type="button" className="btn primary" onClick={event=>{event.stopPropagation();onOpen(video.id,action.tab);}}><Icon name={action.icon} size={15}/>{action.label}</button>
   </div>
  </div>
 </div>;
}

/** A video in production on one line: where it stands and the button for its next step. */
function ProductionRow({video,progress,onOpen}:{video:Video;progress:readonly SceneProgress[]|undefined;onOpen:OpenVideo}){
 const action=nextAction(video,progress);
 return <div className="li" onClick={()=>onOpen(video.id)} tabIndex={0} onKeyDown={onEnter(()=>onOpen(video.id))}>
  <Thumb className="lt" videoId={videoThumbId(video)} text={video.title} seed={video.id}/>
  <div className="grow" style={{minWidth:0}}>
   <div className="tt clamp2">{video.title}</div>
   <div className="row small muted" style={{marginTop:4}}><SceneDots scenes={progress??[]}/><span>{progressText(video,progress)}</span></div>
  </div>
  <button type="button" className="btn sm" onClick={event=>{event.stopPropagation();onOpen(video.id,action.tab);}}><Icon name={action.icon} size={14}/>{action.label}</button>
 </div>;
}
