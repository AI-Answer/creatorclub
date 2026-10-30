import {useEffect,useMemo,useRef,useState} from 'react';
import type {SignalEntry,TrendingEntry} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {BreakdownDrawer} from '../BreakdownDrawer';
import {PostRow,VideoRow} from '../cards/FeedRow';
import {DISCOVER_SHOWS,discoverCounts,discoverFeed,feedKey,latestRead,sortFor,sortsFor,type DiscoverSort} from '../discover';
import {ErrorLine} from '../ErrorLine';
import {topicLabel} from '../format';
import {openIdeas} from '../ideas';
import {RefreshActions} from '../RefreshActions';
import type {DiscoverShow,Route} from '../routes';
import {withEntry} from '../settings';
import {SubredditChips} from '../settings/SubredditChips';
import {isNew} from '../trending-view';
import {Empty,Icon,Spinner,useToast} from '../ui';
import {savedBreakdown,useBreakdowns} from '../useBreakdowns';
import {useSignals,useTrending} from '../useFeed';
import {ideaFromSource,trendingUrl,useIdeaFrom} from '../useIdeaFrom';
import type {JobRun} from '../useJobRun';
import {useProfile} from '../useProfile';
import {useVideos} from '../useVideos';
import {useAddToResearch} from '../useAddToResearch';

const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;
/** How many cards show before "Show more". */
export const FEED_PAGE=30;

/** What one refresh found, in a few words for a toast: new videos and new posts, or that nothing is new. */
export const refreshSummary=(videos:number,posts:number)=>[videos&&plural(videos,'new video'),posts&&plural(posts,'new post')].filter(Boolean).join(' · ')||'Nothing new since last time';

/** The two refresh jobs as one: running while either runs, with the line of the one that says something. */
const bothJobs=(a:JobRun,b:JobRun):JobRun=>a.phase==='running'||b.phase==='running'
 ?{phase:'running',line:(a.phase==='running'?a.line:undefined)??(b.phase==='running'?b.line:undefined)}
 :{phase:'idle'};

/**
 * Discover: everything from outside in one ranked feed. Videos doing better than their creator's usual on YouTube and posts on X and Reddit,
 * matched to your topics. Chips pick what shows (For you, Followed, YouTube, X, Reddit), one sort orders it, one Refresh reads both again.
 * Every card has one action, Turn into idea (and, under the pointer, Add to Research); a video's row opens its breakdown. Your ideas are on Videos; here is only their count.
 */
