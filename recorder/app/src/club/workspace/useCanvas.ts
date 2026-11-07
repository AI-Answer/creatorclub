import {deferDelete} from '../deferred-delete';
import {DELETE_DELAY_MS} from '../pending-delete';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {BoardCanvas,BoardFrame,BoardLink} from '../../../shared/club';
import {captureWorkspace,clubFetch,errorMessage} from '../api';
import {useToast} from '../ui';
import {boardBase} from './board-base';

const EMPTY:BoardCanvas={links:[],frames:[]};
/** Each edit owns its rollback. Loads preserve objects changed while their read was in flight. */
export function useCanvas(board:string,tick=0,onRemap?:(kind:'link'|'frame',before:string,after:string)=>void){
 const base=`${boardBase(board)}/board`;
 const toast=useToast();
 const [canvas,setCanvas]=useState<BoardCanvas>(EMPTY);
 const live=useRef(canvas),alive=useRef(true),readVersion=useRef(0),editVersion=useRef(0);
 const versions=useRef(new Map<string,number>()),pending=useRef(new Set<string>()),chains=useRef(new Map<string,Promise<unknown>>());
 const confirmedFrames=useRef(new Map<string,BoardFrame>()),frameEdits=useRef(new Map<string,{version:number;patch:Partial<BoardFrame>}[]>());
 const remap=useRef(onRemap);remap.current=onRemap;
 const show=useCallback((update:(current:BoardCanvas)=>BoardCanvas)=>{live.current=update(live.current);if(alive.current)setCanvas(live.current);},[]);
 const load=useCallback(()=>{
  const mine=++readVersion.current,at=editVersion.current;
  clubFetch<BoardCanvas>(`${base}/canvas`).then(found=>{
   if(!alive.current||mine!==readVersion.current)return;
   const merge=<T extends {id:string}>(kind:string,server:T[],local:T[])=>{
    const keep=(id:string)=>pending.current.has(`${kind}:${id}`)||(versions.current.get(`${kind}:${id}`)??0)>at;
    return [...server.filter(item=>!keep(item.id)),...local.filter(item=>keep(item.id))];
   };
   for(const frame of found.frames??[])if(!pending.current.has(`frames:${frame.id}`)&&(versions.current.get(`frames:${frame.id}`)??0)<=at)confirmedFrames.current.set(frame.id,frame);
   show(current=>({links:merge('links',found.links??[],current.links),frames:merge('frames',found.frames??[],current.frames)}));
  },()=>{});
 },[base,show]);
 useEffect(()=>{alive.current=true;load();return()=>{alive.current=false;readVersion.current++;};},[load,tick]);
 const failed=useCallback((reason:unknown,fallback:string)=>toast(errorMessage(reason,fallback)),[toast]);
 const touch=(key:string)=>{const version=++editVersion.current;versions.current.set(key,version);pending.current.add(key);return version;};
 const ordered=(key:string,run:()=>Promise<unknown>)=>{
  const next=(chains.current.get(key)??Promise.resolve()).catch(()=>{}).then(run);
  chains.current.set(key,next);void next.finally(()=>{if(chains.current.get(key)===next){chains.current.delete(key);pending.current.delete(key);}}).catch(()=>{});
  return next;
 };
 const connect=useCallback(async(from:string,to:string,label?:string,workspace?:string):Promise<BoardLink|undefined>=>{
  if(from===to)return undefined;
  try{
   const link=await clubFetch<BoardLink>(`${base}/links`,{body:{from,to,...(label?{label}:{})},workspace});
   touch(`links:${link.id}`);pending.current.delete(`links:${link.id}`);
   show(current=>({...current,links:[...current.links.filter(each=>each.id!==link.id),link]}));return link;
  }catch(reason){failed(reason,"Couldn't connect those cards.");return undefined;}
 },[base,failed,show]);
 const confirmedLabels=useRef(new Map<string,string|undefined>()),labelEdits=useRef(new Map<string,{version:number;text:string}[]>());
 const label=useCallback((id:string,text:string)=>{
  const before=live.current.links.find(link=>link.id===id);if(!before)return;
  const key=`links:${id}`,version=touch(key);
  if(!labelEdits.current.get(id)?.length)confirmedLabels.current.set(id,before.label);
  labelEdits.current.set(id,[...(labelEdits.current.get(id)??[]),{version,text}]);
  show(current=>({...current,links:current.links.map(link=>link.id===id?{...link,label:text||undefined}:link)}));
  void ordered(key,async()=>{
   try{await clubFetch(`${base}/links/${encodeURIComponent(id)}`,{method:'PATCH',body:{label:text}});confirmedLabels.current.set(id,text||undefined);}
   catch(reason){failed(reason,"Couldn't save that label.");}
   finally{
    const edits=(labelEdits.current.get(id)??[]).filter(edit=>edit.version!==version);labelEdits.current.set(id,edits);
    const value=edits.length?edits[edits.length-1].text||undefined:confirmedLabels.current.get(id);
    show(current=>({...current,links:current.links.map(link=>link.id===id?{...link,label:value}:link)}));
   }
  });
 },[base,failed,show]);
 const unlink=useCallback((id:string)=>{
  const gone=live.current.links.find(link=>link.id===id);if(!gone)return;
  const key=`links:${id}`;touch(key);
  show(current=>({...current,links:current.links.filter(link=>link.id!==id)}));
  const workspace=captureWorkspace();
  const restore=()=>show(current=>({...current,links:[...current.links.filter(link=>link.id!==id),gone]}));
  const undo=deferDelete({delay:DELETE_DELAY_MS,fallback:"Couldn't remove that connection.",send:()=>ordered(key,async()=>{try{return await clubFetch(`${base}/links/${encodeURIComponent(id)}`,{method:'DELETE',workspace:await workspace});}catch(reason){restore();throw reason;}}),onUndo:restore,onFailed:toast,onSettled:()=>pending.current.delete(key),undoAfterSend:()=>void workspace.then(scope=>connect(gone.from,gone.to,gone.label,scope)).then(made=>{if(made)remap.current?.('link',id,made.id);})});
  toast('Removed the connection',{undo});
 },[base,connect,failed,toast,show]);
 const addFrame=useCallback(async(frame:Omit<BoardFrame,'id'>,workspace?:string):Promise<BoardFrame|undefined>=>{
  try{
   const made=await clubFetch<BoardFrame>(`${base}/frames`,{body:frame,workspace});
   touch(`frames:${made.id}`);pending.current.delete(`frames:${made.id}`);confirmedFrames.current.set(made.id,made);
   show(current=>({...current,frames:[...current.frames,made]}));return made;
  }catch(reason){failed(reason,"Couldn't make that frame.");return undefined;}
 },[base,failed,show]);
 const changeFrame=useCallback((id:string,patch:Partial<Omit<BoardFrame,'id'>>,save=true):Promise<boolean>=>{
  const before=live.current.frames.find(frame=>frame.id===id);if(!before)return Promise.resolve(false);
  const key=`frames:${id}`,version=touch(key);
  show(current=>({...current,frames:current.frames.map(frame=>frame.id===id?{...frame,...patch}:frame)}));
  if(!save){pending.current.delete(key);return Promise.resolve(true);}
  frameEdits.current.set(id,[...(frameEdits.current.get(id)??[]),{version,patch}]);
  return ordered(key,async()=>{
   try{
    await clubFetch(`${base}/frames/${encodeURIComponent(id)}`,{method:'PATCH',body:patch});
    const confirmed=confirmedFrames.current.get(id);if(confirmed)confirmedFrames.current.set(id,{...confirmed,...patch});return true;
   }catch(reason){
    failed(reason,"Couldn't save that frame.");return false;
   }finally{
    const edits=(frameEdits.current.get(id)??[]).filter(edit=>edit.version!==version);frameEdits.current.set(id,edits);
    const confirmed=confirmedFrames.current.get(id);
    if(confirmed){const restored=edits.reduce((frame,edit)=>({...frame,...edit.patch}),confirmed);show(current=>({...current,frames:current.frames.map(frame=>frame.id===id?restored:frame)}));}
    else setTimeout(load,0);
   }
  }) as Promise<boolean>;
 },[base,failed,show,load]);
 const removeFrame=useCallback((id:string)=>{
  const gone=live.current.frames.find(frame=>frame.id===id);if(!gone)return;
  const key=`frames:${id}`;touch(key);
  show(current=>({...current,frames:current.frames.filter(frame=>frame.id!==id)}));
  const {id:_id,...again}=gone;
  const workspace=captureWorkspace();
  const restore=()=>show(current=>({...current,frames:[...current.frames.filter(frame=>frame.id!==id),gone]}));
  const undo=deferDelete({delay:DELETE_DELAY_MS,fallback:"Couldn't remove that frame.",send:()=>ordered(key,async()=>{try{return await clubFetch(`${base}/frames/${encodeURIComponent(id)}`,{method:'DELETE',workspace:await workspace});}catch(reason){restore();throw reason;}}),onUndo:restore,onFailed:toast,onSettled:()=>pending.current.delete(key),undoAfterSend:()=>void workspace.then(scope=>addFrame(again,scope)).then(made=>{if(made)remap.current?.('frame',id,made.id);})});
  toast(`Removed the frame “${gone.title}”. Its cards stay.`,{undo});
 },[base,addFrame,failed,toast,show]);
 return {canvas,reload:load,connect,label,unlink,addFrame,changeFrame,removeFrame};
}
