import {useCallback,useEffect,useRef,useState} from 'react';
import type {ResearchTile} from '../../../shared/club';
import {errorMessage} from '../api';
import {Drawer,Icon,useToast} from '../ui';
import {MarkdownEditor} from '../markdown/MarkdownEditor';
import {SAVE_WAIT_MS,conflictLine,onFileChanged,rememberHash,savedLine} from './note-save';
import type {NoteSaved} from './useBoard';

type Status='saved'|'saving'|'unsaved'|'failed';

/**
 * A note to write in, as a panel beside the Board: the editor, the file it is saved to, and whether it is saved.
 * Writing is saved a moment after you stop. If the file is changed by something else while you write, your version wins and the other one is kept as a copy.
 */
export function NotePanel({tile,save,onClose,onCopyPath,isNew}:{tile:ResearchTile;save(text:string,base:string|undefined):Promise<NoteSaved>;onClose(discard:boolean):void;onCopyPath(path:string):void;/** Made a moment ago to write in: closing it with nothing written takes it off the Board again. */isNew?:boolean}){
 const doc=tile.doc!;
 const toast=useToast();
 const [text,setText]=useState(tile.text??''),[status,setStatus]=useState<Status>('saved'),[notice,setNotice]=useState<{kind:'updated'|'conflict'|'failed';line:string}|null>(null);
 const view=useRef({text:tile.text??'',base:doc.hash,mine:[] as string[],dirty:false,saving:false});
 const timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 const running=useRef<Promise<boolean>|null>(null);
 const readNow=useRef<(()=>string)|undefined>(undefined);
 const saveRef=useRef(save);saveRef.current=save;

 /** Writes what is in the editor. One save at a time; writing done meanwhile is saved right after. Resolves to false when it could not be saved. */
 const flush=useCallback(():Promise<boolean>=>{
  clearTimeout(timer.current);
  // What is typed may not have been read from the page yet (it is read when typing pauses): read it now.
  const typed=readNow.current?.();
  if(typed!==undefined&&typed!==view.current.text){view.current.text=typed;view.current.dirty=true;}
  if(running.current)return running.current.then(()=>view.current.dirty?flush():true);
  if(!view.current.dirty)return Promise.resolve(true);
  const sent=view.current.text;
  view.current.saving=true;setStatus('saving');
  const run=saveRef.current(sent,view.current.base).then(result=>{
   const hash=result.tile.doc?.hash;
   if(hash){view.current.base=hash;view.current.mine=rememberHash(view.current.mine,hash);}
   view.current.dirty=view.current.text!==sent;
   if(result.conflict){const line=conflictLine(result.conflict.copy);setNotice({kind:'conflict',line});toast('The note changed elsewhere. Your version is saved and the other one is kept.');}
   else setNotice(current=>current?.kind==='failed'?null:current);
   return true;
  },reason=>{
   setNotice({kind:'failed',line:errorMessage(reason,"Couldn't save this note.")});
   return false;
  }).then(ok=>{
   view.current.saving=false;running.current=null;
   setStatus(ok?(view.current.dirty?'unsaved':'saved'):'failed');
   if(ok&&view.current.dirty)timer.current=setTimeout(()=>void flush(),SAVE_WAIT_MS);
   return ok;
  });
  running.current=run;
  return run;
 },[toast]);

 const edited=()=>{
  view.current.dirty=true;setStatus('unsaved');
  clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),SAVE_WAIT_MS);
 };
 // The page was read back into Markdown (typing paused, or a save asked for it). The save timer is the keystrokes', not this.
 const change=(markdown:string)=>{view.current.text=markdown;view.current.dirty=true;setText(markdown);};

 // The file changed on disk (an agent, another app): taken in when nothing is unsaved here.
 useEffect(()=>{
  const action=onFileChanged(view.current,{text:tile.text??'',hash:doc.hash});
  if(action==='adopt'){
   view.current={...view.current,text:tile.text??'',base:doc.hash};
   setText(tile.text??'');setNotice({kind:'updated',line:'Updated: this note was changed in its file.'});
  }
 },[tile.text,doc.hash]);
 useEffect(()=>{if(notice?.kind!=='updated')return;const gone=setTimeout(()=>setNotice(null),4000);return()=>clearTimeout(gone);},[notice]);
 // Leaving with writing not yet saved saves it.
 useEffect(()=>()=>{clearTimeout(timer.current);if(view.current.dirty)void flush();},[flush]);

 const close=async()=>{
  if(await flush())onClose(!!isNew&&!view.current.text.trim());
 };
 const shown=tile.title||doc.path;
 return <Drawer width={760} label={`Note: ${shown}`} onClose={()=>void close()} header={<>
  <div style={{minWidth:0}}>
   <div style={{fontWeight:650,fontSize:15}} className="ellipsis">{shown}</div>
   <div className="row small muted" style={{gap:6}}><Icon name="script" size={12}/><span className="ellipsis" title={doc.path}>{doc.path}</span>
    <button type="button" className="btn ghost sm icon-only" style={{width:22,height:22}} aria-label="Copy file name" title="Copy file name" onClick={()=>onCopyPath(doc.path)}><Icon name="copy" size={12}/></button></div>
  </div>
  <span className={`small row ${status==='failed'?'warn-text':'muted'}`} role="status" style={{marginLeft:'auto',marginRight:6,gap:5}}>{status==='failed'&&<Icon name="warning" size={13}/>}{savedLine(status)}</span>
 </>}>
  {notice&&<div className={`md-notice ${notice.kind}`} role="status">{notice.kind!=='updated'&&<Icon name="warning" size={14}/>}{notice.line}{notice.kind==='failed'&&<button type="button" className="btn sm" style={{marginLeft:10}} onClick={()=>void flush()}>Try again</button>}</div>}
  {doc.missing?<p className="muted">This file is not in its folder any more. Remove the card, or put the file back and it opens again.</p>
   :doc.tooLarge?<p className="muted">This file is over 1 MB, which is too large to show here. It stays in its folder.</p>
   :<MarkdownEditor value={text} onChange={change} onEdit={edited} readNow={readNow} label="Note" autoFocus/>}
 </Drawer>;
}
