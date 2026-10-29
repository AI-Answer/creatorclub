import {useEffect,useMemo,useRef,useState,type FormEvent,type ReactNode} from 'react';
import type {Package,Video,VideoScene} from '../../../shared/club';
import type {ExportRecord} from '../../../shared/export-history';
import {listSavedExports} from '../../api';
import {ClubApiError,clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {fmtDate} from '../format';
import {exportFileName,latestVideoExport} from '../recorder/edit-steps';
import {clockTime} from '../video-plan';
import {Button,Card,EmptyState,Icon,Input,Textarea,useToast} from '../ui';
import {buildDescription,shortLink} from './record-logic';

export const PUBLISH_LINE='Upload to YouTube, then paste the link here. CreatorClub never posts for you.';
export const PUBLISH_FAILED="Couldn't mark the video as published.";
/** The view count is read in the background after publishing; the page asks for it once, a little later. */
const VIEWS_RECHECK_MS=8000;

/** Copies with the Clipboard API, or with a hidden text field where that is not allowed. */
export async function copyText(text:string):Promise<boolean>{
 try{await navigator.clipboard.writeText(text);return true;}catch{}
 const field=document.createElement('textarea');
 field.value=text;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';
 document.body.append(field);field.select();
 try{return document.execCommand('copy');}catch{return false;}finally{field.remove();}
}

type CopyKey='title'|'thumb'|'desc';
const COPIED:Record<CopyKey,string>={title:'the title',thumb:'the thumbnail text',desc:'the description'};

function CopyButton({done,disabled,label,onCopy}:{done:boolean;disabled?:boolean;label:string;onCopy():void}){
 return <Button size="sm" disabled={disabled} aria-label={label} onClick={onCopy}><Icon name={done?'Check':'Copy'} size={14}/>{done?'Copied':'Copy'}</Button>;
}

/**
 * The Publish tab, as the prototype lays it out: the exported video, the title, thumbnail text and description to copy into
 * YouTube Studio, the YouTube link with `Mark as published`, and the views once YouTube reports them. The video is exported in Edit.
 */
export function Publish({video,pkg,scenes,onVideo,onDescription,onGoTo}:{video:Video;pkg:Package|null;scenes:readonly VideoScene[]|undefined;onVideo(video:Video):void;onDescription(text:string):void;onGoTo(tab:'plan'|'record'|'edit'):void}){
 const toast=useToast();
 const published=video.stage==='published'&&Boolean(video.youtubeUrl);
 const [file,setFile]=useState<ExportRecord|null|undefined>(undefined);
 useEffect(()=>{
  if(!video.recorderProjectId){setFile(null);return;}
  const request=new AbortController();
  void listSavedExports(video.recorderProjectId,request.signal).then(({jobs})=>setFile(latestVideoExport(jobs)??null)).catch(()=>{if(!request.signal.aborted)setFile(null);});
  return()=>request.abort();
 },[video.recorderProjectId]);

 // The description starts from the package and the scenes, and is the person's own once edited (saved on the package when there is one).
 const built=useMemo(()=>buildDescription(pkg,scenes,clockTime),[pkg,scenes]);
 const [edited,setEdited]=useState<string|undefined>(undefined);
 const description=edited??pkg?.description??built;
 const [copied,setCopied]=useState<Partial<Record<CopyKey,boolean>>>({});
 const copy=(key:CopyKey,text:string)=>void copyText(text).then(ok=>{if(!ok)return;setCopied(now=>({...now,[key]:true}));toast(`Copied ${COPIED[key]}`);});
 const allCopied=Boolean(copied.title&&(copied.thumb||!pkg?.thumbnailText)&&copied.desc);

 if(!published&&scenes&&!scenes.some(scene=>scene.takes.length))return <div className="page"><div className="card"><EmptyState icon={<Icon name="Upload"/>} title="Nothing to publish yet"
  description={scenes.length?`Publishing starts once the scenes are recorded and edited. This video has ${scenes.length} ${scenes.length===1?'scene':'scenes'} waiting to be recorded.`:'Publishing starts once the scenes are recorded and edited. Draft the scenes first.'}
  action={<Button variant="primary" size="md" onClick={()=>onGoTo(scenes.length?'record':'plan')}><Icon name={scenes.length?'Mic':'Layers'} size={15}/>{scenes.length?'Open record':'Open plan'}</Button>}/></div></div>;

 const done=[Boolean(file),allCopied||published,published,false];
 const current=done.findIndex(value=>!value);
 const step=(index:number,title:string,body:ReactNode,aside?:ReactNode,hint?:string)=><div className={`pstep ${done[index]?'done':index===current?'on':'todo'}`}>
  <span className="pnum">{done[index]?<Icon name="Check" size={16} stroke={2.6}/>:index+1}</span>
  <div className="pc"><div className="pt">{title}{aside}</div>{hint&&!done[index]&&<div className="pd">{hint}</div>}{body}</div>
 </div>;

 return <div className="pub">
  <div className="doc-h" style={{marginBottom:4}}><h2>Publish</h2></div>
  <div className="doc-sub">{PUBLISH_LINE}</div>
  {step(0,'Export the video',file===undefined?null:file
   ?<div style={{marginTop:6}}><button type="button" className="linkish" disabled={!window.sceneForge?.reveal} onClick={()=>void window.sceneForge!.reveal(file.outputPath!).catch(()=>{})}>Show in Finder</button></div>
   :<div className="card pbox"><div className="row"><span className="small muted">No exported video yet.</span><Button size="sm" onClick={()=>onGoTo('edit')}>Export in Edit</Button></div></div>,
   file?<span className="faint small" style={{fontWeight:500}}>{exportFileName(file)}</span>:null,'The full timeline as an MP4. Export it in Edit.')}
  {step(1,'Copy the title, thumbnail text and description',<div className="card pbox">
    <div className="copyrow"><span className="k">Title</span><span className="v" style={{fontWeight:600}}>{video.title}</span><CopyButton done={!!copied.title} label="Copy title" onCopy={()=>copy('title',video.title)}/></div>
    <div className="copyrow"><span className="k">Thumbnail text</span><span className="v">{pkg?.thumbnailText||<span className="faint">No thumbnail text yet. Add it in Plan.</span>}</span><CopyButton done={!!copied.thumb} disabled={!pkg?.thumbnailText} label="Copy thumbnail text" onCopy={()=>copy('thumb',pkg!.thumbnailText)}/></div>
    <div className="copyrow"><span className="k">Description</span><Textarea rows={9} aria-label="Description" value={description} style={{fontSize:13.5}} onChange={event=>setEdited(event.target.value)} onBlur={()=>{if(edited!==undefined&&edited!==pkg?.description)onDescription(edited);}}/><CopyButton done={!!copied.desc} label="Copy description" onCopy={()=>copy('desc',description)}/></div>
   </div>,undefined,'Paste them into YouTube Studio as you upload.')}
  {step(2,'Upload to YouTube, then paste the link here',<PublishForm video={video} published={published} onVideo={onVideo}/>,
   published?<span className="faint small" style={{fontWeight:500}}>{fmtDate(video.publishedAt??video.updatedAt)}</span>:null,'Public, unlisted or scheduled, any link works.')}
  {step(3,'Views',published?<div className="card pbox">
    {video.views!==undefined?<div className="row" style={{alignItems:'baseline',gap:10}}><span className="bignum">{video.views.toLocaleString()}</span><span className="muted">views since {fmtDate(video.publishedAt??video.updatedAt)}</span></div>
     :<p className="small muted">Views show here once YouTube reports them.</p>}
   </div>:null,undefined,'Shown once the video is published.')}
 </div>;
}

function PublishForm({video,published,onVideo}:{video:Video;published:boolean;onVideo(video:Video):void}){
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

 if(published&&!editing)return <div className="row" style={{gap:10,marginTop:6}}>
  <a className="small" style={{color:'var(--cc-accent-text)',fontWeight:500}} href={video.youtubeUrl} target="_blank" rel="noreferrer">{shortLink(video.youtubeUrl!)}</a>
  <button type="button" className="linkish" onClick={()=>setEditing(true)}>Change link</button>
 </div>;

 return <Card className="pbox">
  <form className="row" onSubmit={event=>void submit(event)}>
   <Input id="club-youtube-link" inputMode="url" autoComplete="off" aria-label="YouTube link" placeholder="youtube.com/watch?v=…" value={url} aria-invalid={invalid?true:undefined} aria-describedby={invalid?'club-youtube-link-error':undefined}
    onChange={event=>{setUrl(event.target.value);setInvalid('');}}/>
   <Button type="submit" variant="primary" disabled={busy||!url.trim()}><Icon name="CircleCheck" size={15}/>Mark as published</Button>
  </form>
  {invalid&&<p id="club-youtube-link-error" className="small" style={{color:'var(--cc-rec)',marginTop:8}}>{invalid}</p>}
  {failed&&<ErrorLine message={PUBLISH_FAILED} onRetry={()=>void submit()}/>}
  <a className="btn ghost sm" style={{marginTop:10}} href="https://studio.youtube.com" target="_blank" rel="noreferrer"><Icon name="ArrowUpRight" size={14}/>Open YouTube Studio</a>
 </Card>;
}
