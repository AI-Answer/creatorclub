import {useEffect,useState} from 'react';
import {Image as ImageIcon,X} from 'lucide-react';
import type {Breakdown,ResearchTile,TranscriptChapter} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {clockTime,linkHost} from '../video-plan';
import {youtubeId} from '../board';
import {ErrorLine} from '../ErrorLine';
import {creatorName,fmtDays,fmtNum} from '../format';
import {Avatar,Icon,MultChip,SourceIcon,Spinner,Thumb,type IconName} from '../ui';
import type {Reading} from './useBoard';

/** The picture a tile shows: a video's thumbnail, or the tile's own saved file. */
export function tileImage(videoId:string,tile:ResearchTile):string|undefined{
 if(tile.file)return `/api/club/videos/${encodeURIComponent(videoId)}/research/${encodeURIComponent(tile.id)}/file`;
 return tile.meta.thumbnail;
}

/** The head of a tile: its label, and a quiet remove button. */
function TileHead({icon,label,onRemove}:{icon:IconName;label:string;onRemove():void}){
 return <div className="th"><Icon name={icon} size={13}/>{label}<button type="button" className="btn ghost sm icon-only x" onClick={onRemove} aria-label="Remove tile" style={{width:22,height:22}}><X aria-hidden size={13}/></button></div>;
}

export interface TileBodyProps{
 tile:ResearchTile;
 videoId:string;
 reading?:Reading;
 onRemove():void;
 onSaveText(text:string):void;
 onRetryRead():void;
 onBreakdown(videoId:string):void;
}

/** One tile on the Board, drawn per kind as the prototype does. */
export function TileBody(props:TileBodyProps){
 const {tile}=props;
 switch(tile.kind){
  case 'note':return <NoteTile {...props}/>;
  case 'video':return <VideoTile {...props}/>;
  case 'breakdown':return <BreakdownTile {...props}/>;
  case 'signal':return <SignalTile {...props}/>;
  case 'link':return <LinkTile {...props}/>;
  case 'image':return <ImageTile {...props}/>;
  case 'text':return <TextTile {...props}/>;
 }
}

function NoteTile({tile,onRemove,onSaveText}:TileBodyProps){
 return <>
  <TileHead icon="StickyNote" label="Note" onRemove={onRemove}/>
  <div className="tb"><textarea defaultValue={tile.text??''} autoFocus={!tile.text} placeholder="Write a note…" aria-label="Note" rows={Math.min(14,Math.max(3,Math.ceil((tile.text??'').length/34)))}
   onBlur={event=>onSaveText(event.target.value)}/></div>
 </>;
}

function TextTile({tile,onRemove}:TileBodyProps){
 return <><TileHead icon="FileText" label="Text" onRemove={onRemove}/><div className="tb"><p style={{margin:0,whiteSpace:'pre-wrap',fontSize:13.5,lineHeight:1.5}}>{tile.text}</p></div></>;
}

function VideoTile({tile,videoId,reading,onRemove,onRetryRead,onBreakdown}:TileBodyProps){
 const {meta}=tile,picture=tileImage(videoId,tile),unread=!tile.title,creator=creatorName(meta.channel);
 const [chapters,setChapters]=useState<TranscriptChapter[]|null>(null),[open,setOpen]=useState(false),[error,setError]=useState('');
 const source=youtubeId(tile.url);
 useEffect(()=>{
  if(!open||chapters||!meta.transcript)return;
  setError('');
  clubFetch<TranscriptChapter[]>(`/videos/${encodeURIComponent(videoId)}/research/${encodeURIComponent(tile.id)}/transcript`).then(setChapters,reason=>setError(errorMessage(reason,"Couldn't load the transcript.")));
 },[open,chapters,meta.transcript,videoId,tile.id]);
 return <>
  <TileHead icon="Youtube" label="YouTube" onRemove={onRemove}/>
  <div className="tb">
   <Thumb videoId={source} src={source?undefined:picture} seed={tile.id} chip={<MultChip m={meta.multiplier} who={creator||undefined} onThumb dash/>}/>
   <div style={{fontWeight:600,fontSize:13.5,lineHeight:1.35,margin:'10px 0 6px'}} className="clamp2">{tile.title??linkHost(tile.url??'')}</div>
   {meta.channel&&<div className="row small muted" style={{marginBottom:6}}><Avatar name={meta.channel} size="xs"/><span className="ellipsis">{meta.channel}</span></div>}
   {unread?(reading?.phase==='failed'?<ErrorLine message={reading.message} onRetry={onRetryRead}/>:<div className="small muted row"><Spinner size={13} label="Reading the video"/>Reading the video…</div>)
    :meta.views!==undefined?<div className="stats"><span><b>{fmtNum(meta.views)}</b> views</span>{meta.ageDays!==undefined&&<span>{fmtDays(meta.ageDays)}</span>}</div>:null}
   <div className="row" style={{marginTop:8,gap:6,flexWrap:'wrap'}}>
    {tile.url&&<a className="btn sm ghost" href={tile.url} target="_blank" rel="noopener noreferrer"><Icon name="ArrowUpRight" size={13}/>Open</a>}
    {source&&<button type="button" className="btn sm ghost" onClick={()=>onBreakdown(source)}><Icon name="FileText" size={13}/>Breakdown</button>}
    {meta.transcript&&<button type="button" className="btn sm ghost" aria-expanded={open} onClick={()=>setOpen(current=>!current)}>{open?'Hide transcript':'Transcript'}</button>}
   </div>
   {open&&(error?<div style={{marginTop:8}}><ErrorLine message={error} onRetry={()=>{setError('');setChapters(null);}}/></div>
    :!chapters?<div style={{marginTop:8}}><Spinner label="Loading the transcript" size={14}/></div>
    :<div style={{marginTop:8,display:'flex',flexDirection:'column',gap:8,maxHeight:240,overflow:'auto'}} aria-label="Transcript">
      {chapters.map((chapter,index)=><div key={index}><div className="small" style={{fontWeight:600}}><span className="faint" style={{marginRight:6}}>{clockTime(chapter.start)}</span>{chapter.title}</div><p style={{margin:'2px 0 0',fontSize:13,lineHeight:1.5}}>{chapter.text}</p></div>)}
     </div>)}
  </div>
 </>;
}

