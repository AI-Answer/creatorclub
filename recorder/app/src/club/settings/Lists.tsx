import {useCallback,useEffect,useState,type ReactNode} from 'react';
import type {FollowedChannel,SignalsConfig} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {asAccount,asSearch,asSubreddit,followedLabel,withEntry,withFollowed} from '../settings';
import {Spinner} from '../ui';
import {SubredditChips} from './SubredditChips';
import {TagEditor} from './TagEditor';

/** A list the server keeps for the channel: loaded once, and saved at once on every add or remove. A failed save leaves the list as it was. */
function useSavedList<T>(path:string,fallback:string,pick:(loaded:unknown)=>T,body:(value:T)=>unknown){
 const [value,setValue]=useState<T|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [failed,setFailed]=useState<T|null>(null);
 const load=useCallback(()=>{
  setError('');
  clubFetch(path).then(loaded=>setValue(pick(loaded)),reason=>setError(errorMessage(reason,fallback)));
 },[path,fallback]);
 useEffect(load,[load]);
 const save=useCallback(async(next:T)=>{
  setBusy(true);setError('');setFailed(null);
  try{setValue(pick(await clubFetch(path,{method:'PUT',body:body(next)})));}
  catch(reason){setError(errorMessage(reason,"Couldn't save that."));setFailed(next);}
  finally{setBusy(false);}
 },[path]);
 return {value,error,busy,load,save,retry:failed?()=>void save(failed):load};
}

function Block({id,title,help,first,children}:{id?:string;title:string;help:string;first?:boolean;children:ReactNode}){
 return <div id={id} style={{marginTop:first?0:24}}><div className="field">{title}</div><div className="small muted" style={{marginBottom:10}}>{help}</div>{children}</div>;
}

/** The channels Discover watches. Add one with its link or @handle. */
export function FollowedChannels({focus}:{focus?:boolean}){
 const list=useSavedList<FollowedChannel[]>('/followed',"Couldn't load the channels you follow.",loaded=>loaded as FollowedChannel[],value=>value);
 const byLabel=new Map((list.value??[]).map(channel=>[followedLabel(channel),channel]));
 return <Block first title="Followed channels" help="Discover shows what is doing better than usual on these channels.">
  {list.value===null&&!list.error?<div className="row small muted" role="status"><Spinner label="Loading followed channels" size={16}/>Loading followed channels…</div>:null}
  {list.value!==null&&<TagEditor label="Followed channels" values={[...byLabel.keys()]} disabled={list.busy} autoFocus={focus} placeholder="@handle or channel link"
   onAdd={(labels,text)=>withFollowed(labels.map(label=>byLabel.get(label)!),text).map(followedLabel)}
   onChange={labels=>void list.save(labels.map(label=>byLabel.get(label)??withFollowed([],label)[0]))}/>}
  {list.error&&<div style={{marginTop:10}}><ErrorLine message={list.error} onRetry={list.retry}/></div>}
 </Block>;
}

type Sources={x:string[];xTopics:string[];reddit:string[]};
const pickSources=(loaded:unknown):Sources=>{const config=loaded as SignalsConfig;return {x:config.x??[],xTopics:config.xTopics??[],reddit:config.reddit??[]};};

/** Where Discover reads posts from: X accounts, X searches and subreddits. */
export function SignalSources({focus,topics=[]}:{focus?:boolean;topics?:readonly string[]}){
 const list=useSavedList<Sources>('/signals-config',"Couldn't load your signal sources.",pickSources,value=>value);
 const sources=list.value;
 const edit=(key:keyof Sources)=>(next:string[])=>{if(sources)void list.save({...sources,[key]:next});};
 return <Block id="set-sources" title="Signal sources" help="Discover reads posts from these places and shows the ones about your topics.">
  {sources===null&&!list.error?<div className="row small muted" role="status"><Spinner label="Loading signal sources" size={16}/>Loading signal sources…</div>:null}
  {sources&&<div style={{display:'flex',flexDirection:'column',gap:16}}>
   <div><div className="small" style={{fontWeight:600,marginBottom:6}}>X accounts</div><TagEditor label="X accounts" values={sources.x} disabled={list.busy} autoFocus={focus} placeholder="@account" show={asAccount} onAdd={withEntry} onChange={edit('x')}/></div>
   <div><div className="small" style={{fontWeight:600,marginBottom:6}}>X searches</div><TagEditor label="X searches" values={sources.xTopics} disabled={list.busy} placeholder="A word or a phrase in quotes" show={asSearch} onAdd={withEntry} onChange={edit('xTopics')}/></div>
   <div><div className="small" style={{fontWeight:600,marginBottom:6}}>Subreddits</div><TagEditor label="Subreddits" values={sources.reddit} disabled={list.busy} placeholder="r/ClaudeAI" show={asSubreddit} onAdd={withEntry} onChange={edit('reddit')}/><SubredditChips topics={topics} have={sources.reddit} disabled={list.busy} onAdd={name=>edit('reddit')(withEntry(sources.reddit,name))}/></div>
  </div>}
  {list.error&&<div style={{marginTop:10}}><ErrorLine message={list.error} onRetry={list.retry}/></div>}
 </Block>;
}
