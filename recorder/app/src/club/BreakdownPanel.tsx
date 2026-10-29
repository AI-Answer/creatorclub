import {useState,type DragEvent} from 'react';
import type {Breakdown,Video} from '../../shared/club';
import {ClubApiError,clubFetch,errorMessage,notifyVideosChanged} from './api';
import {BREAKDOWN_STEPS,NOT_A_FILE,PLATFORM_LABEL,isVideoFile} from './breakdown';
import {youtubeId} from './board';
import {ErrorLine} from './ErrorLine';
import {creatorName,fmtDays,fmtNum} from './format';
import {Avatar,Icon,Level,MultChip,Thumb,cn,useToast} from './ui';
import {useBreakdownRun,type BreakdownTarget} from './useBreakdownRun';

const hasFiles=(event:DragEvent)=>[...(event.dataTransfer?.types??[])].includes('Files');

/**
 * Break down one video: its progress while the job runs, one plain sentence with Try again (and a place to drop a video file) when it fails,
 * and the result: why it worked, what viewers ask and three concepts to add to your ideas.
 * `videoId` and `title` are shown while it runs, when the caller already knows them.
 * `multiplier` is the video's number from Working now when it is listed there (null when its usual is not known): the card and this panel must say the same thing,
 * and the breakdown's own number was read at another time. Without it the breakdown's own number shows. `onAdded` gets the new idea's id.
 */
export function BreakdownPanel({target,videoId,title,multiplier,videos,onAdded,onCancel}:{target:BreakdownTarget;videoId?:string|null;title?:string;multiplier?:number|null;videos:readonly Video[];onAdded(videoId:string):void;onCancel?():void}){
 const {state,step,comments,retry,tryFile}=useBreakdownRun(target);
 const [over,setOver]=useState(false),[dropError,setDropError]=useState('');
 const failed=state.phase==='failed';
 const drop=(event:DragEvent)=>{
  if(!failed||!hasFiles(event))return;
  event.preventDefault();setOver(false);
  const file=event.dataTransfer.files[0];
  if(!file)return;
  if(!isVideoFile(file)){setDropError(NOT_A_FILE);return;}
  setDropError('');tryFile(file);
 };

 if(state.phase==='done')return <BreakdownResult breakdown={state.result as Breakdown} multiplier={multiplier} videos={videos} onAdded={onAdded}/>;
 if(failed)return <div className="bd" onDragOver={event=>{if(hasFiles(event)){event.preventDefault();setOver(true);}}} onDragLeave={()=>setOver(false)} onDrop={drop}>
  <ErrorLine message={dropError||state.message} onRetry={()=>{setDropError('');retry();}}/>
  <p className={cn('mt-4 rounded-lg border border-dashed px-4 py-6 text-center text-base',over?'border-accent bg-accent-soft text-accent':'border-line text-muted')}>Drop a video file here</p>
 </div>;
 return <div className="bd" aria-live="polite"><div className="bd-head">
  {videoId&&<Thumb videoId={videoId} seed={videoId}/>}
  <div className="grow">
   <div style={{fontWeight:600,fontSize:15,marginBottom:12}}>{title||'Reading the link'}</div>
   <div className="bd-steps">{BREAKDOWN_STEPS.map((label,index)=><div key={label} className={`bd-step${step===index?' on':step>index?' done':''}`}>
    {step>index?<Icon name="CircleCheck" size={16} style={{color:'var(--cc-ok)'}}/>:step===index?<span className="spin"/>:<Icon name="Circle" size={16}/>}
    {label}{index===2&&step>2&&comments?` · ${fmtNum(comments)} comments`:''}
   </div>)}</div>
   {onCancel&&<button type="button" className="btn ghost sm" style={{marginTop:14}} onClick={onCancel}>Cancel</button>}
  </div>
 </div></div>;
}

