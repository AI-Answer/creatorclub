import {useNoteSave} from './useNoteSave';
import {savedLine} from './note-save';
import type {ResearchTile} from '../../../shared/club';
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
 const {text,status,notice,view,flush,change:typed}=useNoteSave(tile,save);
 const failed=notice?.kind==='failed'?notice.line:'';
 return <div className="sticky">
  <Outliner value={text} label={label} onChange={typed} autoFocus={autoFocus} boardId={boardId} tileId={tile.id}
   onBlur={()=>{void flush().then(ok=>{if(ok&&!view.current.text.trim())onBlurEmpty?.();});}}/>
  <span className="small muted" role="status">{savedLine(status)}</span>
  {failed&&<div className="small sticky-err" role="alert">{failed} <button type="button" className="linkish" onClick={()=>void flush()}>Try again</button></div>}
 </div>;
}
