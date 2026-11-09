import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {OnePager,Video} from '../../../shared/club';
import {BrandLogo} from '../../BrandLogo';
import {useAiCheck} from '../ai-status';
import {clubFetch,clubUpload,errorMessage} from '../api';
import {failureMessage,watchJob,type StartedJob} from '../jobs';
import {Button,Dialog,Icon,IconButton,Input,Tabs,cn,useToast} from '../ui';
import {Field} from './sketch-fields';
import './sketch-thumbnail.css';

/*
 * The sketch's thumbnail. On the sketch it is only the picture and its idea in words (or an empty frame with one button); everything
 * that makes it lives in the thumbnail studio, a dialog: the big picture, its idea, what it is made from (your face and the thumbnails you
 * pick from your niche, your Board or any YouTube link), three ideas to choose between by eye, and Make it with your ChatGPT.
 */

type Kind='face'|'board'|'trending'|'link'|'upload';
type Reference={id:string;kind:Kind;title:string;views?:number;multiplier?:number;selected:boolean;pick?:number};
type Idea={name:string;headline:string;composition:string;emotion:string;palette:string;stopper:'face'|'numbers'|'emotion'|'color'};
type IdeasState={phase:'ideas'|'previews'|'done'|'failed';run?:string;ideas?:Idea[];drawn:ReadonlySet<number>;error?:string};
const STOPPER:Record<Idea['stopper'],string>={face:'A face',numbers:'Big numbers',emotion:'Emotion',color:'Bright color'};
/** At most this many references beside the face (`MAX_CHOSEN` on the server). */
const MAX_CHOSEN=4;
const compact=(n:number)=>n>=1e6?`${(n/1e6).toFixed(n>=1e7?0:1)}M`:n>=1e3?`${Math.round(n/1e3)}K`:String(n);
const meta=(r:Reference)=>[r.views&&`${compact(r.views)} views`,r.multiplier&&`${r.multiplier.toFixed(1)}× usual`].filter(Boolean).join(' · ');

/** The thumbnail part of the sketch: the picture and its idea, and the studio when it is open. */
export function SketchThumbnail({video,sketch,open,onOpen,onClose,onThumb,onSave,onRefresh}:{video:Video;sketch:OnePager;open:boolean;onOpen():void;onClose():void;
 onThumb(key:'headline'|'visual'|'closer',text:string):void;onSave():unknown;onRefresh():void}){
 const base=`/videos/${encodeURIComponent(video.id)}/thumbnail`;
 const [picture,setPicture]=useState<string|null>(null),[fresh,setFresh]=useState(false);
 const show=()=>{setPicture(`/api/club${base}?v=${Date.now()}`);setFresh(true);setTimeout(()=>setFresh(false),2600);};
 useEffect(()=>{let alive=true;setPicture(null);
  void fetch(`/api/club${base}`).then(response=>{if(alive&&response.status===200)setPicture(`/api/club${base}?v=${Date.now()}`);},()=>{});
  return()=>{alive=false;};
 },[base]);
 const words=sketch.thumbnail.headline.trim(),visual=sketch.thumbnail.visual.trim();
 return <>
  <button type="button" className={cn('st-pic',picture&&'has-picture',fresh&&'is-fresh')} onClick={onOpen} aria-label="Open the thumbnail studio">
   {picture?<><img src={picture} alt={words||'Thumbnail'}/><span className="st-pic-hover"><Icon name="edit" size={14}/>Edit thumbnail</span></>:<span className="st-empty"><Icon name="image" size={20}/><span className="st-empty-a">Make the thumbnail</span></span>}
  </button>
  {(words||visual)&&<button type="button" className="st-idea" onClick={onOpen}>{words&&<span className="st-words">{words}</span>}{visual&&<span className="st-visual">{visual}</span>}</button>}
  {open&&<ThumbnailDialog video={video} sketch={sketch} picture={picture} onPicture={show} onClose={onClose} onThumb={onThumb} onSave={onSave} onRefresh={onRefresh}/>}
 </>;
}

export type ThumbnailDialogProps={video:Video;sketch:OnePager;picture:string|null;onPicture():void;onClose():void;
 onThumb(key:'headline'|'visual'|'closer',text:string):void;onSave():unknown;onRefresh():void};

