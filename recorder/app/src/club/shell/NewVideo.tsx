import {AI_CONNECT_HINT,useAiAvailable} from '../ai-status';
import {useEffect,useRef,useState} from 'react';
import type {Video} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {youtubeId} from '../board';
import {looksLikeVideoLink} from '../breakdown';
import type {Route} from '../routes';
import {Button,Dialog,Icon,Thumb,useToast} from '../ui';
import './NewVideo.css';

type Mode='choose'|'title'|'link';

export {relativeUpdated as relativeVideoTime} from '../production/KanbanCard';
import {relativeUpdated as relativeVideoTime} from '../production/KanbanCard';

/** All entry points share this chooser; planning keeps its title/link flow, recording needs no outline. */
export function NewVideo({videos,onClose,onOpen}:{videos:readonly Video[];onClose():void;onOpen(route:Route):void}){
 const aiAvailable=useAiAvailable();
 const [mode,setMode]=useState<Mode>('choose'),[value,setValue]=useState(''),[busy,setBusy]=useState(false),[recent,setRecent]=useState<string[]>([]);
 const pending=useRef(false);
 const toast=useToast();
 useEffect(()=>{let live=true;void clubFetch<string[]>('/recent').then(ids=>{if(live)setRecent(ids);},()=>{});return()=>{live=false;};},[]);
 const byId=new Map(videos.map(video=>[video.id,video]));
 const recentVideos=[...recent.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]),...videos.filter(video=>!recent.includes(video.id)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))].slice(0,5);
 const open=(route:Route)=>{onClose();onOpen(route);};
 const quickRecord=async()=>{
  if(pending.current)return;
  pending.current=true;setBusy(true);
  let video:Video|undefined;
  try{
   video=await clubFetch<Video>('/videos',{body:{title:`Quick recording ${new Date().toLocaleString()}`}});
   await clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}/recorder`,{body:{quick:true}});
   open({name:'video',id:video.id,tab:'record'});
  }catch(reason){
   toast(errorMessage(reason,"Couldn't start the recording."));
   // Keep the video if project setup failed: its Record tab offers a retry without making a duplicate video.
   if(video)open({name:'video',id:video.id,tab:'record'});
  }finally{pending.current=false;setBusy(false);}
 };
 const submit=async()=>{
  const text=value.trim();
  if(!text||pending.current)return;
  if(mode==='link'){
   if(!aiAvailable)return;
   if(!looksLikeVideoLink(text)){toast("That doesn't look like a video link. Paste the full address.");return;}
   open({name:'videos',view:'board',bd:youtubeId(text)??text});return;
  }
  pending.current=true;setBusy(true);
  let video:Video;
  try{video=await clubFetch<Video>('/videos',{body:{title:text}});}
  catch(reason){toast(errorMessage(reason,"Couldn't add the video."));pending.current=false;setBusy(false);return;}
  try{
   await clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}/move`,{body:{stage:'planning'}});
   open({name:'video',id:video.id,tab:'idea'});
  }catch{
   toast("Added to your ideas, but couldn't start planning it.");
   open({name:'videos',view:'board',new:video.id});
  }finally{pending.current=false;setBusy(false);}
 };
 return <Dialog title={mode==='choose'?'How would you like to start?':mode==='title'?'Plan out this video':'Break down a video'} onClose={onClose} width={680} className="new-video-dialog" footer={mode!=='choose'?<>
  <Button variant="ghost" onClick={()=>{setMode('choose');setValue('');}} disabled={busy}>Back</Button>
  <Button variant="primary" onClick={()=>void submit()} disabled={!value.trim()||busy}>{mode==='link'?'Break down':'Start planning'}</Button>
 </>:undefined}>
  {mode==='choose'?<>
   <div className="new-start-options">
    <button type="button" className="new-start-card" aria-label="Plan out this video" disabled={busy} onClick={()=>setMode('title')}>
     <span className="new-start-icon new-start-plan"><Icon name="script" size={20}/></span>
     <b>Plan out this video</b><span>Write the idea, plan the scenes, then record and edit them.</span>
    </button>
    <button type="button" className="new-start-card" aria-label="Quick recording" disabled={busy} onClick={()=>void quickRecord()}>
     <span className="new-start-icon new-start-quick"><Icon name="quick-record" size={20}/></span>
     <b>Quick recording</b><span>{busy?'Opening recorder…':'Start recording right away. Edit it after if you need to.'}</span>
    </button>
   </div>
   <button type="button" className="new-breakdown" title={!aiAvailable?AI_CONNECT_HINT:undefined} disabled={!aiAvailable||busy} onClick={()=>{setMode('link');setValue('');}}><Icon name="link" size={17}/><span><b>Break down a video</b><span>Paste a YouTube link.</span></span><Icon name="forward" size={15}/></button>
   <section className="new-recents" aria-label="Recent videos">
    <div className="row"><h4>Recent videos</h4><span className="grow"/><button type="button" className="linkish" disabled={busy} onClick={()=>open({name:'videos',view:'board'})}>View all</button></div>
    {recentVideos.length?recentVideos.map(video=><button type="button" key={video.id} className="new-recent-row" disabled={busy} onClick={()=>open({name:'video',id:video.id})}>
     <Thumb cover={video.id} videoId={video.youtubeUrl?youtubeId(video.youtubeUrl):undefined} seed={video.id} fallback={<Icon name="video" size={17}/>}/>
     <b>{video.title}</b><time dateTime={video.updatedAt} title="Last updated">{relativeVideoTime(video.updatedAt)}</time><Icon name="forward" size={15}/>
    </button>):<p className="small muted">No videos yet. Choose a planning or recording option above to make your first video.</p>}
   </section>
  </>:<>
   <p className="muted" style={{marginBottom:16}}>{mode==='title'?'Give your video a title to start planning.':'Paste a YouTube or Instagram link. Keep the concept you like.'}</p>
   <input className="input" autoFocus key={mode} value={value} onChange={event=>setValue(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void submit();}} placeholder={mode==='title'?'e.g. Claude does my receipts automatically':'youtube.com/watch?v=…'} aria-label={mode==='title'?'Video title':'Video link'} disabled={busy}/>
   {mode==='title'&&<button type="button" className="new-breakdown" title={!aiAvailable?AI_CONNECT_HINT:undefined} disabled={!aiAvailable||busy} onClick={()=>{setMode('link');setValue('');}}>Break down a video</button>}
  </>}
 </Dialog>;
}
