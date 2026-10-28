import {useCallback,useEffect,useRef,useState,type ClipboardEvent,type DragEvent,type FormEvent} from 'react';
import {FileText,Image as ImageIcon,Link2,Play} from 'lucide-react';
import type {ResearchTile} from '../../../shared/club';
import {clubFetch,clubUpload,errorMessage} from '../api';
import {formatCount} from '../breakdown';
import {ErrorLine} from '../ErrorLine';
import {failureMessage,isStartedJob,watchJob} from '../jobs';
import {Button,Card,Input,OutlierChip,Spinner,cn} from '../ui';
import {linkHost,tileFromText} from '../video-plan';
import {TileDialog,tileImage} from './TileDialog';

type Reading={phase:'running'}|{phase:'failed';message:string};
const NOT_SUPPORTED='Drop an image, or paste a link.';
const isImage=(file:File)=>/^image\//.test(file.type)||/\.(png|jpe?g|gif|webp|heic)$/i.test(file.name);

/**
 * The research board: a grid of tiles. Paste or drop links, YouTube and Instagram videos, text and images anywhere on it,
 * or type into the box. A video tile reads its details, outlier chip and transcript in the background.
 */
export function ResearchBoard({videoId}:{videoId:string}){
 const base=`/videos/${encodeURIComponent(videoId)}/research`;
 const [tiles,setTiles]=useState<ResearchTile[]|null>(null),[loadError,setLoadError]=useState('');
 const [reading,setReading]=useState<Record<string,Reading>>({});
 const [entry,setEntry]=useState(''),[problem,setProblem]=useState(''),[over,setOver]=useState(false);
 const [opened,setOpened]=useState<ResearchTile|null>(null);
 const stops=useRef(new Map<string,()=>void>());
 const fileInput=useRef<HTMLInputElement>(null);

 const load=useCallback(()=>{
  setLoadError('');
  clubFetch<ResearchTile[]>(base).then(found=>{
   setTiles(found);
   // A video tile still without details is read again; a read already running on the server is joined, not repeated.
   for(const tile of found)if(tile.kind==='video'&&!tile.title)readRef.current(tile);
  },reason=>setLoadError(errorMessage(reason,"Couldn't load the research board.")));
 },[base]);
 useEffect(()=>()=>{for(const stop of stops.current.values())stop();},[]);

 const replace=useCallback((tile:ResearchTile)=>setTiles(current=>current?.map(item=>item.id===tile.id?tile:item)??current),[]);

 /** Reads a video tile's details. The read keeps going on the server if the page is left. */
 const read=useCallback((tile:ResearchTile)=>{
  stops.current.get(tile.id)?.();
  setReading(current=>({...current,[tile.id]:{phase:'running'}}));
  const fail=(message:string)=>setReading(current=>({...current,[tile.id]:{phase:'failed',message}}));
  clubFetch(`${base}/${encodeURIComponent(tile.id)}/read`,{method:'POST'}).then(started=>{
   if(!isStartedJob(started)){fail("Couldn't read that video.");return;}
   stops.current.set(tile.id,watchJob(started.id,event=>{
    if(event.type==='done'){replace(event.data as ResearchTile);setReading(({[tile.id]:_done,...rest})=>rest);}
    else if(event.type==='failed')fail(failureMessage(event.data,"Couldn't read that video."));
   }));
  },reason=>fail(errorMessage(reason,"Couldn't read that video.")));
 },[base,replace]);

 const readRef=useRef(read);readRef.current=read;
 useEffect(load,[load]);

 const add=useCallback(async(body:{kind:string;url?:string;text?:string}|FormData)=>{
  setProblem('');
  try{
   const tile=body instanceof FormData?await clubUpload<ResearchTile>(base,body):await clubFetch<ResearchTile>(base,{body});
   setTiles(current=>[...(current??[]),tile]);
   if(tile.kind==='video')read(tile);
   return true;
  }catch(reason){setProblem(errorMessage(reason,"Couldn't add that."));return false;}
 },[base,read]);

 const addText=(text:string,typed:boolean)=>{
  const found=tileFromText(text);if(!found)return Promise.resolve(false);
  return add(found.kind==='text'?{kind:typed?'note':'text',text:found.text}:found);
 };
 const addImage=(file:File)=>{const form=new FormData();form.append('kind','image');form.append('title',file.name);form.append('file',file);return add(form);};

 // The box clears at once, so the next link can go in while this one is saved. A failure puts the text back.
 const submit=async(event:FormEvent)=>{event.preventDefault();const text=entry;if(!text.trim())return;setEntry('');if(!(await addText(text,true)))setEntry(current=>current||text);};
 const takeFiles=(files:File[])=>{
  const images=files.filter(isImage);
  if(!images.length){setProblem(NOT_SUPPORTED);return;}
  for(const file of images)void addImage(file);
 };
 // A paste anywhere on the board (outside a field) becomes a tile.
 const paste=(event:ClipboardEvent)=>{
  if((event.target as HTMLElement).closest('input,textarea'))return;
  const files=[...event.clipboardData.files];
  if(files.length){event.preventDefault();takeFiles(files);return;}
  const text=event.clipboardData.getData('text/plain');
  if(text.trim()){event.preventDefault();void addText(text,false);}
 };
 const drop=(event:DragEvent)=>{
  event.preventDefault();setOver(false);
  const files=[...event.dataTransfer.files];
  if(files.length){takeFiles(files);return;}
  const text=event.dataTransfer.getData('text/uri-list').split('\n').find(line=>line&&!line.startsWith('#'))||event.dataTransfer.getData('text/plain');
  if(text.trim())void addText(text,false);
 };

 const remove=async(tile:ResearchTile)=>{
  await clubFetch(`${base}/${encodeURIComponent(tile.id)}`,{method:'DELETE'});
  setTiles(current=>current?.filter(item=>item.id!==tile.id)??current);setOpened(null);
 };

 if(loadError)return <ErrorLine message={loadError} onRetry={load}/>;
 return <div tabIndex={-1} data-research-board onPaste={paste}
  onDragOver={event=>{event.preventDefault();setOver(true);}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOver(false);}} onDrop={drop}
  className={cn('flex flex-col gap-3 rounded-lg outline-none',over&&'bg-accent-soft ring-2 ring-accent')}>
  <form onSubmit={submit} className="flex gap-2">
   <Input aria-label="Paste a link or write a note" placeholder="Paste a link or write a note" value={entry} onChange={event=>{setEntry(event.target.value);setProblem('');}}/>
   <Button type="submit" disabled={!entry.trim()}>Add</Button>
   <Button variant="ghost" onClick={()=>fileInput.current?.click()}><ImageIcon aria-hidden/>Add image</Button>
   <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={event=>{takeFiles([...event.target.files??[]]);event.target.value='';}}/>
  </form>
  {problem&&<p role="alert" className="text-sm text-danger">{problem}</p>}
  {tiles===null?<Spinner label="Loading the research board"/>:tiles.length===0?
   <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-base text-muted">Paste or drop links, videos, text and images here.</p>:
   <ul aria-label="Research board" className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
    {tiles.map(tile=><li key={tile.id}><TileCard videoId={videoId} tile={tile} reading={reading[tile.id]} onOpen={()=>setOpened(tile)} onRetry={()=>read(tile)}/></li>)}
   </ul>}
  <TileDialog videoId={videoId} tile={opened} onClose={()=>setOpened(null)} onRemove={remove}/>
 </div>;
}

