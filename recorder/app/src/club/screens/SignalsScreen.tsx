import {useMemo,useState} from 'react';
import type {SignalEntry} from '../../../shared/club';
import {SignalCard} from '../cards/SignalCard';
import {ErrorLine} from '../ErrorLine';
import {topicLabel} from '../format';
import {SubredditChips} from '../settings/SubredditChips';
import {withEntry} from '../settings';
import {clubFetch,errorMessage} from '../api';
import {RefreshActions} from '../RefreshActions';
import type {Route} from '../routes';
import {SIGNAL_FILTERS,SIGNAL_SORTS,signalCounts,signalList,type SignalFilter,type SignalSort} from '../signals-view';
import {Empty,Icon,Spinner,useToast} from '../ui';
import {useSignals} from '../useFeed';
import {ideaFromSource,useIdeaFrom} from '../useIdeaFrom';
import {useProfile} from '../useProfile';
import {useVideos} from '../useVideos';

const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;

/** Signals: what people in your space are posting and asking on X and Reddit, matched to your topics. */
export function SignalsScreen({navigate}:{navigate(route:Route):void}){
 const feed=useSignals();
 const profile=useProfile();
 const {state}=useVideos();
 const toast=useToast();
 const [source,setSource]=useState<SignalFilter>('all'),[sort,setSort]=useState<SignalSort>('top'),[everything,setEverything]=useState(false);
 const [adding,setAdding]=useState(false),[note,setNote]=useState(''),[allFailed,setAllFailed]=useState<string[]|null>(null);
 const videos=state.status==='ready'?state.videos:[];
 const makeIdea=useIdeaFrom(videos,navigate);
 const items=feed.data?.items;
 const {shown,off}=useMemo(()=>signalList(items??[],source,sort,everything),[items,source,sort,everything]);
 const counts=useMemo(()=>signalCounts(items??[]),[items]);

 /** Saves one suggested subreddit to the channel's sources, then reads the list again so Refresh turns on. */
 const addSubreddit=async(name:string)=>{
  setAdding(true);
  try{
   const config=await clubFetch<{reddit?:string[]}>('/signals-config');
   await clubFetch('/signals-config',{method:'PUT',body:{reddit:withEntry(config.reddit??[],name)}});
   feed.reload();
  }catch(reason){toast(errorMessage(reason,"Couldn't add that."));}
  finally{setAdding(false);}
 };
 const refresh=()=>{
  setNote('');setAllFailed(null);
  feed.refresh(result=>{
   setNote(result.note??'');
   // Nothing could be read: that is an error to retry, not news.
   if(result.tried>0&&result.errors.length>=result.tried){setAllFailed(result.errors);return;}
   toast(result.added?`${plural(result.added,'new post')}`:'Nothing new since last time');
  });
 };

 if(feed.data===null&&feed.loadError===null)return <div className="page wide"><Spinner label="Loading the posts" size={20}/></div>;
 if(feed.data===null)return <div className="page wide"><ErrorLine message={feed.loadError!} onRetry={feed.reload} primary/></div>;
 const {updatedAt,errors,sources}=feed.data;
 const topics=[...(profile?.topics??[]),...(profile?.audience??[])].map(topicLabel);
 const add=(item:SignalEntry)=>void makeIdea({kind:'signal',id:item.id,url:item.url});

 return <div className="page wide">
  <div className="page-head"><div><h1>Signals</h1><div className="lede">What people in your space are posting and asking on X and Reddit, matched to your topics.</div></div>
   <div className="actions"><RefreshActions updatedAt={updatedAt} summary={plural(feed.data.items.length,'post')} job={feed.job} onRefresh={refresh} disabled={sources===0} why="Add a source in Settings first"/></div></div>
  {feed.job.phase==='failed'&&<div style={{marginBottom:14}}><ErrorLine message={feed.job.message} onRetry={refresh}/></div>}
  {allFailed&&<div style={{marginBottom:14}}><ErrorLine message={`Couldn't read ${allFailed.join(', ')}.`} onRetry={refresh}/></div>}
  {(note||(errors.length>0&&!allFailed))&&<div className="small muted" style={{marginBottom:14}}>{[note,errors.length&&!allFailed?`Couldn't read ${errors.join(', ')}.`:''].filter(Boolean).join(' ')}</div>}

  {feed.data.items.length===0
   ?sources===0
    ?<div className="card"><Empty icon="MessagesSquare" title="Add where to read" action={<button type="button" className="btn primary" onClick={()=>navigate({name:'settings',section:'sources'})}><Icon name="Plus" size={15}/>Add sources</button>}>Signals reads posts from the subreddits and X accounts you choose. Add a few in Settings and they show up here.</Empty>
     <div style={{padding:'0 20px 24px',textAlign:'center'}}><SubredditChips topics={profile?.topics??[]} have={[]} disabled={adding} onAdd={name=>void addSubreddit(name)}/></div></div>
    :<div className="card"><Empty icon="MessagesSquare" title="No posts yet" action={<button type="button" className="btn primary" onClick={refresh}><Icon name="RotateCcw" size={15}/>Refresh</button>}>Refresh to read X and Reddit. Add accounts and subreddits in Settings.</Empty></div>
   :<>
    <div className="row" style={{marginBottom:16,gap:12}}>
     <div className="seg">{SIGNAL_FILTERS.map(([key,label])=><button key={key} type="button" className={source===key?'on':''} aria-pressed={source===key} onClick={()=>setSource(key)}>{label} <span className="n">{counts[key]}</span></button>)}</div>
     {topics.length>0&&<span className="small muted">Matched to {topics.join(', ')}</span>}
     <span className="grow"/>
     <div className="seg">{SIGNAL_SORTS.map(([key,label])=><button key={key} type="button" className={sort===key?'on':''} aria-pressed={sort===key} onClick={()=>setSort(key)}>{label}</button>)}</div>
    </div>
    {shown.length
     ?<div className="sig-cols">{shown.map(item=><SignalCard key={item.id} item={item} reason={item.reason} inIdeas={!!ideaFromSource(videos,item.url)} onIdea={add}/>)}</div>
     :<div className="card"><Empty icon="MessagesSquare" title="No posts about your topics right now" action={<button type="button" className="btn" onClick={()=>setEverything(true)}>Show everything</button>}>Refresh to read new posts.</Empty></div>}
    {off>0&&<div style={{textAlign:'center',marginTop:8}}><button type="button" className="btn" onClick={()=>setEverything(open=>!open)}><Icon name={everything?'EyeOff':'Eye'} size={15}/>{everything?"Hide posts that aren't about your topics":`Show everything (${off} more, not about your topics)`}</button></div>}
   </>}
 </div>;
}
