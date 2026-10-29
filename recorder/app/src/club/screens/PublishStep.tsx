import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {Check,Copy,ExternalLink,Film} from 'lucide-react';
import type {Package,Video} from '../../../shared/club';
import type {ExportRecord} from '../../../shared/export-history';
import {listSavedExports} from '../../api';
import {ClubApiError,clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {exportFileName,latestVideoExport} from '../recorder/edit-steps';
import {Button,Card,Input} from '../ui';

export const PUBLISH_LINE='Upload to YouTube, then paste the link here.';
export const PUBLISH_FAILED="Couldn't mark the video as published.";
/** The view count is read in the background after publishing; the page asks for it once, a little later. */
const VIEWS_RECHECK_MS=8000;

/**
 * The Publish step: the exported file (`Show in Finder`), the package's title options, thumbnail text and hook to copy into
 * YouTube Studio, and the YouTube link. `Mark as published` saves the link and the date and moves the card to Published.
 */
export function PublishStep({video,pkg,onVideo}:{video:Video;pkg:Package|null;onVideo(video:Video):void}){
 const [file,setFile]=useState<ExportRecord|null|undefined>(undefined);
 useEffect(()=>{
  if(!video.recorderProjectId){setFile(null);return;}
  const request=new AbortController();
  void listSavedExports(video.recorderProjectId,request.signal).then(({jobs})=>setFile(latestVideoExport(jobs)??null)).catch(()=>{if(!request.signal.aborted)setFile(null);});
  return()=>request.abort();
 },[video.recorderProjectId]);

 return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
  <header className="flex flex-col gap-1">
   <h1 className="text-xl font-semibold text-ink">Publish</h1>
   <p className="text-base text-muted">{PUBLISH_LINE}</p>
  </header>
  <Section title="Video file">
   {file===undefined?null:file?<div className="flex items-center gap-3">
    <Film aria-hidden size={18} className="shrink-0 text-muted"/>
    <span className="min-w-0 flex-1 truncate text-base text-ink" title={file.outputPath}>{exportFileName(file)}</span>
    {window.sceneForge?.reveal&&<Button size="sm" onClick={()=>void window.sceneForge!.reveal(file.outputPath!).catch(()=>{})}>Show in Finder</Button>}
   </div>:<p className="text-base text-muted">No exported video yet. Export it in Edit.</p>}
  </Section>
  <Section title="For YouTube">
   {pkg?<div className="flex flex-col gap-4">
    <div className="flex flex-col gap-2">
     <h3 className="text-sm font-medium text-muted">Title options</h3>
     {pkg.titles.filter(Boolean).map((title,index)=><CopyRow key={index} text={title} label={`Copy title ${index+1}`}/>)}
    </div>
    {pkg.thumbnailText&&<div className="flex flex-col gap-2"><h3 className="text-sm font-medium text-muted">Thumbnail text</h3><CopyRow text={pkg.thumbnailText} label="Copy thumbnail text"/></div>}
    {pkg.hook.spoken&&<div className="flex flex-col gap-2"><h3 className="text-sm font-medium text-muted">Hook</h3><CopyRow text={pkg.hook.spoken} label="Copy hook"/></div>}
   </div>:<p className="text-base text-muted">No package yet. Package it in Plan.</p>}
  </Section>
  <PublishForm video={video} onVideo={onVideo}/>
 </div>;
}

function Section({title,children}:{title:string;children:ReactNode}){
 return <Card className="flex flex-col gap-3 p-5"><h2 className="text-base font-semibold text-ink">{title}</h2>{children}</Card>;
}

/** Copies with the Clipboard API, or with a hidden text field where that is not allowed. */
export async function copyText(text:string):Promise<boolean>{
 try{await navigator.clipboard.writeText(text);return true;}catch{}
 const field=document.createElement('textarea');
 field.value=text;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';
 document.body.append(field);field.select();
 try{return document.execCommand('copy');}catch{return false;}finally{field.remove();}
}

function CopyRow({text,label}:{text:string;label:string}){
 const [copied,setCopied]=useState(false);
 useEffect(()=>{if(!copied)return;const t=setTimeout(()=>setCopied(false),1600);return()=>clearTimeout(t);},[copied]);
 return <div className="flex items-start gap-3 rounded-md bg-subtle px-3 py-2">
  <p className="min-w-0 flex-1 text-base text-ink">{text}</p>
  <Button size="sm" variant="ghost" aria-label={label} onClick={()=>void copyText(text).then(setCopied)}>{copied?<Check aria-hidden/>:<Copy aria-hidden/>}{copied?'Copied':'Copy'}</Button>
 </div>;
}

function PublishForm({video,onVideo}:{video:Video;onVideo(video:Video):void}){
 const published=video.stage==='published'&&Boolean(video.youtubeUrl);
 const [editing,setEditing]=useState(false),[url,setUrl]=useState(video.youtubeUrl??''),[busy,setBusy]=useState(false),[invalid,setInvalid]=useState(''),[failed,setFailed]=useState(false);
 const recheck=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>()=>clearTimeout(recheck.current),[]);

 const submit=async(event?:FormEvent)=>{
  event?.preventDefault();
  if(!url.trim()||busy)return;
  setBusy(true);setInvalid('');setFailed(false);
  try{
   const updated=await clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}/publish`,{body:{youtubeUrl:url.trim()}});
   onVideo(updated);setEditing(false);setUrl(updated.youtubeUrl??'');
   clearTimeout(recheck.current);
   recheck.current=setTimeout(()=>void clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}`).then(onVideo,()=>{}),VIEWS_RECHECK_MS);
  }catch(reason){
   if(reason instanceof ClubApiError&&reason.status===400)setInvalid(errorMessage(reason));
   else setFailed(true);
  }finally{setBusy(false);}
 };

 if(published&&!editing)return <Card className="flex flex-col gap-3 p-5">
  <h2 className="text-base font-semibold text-ink">Published</h2>
  <p className="text-base text-ink">Published on {new Date(video.publishedAt??video.updatedAt).toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})}{video.views!==undefined?` · ${video.views.toLocaleString()} views`:''}</p>
  <div className="flex flex-wrap items-center gap-2">
   <a href={video.youtubeUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-accent hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent">Open on YouTube<ExternalLink aria-hidden size={14}/></a>
   <Button size="sm" variant="ghost" onClick={()=>setEditing(true)}>Change link</Button>
  </div>
 </Card>;

 return <Card className="flex flex-col gap-3 p-5">
  <form className="flex flex-col gap-3" onSubmit={event=>void submit(event)}>
   <label htmlFor="club-youtube-link" className="text-base font-semibold text-ink">YouTube link</label>
   <div className="flex gap-2">
    <Input id="club-youtube-link" inputMode="url" autoComplete="off" placeholder="https://youtu.be/…" value={url} aria-invalid={invalid?true:undefined} aria-describedby={invalid?'club-youtube-link-error':undefined}
     onChange={event=>{setUrl(event.target.value);setInvalid('');}}/>
    <Button type="submit" variant="primary" disabled={busy||!url.trim()}>Mark as published</Button>
   </div>
   {invalid&&<p id="club-youtube-link-error" className="text-sm text-danger">{invalid}</p>}
  </form>
  {failed&&<ErrorLine message={PUBLISH_FAILED} onRetry={()=>void submit()}/>}
 </Card>;
}
