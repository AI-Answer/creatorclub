import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button,Input} from './ui';

/**
 * Sits above the Ideas column: the link box for Break down, and `Add idea`.
 * Break down stays off until the breakdown service exists (`onBreakDown` turns it on).
 */
export function IdeaBox({adding,onAddingChange,onAdd,onBreakDown}:{adding:boolean;onAddingChange(adding:boolean):void;onAdd(title:string):Promise<void>;onBreakDown?(link:string):void}){
 const [link,setLink]=useState(''),[title,setTitle]=useState(''),[busy,setBusy]=useState(false);
 const field=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(adding)field.current?.focus();},[adding]);
 const close=()=>{setTitle('');onAddingChange(false);};
 const submit=async(event:FormEvent)=>{
  event.preventDefault();
  const text=title.trim();if(!text||busy)return;
  setBusy(true);
  try{await onAdd(text);close();}catch{/* the board shows the error line */}finally{setBusy(false);}
 };
 return <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3">
  <form onSubmit={event=>{event.preventDefault();if(onBreakDown&&link.trim())onBreakDown(link.trim());}} className="flex flex-col gap-2">
   <Input aria-label="Paste a YouTube or Instagram link" placeholder="Paste a YouTube or Instagram link" value={link} onChange={event=>setLink(event.target.value)} disabled={!onBreakDown}/>
   <div className="flex items-center justify-between gap-2">
    <Button type="submit" size="sm" disabled={!onBreakDown||!link.trim()}>Break down</Button>
    {!adding&&<Button size="sm" variant="ghost" onClick={()=>onAddingChange(true)}>Add idea</Button>}
   </div>
   {!onBreakDown&&<p className="text-sm text-muted">Break down is coming soon.</p>}
  </form>
  {adding&&<form onSubmit={submit} className="flex flex-col gap-2 border-t border-line pt-3">
   <Input ref={field} aria-label="Idea title" placeholder="Title of the video" value={title} maxLength={300} onChange={event=>setTitle(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}/>
   <div className="flex gap-2">
    <Button type="submit" size="sm" disabled={!title.trim()||busy}>Add</Button>
    <Button size="sm" variant="ghost" onClick={close}>Cancel</Button>
   </div>
  </form>}
 </div>;
}
