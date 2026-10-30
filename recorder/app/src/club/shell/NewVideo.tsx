import {useState} from 'react';
import type {Video} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {youtubeId} from '../board';
import {looksLikeVideoLink} from '../breakdown';
import type {Route} from '../routes';
import {Button,Dialog,Icon,useToast,type IconName} from '../ui';

type Mode='link'|'title';

const OPTIONS:ReadonlyArray<readonly [Mode,IconName,string,string]>=[
 ['link','link','Break down a video','Paste a YouTube or Instagram link. Keep the concept you like.'],
 ['title','text','Start from a title','You already know the video. Add it to ideas.'],
];
const PLACEHOLDER:Record<Mode,string>={link:'youtube.com/watch?v=…',title:'e.g. Claude does my receipts automatically'};
const ACTION:Record<Mode,string>={link:'Break down',title:'Add idea'};

/**
 * The New video dialog. A link (YouTube or Instagram) opens Break down on Videos; a title adds the idea and shows it in the Ideas lane of Videos.
 * Recording straight away is not offered: a video can only be recorded once it has an outline.
 */
export function NewVideo({onClose,onOpen}:{onClose():void;onOpen(route:Route):void}){
 const [mode,setMode]=useState<Mode>('link'),[value,setValue]=useState(''),[busy,setBusy]=useState(false);
 const toast=useToast();
 const submit=async()=>{
  const text=value.trim();
  if(!text||busy)return;
  if(mode==='link'){
   if(!looksLikeVideoLink(text)){toast("That doesn't look like a video link. Paste the full address.");return;}
   onClose();onOpen({name:'videos',view:'board',bd:youtubeId(text)??text});return;
  }
  setBusy(true);
  try{
   const video=await clubFetch<Video>('/videos',{body:{title:text}});
   onClose();onOpen({name:'videos',view:'board',new:video.id});
  }catch(reason){toast(errorMessage(reason,"Couldn't add the video."));}
  finally{setBusy(false);}
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
  <input className="input" autoFocus key={mode} value={value} onChange={event=>setValue(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void submit();}} placeholder={PLACEHOLDER[mode]} aria-label="New video"/>
 </Dialog>;
}