function BreakdownResult({breakdown,multiplier,videos,onAdded}:{breakdown:Breakdown;multiplier?:number|null;videos:readonly Video[];onAdded(videoId:string):void}){
 const {video,whyItWorked:why}=breakdown;
 const mult=multiplier===undefined?video.multiplier:multiplier;
 const who=creatorName(video.channel)||undefined;
 const known=breakdown.platform!=='file';
 const [more,setMore]=useState(false);
 const source=youtubeId(breakdown.url);
 const picture=<Thumb videoId={source} src={source?undefined:video.thumbnail} seed={breakdown.id} chip={<MultChip m={mult} who={who} onThumb dash/>}/>;
 return <div className="bd">
  <div className="bd-head">
   {breakdown.url?<a href={breakdown.url} target="_blank" rel="noopener noreferrer" style={{width:220,flex:'none'}}>{picture}</a>:<div style={{width:220,flex:'none'}}>{picture}</div>}
   <div className="grow">
    <div style={{fontWeight:650,fontSize:17,letterSpacing:'-0.015em',lineHeight:1.3}}>{video.title}</div>
    <div className="row" style={{marginTop:8,gap:8}}>{video.channel&&<><Avatar name={video.channel} size="sm"/><span className="muted">{video.channel}</span></>}<span className="faint small">{PLATFORM_LABEL[breakdown.platform]??breakdown.platform}</span></div>
    <div className="row" style={{marginTop:14,gap:8,flexWrap:'wrap'}}>
     <MultChip m={mult} who={who} label dash/>
     {known&&video.views>0&&<span className="chip outline"><Icon name="Eye" size={12}/>{fmtNum(video.views)} views</span>}
     {known&&video.likes>0&&<span className="chip outline"><Icon name="Heart" size={12}/>{fmtNum(video.likes)}</span>}
     {known&&video.comments>0&&<span className="chip outline"><Icon name="MessageCircle" size={12}/>{fmtNum(video.comments)}</span>}
     {known&&<span className="chip outline"><Icon name="Clock" size={12}/>{fmtDays(video.ageDays)}</span>}
    </div>
    {breakdown.watchedWith==='gemini'&&<div className="faint small" style={{marginTop:8}}>Watched with Gemini</div>}
   </div>
  </div>
  <div className="bd-grid">
   <div>
    <h3><Icon name="Sparkles" size={15} style={{color:'var(--cc-accent)'}}/>Why it worked</h3>
    <ol>{why.short.map((point,index)=><li key={index}>{point}</li>)}</ol>
    <button type="button" className="linkish" style={{marginTop:12}} aria-expanded={more} onClick={()=>setMore(open=>!open)}>{more?'Hide the full breakdown':'Show the full breakdown'}</button>
    {more&&<div style={{display:'flex',flexDirection:'column',gap:10,marginTop:12}}>
     <div className="kv"><b>Title and packaging.</b> {why.titlePackaging}</div>
     <div className="kv"><b>How fast the opening hooks.</b> {why.hookSpeed}</div>
     <div className="kv"><b>Structure.</b><ol style={{marginTop:6}}>{why.structure.map((beat,index)=><li key={index}>{beat}</li>)}</ol></div>
     <div className="kv"><b>What keeps people watching.</b> {why.retention}</div>
     <div className="kv"><b>Payoff.</b> {why.payoff}</div>
     <div className="kv"><b>Reusable outline.</b><ol style={{marginTop:6}}>{breakdown.reusableOutline.map((beat,index)=><li key={index}>{beat}</li>)}</ol></div>
    </div>}
   </div>
   <div>
    <h3><Icon name="MessagesSquare" size={15}/>What viewers ask</h3>
    {breakdown.viewerQuestions.length?breakdown.viewerQuestions.slice(0,6).map((item,index)=><div key={index} className="q"><span>{item.question}</span>{item.likes>0&&<span className="likes"><Icon name="Heart" size={12}/>{item.likes}</span>}</div>)
     :<div className="muted small">No questions in the comments.</div>}
   </div>
  </div>
  <h3 style={{marginTop:26}}><Icon name="Lightbulb" size={15}/>Concepts for you</h3>
  <div className="concepts">{breakdown.concepts.map((concept,index)=><ConceptCard key={index} breakdown={breakdown} index={index} videos={videos} onAdded={onAdded}/>)}</div>
 </div>;
}

/** One concept. `Add to my ideas` creates the idea; a concept that is already an idea opens it instead. */
function ConceptCard({breakdown,index,videos,onAdded}:{breakdown:Breakdown;index:number;videos:readonly Video[];onAdded(videoId:string):void}){
 const concept=breakdown.concepts[index];
 const [busy,setBusy]=useState(false);
 const toast=useToast();
 const existing=videos.find(video=>video.source?.breakdownId===breakdown.id&&video.title===concept.title);
 const add=async()=>{
  setBusy(true);
  try{
   const created=await clubFetch<Video>(`/breakdowns/${encodeURIComponent(breakdown.id)}/concepts/${index}/add`,{method:'POST'});
   onAdded(created.id);
  }catch(reason){
   if(reason instanceof ClubApiError&&reason.status===409){toast('That concept is already in your ideas');notifyVideosChanged();}
   else toast(errorMessage(reason,"Couldn't add that idea."));
  }finally{setBusy(false);}
 };
 return <div className="card concept">
  <div className="tt">{concept.title}</div>
  <div className="hookq">{concept.hook}</div>
  <div className="kv"><b>Angle.</b> {concept.angle}</div>
  <div className="kv"><b>Twist.</b> {concept.twist}</div>
  <div className="row" style={{flexWrap:'wrap',gap:6}}><Level label="Demand" d={concept.demand}/><Level label="Gap" d={concept.gap}/><Level label="Easy to show" d={concept.show}/></div>
  <div style={{marginTop:'auto'}}>{existing
   ?<button type="button" className="btn sm" style={{width:'100%'}} onClick={()=>onAdded(existing.id)}><Icon name="Check" size={14} style={{color:'var(--cc-ok)'}}/>In your ideas · Open</button>
   :<button type="button" className="btn sm" style={{width:'100%'}} disabled={busy} onClick={()=>void add()}><Icon name="Plus" size={14}/>Add to my ideas</button>}</div>
 </div>;
}