/** The thumbnail studio. The sketch and Publish open the same one. */
export function ThumbnailDialog({video,sketch,picture,onPicture,onClose,onThumb,onSave,onRefresh}:ThumbnailDialogProps){
 const base=`/videos/${encodeURIComponent(video.id)}/thumbnail`,toast=useToast();
 const chatgpt=!!useAiCheck().check.status?.codex?.signedIn;
 const [refs,setRefs]=useState<Reference[]|null>(null),[tab,setTab]=useState<'niche'|'board'>('niche'),[link,setLink]=useState(''),[adding,setAdding]=useState(false);
 const [making,setMaking]=useState(false),[facing,setFacing]=useState(false),[faceV,setFaceV]=useState(0),[ideas,setIdeas]=useState<IdeasState|null>(null),[used,setUsed]=useState<number|null>(null);
 const upload=useRef<HTMLInputElement>(null),refUpload=useRef<HTMLInputElement>(null),stops=useRef<(()=>void)[]>([]),ideasBox=useRef<HTMLElement>(null);
 useEffect(()=>()=>stops.current.forEach(stop=>stop()),[]);
 const load=()=>clubFetch<Reference[]>(`${base}/references`).then(setRefs,()=>setRefs([]));
 useEffect(()=>{void load();// eslint-disable-next-line react-hooks/exhaustive-deps
 },[base]);
 const face=refs?.find(r=>r.kind==='face'),chosen=(refs??[]).filter(r=>r.selected&&r.kind!=='face').sort((a,b)=>(a.pick??99)-(b.pick??99));
 const hasBoard=(refs??[]).some(r=>r.kind==='board');
 const gallery=(refs??[]).filter(r=>(tab==='board'&&hasBoard)?r.kind==='board':r.kind==='trending'||r.kind==='link'||r.kind==='upload');
 const choose=async(ids:string[])=>{
  setRefs(now=>now&&now.map(r=>r.kind==='face'?r:{...r,selected:ids.includes(r.id),pick:ids.includes(r.id)?ids.indexOf(r.id):undefined}));
  try{setRefs(await clubFetch<Reference[]>(`${base}/references/chosen`,{method:'PUT',body:{ids}}));}catch(reason){toast(errorMessage(reason,"Couldn't save that."));void load();}
 };
 const toggle=(r:Reference)=>{
  const ids=chosen.map(c=>c.id);
  if(ids.includes(r.id))return void choose(ids.filter(id=>id!==r.id));
  if(ids.length>=MAX_CHOSEN)return toast(`Up to ${MAX_CHOSEN} references: take one out first.`);
  void choose([...ids,r.id]);
 };
 const addLink=async(event:FormEvent)=>{
  event.preventDefault();if(!link.trim()||adding)return;
  setAdding(true);
  try{setRefs(await clubFetch<Reference[]>(`${base}/references/link`,{method:'POST',body:{url:link}}));setLink('');}
  catch(reason){toast(errorMessage(reason,"Couldn't add that link."));}
  finally{setAdding(false);}
 };
 const addPicture=async(file:File|undefined)=>{
  if(!file)return;
  const form=new FormData();form.append('file',file);
  try{await clubUpload(`${base}/references`,form);void load();}catch(reason){toast(errorMessage(reason,"Couldn't add that picture."));}
 };
 const ownPicture=async(file:File|undefined)=>{
  if(!file)return;
  const form=new FormData();form.append('file',file);
  try{await clubUpload(base,form);onPicture();}catch(reason){toast(errorMessage(reason,"Couldn't use that picture."));}
 };
 const follow=(id:string,on:(event:Parameters<Parameters<typeof watchJob>[1]>[0])=>void)=>{stops.current.push(watchJob(id,on));};
 // ChatGPT draws the picture from its idea and what it is made from; it takes about a minute, and the picture says so.
 const make=async()=>{
  if(making)return;
  setMaking(true);
  try{
   await onSave();
   const job=await clubFetch<StartedJob>(`${base}/chatgpt`,{method:'POST',body:{}});
   follow(job.id,event=>{if(event.type==='progress')return;setMaking(false);if(event.type==='done')onPicture();else if(event.type==='failed')toast(failureMessage(event.data));});
  }catch(reason){setMaking(false);toast(errorMessage(reason,"Couldn't start ChatGPT."));}
 };
 const getIdeas=async()=>{
  setIdeas({phase:'ideas',drawn:new Set()});setUsed(null);
  requestAnimationFrame(()=>ideasBox.current?.scrollIntoView({behavior:'smooth',block:'nearest'}));
  try{
   const job=await clubFetch<StartedJob>(`${base}/ideas`,{method:'POST',body:{}});
   follow(job.id,event=>{
    const data=event.data as {run?:string;ideas?:Idea[];preview?:number}|null;
    if(event.type==='progress'){setIdeas(now=>now&&{...now,run:data?.run??now.run,ideas:data?.ideas??now.ideas,phase:data?.ideas||data?.preview!==undefined?'previews':now.phase,drawn:data?.preview!==undefined?new Set([...now.drawn,data.preview]):now.drawn});return;}
    if(event.type==='done'){const r=event.data as {run:string;ideas:Idea[];previews:(string|null)[]};setIdeas({phase:'done',run:r.run,ideas:r.ideas,drawn:new Set(r.previews.flatMap((p,n)=>p?[n]:[]))});}
    else if(event.type==='failed')setIdeas(now=>({...(now??{drawn:new Set()}),phase:'failed',error:failureMessage(event.data)}));
    else setIdeas(null);
   });
  }catch(reason){setIdeas({phase:'failed',drawn:new Set(),error:errorMessage(reason,"Couldn't start the ideas.")});}
 };
 const useIdea=async(n:number)=>{
  if(!ideas?.run)return;
  try{await onSave();const done=await clubFetch<{picture:boolean}>(`${base}/ideas/${ideas.run}/${n}/use`,{method:'POST'});onRefresh();if(done.picture)onPicture();setUsed(n);}
  catch(reason){toast(errorMessage(reason,"Couldn't use that idea."));}
 };
 const idea=!!(sketch.thumbnail.visual.trim()||sketch.thumbnail.headline.trim());
 const imageOf=(r:Reference)=>`/api/club${base}/references/${encodeURIComponent(r.id)}/image${r.kind==='face'?`?v=${faceV}`:''}`;
 return <Dialog title="Thumbnail" onClose={onClose} width={1080} className="st-dialog">
  <div className="st-studio">
   <div className="st-main">
    <div className={cn('st-big',picture&&'has-picture',making&&'is-making')} aria-busy={making}>
     {picture&&<img src={picture} alt={sketch.thumbnail.headline||'Thumbnail'}/>}
     {making?<span className="st-empty" role="status"><BrandLogo brand="chatgpt" size={22} working/>ChatGPT is drawing it… about a minute</span>:!picture&&<span className="st-empty"><Icon name="image" size={22}/>No thumbnail yet</span>}
    </div>
    <label className="st-field"><span className="st-field-l">Words on it</span><Field className="st-field-words" value={sketch.thumbnail.headline} label="Words on the thumbnail" placeholder="Up to three words, or none" onChange={text=>onThumb('headline',text)} onCommit={onSave}/></label>
    <label className="st-field"><span className="st-field-l">What it shows</span><Field className="st-field-visual" value={sketch.thumbnail.visual} label="What the thumbnail shows" placeholder="You, what you do or hold, the feeling, the colours" onChange={text=>onThumb('visual',text)} onCommit={onSave}/></label>
    <div className="st-make">
     <Button variant="primary" disabled={!idea||!chatgpt||making} title={chatgpt?undefined:'Connect ChatGPT in Settings to make the picture with it'} onClick={()=>void make()}><BrandLogo brand="chatgpt" size={16}/>{picture?'Make another with ChatGPT':'Make it with ChatGPT'}</Button>
     <Button variant="secondary" disabled={!!ideas&&(ideas.phase==='ideas'||ideas.phase==='previews')} onClick={()=>void getIdeas()}><Icon name="idea" size={16}/>{ideas?'3 new ideas':'Get 3 ideas'}</Button>
     <Button variant="ghost" disabled={making} onClick={()=>upload.current?.click()}><Icon name="upload" size={16}/>Use my own picture</Button>
     <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{void ownPicture(event.target.files?.[0]);event.target.value='';}}/>
    </div>
   </div>

   <aside className="st-side" aria-label="What it is made from">
    <div className="st-h">Made from <span className="st-count">{chosen.length} of {MAX_CHOSEN} picked</span></div>
    <div className="st-tray">
     {face?<div className="st-chip is-face"><img src={imageOf(face)} alt=""/><span className="st-chip-t">You<button type="button" className="st-chip-link" onClick={()=>setFacing(true)}>Change</button></span></div>
      :<button type="button" className="st-chip is-face is-add" onClick={()=>setFacing(true)}><Icon name="camera" size={16}/><span className="st-chip-t">Add your face</span></button>}
     {/* Always four places, filled in order: picking or taking one out never changes the studio's size. */}
     {Array.from({length:MAX_CHOSEN},(_,n)=>chosen[n]).map((r,n)=>r
      ?<div key={r.id} className="st-chip is-picked"><span className="st-slot-n">{n+1}</span><img src={imageOf(r)} alt=""/><span className="st-chip-t" title={r.title}>{r.title}</span><IconButton icon="close" label="Take it out" onClick={()=>toggle(r)}/></div>
      :<div key={`slot-${n}`} className="st-chip is-slot" aria-hidden="true"><span className="st-slot-n">{n+1}</span><span className="st-slot-pic"/><span className="st-chip-t">{n===chosen.length?'Pick a thumbnail below':''}</span></div>)}
    </div>
    {facing&&<div className="st-overlay"><FacePicker current={face?imageOf(face):undefined} onClose={()=>setFacing(false)} onSaved={()=>{setFacing(false);setFaceV(Date.now());void load();}}/></div>}
    <form className="st-link" onSubmit={event=>void addLink(event)}>
     <Input value={link} onChange={event=>setLink(event.target.value)} placeholder="Paste a YouTube link" aria-label="A YouTube video to use as a reference"/>
     <Button type="submit" disabled={!link.trim()||adding}>{adding?'Adding…':'Add'}</Button>
    </form>
    <div className="st-tabs">{hasBoard?<Tabs<"niche"|"board"> label="Where references come from" value={tab} onChange={setTab} tabs={[{id:'niche' as const,label:'Your niche'},{id:'board' as const,label:'Your Board'}]}/>:<span className="st-h">From your niche</span>}
     <input ref={refUpload} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{void addPicture(event.target.files?.[0]);event.target.value='';}}/>
    </div>
    <div className="st-gallery">
     {refs!==null&&<button type="button" className="st-card is-add" onClick={()=>refUpload.current?.click()}><span className="st-card-pic"><Icon name="add" size={18}/><span>A picture of yours</span></span><span className="st-card-t">A thumbnail you like, or a style</span></button>}
     {refs===null?<p className="st-hint">Loading…</p>:gallery.length===0?<p className="st-hint">{tab==='niche'?'Nothing trending in your niche yet: open Discover, or paste a link.':'No videos on this Board yet: paste a link instead.'}</p>
      :gallery.map(r=>{const slot=chosen.findIndex(c=>c.id===r.id);return <button key={r.id} type="button" className={cn('st-card',slot>=0&&'is-on')} aria-pressed={slot>=0} title={slot>=0?'In use: click to take it out':'Use this style'} onClick={()=>toggle(r)}>
       <span className="st-card-pic"><img src={imageOf(r)} alt="" loading="lazy"/>{slot>=0&&<span className="st-card-on">{slot+1}</span>}</span>
       <span className="st-card-t">{r.title}</span><span className="st-card-m">{slot>=0?<b>In use</b>:meta(r)}</span>
      </button>;})}
    </div>
   </aside>
  </div>

  <section ref={ideasBox} className="st-ideas" aria-label="Thumbnail ideas">
   <div className="st-ideas-h"><span className="st-h">Ideas</span><span className="st-hint">{ideas?.phase==='ideas'?'Writing three ideas…':ideas?.phase==='previews'?'Drawing a preview of each…':ideas?'Pick one: its words, idea and picture become your thumbnail.':'Get 3 ideas draws three from your face and these references, so you can compare them here.'}</span></div>
   {ideas&&<div className="st-idea-row">{(ideas.ideas??[null,null,null]).map((one,n)=><div key={n} className={cn('st-idea-card',!one&&'is-coming',used===n&&'is-on')}>
    <div className="st-idea-pic">{ideas.run&&ideas.drawn.has(n)?<img src={`/api/club${base}/ideas/${ideas.run}/${n}/image`} alt={one?.name??''}/>
     :<span className="st-empty">{one&&chatgpt&&ideas.phase==='previews'?<BrandLogo brand="chatgpt" size={18} working/>:<Icon name="image" size={18}/>}</span>}</div>
    {one?<div className="st-idea-t"><div className="st-idea-name">{one.name}</div>{one.headline&&<div className="st-idea-words">{one.headline}</div>}<div className="st-idea-stop">{STOPPER[one.stopper]}</div>
     {used===n?<span className="st-idea-used"><Icon name="check" size={13}/>In use</span>:<Button size="sm" variant="secondary" disabled={chatgpt&&ideas.phase==='previews'&&!ideas.drawn.has(n)} onClick={()=>void useIdea(n)}>Use this</Button>}</div>
     :<div className="st-idea-t"><span className="sk-wait" style={{width:'60%'}}/><span className="sk-wait" style={{width:'40%'}}/></div>}
   </div>)}</div>}
   {ideas?.error&&<div className="st-err" role="alert"><Icon name="warning" size={13}/>{ideas.error}</div>}
  </section>
 </Dialog>;
}

