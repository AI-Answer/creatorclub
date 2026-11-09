import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import type {PublishProgress,PublishVisibility,Video} from '../../../shared/club';
import {ClubApiError,clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {fmtDate} from '../format';
import {addTags,markReminderSeen,progressRows,reminderSeen,resultWords,visibilityWord,whenText,type ResultInfo} from '../publishing/publish-logic';
import {Button,Card,Icon,Input,Spinner} from '../ui';
import {shortLink} from './record-logic';

export const PUBLISH_FAILED="Couldn't mark the video as published.";
/** The view count is read in the background after publishing; the page asks for it once, a little later. */
const VIEWS_RECHECK_MS=8000;

/** Tags as chips with an input that adds on Enter or comma. */
export function TagsField({tags,onChange}:{tags:readonly string[];onChange(next:string[]):void}){
 const [text,setText]=useState('');
 const commit=()=>{if(text.trim())onChange(addTags(tags,text));setText('');};
 return <div className="tagsbox">
  {tags.map(tag=><span key={tag} className="chip">{tag}<button type="button" aria-label={`Remove ${tag}`} onClick={()=>onChange(tags.filter(item=>item!==tag))}><Icon name="X" size={12}/></button></span>)}
  <input id="pub-tags" aria-label="Tags" autoComplete="off" placeholder={tags.length?'Add another':'Type a tag, press Enter'} value={text}
   onChange={event=>setText(event.target.value)} onBlur={commit}
   onKeyDown={event=>{
    if(event.key==='Enter'||event.key===','){event.preventDefault();commit();}
    else if(event.key==='Backspace'&&!text&&tags.length)onChange(tags.slice(0,-1));
   }}/>
 </div>;
}

/** The package as YouTube will show it: the video (or its thumbnail), the title, who can watch and when, the description and the tags. */
export function PackageSummary({video,thumbnailText,thumbnailUrl,player,menu,channel,visibility,when,title,description,tags}:{video:Video;thumbnailText?:string;thumbnailUrl:string|null;/** The video itself, in place of the thumbnail. */player?:ReactNode;menu?:ReactNode;channel?:string;visibility:PublishVisibility;when:Date|null;title:string;description:string;tags:readonly string[]}){
 return <aside aria-label="How it will look"><div className="sec-h"><h2>How it will look</h2>{menu}</div>
  <div className="pubx-yt">
   {player??(thumbnailUrl?<img className="ws-publish-thumb" src={thumbnailUrl} alt={thumbnailText||`Thumbnail for ${title||video.title}`}/>:<div className="ws-publish-placeholder"><Icon name="image" size={20}/><span>No thumbnail yet</span></div>)}
   <div className="yt-t">{title||'Untitled'}</div>
   <div className="yt-m">{[channel,visibilityWord(visibility),when?whenText(when):'Goes live when you upload it'].filter(Boolean).join(' · ')}</div>
   {description?<div className="yt-d">{description}</div>:<div className="yt-m">No description yet.</div>}
   {tags.length>0&&<div className="row" style={{flexWrap:'wrap',gap:4}}>{tags.slice(0,6).map(tag=><span key={tag} className="chip">{tag}</span>)}</div>}
  </div>
 </aside>;
}

/** The three rows of a publish in progress. A failure stops the row that was running and offers Try again. */
export function ProgressCard({progress,failure,scheduled,onRetry}:{progress:PublishProgress|null;failure?:string;scheduled:boolean;onRetry():void}){
 const rows=progressRows(progress,Boolean(failure),scheduled);
 return <Card className={`pubx-prog${failure?' fail':''}`} role="status" aria-live="polite">
  {rows.map(row=><div key={row.label} className={`pstep2 ${row.state}`}>
   <span className="pi">{row.state==='done'?<Icon name="check" size={12} stroke={1.75}/>:row.state==='fail'?<Icon name="X" size={12} stroke={1.75}/>:row.state==='on'?<Spinner size={14} label="Working"/>:null}</span>
   <span>{row.label}</span>
   {row.state==='on'&&row.percent!==undefined&&row.percent<100&&<div className="pbar"><i style={{width:`${row.percent}%`}}/></div>}
  </div>)}
  {failure&&<ErrorLine message={failure} onRetry={onRetry} primary/>}
 </Card>;
}

/** Where the video is: queued in Postiz, scheduled, or on YouTube with its link and views. */
export function ResultCard({record,video,onCheck,onForget,children}:{record:ResultInfo;video:Video;onCheck?():Promise<void>;/** Lets a queued or unconfirmed post go, once the person has checked Postiz and it is not there. */onForget?():Promise<void>;children?:ReactNode}){
 const words=resultWords(record);
 const link=record.url??video.youtubeUrl;
 const [checking,setChecking]=useState(false),[forgetError,setForgetError]=useState('');
 // Shown until it is dismissed or a Postiz publish has gone through, not on every card.
 const [reminder,setReminder]=useState(()=>!reminderSeen());
 useEffect(()=>{if(record.state==='published'&&record.postizUrl)markReminderSeen();},[record.state,record.postizUrl]);
 return <Card className="pubx-ok">
  <span className={`chip ${words.done?'b-green':'outline'}`}>{words.done&&<Icon name="check" size={12}/>}{record.unconfirmed?'Not confirmed':record.state==='published'?'Published':record.scheduledFor?'Scheduled':'Sent to Postiz'}</span>
  <h2>{words.title}</h2>
  <p>{words.line}</p>
  {link&&<p><a style={{color:'var(--cc-accent-text)',fontWeight:500}} href={link} target="_blank" rel="noreferrer">{shortLink(link)}</a></p>}
  {record.state==='published'&&<div className="row" style={{alignItems:'baseline',gap:10}}>
   {video.views!==undefined?<><span className="bignum">{video.views.toLocaleString()}</span><span className="muted">views since {fmtDate(video.publishedAt??video.updatedAt)}</span></>:<span className="small muted">Views show here once YouTube reports them.</span>}
  </div>}
  <div className="row">
   {record.postizUrl&&<a className="btn" href={record.postizUrl} target="_blank" rel="noreferrer">Open in Postiz<Icon name="open-external" size={14}/></a>}
   {record.state==='queued'&&onCheck&&<Button disabled={checking} onClick={()=>{setChecking(true);void onCheck().finally(()=>setChecking(false));}}>Check again</Button>}
  </div>
  {children&&<div style={{width:'100%'}}>{children}</div>}
  {onForget&&<div className="row"><Button size="sm" onClick={()=>{setForgetError('');void onForget().catch(reason=>setForgetError(errorMessage(reason)));}}>I checked Postiz, it isn't there. Allow sending again</Button></div>}
  {forgetError&&<p role="alert" className="small warn-text" style={{margin:0}}>{forgetError}</p>}
  {record.postizUrl&&reminder&&<p className="small muted" style={{margin:0}}>Postiz publishing is new here. Open the video on YouTube once and check that the made-for-kids answer and the thumbnail are as you set them. <button type="button" className="linkish" onClick={()=>{markReminderSeen();setReminder(false);}}>Close</button></p>}
 </Card>;
}

/** What adding a link yourself does, in one sentence. */
export const SELF_UPLOAD_LINE='Add the link so Creator Compiler can mark it Published.';

/**
 * For a video uploaded outside Creator Compiler: a quiet "I uploaded it myself" that opens the link field. Never a main option; Publish shows it
 * only when Postiz is not set up, or when a post is stuck. `open` shows the field at once, for the stuck case, with `line` saying why.
 */
export function SelfUpload({video,onVideo,label='Add the YouTube link',line=SELF_UPLOAD_LINE,open=false,onOpen,formId,onSubmitReady,note}:{video:Video;onVideo(video:Video):void;label?:string;line?:string;open?:boolean;onOpen?():void;formId?:string;onSubmitReady?(ready:boolean):void;/** A quiet line under the button while the form is closed. */note?:ReactNode}){
 const [shown,setShown]=useState(open);
 useEffect(()=>{if(open)setShown(true);},[open]);
 if(!shown)return <>
  <Button className="ws-self-upload" onClick={()=>{setShown(true);onOpen?.();}}>{label}</Button>
  {note&&<p className="pub-line">{note}</p>}
 </>;
 return <div className="self-upload"><p className="small muted" style={{margin:'0 0 8px'}}>{line}</p><PasteLinkForm video={video} published={false} onVideo={onVideo} formId={formId} onSubmitReady={onSubmitReady}/></div>;
}

/** Accept the same YouTube video URL forms as the server; never enable completion for another site. */
export function validYouTubeLink(input:string):boolean{
 try{
  const value=input.trim();if(!value||/\s/.test(value))return false;const url=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);
  if(!['https:','http:'].includes(url.protocol))return false;
  const host=url.hostname.toLowerCase(),parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const id=['youtu.be','www.youtu.be'].includes(host)?parts[0]:['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)?parts[0]==='watch'?url.searchParams.get('v'):['shorts','live','embed','v'].includes(parts[0])?parts[1]:null:null;
  return /^[A-Za-z0-9_-]{11}$/.test(id??'');
 }catch{return false;}
}

/** The way before Postiz: paste the link of a video uploaded by hand. */
export function PasteLinkForm({video,published,onVideo,formId,onSubmitReady}:{video:Video;published:boolean;onVideo(video:Video):void;formId?:string;onSubmitReady?(ready:boolean):void}){
 const [editing,setEditing]=useState(false),[url,setUrl]=useState(video.youtubeUrl??''),[busy,setBusy]=useState(false),[invalid,setInvalid]=useState(''),[failed,setFailed]=useState(false);
 useEffect(()=>{onSubmitReady?.(validYouTubeLink(url)&&!busy);return()=>onSubmitReady?.(false);},[url,busy,onSubmitReady]);
 const recheck=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>()=>clearTimeout(recheck.current),[]);
 const submit=async(event?:FormEvent)=>{
  event?.preventDefault();
  if(busy)return;if(!validYouTubeLink(url)){setInvalid('Paste the YouTube link of the uploaded video.');return;}
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
 if(published&&!editing)return <button type="button" className="linkish" onClick={()=>setEditing(true)}>Change link</button>;
 return <form id={formId} className="row" onSubmit={event=>void submit(event)}>
  <Input id="club-youtube-link" inputMode="url" autoComplete="off" aria-label="YouTube link" placeholder="youtube.com/watch?v=…" value={url} aria-invalid={invalid||url.trim()&&!validYouTubeLink(url)?true:undefined} aria-describedby={invalid||url.trim()&&!validYouTubeLink(url)?'club-youtube-link-error':undefined}
   onChange={event=>{setUrl(event.target.value);setInvalid('');}}/>
  <Button type="submit" disabled={busy||!validYouTubeLink(url)}>Mark as published</Button>
  {(invalid||url.trim()&&!validYouTubeLink(url))&&<p id="club-youtube-link-error" className="small warn-text" role="alert" style={{flexBasis:'100%',margin:0}}>{invalid||'Paste the YouTube link of the uploaded video.'}</p>}
  {failed&&<ErrorLine message={PUBLISH_FAILED} onRetry={()=>void submit()}/>}
 </form>;
}
