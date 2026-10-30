import type {TrendingEntry,Video} from '../../shared/club';
import {ErrorLine} from './ErrorLine';
import {ProgressLine} from './ProgressLine';
import {FIND_IDEA,VIDEO_STEPS} from './steps';
import type {VideoTab} from './routes';
import {TrendCard,TrendHelp} from './TrendCards';
import {SCAN_ESTIMATE} from './welcome';
import {Button,Empty,Icon,Spinner} from './ui';

/** What the first-video checklist and its picks need from the screen around them. */
export interface FirstStepsProps{
 ideas:readonly Video[];
 hasTopics:boolean;
 /** The videos to start from; null while they are loading. */
 start:readonly TrendingEntry[]|null;
 /** The search for them is running, with what it says it is doing. */
 searching:{line?:string}|null;
 error?:string|null;
 hasBreakdown(videoId:string):boolean;
 onRetry():void;
 onBreak(item:TrendingEntry):void;
 onStartIdea(video:Video):void;
 onOpenStep(video:Video,tab:VideoTab):void;
 onSettings():void;
 onFollow():void;
 onDiscover():void;
}

interface Row{key:string;title:string;text:string;done:boolean;go?:()=>void}

/**
 * The first-video checklist a channel sees until it has a video in production. Its rows are the real steps with the words the rest of the app uses:
 * set up, Discover, then Board, Plan, Record, Edit and Publish. Every row that has somewhere to go is a button (the five steps open once there is an idea).
 * Beside it, the videos working in the channel's topics to start from, with what their numbers mean said once.
 */
export function FirstSteps({ideas,hasTopics,start,searching,error,hasBreakdown,onRetry,onBreak,onStartIdea,onOpenStep,onSettings,onFollow,onDiscover}:FirstStepsProps){
 const idea=ideas[0];
 const rows:Row[]=[
  {key:'setup',title:'Set up',text:'Your AI and your topics are saved.',done:hasTopics,go:onSettings},
  {key:'discover',title:FIND_IDEA.name,text:FIND_IDEA.does,done:ideas.length>0,go:onDiscover},
  ...VIDEO_STEPS.map<Row>(step=>({key:step.tab,title:step.name,text:step.does,done:false,go:idea?()=>(step.tab==='board'?onStartIdea(idea):onOpenStep(idea,step.tab)):undefined})),
 ];
 const current=rows.findIndex(row=>!row.done);
 return <div className="card" style={{padding:22,display:'grid',gridTemplateColumns:'1fr 1.3fr',gap:28}}>
  <div>
   <h2 className="sec" style={{fontSize:17,marginBottom:4}}>Your first video</h2>
   <div className="muted" style={{marginBottom:12}}>{idea?`You have an idea: "${idea.title}". Start planning it.`:"You don't need to know what to make yet. Start from something that's already working."}</div>
   <ol style={{listStyle:'none',margin:0,padding:0}}>{rows.map((row,index)=>{
    const body=<>
     <span aria-hidden style={{width:22,height:22,borderRadius:'50%',flex:'none',display:'flex',alignItems:'center',justifyContent:'center',background:row.done?'var(--cc-ok)':index===current?'var(--cc-primary)':'var(--cc-bg-sunk)',color:row.done||index===current?'var(--cc-on-primary)':'var(--cc-text-3)',fontSize:12,fontWeight:700}}>{row.done?<Icon name="check" size={13} stroke={2.6} style={{color:'var(--cc-on-primary)'}}/>:index+1}</span>
     <span><span className="ck-title" style={{display:'block',color:row.done?'var(--cc-text-2)':'var(--cc-text)'}}>{row.title}</span><span className="small muted" style={{display:'block'}}>{row.text}</span></span>
    </>;
    return <li key={row.key} style={{borderBottom:index<rows.length-1?'1px solid var(--cc-line)':0}}>
     {row.go?<button type="button" className="checklist-row" onClick={row.go}>{body}</button>:<div className="checklist-row is-later">{body}</div>}
    </li>;
   })}</ol>
   {idea
    ?<Button variant="primary" style={{marginTop:16}} onClick={()=>onStartIdea(idea)}><Icon name="next" size={15}/>Start planning</Button>
    :<div className="small muted" style={{marginTop:12}}>Pick an idea and the five steps open for it.</div>}
  </div>
  <div>
   {(start===null||start.length>0||searching)&&<div className="row" style={{marginBottom:10}}><b style={{fontSize:14}}>Start here: break one of these down</b></div>}
   {error?<ErrorLine message={error} onRetry={onRetry}/>
    :searching?<ProgressLine label="Searching YouTube for your topics" line={searching.line??'Starting the search on your topics…'} estimate={SCAN_ESTIMATE} note="You don't have to wait: New video starts from a title you already have."/>
    :start===null?<div className="row"><Spinner label="Loading what's working" size={18}/><span className="muted">Loading what's working…</span></div>
    :start.length?<>
     <div className="grid g3" style={{gap:12}}>{start.map(item=><TrendCard key={item.videoId} item={item} saved={hasBreakdown(item.videoId)} onBreak={onBreak}/>)}</div>
     <TrendHelp/>
    </>:<Empty icon="trending" title="No videos to start from yet" action={<button type="button" className="btn" onClick={onFollow}>Follow channels</button>}>Follow a few channels in your space and the videos beating their usual views show up here.</Empty>}
  </div>
 </div>;
}
