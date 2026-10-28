import {useEffect,useState} from 'react';
import type {ResearchTile,TranscriptChapter} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {formatAge,formatCount} from '../breakdown';
import {ErrorLine} from '../ErrorLine';
import {Button,Dialog,OutlierChip,Spinner} from '../ui';
import {clockTime,linkHost} from '../video-plan';

/** The picture a tile shows: a video's thumbnail, or the tile's own saved file. */
export function tileImage(videoId:string,tile:ResearchTile):string|undefined{
 if(tile.file)return `/api/club/videos/${encodeURIComponent(videoId)}/research/${encodeURIComponent(tile.id)}/file`;
 return tile.meta.thumbnail;
}

const PLATFORM:Record<string,string>={youtube:'Open on YouTube',instagram:'Open on Instagram'};

/** One tile opened: a video's stat row and its transcript in chapters, a note's whole text, a picture at full size, or a link. */
export function TileDialog({videoId,tile,onClose,onRemove}:{videoId:string;tile:ResearchTile|null;onClose():void;onRemove(tile:ResearchTile):Promise<void>}){
 const [removing,setRemoving]=useState(false),[removeError,setRemoveError]=useState('');
 useEffect(()=>{setRemoveError('');setRemoving(false);},[tile?.id]);
 const remove=async()=>{
  if(!tile)return;
  setRemoving(true);setRemoveError('');
  try{await onRemove(tile);}catch(reason){setRemoveError(errorMessage(reason,"Couldn't remove that tile."));}finally{setRemoving(false);}
 };
 const title=tile?(tile.title??(tile.url?linkHost(tile.url):tile.kind==='note'?'Note':'Text')):'';
 return <Dialog open={!!tile} onClose={onClose} title={title} className="max-w-2xl!"
  footer={tile&&<Button variant="ghost" className="text-danger" disabled={removing} onClick={remove}>Remove tile</Button>}>
  {tile&&<div className="flex max-h-[65vh] flex-col gap-4 overflow-auto">
   {tile.kind==='video'&&<VideoDetail videoId={videoId} tile={tile}/>}
   {tile.kind==='image'&&tileImage(videoId,tile)&&<img src={tileImage(videoId,tile)} alt={tile.title??''} className="w-full rounded-md border border-line"/>}
   {(tile.kind==='note'||tile.kind==='text')&&<p className="whitespace-pre-wrap text-base text-ink">{tile.text}</p>}
   {tile.kind==='link'&&tile.url&&<a href={tile.url} target="_blank" rel="noreferrer" className="text-base break-all text-accent underline-offset-2 hover:underline">{tile.url}</a>}
   {removeError&&<ErrorLine message={removeError} onRetry={remove}/>}
  </div>}
 </Dialog>;
}

function VideoDetail({videoId,tile}:{videoId:string;tile:ResearchTile}){
 const {meta}=tile,image=tileImage(videoId,tile);
 const stats=[meta.views!==undefined&&[formatCount(meta.views),'views'],meta.likes&&[formatCount(meta.likes),'likes'],meta.comments&&[formatCount(meta.comments),'comments']].filter((stat):stat is string[]=>Array.isArray(stat));
 return <>
  <div className="flex gap-4">
   {image&&<img src={image} alt="" className="aspect-video w-48 shrink-0 rounded-md border border-line object-cover"/>}
   <div className="flex min-w-0 flex-col gap-2">
    {meta.channel&&<p className="text-sm text-muted">{[meta.channel,meta.ageDays!==undefined&&formatAge(meta.ageDays)].filter(Boolean).join(' · ')}</p>}
    <div role="group" aria-label="Video stats" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base text-ink">
     {meta.multiplier!==undefined&&<OutlierChip multiplier={meta.multiplier} label="usual views"/>}
     {stats.map(([value,label])=><span key={label}><strong className="font-semibold tabular-nums">{value}</strong> <span className="text-muted">{label}</span></span>)}
    </div>
    {tile.url&&<a href={tile.url} target="_blank" rel="noreferrer" className="self-start text-sm font-medium text-accent underline-offset-2 hover:underline">{PLATFORM[meta.platform??'']??'Open video'}</a>}
   </div>
  </div>
  {meta.transcript&&<Transcript videoId={videoId} tileId={tile.id}/>}
 </>;
}

function Transcript({videoId,tileId}:{videoId:string;tileId:string}){
 const [chapters,setChapters]=useState<TranscriptChapter[]|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let live=true;setChapters(null);setError('');
  clubFetch<TranscriptChapter[]>(`/videos/${encodeURIComponent(videoId)}/research/${encodeURIComponent(tileId)}/transcript`).then(found=>{if(live)setChapters(found);},reason=>{if(live)setError(errorMessage(reason,"Couldn't load the transcript."));});
  return()=>{live=false;};
 },[videoId,tileId,attempt]);
 if(error)return <ErrorLine message={error} onRetry={()=>setAttempt(n=>n+1)}/>;
 if(!chapters)return <Spinner label="Loading the transcript"/>;
 return <section aria-label="Transcript" className="flex flex-col gap-4 border-t border-line pt-4">
  <h3 className="text-base font-semibold text-ink">Transcript</h3>
  {chapters.map((chapter,index)=><div key={index} className="flex flex-col gap-1">
   <h4 className="text-sm font-semibold text-ink"><span className="mr-2 font-normal text-muted tabular-nums">{clockTime(chapter.start)}</span>{chapter.title}</h4>
   <p className="text-base leading-relaxed text-ink">{chapter.text}</p>
  </div>)}
 </section>;
}