function TileCard({videoId,tile,reading,onOpen,onRetry}:{videoId:string;tile:ResearchTile;reading?:Reading;onOpen():void;onRetry():void}){
 const image=tileImage(videoId,tile),{meta}=tile;
 const unread=tile.kind==='video'&&!tile.title;
 return <Card className="flex h-full flex-col overflow-hidden">
  <button type="button" onClick={onOpen} aria-label={tile.title??tile.url??tile.text?.slice(0,60)??'Tile'} className="flex flex-1 flex-col text-left focus-visible:outline-2 focus-visible:outline-accent">
   {(tile.kind==='video'||tile.kind==='image')&&<span className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-subtle text-muted">
    {image?<img src={image} alt="" loading="lazy" draggable={false} className="size-full object-cover"/>:tile.kind==='video'?<Play aria-hidden size={18}/>:<ImageIcon aria-hidden size={18}/>}
   </span>}
   <span className="flex flex-1 flex-col gap-1 p-3">
    {tile.kind==='video'&&<>
     <span className="line-clamp-2 text-base font-medium text-ink">{tile.title??linkHost(tile.url??'')}</span>
     {!unread&&<span className="truncate text-sm text-muted">{[meta.channel,meta.views!==undefined&&`${formatCount(meta.views)} views`].filter(Boolean).join(' · ')}</span>}
     {meta.multiplier!==undefined&&<OutlierChip multiplier={meta.multiplier} className="mt-1 self-start"/>}
    </>}
    {tile.kind==='link'&&<>
     <span className="flex items-center gap-1.5 text-base font-medium text-ink"><Link2 aria-hidden size={14} className="shrink-0 text-muted"/>{tile.title??linkHost(tile.url??'')}</span>
     <span className="truncate text-sm text-muted">{tile.url}</span>
    </>}
    {(tile.kind==='note'||tile.kind==='text')&&<span className="flex gap-1.5 text-base text-ink">{tile.kind==='note'&&<FileText aria-hidden size={14} className="mt-1 shrink-0 text-muted"/>}<span className="line-clamp-6 whitespace-pre-wrap">{tile.text}</span></span>}
    {tile.kind==='image'&&<span className="truncate text-sm text-muted">{tile.title??'Image'}</span>}
   </span>
  </button>
  {unread&&reading?.phase==='running'&&<p className="flex items-center gap-2 px-3 pb-3 text-sm text-muted"><Spinner size={14} label="Reading the video"/>Reading the video…</p>}
  {unread&&reading?.phase!=='running'&&<div className="px-3 pb-3"><ErrorLine message={reading?.phase==='failed'?reading.message:"Couldn't read that video."} onRetry={onRetry}/></div>}
 </Card>;
}
