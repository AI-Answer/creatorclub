import {useNoteSave} from './useNoteSave';
import {useEffect,useState} from 'react';
import {CHANNEL_BOARD,type ResearchTile} from '../../../shared/club';
import {Drawer,Icon} from '../ui';
import {Outliner} from './Outliner';
import {savedLine} from './note-save';
import type {NoteSaved} from './useBoard';

/**
 * A note to write in, as a panel beside the Board: the editor, the file it is saved to, and whether it is saved.
 * Writing is saved a moment after you stop. If the file is changed by something else while you write, your version wins and the other one is kept as a copy.
 */
export function NotePanel({tile,save,onClose,onCopyPath,isNew,boardId}:{boardId?:string;tile:ResearchTile;save(text:string,base:string|undefined):Promise<NoteSaved>;onClose(discard:boolean):void;onCopyPath(path:string):void;/** Made a moment ago to write in: closing it with nothing written takes it off the Board again. */isNew?:boolean}){
 const doc=tile.doc!;
 const {text,status,notice,view,readNow,flush,edited,change,abandon}=useNoteSave(tile,save);
 const [closeFailed,setCloseFailed]=useState(false);
 useEffect(()=>{if(status==='saved')setCloseFailed(false);},[status]);
 const close=async()=>{
  if(await flush())onClose(!!isNew&&!view.current.text.trim());else setCloseFailed(true);
 };
 const shown=tile.title||doc.path;
 return <Drawer width={760} label={`Note: ${shown}`} onClose={()=>void close()} header={<>
  <div style={{minWidth:0}}>
   <div style={{fontWeight:600,fontSize:15}} className="ellipsis">{shown}</div>
   <div className="row small muted" style={{gap:6}}><Icon name="script" size={12}/><span className="ellipsis" title={doc.path}>{doc.path}</span>
    <button type="button" className="btn ghost sm icon-only" style={{width:22,height:22}} aria-label="Copy file name" title="Copy file name" onClick={()=>onCopyPath(doc.path)}><Icon name="copy" size={12}/></button></div>
  </div>
  <span className={`small row ${status==='failed'?'warn-text':'muted'}`} role="status" style={{marginLeft:'auto',marginRight:6,gap:5}}>{status==='failed'&&<Icon name="warning" size={13}/>}{savedLine(status)}</span>
 </>}>
  {closeFailed&&<div role="alert" className="md-notice failed">Your latest changes could not be saved.
   <button type="button" className="btn sm" onClick={()=>{abandon();onClose(false);}}>Close anyway</button>
   <button type="button" className="btn sm" onClick={()=>{setCloseFailed(false);void flush();}}>Keep trying</button>
  </div>}
  {notice&&<div className={`md-notice ${notice.kind}`} role="status">{notice.kind!=='updated'&&<Icon name="warning" size={14}/>}{notice.line}{notice.kind==='failed'&&<button type="button" className="btn sm" style={{marginLeft:10}} onClick={()=>void flush()}>Try again</button>}</div>}
  {doc.missing?<p className="muted">This file is not in its folder any more. Remove the card, or put the file back and it opens again.</p>
   :doc.tooLarge?<p className="muted">This file is over 1 MB, which is too large to show here. It stays in its folder.</p>
   :<Outliner boardId={boardId??boardFromHash()} tileId={tile.id} value={text} onChange={change} onEdit={edited} readNow={readNow} label="Note" autoFocus/>}
 </Drawer>;
}

/** Video and Research panels share the same routes; the Board can also pass the identity explicitly. */
function boardFromHash(){const match=/^#\/video\/([^/]+)/.exec(window.location.hash);return match?decodeURIComponent(match[1]):CHANNEL_BOARD;}