export function DiscoverScreen({show='fit',navigate}:{show?:DiscoverShow;navigate(route:Route,options?:{replace?:boolean}):void}){
 const trending=useTrending(),signals=useSignals();
 const profile=useProfile();
 const {state}=useVideos();
 const saved=useBreakdowns();
 const toast=useToast();
 const [chosenSort,setSort]=useState<DiscoverSort>('top');
 const [everything,setEverything]=useState(false),[limit,setLimit]=useState(FEED_PAGE);
 const [breakdown,setBreakdown]=useState<TrendingEntry|null>(null);
 const [failedChannels,setFailedChannels]=useState<string[]>([]),[note,setNote]=useState(''),[allFailed,setAllFailed]=useState<string[]|null>(null),[adding,setAdding]=useState(false);
 const videos=state.status==='ready'?state.videos:[];
 const makeIdea=useIdeaFrom(videos,navigate);
 const addToResearch=useAddToResearch(navigate);
 const sort=sortFor(show,chosenSort);
 const videoItems=trending.data?.items,postItems=signals.data?.items;
 const {shown,off}=useMemo(()=>discoverFeed(videoItems??[],postItems??[],show,sort,everything),[videoItems,postItems,show,sort,everything]);
 const counts=useMemo(()=>discoverCounts(videoItems??[],postItems??[]),[videoItems,postItems]);
 useEffect(()=>setLimit(FEED_PAGE),[show,sort,everything]);
 // One toast for one Refresh, once each job that was started has answered.
 const pending=useRef<{left:number;videos:number;posts:number}|null>(null);

 const finished=(found:{videos?:number;posts?:number})=>{
  const run=pending.current;if(!run)return;
  run.videos+=found.videos??0;run.posts+=found.posts??0;
  if(--run.left===0){pending.current=null;toast(refreshSummary(run.videos,run.posts));}
 };
 const refresh=()=>{
  setFailedChannels([]);setNote('');setAllFailed(null);
  const readPosts=(signals.data?.sources??0)>0;
  pending.current={left:readPosts?2:1,videos:0,posts:0};
  trending.refresh(result=>{setFailedChannels(result.failed);finished({videos:result.added});});
  if(readPosts)signals.refresh(result=>{
   setNote(result.note??'');
   // Nothing could be read: that is an error to retry, not news.
   if(result.tried>0&&result.errors.length>=result.tried){setAllFailed(result.errors);finished({});return;}
   finished({posts:result.added});
  });
 };
 /** Saves one suggested subreddit to the channel's sources, then reads the list again so the posts can be refreshed. */
 const addSubreddit=async(name:string)=>{
  setAdding(true);
  try{
   const config=await clubFetch<{reddit?:string[]}>('/signals-config');
   await clubFetch('/signals-config',{method:'PUT',body:{reddit:withEntry(config.reddit??[],name)}});
   signals.reload();
  }catch(reason){toast(errorMessage(reason,"Couldn't add that."));}
  finally{setAdding(false);}
 };

 const loading=(trending.data===null&&trending.loadError===null)||(signals.data===null&&signals.loadError===null);
 if(loading)return <div className="page"><Spinner label="Loading what's working" size={20}/></div>;
 if(trending.data===null&&signals.data===null)return <div className="page"><ErrorLine message={trending.loadError!} onRetry={()=>{trending.reload();signals.reload();}} primary/></div>;

 const followed=trending.data?.followed??0,sources=signals.data?.sources??0;
 const ideas=openIdeas(videos).length;
 const topics=[...(profile?.topics??[]),...(profile?.audience??[])].map(topicLabel);
 const job=bothJobs(trending.job,signals.job),running=job.phase==='running';
 const updatedAt=latestRead(trending.data?.updatedAt,signals.data?.updatedAt);
 const summary=[trending.data&&plural(trending.data.items.length,'video'),signals.data&&plural(signals.data.items.length,'post')].filter(Boolean).join(' · ');
 const choose=(next:DiscoverShow)=>navigate(next==='fit'?{name:'discover'}:{name:'discover',show:next},{replace:true});
 const openVideoIdea=(item:TrendingEntry)=>{const idea=ideaFromSource(videos,trendingUrl(item.videoId));if(idea)navigate({name:'videos',view:'board',open:idea.id});else void makeIdea({kind:'trending',videoId:item.videoId});};
 const openPostIdea=(item:SignalEntry)=>{const idea=ideaFromSource(videos,item.url);if(idea)navigate({name:'videos',view:'board',open:idea.id});else void makeIdea({kind:'signal',id:item.id,url:item.url});};
 const refreshButton=(label='Refresh')=>running?undefined:<button type="button" className="btn primary" onClick={refresh}><Icon name="retry" size={15}/>{label}</button>;

 return <div className="page">
  <div className="page-head"><div><h1>Discover</h1><div className="lede">What's working on YouTube, X and Reddit, ranked for your topics.</div></div>
   <div className="actions"><RefreshActions updatedAt={updatedAt} summary={summary} job={job} onRefresh={refresh}/></div></div>
  {trending.loadError&&!trending.data&&<div style={{marginBottom:14}}><ErrorLine message={trending.loadError} onRetry={trending.reload}/></div>}
  {signals.loadError&&!signals.data&&<div style={{marginBottom:14}}><ErrorLine message={signals.loadError} onRetry={signals.reload}/></div>}
  {trending.job.phase==='failed'&&<div style={{marginBottom:14}}><ErrorLine message={trending.job.message} onRetry={refresh}/></div>}
  {signals.job.phase==='failed'&&<div style={{marginBottom:14}}><ErrorLine message={signals.job.message} onRetry={refresh}/></div>}
  {allFailed&&<div style={{marginBottom:14}}><ErrorLine message={`Couldn't read ${allFailed.join(', ')}.`} onRetry={refresh}/></div>}
  {(failedChannels.length>0||note||(signals.data?.errors.length&&!allFailed))?<div className="small muted" style={{marginBottom:14}}>{[
   failedChannels.length?`Couldn't read ${failedChannels.join(', ')}. Their earlier videos stay.`:'',note,
   signals.data?.errors.length&&!allFailed?`Couldn't read ${signals.data.errors.join(', ')}.`:''].filter(Boolean).join(' ')}</div>:null}

  <div className="row disc-bar">
   <div className="seg" role="group" aria-label="Show">{DISCOVER_SHOWS.map(([key,label])=><button key={key} type="button" className={show===key?'on':''} aria-pressed={show===key} onClick={()=>choose(key)}>{label} <span className="n">{counts[key]}</span></button>)}</div>
   <label className="sr-only" htmlFor="discover-sort">Sort by</label>
   <select id="discover-sort" className="select" value={sort} onChange={event=>setSort(event.target.value as DiscoverSort)} title="Sort by">{sortsFor(show).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
   <span className="grow"/>
   <button type="button" className="linkish ideas-shelf" onClick={()=>navigate({name:'videos',view:'board'})} title="Your ideas are the first lane of Videos"><Icon name="idea" size={14}/>Your ideas <b className="tnum">{ideas}</b></button>
  </div>
  {topics.length>0&&(show==='fit'||show==='youtube')&&<div className="small muted disc-note">Matched to {topics.join(', ')}. The number on a picture is its views compared with that channel's usual.</div>}

  {shown.length
   ?<div className="card feed">{shown.slice(0,limit).map((entry,index)=>entry.kind==='video'
    ?<VideoRow key={feedKey(entry)} item={entry.item} rank={index+1} isNew={isNew(entry.item,trending.data?.updatedAt??null)} reason={show!=='followed'?entry.item.reason:null}
      hasBreakdown={!!(saved&&savedBreakdown(saved,entry.item.videoId))} inIdeas={!!ideaFromSource(videos,trendingUrl(entry.item.videoId))} onBreak={setBreakdown} onIdea={openVideoIdea} onResearch={item=>void addToResearch({source:'trending',id:item.videoId})}/>
    :<PostRow key={feedKey(entry)} item={entry.item} rank={index+1} reason={entry.item.reason} inIdeas={!!ideaFromSource(videos,entry.item.url)} onIdea={openPostIdea} onResearch={item=>void addToResearch({source:'signal',id:item.id})}/>)}</div>
   :emptyFeed()}
  {shown.length>limit&&<div style={{textAlign:'center',marginTop:14}}><button type="button" className="btn" onClick={()=>setLimit(n=>n+FEED_PAGE)}>Show {Math.min(FEED_PAGE,shown.length-limit)} more</button></div>}
  {shown.length>0&&off>0&&shown.length<=limit&&<div style={{textAlign:'center',marginTop:14}}><button type="button" className="btn" onClick={()=>setEverything(open=>!open)}><Icon name={everything?'hide':'preview'} size={15}/>{everything?"Hide what isn't about your topics":`Show everything (${off} more, off topic or under their usual)`}</button></div>}
  {breakdown&&<BreakdownDrawer videoId={breakdown.videoId} title={breakdown.title} channel={breakdown.channel} multiplier={breakdown.mult} saved={saved} videos={videos} onAdded={id=>navigate({name:'videos',view:'board',new:id})} onClose={()=>setBreakdown(null)}/>}
 </div>;

 /** What an empty feed says: how to fill the source it shows, or that the topics filter left nothing. */
 function emptyFeed(){
  const noVideos=!videoItems?.length,noPosts=!postItems?.length;
  const settings=<button type="button" className="btn primary" onClick={()=>navigate({name:'settings',section:'followed'})}>Follow channels</button>;
  if((show==='youtube'||show==='followed'||(show==='fit'&&noPosts))&&noVideos&&trending.seeding)return <Spinner label="Searching YouTube for your topics" size={20}/>;
  if((show==='youtube'||show==='followed')&&noVideos)return <div className="card">{followed===0
   ?<Empty icon="trending" title="No channels followed yet" action={settings}>Follow channels in Settings. The videos beating their usual views show up here.</Empty>
   :<Empty icon="trending" title="Nothing read yet" action={refreshButton()}>{running?(job.line??'Reading the channels you follow…'):'Refresh to read the channels you follow.'}</Empty>}</div>;
  if((show==='x'||show==='reddit')&&noPosts)return <div className="card">{sources===0
   ?<><Empty icon="signals" title="Add where to read" action={<button type="button" className="btn primary" onClick={()=>navigate({name:'settings',section:'sources'})}><Icon name="add" size={15}/>Add sources</button>}>Discover reads posts from the subreddits and X accounts you choose. Add a few in Settings and they show up here.</Empty>
    <div style={{padding:'0 20px 24px',textAlign:'center'}}><SubredditChips topics={profile?.topics??[]} have={[]} center disabled={adding} onAdd={name=>void addSubreddit(name)}/></div></>
   :<Empty icon="signals" title="No posts yet" action={refreshButton()}>Refresh to read X and Reddit. Add accounts and subreddits in Settings.</Empty>}</div>;
  if(show==='fit'&&noVideos&&noPosts)return <div className="card">{followed===0&&sources===0
   ?<Empty icon="trending" title="Nothing to read yet" action={settings}>Follow a few channels and add subreddits or X accounts in Settings. What's working on your topics shows up here.</Empty>
   :<Empty icon="trending" title="Nothing read yet" action={refreshButton()}>{running?(job.line??'Reading your sources…'):'Refresh to read the channels you follow, X and Reddit.'}</Empty>}</div>;
  if(show==='followed')return <div className="card"><Empty icon="trending" title="Nothing from the channels you follow">Refresh to read them again.</Empty></div>;
  return <div className="card"><Empty icon="trending" title="Nothing about your topics right now" action={off>0?<button type="button" className="btn" onClick={()=>setEverything(true)}>Show everything</button>:undefined}>Nothing about your topics is above its usual right now. Look at everything that was read.</Empty></div>;
 }
}
