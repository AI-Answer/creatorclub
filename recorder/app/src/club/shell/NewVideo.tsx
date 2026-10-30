import {useState} from 'react';
import type {Video} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {youtubeId} from '../board';
import {looksLikeVideoLink} from '../breakdown';
import type {Route} from '../routes';
import {Button,Dialog,Icon,useToast,type IconName} from '../ui';

type Mode='title'|'link';

/** Start from a title is first and the one the dialog opens on: most people have a title before they have a link. */
const OPTIONS:ReadonlyArray<readonly [Mode,IconName,string,string]>=[
 ['title','text','Start from a title','You already know the video. It goes to planning with a board for it.'],
 ['link','link','Break down a video','Paste a YouTube or Instagram link. Keep the concept you like.'],
];
const PLACEHOLDER:Record<Mode,string>={title:'e.g. Claude does my receipts automatically',link:'youtube.com/watch?v=…'};
const ACTION:Record<Mode,string>={title:'Start planning',link:'Break down'};
const LABEL:Record<Mode,string>={title:'Video title',link:'Video link'};

/**
 * The New video dialog. A title makes the idea and goes straight to its next action: it moves to planning and opens the video's Board.
 * A link (YouTube or Instagram) opens Break down on Videos, where you keep a concept as an idea.
 * Recording straight away is not offered: a video can only be recorded once it has scenes.
 */
export function NewVideo({onClose,onOpen}:{onClose():void;onOpen(route:Route):void}){
 const [mode,setMode]=useState<Mode>('title'),[value,setValue]=useState(''),[busy,setBusy]=useState(false);
 const toast=useToast();
 const submit=async()=>{
  const text=value.trim();
  if(!text||busy)return;
  if(mode==='link'){
   if(!looksLikeVideoLink(text)){toast("That doesn't look like a video link. Paste the full address.");return;}
   onClose();onOpen({name:'videos',view:'board',bd:youtubeId(text)??text});return;
  }
  setBusy(true);
  let video:Video;
  try{video=await clubFetch<Video>('/videos',{body:{title:text}});}
  catch(reason){toast(errorMessage(reason,"Couldn't add the video."));setBusy(false);return;}
  try{
   await clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}/move`,{body:{stage:'planning'}});
   onClose();onOpen({name:'video',id:video.id,tab:'board'});
  }catch{
   // The idea exists; only starting to plan it failed, so it is offered where it can be started again.
   toast("Added to your ideas, but couldn't start planning it.");
   onClose();onOpen({name:'videos',view:'board',new:video.id});
  }finally{setBusy(false);}
 };
 return <Dialog title="New video" onClose={onClose} width={560} footer={<>
  <Button variant="ghost" onClick={onClose}>Cancel</Button>
  <Button variant="primary" onClick={()=>void submit()} disabled={!value.trim()||busy}>{ACTION[mode]}</Button>
 </>}>
  <div className="grid g2" style={{gap:8,marginBottom:16}}>
   {OPTIONS.map(([key,icon,title,text])=><button key={key} type="button" className={`topt${mode===key?' on':''}`} style={{flexDirection:'column',gap:6,textAlign:'left',margin:0,background:'var(--cc-surface)'}} onClick={()=>{setMode(key);setValue('');}} aria-pressed={mode===key}>
    <Icon name={icon} size={18}/><b style={{fontSize:13.5}}>{title}</b><span className="small muted" style={{lineHeight:1.4}}>{text}</span>
   </button>)}
  </div>
  <input className="input" autoFocus key={mode} value={value} onChange={event=>setValue(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void submit();}} placeholder={PLACEHOLDER[mode]} aria-label={LABEL[mode]}/>
 </Dialog>;
}
