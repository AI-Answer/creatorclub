import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {ResearchTile,TilePosition} from '../../../shared/club';
import {clubFetch,clubUpload,errorMessage} from '../api';
import {failureMessage,isStartedJob,watchJob} from '../jobs';
import {useToast} from '../ui';
import {KEY_SAVE_MS} from './board-layout';
import {deleteTileLater,usePendingTiles} from './tile-delete';
import {mergeTiles} from './board-files';
import {useBoardEvents} from './useBoardFiles';
import {boardBase} from './board-base';

export type Reading={phase:'running'}|{phase:'failed';message:string};
export const READ_FAILED="Couldn't read that video.";

/** A note's save: the tile as the server shows it now, and when the file had been changed elsewhere, the copy kept of that other version. */
export type NoteSaved={tile:ResearchTile;conflict?:{copy:string}};

export type NewTile={kind:ResearchTile['kind'];url?:string;text?:string};
type Place={x:number;y:number;w?:number;h?:number};

/**
 * The tiles of a Board (a video's, or Research when `videoId` is `CHANNEL_BOARD`) and the changes made to them. A tile that moves or is written in shows at once and is saved behind it:
 * a drop saves at once, a key press a moment after the last one. A failed save puts the tile back and says so in a toast.
 * A video tile without details is read in the background. Removing a tile offers Undo for as long as its toast shows.
 */
