import {useState} from 'react';
import type {BoardFiles} from '../../../shared/club';
import {Button,Dialog,Icon} from '../ui';
import {fmtDate} from '../format';

/**
 * "Notes folder": a folder of Markdown files (an Obsidian vault, a folder an agent writes to) that every video of the channel can draw on.
 * Its files are listed here and any of them can be pinned to this video's Board as a card; the card shows the file's text and writing in it changes the file.
 */
export function NotesFolder({notes,onChoose,onPin,onClose}:{notes:BoardFiles['notes'];onChoose(path:string|null):Promise<string|undefined>;onPin(path:string):Promise<void>;onClose():void}){
 const [path,setPath]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const choose=window.sceneForge?.chooseFolder;
 const use=async(value:string|null)=>{
  setBusy('folder');setError('');
  const failed=await onChoose(value);
  setBusy('');
  if(failed)setError(failed);else setPath('');
 };
 const pick=async()=>{
  const folder=await choose?.().catch(()=>null);
  if(folder)await use(folder);
 };
 return <Dialog title="Notes folder" description="Pick a folder with Markdown files, like an Obsidian vault or a folder an agent writes to. Each file shows up here and you can pin it to this board." onClose={onClose} width={560}
  footer={<><Button variant="ghost" onClick={onClose}>Done</Button></>}>
  <div className="notes-folder">
   {notes?<div className="row" style={{gap:8}}><Icon name="FolderOpen" size={15}/><span className="grow ellipsis" title={notes.path}>{notes.display}</span>
     <Button size="sm" variant="ghost" onClick={()=>void use(null)} disabled={!!busy}>Stop using</Button></div>:null}
   <form className="row" style={{gap:8,marginTop:notes?10:0}} onSubmit={event=>{event.preventDefault();if(path.trim())void use(path.trim());}}>
    {choose&&<Button size="sm" type="button" onClick={()=>void pick()} disabled={!!busy}><Icon name="Folder" size={14}/>Choose folder</Button>}
    <input className="input grow" aria-label="Folder path" placeholder={notes?'Use a different folder: paste its path':'Paste the path of the folder'} value={path} onChange={event=>setPath(event.target.value)}/>
    <Button size="sm" variant="primary" type="submit" disabled={!path.trim()||!!busy}>Use folder</Button>
   </form>
   {error&&<p className="small warn-text row" role="alert" style={{margin:'8px 0 0',gap:6}}><Icon name="TriangleAlert" size={14}/>{error}</p>}
   {notes&&(notes.files.length===0?<p className="muted small" style={{margin:'14px 0 0'}}>No Markdown or text files in this folder yet. New ones show up here by themselves.</p>
    :<ul className="notes-list" aria-label="Files in the Notes folder">
      {notes.files.map(file=><li key={file.path}>
       <Icon name="FileText" size={15}/>
       <div className="grow" style={{minWidth:0}}><div className="ellipsis" style={{fontWeight:550}}>{file.title}</div><div className="small faint ellipsis">{file.path} · {fmtDate(file.modified)}</div></div>
       {file.pinned?<span className="small muted">On the board</span>:<Button size="sm" onClick={()=>{setBusy(file.path);void onPin(file.path).finally(()=>setBusy(''))}} disabled={!!busy}>Pin</Button>}
      </li>)}
     </ul>)}
   {notes?.truncated&&<p className="small muted">Only the first files are listed.</p>}
  </div>
 </Dialog>;
}
