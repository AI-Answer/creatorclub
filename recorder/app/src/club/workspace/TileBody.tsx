import {memo,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {Breakdown,ResearchTile,TranscriptChapter,Video} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {clockTime,linkHost} from '../video-plan';
import {youtubeId} from '../board';
import {ErrorLine} from '../ErrorLine';
import {creatorName,fmtDays,fmtNum} from '../format';
import {Avatar,Icon,IconButton,MultChip,SourceIcon,Spinner,StagePill,Thumb,type IconName} from '../ui';
import {ideaWhy} from '../ideas';
import {InlineText} from './InlineText';
import {boardBase} from './board-base';
import type {NoteSaved,Reading} from './useBoard';
import {StickyNote} from './StickyNote';

/** The picture a tile shows: a video's thumbnail, or the tile's own saved file. `videoId` is the Board's (a video's id, or `CHANNEL_BOARD`). */
export function tileImage(videoId:string,tile:ResearchTile):string|undefined{
 if(tile.file)return `/api/club${boardBase(videoId)}/research/${encodeURIComponent(tile.id)}/file`;
 return tile.meta.thumbnail;
}

/** The head of a tile: its label, and a quiet remove button. */
function TileHead({icon,label,onRemove,children}:{icon:IconName;label:string;onRemove():void;/** Buttons before the remove button. */children?:ReactNode}){
 return <div className="th"><Icon name={icon} size={13}/>{label}<span className="th-actions">{children}<IconButton icon="close" iconSize={13} label="Remove from the board" className="x" onClick={onRemove} style={{width:22,height:22}}/></span></div>;
}

export interface TileBodyProps{
 tile:ResearchTile;
 videoId:string;
 reading?:Reading;
 onRemove():void;
 onOpen():void;
 onRetryRead():void;
 onBreakdown(videoId:string):void;
 /** `mine` tiles: the channel's idea or video the card stands for (undefined while the list loads, null when it is gone), and opening it. */
 mine?:Video|null;
 onOpenVideo?(video:Video):void;
 /** Saves text written on the card itself (ideas and text cards). */
 onSaveText?(text:string):Promise<unknown>;
 /** `note` tiles: saves the note's text to its file. With it the note is a sticky note to type in right on the Board; without it, a preview that opens the panel. */
 onSaveNote?(text:string,base:string|undefined):Promise<NoteSaved>;
 /** `note` tiles: focus the note's text (it was just made). */
 autoFocus?:boolean;
 /** `note` tiles: the note was left empty. */
 onBlurEmpty?():void;
}

/** One tile on the Board, drawn per kind as the prototype does. */
export function TileBody(props:TileBodyProps){
 const latest=useRef(props);latest.current=props;
 const saveText=!!props.onSaveText,saveNote=!!props.onSaveNote,openVideo=!!props.onOpenVideo,blurEmpty=!!props.onBlurEmpty;
 // Board selection and canvas gestures supply new closures. Forward them through stable
 // handlers so the rich note editors render only when their own content changes.
 const handlers=useMemo(()=>({
  onRemove:()=>latest.current.onRemove(),onOpen:()=>latest.current.onOpen(),onRetryRead:()=>latest.current.onRetryRead(),
  onBreakdown:(id:string)=>latest.current.onBreakdown(id),
  onSaveText:saveText?(text:string)=>latest.current.onSaveText!(text):undefined,
  onSaveNote:saveNote?(text:string,base:string|undefined)=>latest.current.onSaveNote!(text,base):undefined,
  onOpenVideo:openVideo?(video:Video)=>latest.current.onOpenVideo!(video):undefined,
  onBlurEmpty:blurEmpty?()=>latest.current.onBlurEmpty!():undefined,
 }),[saveText,saveNote,openVideo,blurEmpty]);
 return <TileContent {...props} {...handlers}/>;
}
const TileContent=memo(function TileContent(props:TileBodyProps){
 const {tile}=props;
 switch(tile.kind){
  case 'note':return <NoteTile {...props}/>;
  case 'video':return <VideoTile {...props}/>;
  case 'breakdown':return <BreakdownTile {...props}/>;
  case 'signal':return <SignalTile {...props}/>;
  case 'link':return <LinkTile {...props}/>;
  case 'image':return <ImageTile {...props}/>;
  case 'text':return <TextTile {...props}/>;
  case 'idea':return <IdeaTile {...props}/>;
  case 'mine':return <MineTile {...props}/>;
 }
});

/** A note: a sticky note to type in right on the Board. Its full editor (Markdown, headings, lists) opens from the button on its head; the file it is saved in is its tooltip. */
function NoteTile({tile,videoId,onRemove,onOpen,onSaveNote,autoFocus,onBlurEmpty}:TileBodyProps){
 const doc=tile.doc;
 const label=doc?.root==='folder'?'Note from your Notes folder':'Note';
 return <>
  <TileHead icon="note" label={label} onRemove={onRemove}>{!doc?.missing&&!doc?.tooLarge&&<IconButton icon="open-external" iconSize={13} label="Open in the full editor" onClick={onOpen} style={{width:22,height:22}}/>}</TileHead>
  {doc?.missing?<div className="tb small muted">{doc.root==='folder'?<>This note is from a Notes folder that is not the current one: <span className="note-path">{doc.folder??'an earlier folder'}</span>. It shows again if you choose that folder.</>:'This file is not in its folder any more. Put it back and it shows here again, or remove the card.'}</div>
   :doc?.tooLarge?<div className="tb small muted">This file is over 1 MB, so it is not shown. It stays in its folder.</div>
   :onSaveNote&&<StickyNote tile={tile} boardId={videoId} save={onSaveNote} autoFocus={autoFocus} onBlurEmpty={onBlurEmpty} label={tile.title||doc?.path||'Note'}/>}
 </>;
}

/** The words the card uses for a rating, instead of bars. */
const RATING_WORD:Record<string,string>={high:'Strong',mid:'Okay',low:'Weak'};

/** "The idea": why it could work and how it was rated, from the idea the video started as. */
function IdeaTile({tile,onRemove,onSaveText}:TileBodyProps){
 const {meta}=tile,ratings=[['Demand',meta.demand],['Gap',meta.gap],['Easy to show',meta.show]] as const;
 return <>
  <TileHead icon="idea" label="The idea" onRemove={onRemove}/>
  <div className="tb">
   {onSaveText?<InlineText value={tile.text??''} label="The idea" placeholder="Write the idea" save={onSaveText}/>:tile.text&&<p style={{margin:'0 0 10px',fontSize:13.5,lineHeight:1.5}}>{tile.text}</p>}
   <div style={{display:'flex',flexDirection:'column',gap:8}}>{ratings.map(([label,rating])=>rating&&<div key={label} className="idea-rating"><div style={{fontSize:13,fontWeight:600}}>{label} <span className="muted" style={{fontWeight:500}}>· {RATING_WORD[rating.level||'mid']}</span></div>{rating.note&&<div className="small muted" style={{marginTop:2,lineHeight:1.45}}>{rating.note}</div>}</div>)}</div>
  </div>
 </>;
}

/** One of the channel's own ideas or videos: its stage, title and why. It opens the idea's drawer, or the video's page. */
function MineTile({tile,mine,onRemove,onOpenVideo}:TileBodyProps){
 const idea=mine?.stage==='ideas',why=mine?ideaWhy(mine):'';
 return <>
  <TileHead icon={idea?'idea':'video'} label={mine===undefined?'Your video':idea?'Your idea':'Your video'} onRemove={onRemove}/>
  <div className="tb">
   {mine===null?<div className="small muted">“{tile.title??'This video'}” is no longer in this channel.</div>:<>
    {mine&&<div style={{marginBottom:6}}><StagePill stage={mine.stage}/></div>}
    <div style={{fontWeight:600,fontSize:13.5,lineHeight:1.35}} className="clamp2">{mine?.title??tile.title}</div>
    {why&&<p className="small muted clamp3" style={{margin:'6px 0 0',lineHeight:1.45}}>{why}</p>}
    {mine&&onOpenVideo&&<button type="button" className="btn sm ghost" style={{marginTop:8}} onClick={()=>onOpenVideo(mine)}><Icon name={idea?'idea':'open-external'} size={13}/>{idea?'Open idea':'Open video'}</button>}
   </>}
  </div>
 </>;
}

function TextTile({tile,onRemove,onSaveText}:TileBodyProps){
 return <><TileHead icon="script" label="Text" onRemove={onRemove}/><div className="tb">{onSaveText?<InlineText value={tile.text??''} label="Text" placeholder="Write here" save={onSaveText}/>:<p style={{margin:0,whiteSpace:'pre-wrap',fontSize:13.5,lineHeight:1.5}}>{tile.text}</p>}</div></>;
}

function VideoTile({tile,videoId,reading,onRemove,onRetryRead,onBreakdown}:TileBodyProps){
 const {meta}=tile,picture=tileImage(videoId,tile),unread=!tile.title,creator=creatorName(meta.channel);
 const [chapters,setChapters]=useState<TranscriptChapter[]|null>(null),[open,setOpen]=useState(false),[error,setError]=useState('');
 const source=youtubeId(tile.url);
 useEffect(()=>{
  if(!open||chapters||!meta.transcript)return;
  setError('');
  clubFetch<TranscriptChapter[]>(`${boardBase(videoId)}/research/${encodeURIComponent(tile.id)}/transcript`).then(setChapters,reason=>setError(errorMessage(reason,"Couldn't load the transcript.")));
 },[open,chapters,meta.transcript,videoId,tile.id]);
 return <>
  <TileHead icon="youtube" label="YouTube" onRemove={onRemove}/>
  <div className="tb">
   <Thumb videoId={source} src={source?undefined:picture} seed={tile.id} chip={<MultChip m={meta.multiplier} who={creator||undefined} onThumb dash/>}/>
   <div style={{fontWeight:600,fontSize:13.5,lineHeight:1.35,margin:'10px 0 6px'}} className="clamp2">{tile.title??linkHost(tile.url??'')}</div>
   {meta.channel&&<div className="row small muted" style={{marginBottom:6}}><Avatar name={meta.channel} size="xs"/><span className="ellipsis">{meta.channel}</span></div>}
   {unread?(reading?.phase==='failed'?<ErrorLine message={reading.message} onRetry={onRetryRead}/>:<div className="small muted row"><Spinner size={13} label="Reading the video"/>Reading the video…</div>)
    :meta.views!==undefined?<div className="stats"><span><b>{fmtNum(meta.views)}</b> views</span>{meta.ageDays!==undefined&&<span>{fmtDays(meta.ageDays)}</span>}</div>:null}
   <div className="row" style={{marginTop:8,gap:6,flexWrap:'wrap'}}>
    {tile.url&&<a className="btn sm ghost" href={tile.url} target="_blank" rel="noopener noreferrer"><Icon name="open-external" size={13}/>Open</a>}
    {source&&<button type="button" className="btn sm ghost" onClick={()=>onBreakdown(source)}><Icon name="script" size={13}/>Break down</button>}
    {meta.transcript&&<button type="button" className="btn sm ghost" aria-expanded={open} onClick={()=>setOpen(current=>!current)}>{open?'Hide transcript':'Transcript'}</button>}
   </div>
   {open&&(error?<div style={{marginTop:8}}><ErrorLine message={error} onRetry={()=>{setError('');setChapters(null);}}/></div>
    :!chapters?<div style={{marginTop:8}}><span className="row small muted" role="status"><Spinner label="Loading the transcript" size={14}/>Loading the transcript…</span></div>
    :<div data-wheel="own" style={{marginTop:8,display:'flex',flexDirection:'column',gap:8,maxHeight:240,overflow:'auto'}} aria-label="Transcript">
      {!chapters.length&&<p className="small muted">No transcript chapters were found. Open the source video to check its captions.</p>}{chapters.map((chapter,index)=><div key={index}><div className="small" style={{fontWeight:600}}><span className="faint" style={{marginRight:6}}>{clockTime(chapter.start)}</span>{chapter.title}</div><p style={{margin:'2px 0 0',fontSize:13,lineHeight:1.5}}>{chapter.text}</p></div>)}
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
 if(found===undefined)return <><TileHead icon="ai" label="Breakdown" onRemove={onRemove}/><div className="tb"><span className="row small muted" role="status"><Spinner label="Loading the breakdown" size={14}/>Loading the breakdown…</span></div></>;
 if(!found)return <><TileHead icon="ai" label="Breakdown" onRemove={onRemove}/><div className="tb small muted">This breakdown could not be loaded. Remove this card and break down the source video again.</div></>;
 const why=found.whyItWorked;
 const source=youtubeId(found.url);
 return <>
  <TileHead icon="ai" label={`Breakdown · ${creatorName(found.video.channel)}`} onRemove={onRemove}/>
  <div className="tb">
   <div className="row" style={{gap:10,marginBottom:10}}><img decoding="async" loading="lazy" src={found.video.thumbnail} alt="" style={{width:72,height:40,borderRadius:'var(--cc-r-lg)',objectFit:'cover'}}/><div style={{fontWeight:600,fontSize:13,lineHeight:1.3}} className="clamp2">{found.video.title}</div></div>
   <div className="small faint" style={{marginBottom:6}}>Why it worked</div>
   <ol style={{margin:0,paddingLeft:18,fontSize:13,lineHeight:1.5,color:'var(--cc-text-2)',display:'flex',flexDirection:'column',gap:6}}>{[why.titlePackaging,why.hookSpeed,why.retention].filter(Boolean).slice(0,3).map((line,index)=><li key={index}>{line}</li>)}</ol>
   {source&&<button type="button" className="btn sm ghost" style={{marginTop:8}} onClick={()=>onBreakdown(source)}><Icon name="script" size={13}/>Open breakdown</button>}
  </div>
 </>;
}

function SignalTile({tile,onRemove}:TileBodyProps){
 const {meta}=tile,source=meta.source??'x',label=source==='x'?'Post on X':'Reddit post';
 return <>
  <TileHead icon="signals" label={label} onRemove={onRemove}/>
  <div className="tb">
   <div className="row" style={{marginBottom:8}}><Avatar name={meta.author??'?'} size="sm"/><b style={{fontSize:13}} className="ellipsis">{meta.author}</b><span className="grow"/><SourceIcon source={source}/></div>
   <div className="clamp3" style={{fontSize:13,lineHeight:1.5}}>{tile.text}</div>
   <div className="stats" style={{marginTop:8}}>{meta.likes!==undefined&&<span><Icon name="like" size={12}/><b>{fmtNum(meta.likes)}</b></span>}{meta.replies!==undefined&&<span><Icon name="comment" size={12}/><b>{fmtNum(meta.replies)}</b></span>}</div>
   {tile.url&&<a className="btn sm ghost" style={{marginTop:6}} href={tile.url} target="_blank" rel="noopener noreferrer"><Icon name="open-external" size={13}/>Open post</a>}
  </div>
 </>;
}

function LinkTile({tile,onRemove}:TileBodyProps){
 const host=linkHost(tile.url??'');
 return <>
  <TileHead icon="link" label="Link" onRemove={onRemove}/>
  <div className="tb row" style={{alignItems:'flex-start',gap:10}}>
   <span style={{width:32,height:32,borderRadius:'var(--cc-r-lg)',background:'var(--cc-bg-sunk)',fontWeight:700,color:'var(--cc-text-2)',display:'inline-flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{host.charAt(0).toUpperCase()}</span>
   <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13.5,lineHeight:1.35}}>{tile.title??host}</div><a href={tile.url} target="_blank" rel="noopener noreferrer" className="small ellipsis" style={{color:'var(--cc-accent-text)',display:'block'}}>{host}</a></div>
  </div>
 </>;
}

function ImageTile({tile,videoId,onRemove}:TileBodyProps){
 const picture=tileImage(videoId,tile);
 return <>
  <TileHead icon="image" label="Screenshot" onRemove={onRemove}/>
  <div className="tb">
   {picture?<img decoding="async" loading="lazy" src={picture} alt={tile.title??''} style={{width:'100%',aspectRatio:'16/10',objectFit:'cover',borderRadius:'var(--cc-r-lg)',border:'1px solid var(--cc-line)'}}/>:<div className="small muted"><Icon name="image" size={14}/> No image is saved. Remove this card and add the image again.</div>}
   <div className="small muted" style={{marginTop:8}}>{tile.title??'Screenshot'}</div>
  </div>
 </>;
}
