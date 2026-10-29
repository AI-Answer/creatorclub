import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {AddIdeaDialog} from '../AddIdeaDialog';
import {looksLikeVideoLink} from '../breakdown';
import {BreakdownPanel} from '../BreakdownPanel';
import {youtubeId} from '../board';
import {IdeaCard} from '../cards/IdeaCard';
import {ErrorLine} from '../ErrorLine';
import {creatorName,ytThumb} from '../format';
import {IDEA_TABS,breakdownUrl,ideaCounts,ideasIn,tabOf} from '../ideas';
import {IdeaDrawer} from '../IdeaDrawer';
import type {Route} from '../routes';
import {Empty,Icon,Spinner,useToast} from '../ui';
import {useIdeaActions} from '../useIdeaActions';
import {useTrending} from '../useFeed';
import {useVideos} from '../useVideos';
import type {TrendingEntry} from '../../../shared/club';

type IdeasRoute=Extract<Route,{name:'ideas'}>;
const NOT_A_LINK="That doesn't look like a YouTube or Instagram link. Paste the full address.";

/** Ideas: every video starts here. Paste a link to break it down in place, keep the concepts you would make, and sort what you have into New, Later and Skipped. */
export function IdeasScreen({route,navigate}:{route:IdeasRoute;navigate(route:Route,options?:{replace?:boolean}):void}){
 const {state,reload}=useVideos();
 const {data:trending}=useTrending();
 const toast=useToast();
 const actions=useIdeaActions(navigate);
 const [url,setUrl]=useState('');
 const [run,setRun]=useState<{url:string;key:number}|null>(null);
 const [drawer,setDrawer]=useState<string|null>(route.open??null),[adding,setAdding]=useState(false);
 const tab=tabOf(route.filter),newId=route.new;

 const start=useCallback((link:string)=>{
  if(!looksLikeVideoLink(link)){toast(NOT_A_LINK);return;}
  setUrl(link);setRun(current=>({url:link,key:(current?.key??0)+1}));
 },[toast]);
 // A link from New video (`?bd=`) starts its breakdown once and leaves the address, so a reload does not run it again.
 const {bd,filter}=route;
 useEffect(()=>{
  if(!bd)return;
  start(breakdownUrl(bd));
  navigate({name:'ideas',...(filter&&{filter})},{replace:true});
 },[bd,filter,start,navigate]);
 useEffect(()=>{if(route.open)setDrawer(route.open);},[route.open]);
 useEffect(()=>{
  if(!newId)return;
  const timer=setTimeout(()=>document.getElementById(`idea-${newId}`)?.scrollIntoView?.({behavior:'smooth',block:'center'}),120);
  return()=>clearTimeout(timer);
 },[newId,state.status]);

 const videos=state.status==='ready'?state.videos:[];
 const counts=useMemo(()=>ideaCounts(videos),[videos]);
 const list=useMemo(()=>ideasIn(videos,tab,newId),[videos,tab,newId]);
 const trends=useMemo(()=>new Map((trending?.items??[]).map(item=>[item.videoId,item])),[trending]);
 const suggestions=useMemo(()=>(trending?.items??[]).filter(item=>item.fit).slice(0,3),[trending]);
 // On an empty New list the empty state has the primary button, so the link bar's is a plain one.
 const empty=tab==='new'&&list.length===0;
 const listed=run?trends.get(youtubeId(run.url)??''):undefined;
 const newIdea=newId?videos.find(video=>video.id===newId&&video.stage==='ideas'):undefined;
 const open=drawer?videos.find(video=>video.id===drawer):undefined;

 const submit=(event:FormEvent)=>{event.preventDefault();if(url.trim())start(url.trim());};
 const closeDrawer=()=>{setDrawer(null);if(route.open)navigate({name:'ideas',...(route.filter&&{filter:route.filter})},{replace:true});};
 const added=(id:string)=>navigate({name:'ideas',new:id});
 const tryOne=(item:TrendingEntry)=>start(`https://www.youtube.com/watch?v=${item.videoId}`);

 if(state.status==='loading')return <div className="page"><Spinner label="Loading your ideas" size={20}/></div>;
 if(state.status==='error')return <div className="page"><ErrorLine message={state.message} onRetry={reload} primary/></div>;

 return <div className="page">
  <div className="page-head"><div><h1>Ideas</h1><div className="lede">Every video starts here. Break down what's working, keep the concepts you'd make.</div></div>
   <div className="actions"><button type="button" className="btn" onClick={()=>setAdding(true)}><Icon name="Plus" size={15}/>Add idea</button></div></div>

  {newIdea&&<div className="card" style={{padding:'14px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:14,background:'var(--cc-accent-soft)',borderColor:'color-mix(in srgb, var(--cc-accent) 25%, transparent)'}}>
   <Icon name="Sparkles" size={18} style={{color:'var(--cc-accent)'}}/>
   <div className="grow"><b>"{newIdea.title}" is in your ideas.</b><div className="small muted">Next: open it and start planning. You'll gather references on its board, then turn them into scenes.</div></div>
   <button type="button" className="btn primary" onClick={()=>void actions.startPlanning(newIdea)}><Icon name="ArrowRight" size={15}/>Open it and start planning</button>
  </div>}

  <div className="card" style={{marginBottom:22,overflow:'hidden'}}>
   <form className="breakbar" onSubmit={submit}>
    <span className="lead"><Icon name="Link" size={17}/></span>
    <input className="input" value={url} onChange={event=>setUrl(event.target.value)} placeholder="Paste a YouTube or Instagram link to break it down" aria-label="Video link"/>
    <button type="submit" className={`btn${newIdea||empty?'':' primary'}`} disabled={!url.trim()}><Icon name="Sparkles" size={15}/>Break down</button>
   </form>
   {!run&&suggestions.length>0&&<div className="try">Try one that's working now:{suggestions.map(item=><button key={item.videoId} type="button" onClick={()=>tryOne(item)}><img src={ytThumb(item.videoId)} alt=""/>{creatorName(item.channel)}</button>)}</div>}
   {run&&<div style={{position:'relative'}}>
    <button type="button" className="btn ghost sm" style={{position:'absolute',right:12,top:12,zIndex:2}} onClick={()=>{setRun(null);setUrl('');}}><Icon name="X" size={14}/>Close</button>
    <BreakdownPanel key={run.key} target={{kind:'link',url:run.url}} videoId={youtubeId(run.url)} multiplier={listed?.mult} videos={videos} onAdded={added}/>
   </div>}
  </div>

  <div className="row" style={{marginBottom:14}}>
   <div className="seg" role="tablist">{IDEA_TABS.map(([key,label])=><button key={key} type="button" role="tab" aria-selected={tab===key} className={tab===key?'on':''} onClick={()=>navigate({name:'ideas',...(key!=='new'&&{filter:key})})}>{label} <span className="n">{counts[key]}</span></button>)}</div>
  </div>
  {list.length?<div className="grid g3">{list.map(video=><IdeaCard key={video.id} video={video} trend={trendFor(video.idea?.sources?.[0]?.url,trends)} highlight={video.id===newId} actions={actions} onOpen={()=>setDrawer(video.id)}/>)}</div>
   :<div className="card">{tab==='later'?<Empty icon="Bookmark" title="Nothing saved for later">Press Later on an idea that's good but not for this week. It waits here, out of the way.</Empty>
    :tab==='skipped'?<Empty icon="EyeOff" title="Nothing skipped">Skipped ideas land here with the reason you gave, so the next ideas fit better.</Empty>
    :<Empty icon="Lightbulb" title="No ideas yet" action={suggestions[0]&&<button type="button" className="btn primary" onClick={()=>tryOne(suggestions[0])}><Icon name="Sparkles" size={15}/>Break down a video that's working</button>}>Paste a link above, or break down a video that's doing well right now and keep a concept.</Empty>}</div>}
  {open&&<IdeaDrawer video={open} actions={actions} onClose={closeDrawer} onRemove={video=>{closeDrawer();actions.remove(video);}}/>}
  {adding&&<AddIdeaDialog onClose={()=>setAdding(false)} onAdded={added}/>}
 </div>;
}

/** The Working now video an idea's first source points at, for its outlier chip. */
const trendFor=(url:string|undefined,trends:ReadonlyMap<string,TrendingEntry>)=>{const id=youtubeId(url);return id?trends.get(id):undefined;};