export function useBoard(videoId:string){
 const base=`${boardBase(videoId)}/research`;
 const toast=useToast();
 const [loaded,setLoaded]=useState<ResearchTile[]|null>(null),[loadError,setLoadError]=useState('');
 const [reading,setReading]=useState<Record<string,Reading>>({});
 const hiding=usePendingTiles(videoId);
 const tiles=useMemo(()=>loaded&&(hiding.size?loaded.filter(tile=>!hiding.has(tile.id)):loaded),[loaded,hiding]);
 // The place the server has for each tile, to go back to when a save fails; and the places still waiting to be saved.
 const saved=useRef(new Map<string,TilePosition|undefined>());
 const waiting=useRef(new Map<string,Place>());
 const previews=useRef(new Set<string>());
 const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
 const stops=useRef(new Map<string,()=>void>());
 const alive=useRef(true),loadVersion=useRef(0);
 const readVersions=useRef(new Map<string,number>());
 const versions=useRef(new Map<string,number>()),inflight=useRef(new Map<string,Promise<void>>());
 const loadedRef=useRef(loaded);loadedRef.current=loaded;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;loadVersion.current++;readVersions.current.clear();};},[]);

 const change=useCallback((id:string,patch:Partial<ResearchTile>)=>{const next=loadedRef.current?.map(tile=>tile.id===id?{...tile,...patch}:tile)??null;loadedRef.current=next;setLoaded(next);},[]);
 const replace=useCallback((incoming:ResearchTile)=>{const next=loadedRef.current?.map(tile=>tile.id===incoming.id?{...incoming,pos:tile.pos??incoming.pos}:tile)??null;loadedRef.current=next;setLoaded(next);},[]);

 /** Reads a video tile's details. The read keeps going on the server if the page is left, and a read already running is joined. */
 const read=useCallback((tile:ResearchTile)=>{
  if(!alive.current)return;
  stops.current.get(tile.id)?.();
  const version=(readVersions.current.get(tile.id)??0)+1;readVersions.current.set(tile.id,version);
  const active=()=>alive.current&&readVersions.current.get(tile.id)===version;
  setReading(current=>({...current,[tile.id]:{phase:'running'}}));
  const fail=(message:string)=>{if(!active())return;stops.current.delete(tile.id);setReading(current=>({...current,[tile.id]:{phase:'failed',message}}));};
  clubFetch(`${base}/${encodeURIComponent(tile.id)}/read`,{method:'POST'}).then(started=>{
   if(!active())return;
   if(!isStartedJob(started)){fail(READ_FAILED);return;}
   stops.current.set(tile.id,watchJob(started.id,event=>{
    if(!active())return;
    if(event.type!=='progress')stops.current.delete(tile.id);
    if(event.type==='done'){replace(event.data as ResearchTile);setReading(({[tile.id]:_done,...rest})=>rest);}
    else if(event.type==='failed')fail(failureMessage(event.data,READ_FAILED));
    else if(event.type==='cancelled')setReading(({[tile.id]:_stopped,...rest})=>rest);
   }));
  },reason=>fail(errorMessage(reason,READ_FAILED)));
 },[base,replace]);
 const readRef=useRef(read);readRef.current=read;

 const load=useCallback(()=>{
  const mine=++loadVersion.current,at=new Map(versions.current);
  setLoadError('');
  clubFetch<ResearchTile[]>(base).then(found=>{
   if(!alive.current||mine!==loadVersion.current)return;
   const positions=new Map(waiting.current);
   for(const tile of loadedRef.current??[])if((previews.current.has(tile.id)||versions.current.get(tile.id)!==at.get(tile.id))&&tile.pos)positions.set(tile.id,tile.pos);
   for(const tile of found)if(!positions.has(tile.id))saved.current.set(tile.id,tile.pos);
   const merged=mergeTiles(found,positions);loadedRef.current=merged;setLoaded(merged);
   for(const tile of merged)if(tile.kind==='video'&&!tile.title&&!stops.current.has(tile.id))readRef.current(tile);
  },reason=>{if(alive.current&&mine===loadVersion.current&&loadedRef.current===null)setLoadError(errorMessage(reason,"Couldn't load the board."));});
 },[base]);
 useEffect(()=>{load();},[load]);
 const refresh=load;
 const [changes,setChanges]=useState(0);
 useBoardEvents(videoId,()=>{refresh();setChanges(count=>count+1);});

 /** Saves the place waiting for a tile. A failure puts the tile back where the server has it. */
 const commit=useCallback((id:string):Promise<void>=>{
  clearTimeout(timers.current.get(id));timers.current.delete(id);
  const active=inflight.current.get(id);if(active)return active;
  const drain=async()=>{
   while(waiting.current.has(id)){
    const pos=waiting.current.get(id)!,version=versions.current.get(id);
    try{
     await clubFetch(`${base}/${encodeURIComponent(id)}`,{method:'PATCH',body:{pos}});
     saved.current.set(id,{...saved.current.get(id),...pos});
     if(versions.current.get(id)===version)waiting.current.delete(id);
    }catch(reason){
     if(versions.current.get(id)===version){waiting.current.delete(id);if(alive.current)change(id,{pos:saved.current.get(id)});}
     if(alive.current)toast(errorMessage(reason,"Couldn't save that change."));
    }
   }
  };
  const pending=drain().finally(()=>inflight.current.delete(id));inflight.current.set(id,pending);return pending;
 },[base,change,toast]);

 /** Moves a tile on screen without saving it (a drag in progress). */
 const preview=useCallback((id:string,pos:Place)=>{const version=(versions.current.get(id)??0)+1;versions.current.set(id,version);previews.current.add(id);change(id,{pos:{...loadedRef.current?.find(tile=>tile.id===id)?.pos,...pos}});return version;},[change]);
 /** Moves a tile and saves its place: at once after a drop, a moment after the last key press. */
 const place=useCallback((id:string,pos:Place,when:'now'|'soon')=>{
  versions.current.set(id,(versions.current.get(id)??0)+1);
  waiting.current.set(id,{...loadedRef.current?.find(tile=>tile.id===id)?.pos,...pos});
  preview(id,pos);previews.current.delete(id);
  clearTimeout(timers.current.get(id));
  if(when==='now'){void commit(id);return;}
  timers.current.set(id,setTimeout(()=>void commit(id),KEY_SAVE_MS));
 },[preview,commit]);
 // Leaving the Board saves the places still waiting, and stops the reads it was following.
 useEffect(()=>{
  const following=stops.current;
  return()=>{
   for(const id of [...waiting.current.keys()])void commit(id);
   for(const stop of following.values())stop();
  };
 },[commit]);

 /** Adds a tile; the server gives it a free place. Resolves to the tile, or nothing when it could not be added (a toast says why, with Try again). */
 const add=useCallback(async(body:NewTile|FormData):Promise<ResearchTile|undefined>=>{
  try{
   const tile=body instanceof FormData?await clubUpload<ResearchTile>(base,body):await clubFetch<ResearchTile>(base,{body});
   saved.current.set(tile.id,tile.pos);
   const next=[...(loadedRef.current??[]),tile];loadedRef.current=next;setLoaded(next);
   if(tile.kind==='video')read(tile);
   return tile;
  }catch(reason){
   toast(errorMessage(reason,"Couldn't add that."),{action:{label:'Try again',fn:()=>void add(body)}});
   return undefined;
  }
 },[base,read,toast]);

 /**
  * Saves what was written in a note, to its file. `base` is the hash of the text the writer was looking at: if the file holds something else by now,
  * the server keeps the other version as a copy and says so. Resolves to the saved tile, or throws the sentence to show.
  */
 const saveNote=useCallback(async(id:string,text:string,basis?:string):Promise<NoteSaved>=>{
  const {conflict,...tile}=await clubFetch<ResearchTile&{conflict?:{copy:string}}>(`${base}/${encodeURIComponent(id)}`,{method:'PATCH',body:{text,...(basis?{base:basis}:{})}});
  replace(tile);
  if(conflict)refresh();
  return {tile,...(conflict?{conflict}:{})};
 },[base,replace,refresh]);

 /** Puts a tile the server made (a pinned file, a dropped note) on the Board. */
 const adopt=useCallback((incoming:readonly ResearchTile[])=>{
  for(const tile of incoming)saved.current.set(tile.id,tile.pos);
  const current=loadedRef.current,known=new Set((current??[]).map(tile=>tile.id)),next=[...(current??[]),...incoming.filter(tile=>!known.has(tile.id))];loadedRef.current=next;setLoaded(next);
 },[]);

 /** Takes a tile off the Board, for good once its toast has gone unless Undo is pressed. */
 const remove=useCallback((tile:ResearchTile)=>{
  const undo=deleteTileLater(videoId,tile.id,message=>toast(message));
  toast('Removed from the board',{undo});
 },[videoId,toast]);

 /** Takes several tiles off the Board at once, with one Undo for all of them. */
 const removeMany=useCallback((ids:readonly string[])=>{
  if(!ids.length)return;
  const undos=ids.map(id=>deleteTileLater(videoId,id,message=>toast(message)));
  toast(ids.length===1?'Removed from the board':`Removed ${ids.length} cards from the board`,{undo:()=>undos.forEach(undo=>undo())});
 },[videoId,toast]);

 /** Saves the size a note was resized to (its width and height), keeping its place. */
 const resize=useCallback((id:string,size:{w:number;h:number})=>{
  const tile=loaded?.find(each=>each.id===id);
  place(id,{x:tile?.pos?.x??0,y:tile?.pos?.y??0,...size},'now');
 },[loaded,place]);

 const settlePreview=(id:string,expected:Place,target:Place,save:boolean,version:number)=>{
  const current=loadedRef.current?.find(tile=>tile.id===id)?.pos;
  if(versions.current.get(id)!==version||current?.x!==expected.x||current.y!==expected.y)return;
  previews.current.delete(id);
  if(save)place(id,target,'now');else change(id,{pos:{...current,...target}});
 };
 return {settlePreview,tiles,changes,loadError,reload:load,refresh,reading,read,add,adopt,preview,place,resize,saveNote,remove,removeMany};
}
