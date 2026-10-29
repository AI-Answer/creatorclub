import {useEffect,useState} from 'react';
import type {Breakdown,Video} from '../../shared/club';
import {clubFetch} from './api';
import type {IdeaActionSet} from './cards/IdeaRow';
import {ytThumb} from './format';
import {LEVEL_WORD,ideaSourceVideoId,isTimely} from './ideas';
import {Drawer,Ed,Icon,Level,StagePill,Thumb} from './ui';
import {youtubeId} from './board';

const none=(text:string)=>text.trim()||null;

/** The first two reasons from the breakdown an idea came from. Nothing when it did not come from one, or the breakdown is gone. */
function useBreakdownReasons(video:Video):string[]{
 const id=video.source?.kind==='breakdown'?video.source.breakdownId:undefined;
 const [reasons,setReasons]=useState<string[]>([]);
 useEffect(()=>{
  setReasons([]);
  if(!id)return;
  let live=true;
  clubFetch<Breakdown>(`/breakdowns/${encodeURIComponent(id)}`).then(found=>{if(live)setReasons(found.whyItWorked.short.slice(0,2));},()=>{});
  return()=>{live=false;};
 },[id]);
 return reasons;
}

/** One idea in a panel: every note can be edited where it stands, and the footer has the actions (Start planning, Later, Delete). */
export function IdeaDrawer({video,actions,onClose,onRemove}:{video:Video;actions:IdeaActionSet;onClose():void;onRemove(video:Video):void}){
 const notes=video.idea??{};
 const reasons=useBreakdownReasons(video);
 const ratings=[['Demand','demand',notes.demand],['Gap','gap',notes.gap],['Easy to show','show',notes.show]] as const;
 const remove=<button type="button" className="btn ghost sm" onClick={()=>onRemove(video)}><Icon name="Trash2" size={14}/>Delete</button>;
 return <Drawer onClose={onClose} label={video.title}
  header={<div className="row"><StagePill stage={video.stage}/>{isTimely(video)&&<span className="chip b-amber">Timely</span>}</div>}
  footer={video.hidden
   ?<><button type="button" className="btn sm" onClick={()=>void actions.restore(video)}><Icon name="RotateCcw" size={14}/>Restore</button><span className="grow"/>{remove}</>
   :<><button type="button" className="btn ghost sm" onClick={()=>{void actions.later(video);onClose();}}><Icon name="Bookmark" size={14}/>Later</button>{remove}<span className="grow"/>
    <button type="button" className="btn primary" onClick={()=>void actions.startPlanning(video)}><Icon name="ArrowRight" size={15}/>Start planning</button></>}>
  <Thumb videoId={ideaSourceVideoId(video)} text={video.title} seed={video.id}/>
  <Ed tag="h2" value={video.title} ph="Title" style={{fontSize:21,letterSpacing:'-0.02em',margin:'18px 0 8px',lineHeight:1.25,fontWeight:600}} onChange={title=>actions.rename(video,title)}/>
  <Ed tag="p" multiline className="muted" value={notes.why} ph="Why it could work" style={{margin:'0 0 18px',lineHeight:1.55}} onChange={text=>void actions.edit(video,{why:none(text)})}/>
  <div style={{marginBottom:18}}><div className="small faint" style={{marginBottom:6}}>Hook</div>
   <Ed multiline className="hookq" value={notes.hook} ph="The first line you would say" onChange={text=>void actions.edit(video,{hook:none(text)})}/></div>
  <div className="kv" style={{marginBottom:8}}><b>Angle.</b> <Ed tag="span" value={notes.angle} ph="What the video does" onChange={text=>void actions.edit(video,{angle:none(text)})}/></div>
  <div className="kv" style={{marginBottom:18}}><b>Twist.</b> <Ed tag="span" value={notes.twist} ph="What makes it yours" onChange={text=>void actions.edit(video,{twist:none(text)})}/></div>
  {ratings.some(([,,rating])=>rating)&&<div className="card" style={{padding:'4px 14px',marginBottom:18}}>
   {ratings.map(([label,key,rating])=>rating&&<div key={key} className="dgs-row" style={{gridTemplateColumns:'120px 1fr'}}><Level label={label} d={rating}/>
    <Ed className="muted" value={rating.note||LEVEL_WORD[rating.level]} ph="Add a note" style={{lineHeight:1.5}} onChange={text=>void actions.edit(video,{[key]:{level:rating.level,note:text.trim()}})}/></div>)}
  </div>}
  <div style={{marginBottom:18}}><div className="small faint" style={{marginBottom:6}}>Notes</div>
   <Ed multiline value={notes.note} ph="Add a note" style={{lineHeight:1.55,fontSize:13.5}} onChange={text=>void actions.edit(video,{note:none(text)})}/></div>
  {!!notes.sources?.length&&<div><div className="small faint" style={{marginBottom:8}}>Sources</div>{notes.sources.map((source,index)=>{
   const id=youtubeId(source.url);
   return <div key={index} className="row" style={{padding:'6px 0',fontSize:13.5}}>
    {id?<img src={ytThumb(id)} alt="" style={{width:48,height:27,borderRadius:4,objectFit:'cover'}}/>:<span className="src-ic" style={{background:'var(--cc-bg-sunk)',color:'var(--cc-text-2)'}}><Icon name="Link" size={12}/></span>}
    {source.url?<a href={source.url} target="_blank" rel="noopener noreferrer" className="ellipsis" style={{color:'var(--cc-accent-text)'}}>{source.label}</a>:<span className="ellipsis">{source.label}</span>}
   </div>;})}</div>}
  {reasons.length>0&&<div style={{marginTop:18}}><div className="small faint" style={{marginBottom:6}}>From the breakdown</div>
   <ol style={{margin:0,paddingLeft:18,color:'var(--cc-text-2)',lineHeight:1.55,fontSize:13.5}}>{reasons.map((reason,index)=><li key={index} style={{marginBottom:6}}>{reason}</li>)}</ol></div>}
 </Drawer>;
}
