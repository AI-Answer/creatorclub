import {useCallback,useEffect,useRef,useState} from 'react';
import type {ResearchTile} from '../../../shared/club';
import {errorMessage} from '../api';
import {useToast} from '../ui';
import {SAVE_WAIT_MS,conflictLine,onFileChanged,rememberHash,type NoteView} from './note-save';
import type {NoteSaved} from './useBoard';
import {Outliner} from './Outliner';

/** Makes a text area as tall as its text, so a note grows as you write and never scrolls inside. */
export function fitHeight(area:HTMLTextAreaElement|null){
 if(!area)return;
 area.style.height='auto';
 area.style.height=`${area.scrollHeight}px`;
}

/**
 * A note as a sticky note: click it once and type. It grows with the text and saves a moment after you stop (and when you click away).
 * If the note's file changes elsewhere while you write, your version wins and the other one is kept as a copy.
 */
export function StickyNote({tile,save,autoFocus,onBlurEmpty,label,boardId}:{boardId?:string;tile:ResearchTile;save(text:string,base:string|undefined):Promise<NoteSaved>;autoFocus?:boolean;/** Left empty after being made a moment ago. */onBlurEmpty?():void;label:string}){
 const doc=tile.doc;
 const toast=useToast();
 const [text,setText]=useState(tile.text??''),[failed,setFailed]=useState('');
 const view=useRef<NoteView>({text:tile.text??'',base:doc?.hash,mine:[],dirty:false,saving:false});
 const timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 const saveRef=useRef(save);saveRef.current=save;

 const flush=useCallback(async():Promise<void>=>{
  clearTimeout(timer.current);
  const now=view.current;
  if(now.saving||!now.dirty)return;
  const sent=now.text;
  now.saving=true;
  let ok=true;
  try{
   const result=await saveRef.current(sent,now.base);
   const hash=result.tile.doc?.hash;
   if(hash){now.base=hash;now.mine=rememberHash(now.mine,hash);}
   now.dirty=now.text!==sent;
   setFailed('');
   if(result.conflict)toast(conflictLine(result.conflict.copy));
  }catch(reason){ok=false;setFailed(errorMessage(reason,"Couldn't save this note."));}
  now.saving=false;
  if(ok&&now.dirty)timer.current=setTimeout(()=>void flush(),SAVE_WAIT_MS);
 },[toast]);

 // The file changed elsewhere (an agent, another app): taken in when nothing here is unsaved.
 useEffect(()=>{
  if(onFileChanged(view.current,{text:tile.text??'',hash:doc?.hash})==='adopt'){
   view.current={...view.current,text:tile.text??'',base:doc?.hash};
   setText(tile.text??'');
  }
 },[tile.text,doc?.hash]);
 // Leaving the Board with writing not yet saved saves it.
 useEffect(()=>()=>{clearTimeout(timer.current);if(view.current.dirty)void flush();},[flush]);

 const typed=(value:string)=>{
  view.current.text=value;view.current.dirty=true;setText(value);setFailed('');
  clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),SAVE_WAIT_MS);
 };
 return <div className="sticky">
  <Outliner value={text} label={label} onChange={typed} autoFocus={autoFocus} boardId={boardId} tileId={tile.id}
   onBlur={()=>{void flush();if(!view.current.text.trim())onBlurEmpty?.();}}/>
  {failed&&<div className="small sticky-err" role="alert">{failed} <button type="button" className="linkish" onClick={()=>void flush()}>Try again</button></div>}
 </div>;
}
