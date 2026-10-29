import {useState,type FormEvent} from 'react';
import type {BreakdownSummary,TrendingEntry,Video} from '../../../shared/club';
import {youtubeId} from '../board';
import {BreakdownPanel} from '../BreakdownPanel';
import {ErrorLine} from '../ErrorLine';
import {FollowChannel} from '../FollowChannel';
import {creatorName,fmtNum} from '../format';
import {savedBreakdown} from '../useBreakdowns';
import type {BreakdownTarget} from '../useBreakdownRun';
import {Button,Empty,Icon,Input,MultChip,Spinner,Thumb} from '../ui';

interface Pick{target:BreakdownTarget;videoId:string|null;title?:string;multiplier?:number|null}

/**
 * Step 4: what is working for the channel's topics (Working now, ranked for it), then one breakdown. Adding a concept makes the first idea.
 * A channel the search found nothing for gets one next action instead: paste a link to break down.
 */
export function WorkingStep({items,searching,loadError,onReload,saved,videos,onAdded,onSettings}:{items:readonly TrendingEntry[]|null;searching:boolean;loadError:string|null;onReload():void;saved:readonly BreakdownSummary[]|null;videos:readonly Video[];onAdded(id:string):void;onSettings():void}){
 const [pick,setPick]=useState<Pick|null>(null),[link,setLink]=useState('');
 const choose=(item:TrendingEntry)=>{
  const found=saved&&savedBreakdown(saved,item.videoId);
  setPick({target:found?{kind:'saved',id:found.id}:{kind:'link',url:`https://www.youtube.com/watch?v=${item.videoId}`},videoId:item.videoId,title:item.title,multiplier:item.mult});
 };
 const paste=(event:FormEvent)=>{
  event.preventDefault();
  const url=link.trim();if(!url)return;
  setPick({target:{kind:'link',url},videoId:youtubeId(url)??null});
 };
 if(pick)return <div className="card" style={{overflow:'hidden'}}>
  <div className="row" style={{padding:'10px 14px',borderBottom:'1px solid var(--cc-line)'}}><button type="button" className="btn ghost sm" onClick={()=>setPick(null)}><Icon name="ChevronLeft" size={14}/>Pick another video</button><span className="grow"/><span className="small muted">Add the concept you'd make. That's your first idea.</span></div>
  <BreakdownPanel key={pick.videoId??'link'} target={pick.target} videoId={pick.videoId} title={pick.title} multiplier={pick.multiplier} videos={videos} onAdded={onAdded} onCancel={()=>setPick(null)}/>
 </div>;
 if(loadError)return <ErrorLine message={loadError} onRetry={onReload}/>;
 if(items===null||saved===null||searching)return <Spinner label={searching?'Searching YouTube for your topics':"Loading what's working"} size={18}/>;
 if(!items.length)return <div className="card"><Empty icon="TrendingUp" title="Nothing to start from yet">
  Paste a link to any video that's working and we'll break it down. To see what's working in your space each day, follow channels in Settings.
  <form onSubmit={paste} className="row" style={{marginTop:14,width:'100%',maxWidth:460}}>
   <Input aria-label="Video link" value={link} autoComplete="off" spellCheck={false} placeholder="youtube.com/watch?v=…" onChange={event=>setLink(event.target.value)}/>
   <Button type="submit" variant="primary" disabled={!link.trim()}>Break down</Button>
  </form>
  <button type="button" className="linkish" style={{marginTop:12}} onClick={onSettings}>Follow channels in Settings</button>
 </Empty></div>;
 return <div>
  <div className="row" style={{marginBottom:10}}><b style={{fontSize:14}}>Working in your topics</b><span className="small muted">Each breakdown takes about a minute.</span></div>
  <div className="grid g3" style={{gap:12}}>{items.map(item=>{
   const has=!!savedBreakdown(saved,item.videoId);
   return <div key={item.videoId} className="card trend hov" tabIndex={0} onClick={()=>choose(item)} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)choose(item);}}>
    <Thumb videoId={item.videoId} seed={item.videoId} chip={<MultChip m={item.mult} who={creatorName(item.channel)} onThumb dash/>}/>
    <div className="meta"><span className="ellipsis">{item.channel}</span></div>
    <div className="tt clamp2" style={{fontSize:13.5}}>{item.title}</div>
    <div className="stats"><span><b>{fmtNum(item.views)}</b> views</span><span><b>{fmtNum(item.vpd)}</b>/day</span></div>
    {item.reason&&<div className="reason"><Icon name="Sparkles" size={12}/>{item.reason}</div>}
    <FollowChannel item={item}/>
    <button type="button" className="btn sm" onClick={event=>{event.stopPropagation();choose(item);}}><Icon name={has?'FileText':'Sparkles'} size={14}/>{has?'Open breakdown':'Break this down'}</button>
   </div>;
  })}</div>
  <div className="small muted" style={{marginTop:12}}>The chip on each thumbnail compares the video with that channel's usual views: blue 1 to 3×, green 3 to 5×, amber 5 to 10×, orange 10× and up. A dash means the channel's usual isn't tracked yet. You'll find more in Working now.</div>
 </div>;
}
