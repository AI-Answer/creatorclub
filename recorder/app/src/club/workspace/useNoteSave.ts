import {useCallback,useEffect,useRef,useState} from 'react';
import type {ResearchTile} from '../../../shared/club';
import {errorMessage} from '../api';
import {useToast} from '../ui';
import {SAVE_WAIT_MS,conflictLine,onFileChanged,rememberHash,type NoteView} from './note-save';
import type {NoteSaved} from './useBoard';
export type NoteStatus='saved'|'saving'|'unsaved'|'failed';
export function useNoteSave(tile:ResearchTile,save:(text:string,base:string|undefined)=>Promise<NoteSaved>){
 const toast=useToast();
 const [text,setText]=useState(tile.text??''),[status,setStatus]=useState<NoteStatus>('saved');
 const [notice,setNotice]=useState<{kind:'updated'|'conflict'|'failed';line:string}|null>(null);
 const view=useRef<NoteView>({text:tile.text??'',base:tile.doc?.hash,mine:[],dirty:false,saving:false});
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),running=useRef<Promise<boolean>|null>(null),alive=useRef(true);
 const readNow=useRef<(()=>string)|undefined>(undefined),saveRef=useRef(save);saveRef.current=save;
 const flush=useCallback(():Promise<boolean>=>{
  clearTimeout(timer.current);
  const typed=readNow.current?.();if(typed!==undefined&&typed!==view.current.text){view.current.text=typed;view.current.dirty=true;}
  if(running.current)return running.current.then(ok=>ok&&view.current.dirty?flush():ok);
  if(!view.current.dirty)return Promise.resolve(true);
  const sent=view.current.text;view.current.saving=true;if(alive.current)setStatus('saving');
  const request=saveRef.current(sent,view.current.base).then(result=>{
   const hash=result.tile.doc?.hash;if(hash){view.current.base=hash;view.current.mine=rememberHash(view.current.mine,hash);}
   view.current.dirty=view.current.text!==sent;
   if(alive.current){
    if(result.conflict){setNotice({kind:'conflict',line:conflictLine(result.conflict.copy)});toast('The note changed elsewhere. Your version is saved and the other one is kept.');}
    else setNotice(current=>current?.kind==='failed'?null:current);
   }
   return true;
  },reason=>{if(alive.current)setNotice({kind:'failed',line:errorMessage(reason,"Couldn't save this note.")});return false;}).then(async ok=>{
   view.current.saving=false;running.current=null;
   if(alive.current)setStatus(ok?(view.current.dirty?'unsaved':'saved'):'failed');
   if(ok&&view.current.dirty)return flush();
   return ok;
  });
  running.current=request;return request;
 },[toast]);
 const edited=useCallback(()=>{
  view.current.dirty=true;if(alive.current)setStatus('unsaved');
  clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),SAVE_WAIT_MS);
 },[flush]);
 const change=useCallback((value:string)=>{view.current.text=value;setText(value);edited();},[edited]);
 useEffect(()=>{
  if(onFileChanged(view.current,{text:tile.text??'',hash:tile.doc?.hash})==='adopt'){
   view.current={...view.current,text:tile.text??'',base:tile.doc?.hash};setText(tile.text??'');setNotice({kind:'updated',line:'Updated: this note was changed in its file.'});
  }
 },[tile.text,tile.doc?.hash]);
 useEffect(()=>{if(notice?.kind!=='updated')return;const gone=setTimeout(()=>setNotice(null),4000);return()=>clearTimeout(gone);},[notice]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(timer.current);if(view.current.dirty)void flush();};},[flush]);
 const abandon=()=>{clearTimeout(timer.current);view.current.dirty=false;};
 return {text,status,notice,view,readNow,flush,edited,change,abandon};
}