/**
 * Your face for every thumbnail, given once (often before anything is recorded): a photo from the camera, or a file. It is kept with the
 * channel, so every video's thumbnail can use it.
 */
function FacePicker({current,onSaved,onClose}:{current?:string;onSaved():void;onClose():void}){
 const video=useRef<HTMLVideoElement>(null),file=useRef<HTMLInputElement>(null),stream=useRef<MediaStream|null>(null),toast=useToast();
 const [live,setLive]=useState(false),[saving,setSaving]=useState(false),[noCamera,setNoCamera]=useState(false);
 useEffect(()=>{let alive=true;
  void navigator.mediaDevices?.getUserMedia({video:{width:1280,height:720}}).then(media=>{
   if(!alive){media.getTracks().forEach(t=>t.stop());return;}
   stream.current=media;if(video.current){video.current.srcObject=media;void video.current.play();}setLive(true);
  },()=>{if(alive)setNoCamera(true);});
  return()=>{alive=false;stream.current?.getTracks().forEach(t=>t.stop());};
 },[]);
 const save=async(blob:Blob|null)=>{
  if(!blob)return;
  setSaving(true);
  const form=new FormData();form.append('file',blob,'face');
  try{await clubUpload('/thumbnail-face',form);onSaved();}
  catch(reason){toast(errorMessage(reason,"Couldn't save that photo."));}
  finally{setSaving(false);}
 };
 const snap=()=>{
  const v=video.current;if(!v||!v.videoWidth)return;
  const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  // The camera preview is a mirror; the photo is the way others see you.
  ctx.drawImage(v,0,0);canvas.toBlob(blob=>void save(blob),'image/jpeg',.92);
 };
 return <div className="st-face" role="group" aria-label="Your face for thumbnails">
  <div className="st-face-h">{current&&<img src={current} alt="Your face now"/>}<p className="st-hint">Your face, for all your thumbnails. Look at the camera with the face you'd make in one.</p></div>
  {noCamera?<div className="st-face-cam is-off"><Icon name="camera" size={18}/><span>No camera. Upload a photo instead.</span></div>
   :<div className="st-face-cam"><video ref={video} muted playsInline/>{!live&&<span className="st-empty"><Icon name="camera" size={18}/></span>}</div>}
  <div className="st-make">
   {!noCamera&&<Button variant="primary" size="sm" disabled={!live||saving} onClick={snap}><Icon name="snapshot" size={14}/>Take photo</Button>}
   <Button variant="ghost" size="sm" disabled={saving} onClick={()=>file.current?.click()}><Icon name="upload" size={14}/>Upload a photo</Button>
   <Button variant="ghost" size="sm" disabled={saving} onClick={onClose}>Cancel</Button>
   <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{void save(event.target.files?.[0]??null);event.target.value='';}}/>
  </div>
 </div>;
}
