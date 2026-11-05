import {BrandLogo} from '../../BrandLogo';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {SignalEntry,TrendingEntry} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {BreakdownDrawer} from '../BreakdownDrawer';
import {PostRow,VideoRow} from '../cards/FeedRow';
import {DISCOVER_SOURCES,DISCOVER_VIEWS,discoverCounts,discoverFeed,feedKey,latestRead,sameFeed,sortFor,sortsFor,sourceList,viewOf,type DiscoverSort} from '../discover';
import {ErrorLine} from '../ErrorLine';
import {topicLabel} from '../format';
import {openIdeas} from '../ideas';
import {RefreshActions} from '../RefreshActions';
import type {DiscoverShow,Route} from '../routes';
import {withEntry} from '../settings';
import {SubredditChips} from '../settings/SubredditChips';
import {isNew} from '../trending-view';
import {Empty,Icon,Select,Spinner,useToast} from '../ui';
import {savedBreakdown,useBreakdowns} from '../useBreakdowns';
import {useSignals,useTrending} from '../useFeed';
import {ideaFromSource,trendingUrl,useIdeaFrom} from '../useIdeaFrom';
import type {JobRun} from '../useJobRun';
import {useProfile} from '../useProfile';
import {useVideos} from '../useVideos';
import {useAddToResearch} from '../useAddToResearch';

import {ScreenHeader} from './ScreenHeader';

const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;
/** How many cards show before "Show more". */
export const FEED_PAGE=30;

/** What one refresh found, in a few words for a toast: new videos and new posts, or that nothing is new. */
export const refreshSummary=(videos:number,posts:number)=>[videos&&plural(videos,'new video'),posts&&plural(posts,'new post')].filter(Boolean).join(' · ')||'Nothing new since last time';

/** The two refresh jobs as one: running while either runs, with the line of the one that says something. */
const bothJobs=(a:JobRun,b:JobRun):JobRun=>a.phase==='running'||b.phase==='running'
 ?{phase:'running',line:(a.phase==='running'?a.line:undefined)??(b.phase==='running'?b.line:undefined)}
 :{phase:'idle'};

type Lists={videos:readonly TrendingEntry[];posts:readonly SignalEntry[]};
type Waiting={left:Set<'videos'|'posts'>;videos:number;posts:number;news:boolean};

