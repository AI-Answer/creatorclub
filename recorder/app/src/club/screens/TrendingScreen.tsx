import {useMemo,useState} from 'react';
import type {TrendingEntry,TrendingRefreshResult} from '../../../shared/club';
import {BreakdownDrawer} from '../BreakdownDrawer';
import {TrendCard} from '../cards/TrendCard';
import {ErrorLine} from '../ErrorLine';
import {RefreshActions} from '../RefreshActions';
import type {Route} from '../routes';
import {TREND_SORTS,isNew,offTopic,trendCounts,trendList,type TrendShow,type TrendSort} from '../trending-view';
import {Empty,Icon,Spinner,useToast} from '../ui';
import {useBreakdowns,savedBreakdown} from '../useBreakdowns';
import {useTrending} from '../useFeed';
import {ideaFromSource,trendingUrl,useIdeaFrom} from '../useIdeaFrom';
import {useProfile} from '../useProfile';
import {useVideos} from '../useVideos';
import {topicLabel} from '../format';

const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;

/** What a refresh found, in a few words for a toast. */
export const refreshSummary=(result:TrendingRefreshResult)=>result.added?`${plural(result.added,'new video')}`:'Nothing new since last time';

/** Working now: videos doing better than usual in your space. Break one down to see why, or save it as an idea. */
export function TrendingScreen({navigate}:{navigate(route:Route):void}){
 const feed=useTrending();
 const profile=useProfile();
 const {state}=useVideos();
 const saved=useBreakdowns();
 const toast=useToast();
 const [show,setShow]=useState<TrendShow>('fit'),[sort,setSort]=useState<TrendSort>('vpd');
 const [breakdown,setBreakdown]=useState<TrendingEntry|null>(null);
 const [failedChannels,setFailedChannels]=useState<string[]>([]);
 const videos=state.status==='ready'?state.videos:[];
 const makeIdea=useIdeaFrom(videos,navigate);
 const items=feed.data?.items;
 const list=useMemo(()=>items?trendList(items,show,sort):[],[items,show,sort]);
 const counts=useMemo(()=>trendCounts(items??[]),[items]);

 const refresh=()=>{setFailedChannels([]);feed.refresh(result=>{setFailedChannels(result.failed);toast(refreshSummary(result));});};

 if(feed.data===null&&feed.loadError===null)return <div className="page wide"><Spinner label="Loading what's working" size={20}/></div>;
 if(feed.data===null)return <div className="page wide"><ErrorLine message={feed.loadError!} onRetry={feed.reload} primary/></div>;
 const {updatedAt,followed}=feed.data;
 const topics=[...(profile?.topics??[]),...(profile?.audience??[])].map(topicLabel);
 const hidden=offTopic(feed.data.items);
 const everything=()=>setShow('all');
 const openIdea=(item:TrendingEntry)=>{const idea=ideaFromSource(videos,trendingUrl(item.videoId));if(idea)navigate({name:'ideas',open:idea.id});else void makeIdea({kind:'trending',videoId:item.videoId});};

 return <div className="page wide">
  <div className="page-head"><div><h1>Working now</h1><div className="lede">Videos doing better than usual in your space. Break one down to see why, or save it as an idea.</div></div>
   <div className="actions"><RefreshActions updatedAt={updatedAt} summary={plural(feed.data.items.length,'video')} job={feed.job} onRefresh={refresh} disabled={followed===0}/></div></div>
  {feed.job.phase==='failed'&&<div style={{marginBottom:14}}><ErrorLine message={feed.job.message} onRetry={refresh}/></div>}
  {failedChannels.length>0&&<div className="small muted" style={{marginBottom:14}}>Couldn't read {failedChannels.join(', ')}. Their earlier videos stay.</div>}

  {feed.data.items.length===0
   ?<div className="card">{followed===0
    ?<Empty icon="TrendingUp" title="No channels followed yet" action={<button type="button" className="btn" onClick={()=>navigate({name:'settings'})}>Open Settings</button>}>Follow channels in Settings. The videos beating their usual views show up here.</Empty>
    :<Empty icon="TrendingUp" title="Nothing read yet" action={<button type="button" className="btn primary" onClick={refresh}><Icon name="RotateCcw" size={15}/>Refresh</button>}>Refresh to read the channels you follow.</Empty>}</div>
   :<>
    <div className="row" style={{marginBottom:10,gap:12}}>
     <div className="seg">{([['fit','For you'],['followed','Followed'],['all','All']] as const).map(([key,label])=><button key={key} type="button" className={show===key?'on':''} aria-pressed={show===key} onClick={()=>setShow(key)}>{label} <span className="n">{counts[key]}</span></button>)}</div>
     <span className="grow"/>
     <label className="small muted" htmlFor="sortby">Sort by</label>
     <select id="sortby" className="select" value={sort} onChange={event=>setSort(event.target.value as TrendSort)}>{TREND_SORTS.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
    </div>
    <div className="legend small muted"><span className="chip mult b-blue">1–3×</span><span className="chip mult b-green">3–5×</span><span className="chip mult b-amber">5–10×</span><span className="chip mult b-orange">10–50×</span><span className="chip mult b-grey">—</span>Views compared with that channel's usual. A dash means its usual isn't tracked yet.</div>
    {show==='fit'&&topics.length>0&&<div className="small muted" style={{margin:'0 0 14px'}}>Matched to your topics: {topics.join(', ')}.</div>}
    {list.length
     ?<div className="grid g4">{list.map(item=><TrendCard key={item.videoId} item={item} isNew={isNew(item,updatedAt)} reason={show!=='followed'?item.reason:null}
       hasBreakdown={!!(saved&&savedBreakdown(saved,item.videoId))} inIdeas={!!ideaFromSource(videos,trendingUrl(item.videoId))} onBreak={setBreakdown} onIdea={openIdea}/>)}</div>
     :<div className="card"><Empty icon="TrendingUp" title={show==='followed'?'Nothing from the channels you follow':'Nothing matches your topics this week'} action={show==='followed'?undefined:<button type="button" className="btn" onClick={everything}>Show everything</button>}>{show==='followed'?'Refresh to read them again.':"Add a topic in Settings, or look at everything that's working."}</Empty></div>}
    {show==='fit'&&hidden>0&&list.length>0&&<div style={{textAlign:'center',marginTop:20}}><button type="button" className="btn" onClick={everything}><Icon name="Eye" size={15}/>Show everything ({hidden} more, not about your topics)</button></div>}
   </>}
  {breakdown&&<BreakdownDrawer videoId={breakdown.videoId} title={breakdown.title} channel={breakdown.channel} saved={saved} videos={videos} onAdded={id=>navigate({name:'ideas',new:id})} onClose={()=>setBreakdown(null)}/>}
 </div>;
}
