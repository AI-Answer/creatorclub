import type {TrendingEntry,Video} from '../../shared/club';
import {ErrorLine} from './ErrorLine';
import {FollowChannel} from './FollowChannel';
import {creatorName,fmtNum} from './format';
import {Empty,Icon,MultChip,Spinner,Thumb} from './ui';

/** The first-video checklist a channel sees until it has a video in production: connect, say what your space is, pick an idea, then the five steps. `error` is why the videos to start from could not be read, with `onRetry`. */
export function FirstSteps({ideas,hasTopics,start,error,onRetry,onBreak,onOpenIdea,onIdeas}:{ideas:readonly Video[];hasTopics:boolean;start:readonly TrendingEntry[]|null;error?:string|null;onRetry():void;onBreak(item:TrendingEntry):void;onOpenIdea(video:Video):void;onIdeas():void}){
 const done=(key:string)=>key==='ai'||(key==='space'&&hasTopics)||(key==='idea'&&ideas.length>0);
 const steps=[
  {key:'ai',title:'Connect your AI',text:'Your AI is connected.'},
  {key:'space',title:'Tell CreatorClub your space',text:'Topics and who you make videos for.'},
  {key:'idea',title:'Pick your first idea',text:"Break down a video that's working and keep a concept."},
  {key:'plan',title:'Plan it, record the scenes, edit, publish',text:'Every video goes through the same five steps.'},
 ];
 const current=steps.findIndex(step=>!done(step.key));
 return <div className="card" style={{padding:22,display:'grid',gridTemplateColumns:'1fr 1.3fr',gap:28}}>
  <div>
   <h2 className="sec" style={{fontSize:17,marginBottom:4}}>Your first video</h2>
   <div className="muted" style={{marginBottom:16}}>{ideas.length?'You have an idea. Open it and start planning.':"You don't need to know what to make yet. Start from something that's already working."}</div>
   {steps.map((step,index)=><div key={step.key} className="row" style={{alignItems:'flex-start',gap:12,padding:'9px 0',borderBottom:index<3?'1px solid var(--cc-line)':0}}>
    <span aria-hidden style={{width:22,height:22,borderRadius:'50%',flex:'none',display:'flex',alignItems:'center',justifyContent:'center',background:done(step.key)?'var(--cc-ok)':index===current?'var(--cc-primary)':'var(--cc-bg-sunk)',color:done(step.key)||index===current?'var(--cc-on-primary)':'var(--cc-text-3)',fontSize:12,fontWeight:700}}>{done(step.key)?<Icon name="check" size={13} stroke={2.6} style={{color:'var(--cc-on-primary)'}}/>:index+1}</span>
    <div><div style={{fontWeight:600,color:done(step.key)?'var(--cc-text-2)':'var(--cc-text)',textDecoration:done(step.key)?'line-through':'none',textDecorationColor:'var(--cc-line-strong)'}}>{step.title}</div><div className="small muted">{step.text}</div></div>
   </div>)}
   {ideas.length>0&&<button type="button" className="btn primary" style={{marginTop:16}} onClick={()=>onOpenIdea(ideas[0])}><Icon name="next" size={15}/>Open "{ideas[0].title}"</button>}
  </div>
  <div>
   {(start===null||start.length>0)&&<div className="row" style={{marginBottom:10}}><b style={{fontSize:14}}>Start here: break one of these down</b></div>}
   {error?<ErrorLine message={error} onRetry={onRetry}/>:start===null?<Spinner label="Loading what's working" size={18}/>:start.length?<>
    <div className="grid g3" style={{gap:12}}>{start.map(item=><div key={item.videoId} className="card trend hov" onClick={()=>onBreak(item)}>
     <Thumb videoId={item.videoId} seed={item.videoId} chip={<MultChip m={item.mult} who={creatorName(item.channel)} onThumb dash/>}/>
     <div className="tt clamp2" style={{fontSize:13}}>{item.title}</div>
     <div className="stats"><span><b>{fmtNum(item.views)}</b> views</span><span><b>{fmtNum(item.vpd)}</b>/day</span></div>
     {item.reason&&<div className="reason"><Icon name="ai" size={12}/>{item.reason}</div>}
     <FollowChannel item={item}/>
     <button type="button" className="btn sm" onClick={event=>{event.stopPropagation();onBreak(item);}}><Icon name="ai" size={14}/>Break this down</button>
    </div>)}</div>
    <div className="small muted" style={{marginTop:12}}>A breakdown shows why the video worked, what viewers asked, and three concepts you could make.</div>
   </>:<Empty icon="trending" title="No videos to start from yet" action={<button type="button" className="btn" onClick={onIdeas}>Go to Ideas</button>}>Paste a link on Ideas to break down any video that's working.</Empty>}
  </div>
 </div>;
}