/**
 * Discover: everything from outside in one ranked feed. Videos doing better than their creator's usual on YouTube and posts on X and Reddit,
 * matched to your topics. A view switch (For you, Followed), source chips under For you (YouTube, X, Reddit), one sort, one Refresh that reads both again.
 * While a refresh runs the rows stay where they are; when it is done and the order changed, "New results" puts the new order in.
 * A source that could not be read keeps its earlier posts and is named with Try again, which reads just those sources.
 * Every card has one action, Turn into idea (it flips to In ideas at once; Add to Research shows under the pointer); a video's row opens its breakdown. Your ideas are on Videos; here is only their count.
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
 const [failedChannels,setFailedChannels]=useState<string[]>([]),[note,setNote]=useState(''),[adding,setAdding]=useState(false);
 const videos=state.status==='ready'?state.videos:[];
 const ideaFrom=useIdeaFrom(videos,navigate);
 const addToResearch=useAddToResearch(navigate);
 const sort=sortFor(show,chosenSort);

 // While a refresh runs, the rows on screen are the ones from before it: nothing moves under the pointer.
 const live:Lists={videos:trending.data?.items??[],posts:signals.data?.items??[]};
 const [held,setHeld]=useState<Lists|null>(null),[newResults,setNewResults]=useState(false);
 const lists=held??live;
 const {shown,off}=useMemo(()=>discoverFeed(lists.videos,lists.posts,show,sort,everything),[lists.videos,lists.posts,show,sort,everything]);
 const counts=useMemo(()=>discoverCounts(lists.videos,lists.posts),[lists.videos,lists.posts]);
 useEffect(()=>setLimit(FEED_PAGE),[show,sort,everything]);
 const showNew=useCallback(()=>{setHeld(null);setNewResults(false);},[]);

 // One toast for one Refresh, once each job that was started has answered (or failed).
 const waiting=useRef<Waiting|null>(null);
 const [settled,setSettled]=useState(0);
 const finished=useCallback((kind:'videos'|'posts',found?:number)=>{
  const run=waiting.current;if(!run||!run.left.has(kind))return;
  run.left.delete(kind);
  if(found!==undefined){run[kind]+=found;run.news=true;}
  if(run.left.size)return;
  waiting.current=null;
  if(run.news)toast(refreshSummary(run.videos,run.posts));
  setSettled(n=>n+1);
 },[toast]);
 useEffect(()=>{if(trending.job.phase==='failed')finished('videos');},[trending.job.phase,finished]);
 useEffect(()=>{if(signals.job.phase==='failed')finished('posts');},[signals.job.phase,finished]);
 // The refresh is over and the lists are read again: the same order needs nothing; a new one waits behind "New results".
 useEffect(()=>{
  if(!settled||!held)return;
  if(sameFeed(discoverFeed(held.videos,held.posts,show,sort,everything).shown,discoverFeed(live.videos,live.posts,show,sort,everything).shown))showNew();
  else setNewResults(true);
 },[settled]);// eslint-disable-line react-hooks/exhaustive-deps

 const readVideos=()=>trending.refresh(result=>{setFailedChannels(result.failed);finished('videos',result.added);});
 const readPosts=(only?:string[])=>signals.refresh(result=>{
  setNote(result.note??'');
  // Nothing could be read: that is an error line to retry, not news.
  finished('posts',result.tried>0&&result.failed.length>=result.tried?undefined:result.added);
 },only?{only}:undefined);
 const start=(kinds:Array<'videos'|'posts'>,run:()=>void)=>{
  if(!waiting.current)setHeld(current=>current??live);
  setNewResults(false);
  waiting.current={left:new Set([...(waiting.current?.left??[]),...kinds]),videos:waiting.current?.videos??0,posts:waiting.current?.posts??0,news:waiting.current?.news??false};
  run();
 };
 const refresh=()=>{
  setFailedChannels([]);setNote('');
  const posts=(signals.data?.sources??0)>0;
  start(posts?['videos','posts']:['videos'],()=>{readVideos();if(posts)readPosts();});
 };
 const retryVideos=()=>{setFailedChannels([]);start(['videos'],readVideos);};
 const retryPosts=(only?:string[])=>start(['posts'],()=>readPosts(only));
 /** Saves one suggested subreddit to the channel's sources, then reads the list again so the posts can be refreshed. */
 const addSubreddit=async(name:string)=>{
  setAdding(true);
  try{
   const config=await clubFetch<{reddit?:string[]}>('/signals-config');
   await clubFetch('/signals-config',{method:'PUT',body:{reddit:withEntry(config.reddit??[],name)}});
   void signals.reload();
  }catch(reason){toast(errorMessage(reason,"Couldn't add that."),{refused:true});}
  finally{setAdding(false);}
 };

 const loading=(trending.data===null&&trending.loadError===null)||(signals.data===null&&signals.loadError===null);
 if(loading)return <div className="page"><ScreenHeader title="Research" description="What's working on YouTube, X and Reddit, ranked for your topics."/><div className="row small muted" role="status"><Spinner label="Loading what's working" size={20}/>Loading videos and posts for your topics…</div></div>;
 const failedWithoutContent=!live.videos.length&&!live.posts.length&&(trending.loadError||signals.loadError||trending.job.phase==='failed'||signals.job.phase==='failed'||failedChannels.length>0||(signals.data?.errors.length??0)>0);
 if(failedWithoutContent)return <div className="page"><ScreenHeader title="Research" description="What's working on YouTube, X and Reddit, ranked for your topics."/><div className="research-recovery" role="alert"><span className="research-error-icon"><Icon name="offline" size={20}/></span><p className="research-error-copy">Couldn't get your research. Try again in a moment.</p><button type="button" className="btn primary" onClick={()=>{if(trending.loadError||signals.loadError){void trending.reload();void signals.reload();}else refresh();}}>Try again</button></div></div>;

 const followed=trending.data?.followed??0,sources=signals.data?.sources??0,sourcesBy=signals.data?.sourcesBy??{x:0,reddit:0};
 const ideas=openIdeas(videos).length;
 // The topics the channel picked; the audience is who it is for, not a topic.
 const topics=(profile?.topics??[]).map(topicLabel);
 const job=bothJobs(trending.job,signals.job),running=job.phase==='running';
 const updatedAt=latestRead(trending.data?.updatedAt,signals.data?.updatedAt);
 const summary=[trending.data&&plural(trending.data.items.length,'video'),signals.data&&plural(signals.data.items.length,'post')].filter(Boolean).join(' · ');
 const choose=(next:DiscoverShow)=>{if(!running&&held)showNew();navigate(next==='fit'?{name:'discover'}:{name:'discover',show:next},{replace:true});};
 const inIdeas=(url:string)=>!!ideaFromSource(videos,url)||ideaFrom.adding.has(url);
 const openVideoIdea=(item:TrendingEntry)=>{const idea=ideaFromSource(videos,trendingUrl(item.videoId));if(idea)navigate({name:'videos',view:'board',open:idea.id});else void ideaFrom.make({kind:'trending',videoId:item.videoId});};
 const openPostIdea=(item:SignalEntry)=>{const idea=ideaFromSource(videos,item.url);if(idea)navigate({name:'videos',view:'board',open:idea.id});else void ideaFrom.make({kind:'signal',id:item.id,url:item.url});};
 const refreshButton=(label='Refresh')=>running?undefined:<button type="button" className="btn primary" onClick={refresh}><Icon name="retry" size={15}/>{label}</button>;
 const postErrors=signals.data?.errors??[];
 const view=viewOf(show);

 return <div className="page">
  <ScreenHeader title="Research" description="What's working on YouTube, X and Reddit, ranked for your topics." actions={<RefreshActions updatedAt={updatedAt} summary={summary} job={job} onRefresh={refresh}/>}/>
  {trending.loadError&&!trending.data&&<div style={{marginBottom:14}}><ErrorLine fallback="Couldn't load Research." message={trending.loadError} onRetry={()=>void trending.reload()}/></div>}
  {signals.loadError&&!signals.data&&<div style={{marginBottom:14}}><ErrorLine fallback="Couldn't load Research." message={signals.loadError} onRetry={()=>void signals.reload()}/></div>}
  {trending.job.phase==='failed'&&<div style={{marginBottom:14}}><ErrorLine fallback="Couldn't load Research." message={trending.job.message} onRetry={retryVideos}/></div>}
  {signals.job.phase==='failed'&&<div style={{marginBottom:14}}><ErrorLine fallback="Couldn't load Research." message={signals.job.message} onRetry={()=>retryPosts()}/></div>}
  {!running&&failedChannels.length>0&&<div style={{marginBottom:14}}><ErrorLine fallback="Couldn't load Research." message={`Couldn't read ${sourceList(failedChannels)}, so their earlier videos stay.`} onRetry={retryVideos}/></div>}
  {!running&&postErrors.length>0&&signals.job.phase!=='failed'&&<div style={{marginBottom:14}}><ErrorLine fallback="Couldn't load Research." message={`Couldn't read ${sourceList(postErrors)}, so their earlier posts stay.`} onRetry={()=>retryPosts(postErrors)}/></div>}
  {note&&<div className="small muted" style={{marginBottom:14}}>{note}</div>}

  <div className="disc-views">
   <div className="seg" role="group" aria-label="View">{DISCOVER_VIEWS.map(([key,label])=><button key={key} type="button" className={view===key?'on':''} aria-pressed={view===key} onClick={()=>choose(key)}>{label} <span className="n">{counts[key]}</span></button>)}</div>
   <span className="grow"/>
   <button type="button" className="linkish ideas-shelf" onClick={()=>navigate({name:'videos',view:'board'})} title="Your ideas are the first lane of Video board"><Icon name="idea" size={14}/>Your ideas <b className="tnum">{ideas}</b></button>
  </div>
  <div className="row disc-bar">
   {view==='fit'&&<div className="disc-sources" role="group" aria-label="Source">{DISCOVER_SOURCES.map(([key,label])=><button key={key} type="button" className={`fchip${show===key?' on':''}`} aria-pressed={show===key} onClick={()=>choose(key)}>{(key==='youtube'||key==='x'||key==='reddit')&&<BrandLogo brand={key} size={15}/>}{label} <span className="n">{counts[key]}</span></button>)}</div>}
   <span className="grow"/>
   <label className="small muted" htmlFor="discover-sort">Sort by</label>
   <Select id="discover-sort" label="Sort by" value={sort} options={sortsFor(show).map(([value,label])=>({value,label}))} onChange={value=>{if(!running&&held)showNew();setSort(value as DiscoverSort);}}/>
  </div>
  {topics.length>0&&(show==='fit'||show==='youtube')&&<div className="small muted disc-note">Matched to your topics: {topics.join(', ')}.</div>}
  {newResults&&<div className="disc-new"><button type="button" className="btn sm" onClick={showNew}><Icon name="retry" size={14}/>New results</button><span className="small muted">The list was read again. Show it in its new order.</span></div>}

  {shown.length
   ?<div className="card feed">{shown.slice(0,limit).map((entry,index)=>entry.kind==='video'
    ?<VideoRow key={feedKey(entry)} item={entry.item} rank={index+1} isNew={isNew(entry.item,trending.data?.updatedAt??null)} reason={show!=='followed'?entry.item.reason:null}
      hasBreakdown={!!(saved&&savedBreakdown(saved,entry.item.videoId))} inIdeas={inIdeas(trendingUrl(entry.item.videoId))} onBreak={setBreakdown} onIdea={openVideoIdea} onFollowed={()=>void trending.reload()} onResearch={item=>void addToResearch({source:'trending',id:item.videoId})}/>
    :<PostRow key={feedKey(entry)} item={entry.item} rank={index+1} reason={entry.item.reason} inIdeas={inIdeas(entry.item.url)} onIdea={openPostIdea} onResearch={item=>void addToResearch({source:'signal',id:item.id})}/>)}</div>
   :emptyFeed()}
  {shown.length>limit&&<div style={{textAlign:'center',marginTop:14}}><button type="button" className="btn" onClick={()=>setLimit(n=>n+FEED_PAGE)}>Show {Math.min(FEED_PAGE,shown.length-limit)} more</button></div>}
  {shown.length>0&&off>0&&shown.length<=limit&&<div style={{textAlign:'center',marginTop:14}}><button type="button" className="btn" onClick={()=>setEverything(open=>!open)}><Icon name={everything?'hide':'preview'} size={15}/>{everything?"Hide what isn't about your topics":`Show everything (${off} more, off topic or under their usual)`}</button></div>}
  {breakdown&&<BreakdownDrawer videoId={breakdown.videoId} title={breakdown.title} channel={breakdown.channel} multiplier={breakdown.mult} saved={saved} videos={videos} onAdded={id=>navigate({name:'videos',view:'board',new:id})} onClose={()=>setBreakdown(null)}/>}
 </div>;

 /** What an empty feed says: how to fill the source it shows, or that the topics filter left nothing. */
 function emptyFeed(){
  const noVideos=!lists.videos.length,noPosts=!lists.posts.length;
  const settings=<button type="button" className="btn primary" onClick={()=>navigate({name:'settings',section:'followed'})}>Follow channels</button>;
  const addSources=<button type="button" className="btn primary" onClick={()=>navigate({name:'settings',section:'sources'})}><Icon name="add" size={15}/>Add sources</button>;
  if((show==='youtube'||show==='followed'||(show==='fit'&&noPosts))&&noVideos&&trending.seeding)return <div className="row small muted" role="status"><Spinner label="Searching YouTube for your topics" size={20}/>Searching YouTube for your topics…</div>;
  if(show==='followed'&&followed===0)return <div className="card">{noVideos
   ?<Empty icon="trending" title="You follow no channels yet" action={settings}>Follow channels in Settings. The videos beating their usual views show up here.</Empty>
   :<Empty icon="trending" title="You follow no channels yet" action={<button type="button" className="btn primary" onClick={()=>choose('fit')}>Open For you</button>}>Follow one from For you.</Empty>}</div>;
  if((show==='youtube'||show==='followed')&&noVideos)return <div className="card">{followed===0
   ?<Empty icon="trending" title="No channels followed yet" action={settings}>Follow channels in Settings. The videos beating their usual views show up here.</Empty>
   :<Empty icon="trending" title="Nothing read yet" action={refreshButton()}>{running?(job.line??'Reading the channels you follow…'):'Refresh to read the channels you follow.'}</Empty>}</div>;
  // X and Reddit are separate: the X chip never offers subreddits, and each says how to add its own kind of source.
  if(show==='x'&&!lists.posts.some(post=>post.source==='x'))return <div className="card">{sourcesBy.x===0
   ?<Empty icon="signals" title="Add X accounts to read" action={addSources}>Research reads posts from the X accounts and searches you choose. Add a few in Settings and they show up here.</Empty>
   :<Empty icon="signals" title="No X posts yet" action={refreshButton()}>{note||'Refresh to read the X accounts and searches you chose.'}</Empty>}</div>;
  if(show==='reddit'&&!lists.posts.some(post=>post.source==='reddit'))return <div className="card">{sourcesBy.reddit===0
   ?<><Empty icon="signals" title="Add subreddits to read" action={addSources}>Research reads posts from the subreddits you choose. Add a few in Settings, or pick one of these.</Empty>
    <div style={{padding:'0 20px 24px',textAlign:'center'}}><SubredditChips topics={profile?.topics??[]} have={[]} center disabled={adding} onAdd={name=>void addSubreddit(name)}/></div></>
   :<Empty icon="signals" title="No Reddit posts yet" action={refreshButton()}>Refresh to read the subreddits you chose.</Empty>}</div>;
  if(show==='fit'&&noVideos&&noPosts)return <div className="card">{followed===0&&sources===0
   ?<Empty icon="trending" title="Nothing to read yet" action={settings}>Follow a few channels and add subreddits or X accounts in Settings. What's working on your topics shows up here.</Empty>
   :<Empty icon="trending" title="Nothing read yet" action={refreshButton()}>{running?(job.line??'Reading your sources…'):'Refresh to read the channels you follow, X and Reddit.'}</Empty>}</div>;
  if(show==='followed')return <div className="card"><Empty icon="trending" title="Nothing from the channels you follow">Refresh to read them again.</Empty></div>;
  return <div className="card"><Empty icon="trending" title="Nothing about your topics right now" action={off>0?<button type="button" className="btn" onClick={()=>setEverything(true)}>Show everything</button>:undefined}>Nothing about your topics is above its usual right now. Look at everything that was read.</Empty></div>;
 }
}
