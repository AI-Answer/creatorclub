import {useCallback,useEffect,useRef,useState} from 'react';
import type {BoardCanvas,BoardFrame,BoardLink} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {useToast} from '../ui';
import {boardBase} from './board-base';

const EMPTY:BoardCanvas={links:[],frames:[]};

/**
 * The connections and frames of a Board. A change shows at once and is saved behind it; a failed save puts the canvas back as the server has it
 * and says so in a toast. Removing a line or a frame offers Undo, which adds it again. Loads again when `tick` changes (the companion grouped cards).
 */
export function useCanvas(board:string,tick=0){
 const base=`${boardBase(board)}/board`;
 const toast=useToast();
 const [canvas,setCanvas]=useState<BoardCanvas>(EMPTY);
 const live=useRef(canvas);live.current=canvas;
 const load=useCallback(()=>{clubFetch<BoardCanvas>(`${base}/canvas`).then(found=>setCanvas({links:found.links??[],frames:found.frames??[]}),()=>{});},[base]);
 useEffect(()=>{load();},[load,tick]);
 const failed=useCallback((reason:unknown,fallback:string)=>{toast(errorMessage(reason,fallback));load();},[toast,load]);

 const connect=useCallback(async(from:string,to:string,label?:string):Promise<BoardLink|undefined>=>{
  if(from===to)return undefined;
  try{
   const link=await clubFetch<BoardLink>(`${base}/links`,{body:{from,to,...(label?{label}:{})}});
   setCanvas(current=>({...current,links:[...current.links.filter(each=>each.id!==link.id),link]}));
   return link;
  }catch(reason){failed(reason,"Couldn't connect those cards.");return undefined;}
 },[base,failed]);

 const label=useCallback((id:string,text:string)=>{
  setCanvas(current=>({...current,links:current.links.map(link=>link.id===id?{...link,label:text||undefined}:link)}));
  clubFetch(`${base}/links/${encodeURIComponent(id)}`,{method:'PATCH',body:{label:text}}).catch(reason=>failed(reason,"Couldn't save that label."));
 },[base,failed]);

 const unlink=useCallback((id:string)=>{
  const gone=live.current.links.find(link=>link.id===id);if(!gone)return;
  setCanvas(current=>({...current,links:current.links.filter(link=>link.id!==id)}));
  clubFetch(`${base}/links/${encodeURIComponent(id)}`,{method:'DELETE'}).then(
   ()=>toast('Removed the connection',{undo:()=>void connect(gone.from,gone.to,gone.label)}),
   reason=>failed(reason,"Couldn't remove that connection."));
 },[base,connect,failed,toast]);

 const addFrame=useCallback(async(frame:Omit<BoardFrame,'id'>):Promise<BoardFrame|undefined>=>{
  try{
   const made=await clubFetch<BoardFrame>(`${base}/frames`,{body:frame});
   setCanvas(current=>({...current,frames:[...current.frames,made]}));
   return made;
  }catch(reason){failed(reason,"Couldn't make that frame.");return undefined;}
 },[base,failed]);

 /** Changes a frame on screen; `save` sends it (a drag shows on screen first and is saved when dropped). */
 const changeFrame=useCallback((id:string,patch:Partial<Omit<BoardFrame,'id'>>,save=true)=>{
  setCanvas(current=>({...current,frames:current.frames.map(frame=>frame.id===id?{...frame,...patch}:frame)}));
  if(save)clubFetch(`${base}/frames/${encodeURIComponent(id)}`,{method:'PATCH',body:patch}).catch(reason=>failed(reason,"Couldn't save that frame."));
 },[base,failed]);

 const removeFrame=useCallback((id:string)=>{
  const gone=live.current.frames.find(frame=>frame.id===id);if(!gone)return;
  setCanvas(current=>({...current,frames:current.frames.filter(frame=>frame.id!==id)}));
  const {id:_id,...again}=gone;
  clubFetch(`${base}/frames/${encodeURIComponent(id)}`,{method:'DELETE'}).then(
   ()=>toast(`Removed the frame “${gone.title}”. Its cards stay.`,{undo:()=>void addFrame(again)}),
   reason=>failed(reason,"Couldn't remove that frame."));
 },[base,addFrame,failed,toast]);

 return {canvas,reload:load,connect,label,unlink,addFrame,changeFrame,removeFrame};
}
