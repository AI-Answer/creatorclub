import {useEffect,useRef,useState,type DragEvent,type FormEvent} from 'react';
import {NOT_A_FILE,NOT_A_VIDEO,isVideoFile,looksLikeVideoLink} from './breakdown';
import {Button,Input,cn} from './ui';

const hasFiles=(event:DragEvent)=>[...(event.dataTransfer?.types??[])].includes('Files');

/**
 * Sits above the Ideas column: the link box for Break down (a pasted link, or a video file dropped on the box), and `Add idea`.
 * Break down stays off while `onBreakDown` is not given.
 */
export function IdeaBox({adding,onAddingChange,onAdd,onBreakDown,onBreakDownFile}:{adding:boolean;onAddingChange(adding:boolean):void;onAdd(title:string):Promise<void>;onBreakDown?(link:string):void;onBreakDownFile?(file:File):void}){
 const [link,setLink]=useState(''),[title,setTitle]=useState(''),[busy,setBusy]=useState(false),[problem,setProblem]=useState(''),[over,setOver]=useState(false);
 const field=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(adding)field.current?.focus();},[adding]);
 const close=()=>{setTitle('');onAddingChange(false);};
 const submit=async(event:FormEvent)=>{
  event.preventDefault();
  const text=title.trim();if(!text||busy)return;
  setBusy(true);
  try{await onAdd(text);close();}catch{/* the board shows the error line */}finally{setBusy(false);}
 };
 const breakDown=(event:FormEvent)=>{
  event.preventDefault();
  const text=link.trim();
  if(!onBreakDown||!text)return;
  if(!looksLikeVideoLink(text)){setProblem(NOT_A_VIDEO);return;}
  setProblem('');setLink('');onBreakDown(text);
 };
 const drop=(event:DragEvent)=>{
  if(!onBreakDownFile||!hasFiles(event))return;
  event.preventDefault();setOver(false);
  const file=event.dataTransfer.files[0];
  if(!file)return;
  if(!isVideoFile(file)){setProblem(NOT_A_FILE);return;}
  setProblem('');onBreakDownFile(file);
 };
 return <div data-dropzone onDragOver={event=>{if(onBreakDownFile&&hasFiles(event)){event.preventDefault();setOver(true);}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOver(false);}} onDrop={drop}
  className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors',over?'border-accent bg-accent-soft':'border-line')}>
  <form onSubmit={breakDown} className="flex flex-col gap-2">
   <Input aria-label="Paste a YouTube or Instagram link" placeholder="Paste a YouTube or Instagram link" value={link} onChange={event=>{setLink(event.target.value);setProblem('');}} disabled={!onBreakDown}/>
   <div className="flex items-center justify-between gap-2">
    <Button type="submit" size="sm" disabled={!onBreakDown||!link.trim()}>Break down</Button>
    {!adding&&<Button size="sm" variant="ghost" onClick={()=>onAddingChange(true)}>Add idea</Button>}
   </div>
   {problem?<p role="alert" className="text-sm text-danger">{problem}</p>:onBreakDownFile&&<p className="text-sm text-muted">Or drop a video file here.</p>}
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