function BreakdownTile({tile,videoId,onRemove,onBreakdown}:TileBodyProps){
 const [found,setFound]=useState<Breakdown|null|undefined>(undefined);
 useEffect(()=>{
  if(!tile.meta.breakdownId)return;
  clubFetch<Breakdown>(`/breakdowns/${encodeURIComponent(tile.meta.breakdownId)}`).then(setFound,()=>setFound(null));
 },[tile.meta.breakdownId]);
 if(found===undefined)return <><TileHead icon="Sparkles" label="Breakdown" onRemove={onRemove}/><div className="tb"><Spinner label="Loading the breakdown" size={14}/></div></>;
 if(!found)return <><TileHead icon="Sparkles" label="Breakdown" onRemove={onRemove}/><div className="tb small muted">This breakdown is no longer saved.</div></>;
 const why=found.whyItWorked;
 const source=youtubeId(found.url);
 return <>
  <TileHead icon="Sparkles" label={`Breakdown · ${creatorName(found.video.channel)}`} onRemove={onRemove}/>
  <div className="tb">
   <div className="row" style={{gap:10,marginBottom:10}}><img src={found.video.thumbnail} alt="" style={{width:72,height:40,borderRadius:5,objectFit:'cover'}}/><div style={{fontWeight:600,fontSize:13,lineHeight:1.3}} className="clamp2">{found.video.title}</div></div>
   <div className="small faint" style={{marginBottom:6}}>Why it worked</div>
   <ol style={{margin:0,paddingLeft:18,fontSize:13,lineHeight:1.5,color:'var(--cc-text-2)',display:'flex',flexDirection:'column',gap:6}}>{[why.titlePackaging,why.hookSpeed,why.retention].filter(Boolean).slice(0,3).map((line,index)=><li key={index}>{line}</li>)}</ol>
   {source&&<button type="button" className="btn sm ghost" style={{marginTop:8}} onClick={()=>onBreakdown(source)}><Icon name="FileText" size={13}/>Open breakdown</button>}
  </div>
 </>;
}

function SignalTile({tile,onRemove}:TileBodyProps){
 const {meta}=tile,source=meta.source??'x',label=source==='x'?'Post on X':'Reddit post';
 return <>
  <TileHead icon="MessagesSquare" label={label} onRemove={onRemove}/>
  <div className="tb">
   <div className="row" style={{marginBottom:8}}><Avatar name={meta.author??'?'} size="sm"/><b style={{fontSize:13}} className="ellipsis">{meta.author}</b><span className="grow"/><SourceIcon source={source}/></div>
   <div className="clamp3" style={{fontSize:13,lineHeight:1.5}}>{tile.text}</div>
   <div className="stats" style={{marginTop:8}}>{meta.likes!==undefined&&<span><Icon name="Heart" size={12}/><b>{fmtNum(meta.likes)}</b></span>}{meta.replies!==undefined&&<span><Icon name="MessageCircle" size={12}/><b>{fmtNum(meta.replies)}</b></span>}</div>
   {tile.url&&<a className="btn sm ghost" style={{marginTop:6}} href={tile.url} target="_blank" rel="noopener noreferrer"><Icon name="ArrowUpRight" size={13}/>Open post</a>}
  </div>
 </>;
}

function LinkTile({tile,onRemove}:TileBodyProps){
 const host=linkHost(tile.url??'');
 return <>
  <TileHead icon="Link" label="Link" onRemove={onRemove}/>
  <div className="tb row" style={{alignItems:'flex-start',gap:10}}>
   <span style={{width:32,height:32,borderRadius:8,background:'var(--cc-bg-sunk)',fontWeight:700,color:'var(--cc-text-2)',display:'inline-flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{host.charAt(0).toUpperCase()}</span>
   <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13.5,lineHeight:1.35}}>{tile.title??host}</div><a href={tile.url} target="_blank" rel="noopener noreferrer" className="small ellipsis" style={{color:'var(--cc-accent-text)',display:'block'}}>{host}</a></div>
  </div>
 </>;
}

function ImageTile({tile,videoId,onRemove}:TileBodyProps){
 const picture=tileImage(videoId,tile);
 return <>
  <TileHead icon="Image" label="Screenshot" onRemove={onRemove}/>
  <div className="tb">
   {picture?<img src={picture} alt={tile.title??''} style={{width:'100%',aspectRatio:'16/10',objectFit:'cover',borderRadius:8,border:'1px solid var(--cc-line)'}}/>:<div className="small muted"><ImageIcon size={14}/> Image not found</div>}
   <div className="small muted" style={{marginTop:8}}>{tile.title??'Screenshot'}</div>
  </div>
 </>;
}
