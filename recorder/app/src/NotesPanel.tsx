import {useEffect,useRef,useState} from 'react';
import {Copy,Trash2,WandSparkles,X} from './Icons';
import {MARKER_TAG_LABEL,MARKER_TAGS,type MarkerTag,type Project} from '../shared/types';
import {isEditableTarget} from './shortcuts';
import {askClaude} from './club/workspace/ask-claude';
import './NotesPanel.css';

type Note=NonNullable<Project['markers']>[number];
export const sortedNotes=(notes:readonly Note[])=>([...notes].sort((a,b)=>a.time-b.time));
/** Tenths stay visible in the editor; the copied list uses the requested MM:SS format. */
export function noteTime(time:number,precise=true){const ticks=precise?Math.round(Math.max(0,time)*10):Math.floor(Math.max(0,time))*10,seconds=Math.floor(ticks/10);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}${precise&&ticks%10?`.${ticks%10}`:''}`;}
const noteLine=(note:Note,precise:boolean)=>`${noteTime(note.time,precise)} — [${note.tag?MARKER_TAG_LABEL[note.tag]:'Note'}] ${note.name?.replace(/\s+/g,' ').trim()??''}`.trimEnd();
export const copyNotes=(notes:readonly Note[])=>sortedNotes(notes).map(note=>noteLine(note,false)).join('\n');
export const actionableNotes=(notes:readonly Note[])=>sortedNotes(notes).filter(note=>note.tag==='dislike'||note.tag==='idea');
export const fixNotesRequest=(notes:readonly Note[])=>`Go through all my "Needs fixing" and "Idea to add" timeline notes below and propose edits as cards, referring to each note by its timestamp. Keep the parts tagged "Keep as is". Propose the edits for me to review before applying them. These are my notes:\n${actionableNotes(notes).map(note=>noteLine(note,true)).join('\n')}`;

export function NoteTag({tag,onChange,label='Note tag'}:{tag?:MarkerTag;onChange(tag:MarkerTag|null):void;label?:string}){return <select className={`notes-tag${tag?` tag-${tag}`:''}`} aria-label={label} value={tag??''} onChange={event=>onChange(event.target.value as MarkerTag||null)}><option value="">No tag</option>{MARKER_TAGS.map(value=><option key={value} value={value}>{MARKER_TAG_LABEL[value]}</option>)}</select>;}

export function NotesPanel({notes,onSeek,onChange,onDelete,onClose}:{notes:readonly Note[];onSeek(time:number):void;onChange(id:string,patch:{name?:string;tag?:MarkerTag|null}):void;onDelete(id:string):void;onClose():void}){
 const box=useRef<HTMLElement>(null),[filter,setFilter]=useState<MarkerTag|''>(''),[active,setActive]=useState<string|null>(null),[copyStatus,setCopyStatus]=useState('');
 const ordered=sortedNotes(notes),shown=ordered.filter(note=>!filter||note.tag===filter),fixable=actionableNotes(notes);
 useEffect(()=>{box.current?.focus();},[]);
 const choose=(note:Note)=>{setActive(note.id);onSeek(note.time);};
 const copy=async()=>{try{await navigator.clipboard.writeText(copyNotes(notes));setCopyStatus('Notes copied');}catch{setCopyStatus('Could not copy notes. Try again.');}};
 return <aside ref={box} className="club-sheet notes-panel" tabIndex={-1} aria-label="Notes" onKeyDown={event=>{
  // Leave another note while reviewing the list; typing N in its text boxes is still ordinary text.
  if(!isEditableTarget(event.target)&&['n','m'].includes(event.key.toLowerCase())&&!event.metaKey&&!event.ctrlKey&&!event.altKey)return;
  // Arrow keys belong to the note list here; inside a text box they still move the caret.
  event.stopPropagation();if(isEditableTarget(event.target)||event.metaKey||event.ctrlKey||event.altKey||event.nativeEvent.isComposing)return;
  if(event.key==='Escape'){event.preventDefault();onClose();return;}if(!shown.length||event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;
  event.preventDefault();const index=shown.findIndex(note=>note.id===active),next=index<0?(event.key==='ArrowDown'?0:shown.length-1):Math.max(0,Math.min(shown.length-1,index+(event.key==='ArrowDown'?1:-1))),note=shown[next];choose(note);
  const row=box.current?.querySelectorAll<HTMLElement>('.notes-row')[next];row?.querySelector<HTMLButtonElement>('.notes-time')?.focus();row?.scrollIntoView?.({block:'nearest'});
 }}>
  <header><b>Notes</b><span className="notes-count">{notes.length}</span><button type="button" className="club-sheet-close" aria-label="Close notes" onClick={onClose}><X size={16}/></button></header>
  {notes.length>0&&<div className="notes-tools"><label>Show <select aria-label="Filter notes by tag" value={filter} onChange={event=>setFilter(event.target.value as MarkerTag|'')}><option value="">All notes</option>{MARKER_TAGS.map(tag=><option key={tag} value={tag}>{MARKER_TAG_LABEL[tag]}</option>)}</select></label><span>↑ ↓ to review</span></div>}
  <div className="notes-list">{shown.length?shown.map(note=><section className={`notes-row${active===note.id?' is-active':''}`} key={note.id} onFocus={()=>setActive(note.id)}>
   <div className="notes-row-h"><button type="button" className="notes-time tnum" aria-label={`Seek to ${noteTime(note.time)}`} onClick={()=>choose(note)}>{noteTime(note.time)}</button><NoteTag tag={note.tag} label={`Tag at ${noteTime(note.time)}`} onChange={tag=>onChange(note.id,{tag})}/><button type="button" className="notes-delete" aria-label={`Delete note at ${noteTime(note.time)}`} onClick={()=>onDelete(note.id)}><Trash2 size={14}/></button></div>
   <textarea rows={2} aria-label={`Note at ${noteTime(note.time)}`} placeholder="Write a note" value={note.name??''} onChange={event=>onChange(note.id,{name:event.target.value})}/>
  </section>):<p className="notes-empty">{notes.length?'No notes with this tag':'Press N while watching to leave a note at that moment'}</p>}</div>
  <footer><button type="button" className="btn sm" disabled={!notes.length} onClick={()=>void copy()}><Copy size={13}/>Copy notes</button><button type="button" className="btn sm primary" disabled={!fixable.length} onClick={()=>askClaude(fixNotesRequest(notes))}><WandSparkles size={13}/>Fix with Claude</button>{copyStatus&&<span className="notes-copy-status" role="status">{copyStatus}</span>}</footer>
 </aside>;
}
