import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {ResearchTile,TilePosition} from '../../../shared/club';
import {clubFetch,clubUpload,errorMessage} from '../api';
import {failureMessage,isStartedJob,watchJob} from '../jobs';
import {useToast} from '../ui';
import {KEY_SAVE_MS} from './board-layout';
import {deleteTileLater,usePendingTiles} from './tile-delete';

export type Reading={phase:'running'}|{phase:'failed';message:string};
export const READ_FAILED="Couldn't read that video.";

export type NewTile={kind:ResearchTile['kind'];url?:string;text?:string};
type Place={x:number;y:number};

/**
 * The tiles of a video's Board and the changes made to them. A tile that moves or is written in shows at once and is saved behind it:
 * a drop saves at once, a key press a moment after the last one. A failed save puts the tile back and says so in a toast.
 * A video tile without details is read in the background. Removing a tile offers Undo for as long as its toast shows.
 */
export function useBoard(videoId:string){
 const base=`/videos/${encodeURIComponent(videoId)}/research`;
 const toast=useToast();
 const [loaded,setLoaded]=useState<ResearchTile[]|null>(null),[loadError,setLoadError]=useState('');
 const [reading,setReading]=useState<Record<string,Reading>>({});
 const hiding=usePendingTiles(videoId);
 const tiles=useMemo(()=>loaded&&(hiding.size?loaded.filter(tile=>!hiding.has(tile.id)):loaded),[loaded,hiding]);
 // The place the server has for each tile, to go back to when a save fails; and the places still waiting to be saved.
 const saved=useRef(new Map<string,TilePosition|undefined>());
 const waiting=useRef(new Map<string,Place>());
 const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
 const stops=useRef(new Map<string,()=>void>());

 const change=useCallback((id:string,patch:Partial<ResearchTile>)=>setLoaded(current=>current&&current.map(tile=>tile.id===id?{...tile,...patch}:tile)),[]);
 const replace=useCallback((incoming:ResearchTile)=>setLoaded(current=>current&&current.map(tile=>tile.id===incoming.id?{...incoming,pos:tile.pos??incoming.pos}:tile)),[]);

 /** Reads a video tile's details. The read keeps going on the server if the page is left, and a read already running is joined. */
 const read=useCallback((tile:ResearchTile)=>{
  stops.current.get(tile.id)?.();
  setReading(current=>({...current,[tile.id]:{phase:'running'}}));
  const fail=(message:string)=>setReading(current=>({...current,[tile.id]:{phase:'failed',message}}));
  clubFetch(`${base}/${encodeURIComponent(tile.id)}/read`,{method:'POST'}).then(started=>{
   if(!isStartedJob(started)){fail(READ_FAILED);return;}
   stops.current.set(tile.id,watchJob(started.id,event=>{
    if(event.type==='done'){replace(event.data as ResearchTile);setReading(({[tile.id]:_done,...rest})=>rest);}
    else if(event.type==='failed')fail(failureMessage(event.data,READ_FAILED));
    else if(event.type==='cancelled')setReading(({[tile.id]:_stopped,...rest})=>rest);
   }));
  },reason=>fail(errorMessage(reason,READ_FAILED)));
 },[base,replace]);
 const readRef=useRef(read);readRef.current=read;

 const load=useCallback(()=>{
  setLoadError('');
  clubFetch<ResearchTile[]>(base).then(found=>{
   saved.current=new Map(found.map(tile=>[tile.id,tile.pos]));
   setLoaded(found);
   for(const tile of found)if(tile.kind==='video'&&!tile.title)readRef.current(tile);
  },reason=>setLoadError(errorMessage(reason,"Couldn't load the board.")));
 },[base]);
 useEffect(()=>{load();},[load]);

 /** Saves the place waiting for a tile. A failure puts the tile back where the server has it. */
 const commit=useCallback(async(id:string)=>{
  clearTimeout(timers.current.get(id));timers.current.delete(id);
  const pos=waiting.current.get(id);
  if(!pos)return;
  waiting.current.delete(id);
  try{
   await clubFetch(`${base}/${encodeURIComponent(id)}`,{method:'PATCH',body:{pos}});
   saved.current.set(id,{...saved.current.get(id),...pos});
  }catch(reason){
   change(id,{pos:saved.current.get(id)});
   toast(errorMessage(reason,"Couldn't save that change."));
  }
 },[base,change,toast]);

 /** Moves a tile on screen without saving it (a drag in progress). */
 const preview=useCallback((id:string,pos:Place)=>change(id,{pos:{...loaded?.find(tile=>tile.id===id)?.pos,...pos}}),[change,loaded]);
 /** Moves a tile and saves its place: at once after a drop, a moment after the last key press. */
 const place=useCallback((id:string,pos:Place,when:'now'|'soon')=>{
  waiting.current.set(id,pos);
  preview(id,pos);
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
   setLoaded(current=>[...(current??[]),tile]);
   if(tile.kind==='video')read(tile);
   return tile;
  }catch(reason){
   toast(errorMessage(reason,"Couldn't add that."),{action:{label:'Try again',fn:()=>void add(body)}});
   return undefined;
  }
 },[base,read,toast]);

 /** Saves what was written in a note. */
 const saveText=useCallback(async(id:string,text:string)=>{
  const before=loaded?.find(tile=>tile.id===id)?.text;
  if((before??'')===text)return;
  change(id,{text});
  try{await clubFetch(`${base}/${encodeURIComponent(id)}`,{method:'PATCH',body:{text}});}
  catch(reason){change(id,{text:before});toast(errorMessage(reason,"Couldn't save that note."));}
 },[base,change,loaded,toast]);

 /** Takes a tile off the Board, for good once its toast has gone unless Undo is pressed. */
 const remove=useCallback((tile:ResearchTile)=>{
  const undo=deleteTileLater(videoId,tile.id,message=>toast(message));
  toast('Removed from the board',{undo});
 },[videoId,toast]);

 return {tiles,loadError,reload:load,reading,read,add,preview,place,saveText,remove};
}
