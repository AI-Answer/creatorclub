import {useMemo,useState} from 'react';
import type {TrendingEntry} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {BreakdownDrawer} from '../BreakdownDrawer';
import {TrendCard} from '../cards/TrendCard';
import {ErrorLine} from '../ErrorLine';
import {FirstSteps} from '../FirstSteps';
import {fmtDate,fmtHours,fmtNum} from '../format';
import {videoThumbId} from '../ideas';
import {ACTIVE_STAGES,firstName,greeting,isFresh,nextAction,overviewLede,progressText,resumeVideos,stageCounts,standing} from '../overview';
import type {Route,VideoTab} from '../routes';
import {useSceneProgress} from '../scenes';
import {Empty,Icon,Level,SceneDots,SourceIcon,Spinner,Thumb} from '../ui';
import {useBreakdowns} from '../useBreakdowns';
import {useSignals,useTrending} from '../useFeed';
import {useProfile} from '../useProfile';
import {useVideos} from '../useVideos';

const STAGES=['ideas',...ACTIVE_STAGES,'published'] as const;

/** Overview: where you left off, what is in production, the ideas waiting, and what is working now and being said in your space. */
export function OverviewScreen({navigate,onNewVideo}:{navigate(route:Route):void;onNewVideo():void}){
 const {state,reload}=useVideos();
 const profile=useProfile();
 const trendingFeed=useTrending(),signalsFeed=useSignals();
 const trending=trendingFeed.data,signals=signalsFeed.data;
 // Null while a list is still loading, so an empty message is not shown for a moment first.
 const loading=(feed:{data:unknown;loadError:string|null})=>feed.data===null&&feed.loadError===null;
 const saved=useBreakdowns();
 const [breakdown,setBreakdown]=useState<TrendingEntry|null>(null);
 const videos=state.status==='ready'?state.videos:[];
 const recent=state.status==='ready'?state.recent:[];
 const now=useMemo(()=>standing(videos),[videos]);
 const resume=useMemo(()=>resumeVideos(videos,recent),[videos,recent]);
 const scenes=useSceneProgress(resume);

 if(state.status==='error')return <div className="page"><ErrorLine message={state.message} onRetry={reload} primary/></div>;
 if(state.status==='loading'||profile===undefined)return <div className="page"><Spinner label="Loading your overview" size={20}/></div>;

 const {active,ideas}=now,fresh=isFresh(now);
 const topPicks=(trending?.items??[]).filter(item=>item.fit);
 const latest=(signals?.items??[]).filter(item=>item.fit).slice(0,4);
 const counts=stageCounts(videos,STAGES);
 const most=Math.max(1,...counts.map(row=>row.count));
 const openVideo=(id:string,tab?:VideoTab)=>navigate({name:'video',id,...(tab&&{tab})});
 const production=()=>navigate({name:'production',view:'board'});

 return <div className="page">
  <div className="page-head greet">
   <div><h1>{profile?.person?`${greeting()}, ${firstName(profile.person)}`:greeting()}</h1><div className="lede">{overviewLede(now)}</div></div>
   <div className="actions"><button type="button" className={`btn${fresh?'':' primary'}`} onClick={onNewVideo}><Icon name="Plus" size={15}/>New video</button></div>
  </div>

  {fresh
   ?<FirstSteps ideas={ideas} hasTopics={!!profile?.topics.length} start={loading(trendingFeed)?null:topPicks.slice(0,3)} onBreak={setBreakdown} onOpenIdea={video=>navigate({name:'ideas',new:video.id})} onIdeas={()=>navigate({name:'ideas'})}/>
   :<>
    <div className="sec-head"><h2 className="sec">Pick up where you left off</h2><button type="button" className="linkish more" onClick={production}>Open production</button></div>
    {resume.length===0
     ?<div className="card"><Empty icon="Clapperboard" title="Nothing in production" action={<button type="button" className="btn" onClick={()=>navigate({name:'ideas'})}>Open Ideas</button>}>Start planning an idea to bring it here.</Empty></div>
     :<div className="resume">{resume.map(video=>{
     const progress=scenes[video.id],next=nextAction(video,progress);
     return <div key={video.id} className="card hov" onClick={()=>openVideo(video.id)} tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)openVideo(video.id);}}>
      <Thumb videoId={videoThumbId(video)} text={video.title} seed={video.id} chip={<span className="chip solid on-thumb">{STAGE_LABEL[video.stage]}</span>}/>
      <div className="body">
       <div className="title clamp2">{video.title}</div>
       <div className="row small muted"><SceneDots scenes={progress??[]}/><span>{progressText(video,progress)}</span></div>
       <div className="row" style={{marginTop:'auto',paddingTop:4}}>
        <button type="button" className="btn sm" onClick={event=>{event.stopPropagation();openVideo(video.id,next.tab);}}><Icon name={next.icon} size={14}/>{next.label}</button>
        {video.publishDate&&<span className="faint small" style={{marginLeft:'auto'}}><Icon name="Calendar" size={12}/> {fmtDate(video.publishDate)}</span>}
       </div>
      </div>
     </div>;
    })}</div>}
   </>}

  <div className="ov-cols" style={{marginTop:8}}>
   <div>
    <div className="sec-head"><h2 className="sec"><Icon name="TrendingUp" size={16}/>Working now</h2><span className="faint small">Outliers in your space this week</span><button type="button" className="linkish more" onClick={()=>navigate({name:'trending'})}>See all {trending?.items.length??0}</button></div>
    {loading(trendingFeed)?<Spinner label="Loading what's working" size={18}/>
     :topPicks.length
     ?<div className="grid g3">{topPicks.slice(0,6).map(item=><TrendCard key={item.videoId} item={item} reason={item.reason} compact onBreak={setBreakdown}/>)}</div>
     :<div className="card"><Empty icon="TrendingUp" title={trending?.followed===0?'No channels followed yet':'Nothing about your topics yet'} action={<button type="button" className="btn" onClick={()=>navigate({name:'trending'})}>Open Working now</button>}>{trending?.followed===0?'Follow channels in Settings. The videos beating their usual views show up here.':'Refresh Working now to read the channels you follow.'}</Empty></div>}
   </div>
   <div>
    {!fresh&&<>
     <div className="sec-head"><h2 className="sec">In production</h2></div>
     <div className="card pipeline">{counts.map(({stage,count})=><div key={stage} className={`pipe-row st-${stage}`} style={{background:'none'}} onClick={production}>
      <span style={{width:82,fontSize:13,fontWeight:550,color:'var(--cc-text)'}}>{STAGE_LABEL[stage]}</span>
      <span className="bar"><i style={{width:`${count/most*100}%`}}/></span><span className="n" style={{color:'var(--cc-text)'}}>{count}</span></div>)}</div>
    </>}
    <div className="sec-head"><h2 className="sec">Next-up ideas</h2><button type="button" className="linkish more" onClick={()=>navigate({name:'ideas'})}>All ideas</button></div>
    {ideas.length
     ?<div className="card list-card">{ideas.slice(0,4).map(video=><div key={video.id} className="li" onClick={()=>navigate({name:'ideas',open:video.id})}>
      <div className="grow"><div className="tt clamp2">{video.title}</div><div className="row" style={{marginTop:6,gap:4}}><Level label="Demand" d={video.idea?.demand}/><Level label="Gap" d={video.idea?.gap}/></div></div>
      <Icon name="ChevronRight" size={16} className="faint"/>
     </div>)}</div>
     :<div className="card"><Empty icon="Lightbulb" title="No ideas yet">Break down one of the videos that's working and keep the concept you'd make.</Empty></div>}
    <div className="sec-head"><h2 className="sec">Latest signals</h2><button type="button" className="linkish more" onClick={()=>navigate({name:'signals'})}>All signals</button></div>
    {loading(signalsFeed)?<Spinner label="Loading the posts" size={18}/>
     :latest.length
     ?<div className="card list-card">{latest.map(post=><div key={post.id} className="li" style={{alignItems:'flex-start'}} onClick={()=>navigate({name:'signals'})}>
      <SourceIcon source={post.source}/>
      <div className="grow" style={{minWidth:0}}><div className="small muted ellipsis"><b style={{color:'var(--cc-text)'}}>{post.author}</b> · {fmtHours(post.ageHours)}</div><div className="clamp2" style={{fontSize:13.5,marginTop:2}}>{post.text}</div>
       <div className="stats" style={{marginTop:4}}><span><Icon name="Heart" size={12}/>{fmtNum(post.likes)}</span><span><Icon name="MessageCircle" size={12}/>{fmtNum(post.replies)}</span></div></div>
     </div>)}</div>
     :<div className="card"><Empty icon="MessagesSquare" title="No posts about your topics yet">Refresh Signals to read X and Reddit.</Empty></div>}
   </div>
  </div>
  {breakdown&&<BreakdownDrawer videoId={breakdown.videoId} title={breakdown.title} channel={breakdown.channel} multiplier={breakdown.mult} saved={saved} videos={videos} onAdded={id=>navigate({name:'ideas',new:id})} onClose={()=>setBreakdown(null)}/>}
 </div>;
}
