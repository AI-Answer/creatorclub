import {useState,type FormEvent} from 'react';
import type {BreakdownSummary,TrendingEntry,Video} from '../../../shared/club';
import {youtubeId} from '../board';
import {BreakdownPanel} from '../BreakdownPanel';
import {ErrorLine} from '../ErrorLine';
import {ProgressLine} from '../ProgressLine';
import {TrendCard,TrendHelp} from '../TrendCards';
import {SCAN_ESTIMATE} from '../welcome';
import {savedBreakdown} from '../useBreakdowns';
import type {BreakdownTarget} from '../useBreakdownRun';
import {Button,Empty,Icon,Input,Spinner} from '../ui';

interface Pick{target:BreakdownTarget;videoId:string|null;title?:string;multiplier?:number|null}

/**
 * Step 4: what is working for the channel's topics (Working now, ranked for it), then one breakdown. Adding a concept makes the first idea.
 * The search starts as soon as the channel exists, so it is often done by now; while it runs this says what it is searching and how long it takes,
 * and that leaving is fine. A channel the search found nothing for gets one next action instead: paste a link to break down.
 */
export function WorkingStep({items,searching,scanLine,loadError,onReload,saved,videos,onAdded,onSettings}:{items:readonly TrendingEntry[]|null;searching:boolean;scanLine?:string;loadError:string|null;onReload():void;saved:readonly BreakdownSummary[]|null;videos:readonly Video[];onAdded(id:string):void;onSettings():void}){
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
  <div className="row" style={{padding:'10px 14px',borderBottom:'1px solid var(--cc-line)'}}><button type="button" className="btn ghost sm" onClick={()=>setPick(null)}><Icon name="back" size={14}/>Pick another video</button><span className="grow"/><span className="small muted">Add the concept you'd make. That's your first idea.</span></div>
  <BreakdownPanel key={pick.videoId??'link'} target={pick.target} videoId={pick.videoId} title={pick.title} multiplier={pick.multiplier} videos={videos} onAdded={onAdded} onCancel={()=>setPick(null)}/>
 </div>;
 if(loadError)return <ErrorLine message={loadError} onRetry={onReload}/>;
 if(searching)return <div className="card" style={{padding:18}}><ProgressLine label="Searching YouTube for your topics" line={scanLine??'Starting the search on your topics…'} estimate={SCAN_ESTIMATE} note="You don't have to wait. Go to Home and the videos will be there when it finishes."/></div>;
 if(items===null||saved===null)return <div className="row"><Spinner label="Loading what's working" size={18}/><span className="muted">Loading what's working…</span></div>;
 if(!items.length)return <div className="card"><Empty icon="trending" title="Nothing to start from yet" action={<>
  <form onSubmit={paste} className="row" style={{marginTop:14,width:'100%',maxWidth:460}}>
   <Input aria-label="Video link" value={link} autoComplete="off" spellCheck={false} placeholder="youtube.com/watch?v=…" onChange={event=>setLink(event.target.value)}/>
   <Button type="submit" variant="primary" disabled={!link.trim()}>Break down</Button>
  </form>
  <button type="button" className="linkish" style={{marginTop:12}} onClick={onSettings}>Follow channels in Settings</button>
 </>}>
  Paste a link to any video that's working and we'll break it down. To see what's working in your space each day, follow channels in Settings.
 </Empty></div>;
 return <div>
  <div className="row" style={{marginBottom:10}}><b style={{fontSize:14}}>Working in your topics</b><span className="small muted">Each breakdown takes about a minute.</span></div>
  <div className="grid g3" style={{gap:12}}>{items.map(item=><TrendCard key={item.videoId} item={item} saved={!!savedBreakdown(saved,item.videoId)} onBreak={choose}/>)}</div>
  <TrendHelp/>
 </div>;
}
