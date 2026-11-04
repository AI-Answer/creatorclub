import {useAiAvailability,useAiAvailable} from './ai-status';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {SignalsRefreshResult,SignalsResponse,TrendingRefreshResult,TrendingResponse} from '../../shared/club';
import {clubFetch,errorMessage} from './api';
import {needsSeed} from './trending-view';
import {useJobRun,type JobRun} from './useJobRun';

export type Feed<Data,Result>={
 /** What the server has. Null until the first answer; stays on screen while it loads again. */
 data:Data|null;
 /** One sentence when it could not be read, with nothing to show. */
 loadError:string|null;
 /** Reads the list again; resolves once it is on screen (or could not be read). */
 reload():Promise<void>;
 /** Starts the refresh job (or joins the one already running) and loads the list again when it is done. `body` narrows it (posts: `{only}`, the sources to read again). */
 refresh(onDone?:(result:Result)=>void,body?:object):void;
 job:JobRun;
};

/** A list the server keeps for the current channel (`path`) and a job that fills it again (`path/refresh`). Working now and Signals are both this. */
function useFeed<Data,Result>(path:string,fallback:string):Feed<Data,Result>{
 const aiAvailable=useAiAvailable();
 const [data,setData]=useState<Data|null>(null);
 const [loadError,setLoadError]=useState<string|null>(null);
 const latest=useRef(0);
 const {state,run}=useJobRun();
 const reload=useCallback(()=>{
  const mine=++latest.current;
  return clubFetch<Data>(path).then(found=>{if(mine===latest.current){setData(found);setLoadError(null);}},reason=>{if(mine===latest.current)setLoadError(errorMessage(reason,fallback));});
 },[path,fallback]);
 useEffect(()=>{void reload();return()=>{latest.current++;};},[reload]);
 const refresh=useCallback((onDone?:(result:Result)=>void,body?:object)=>{
  if(!aiAvailable)return;
  // The finished callback runs once the new list is on screen, so whoever waits for it sees the new results.
  void run(()=>clubFetch(`${path}/refresh`,{method:'POST',...(body?{body}:{})}),result=>{void reload().then(()=>onDone?.(result as Result));});
 },[path,reload,run,aiAvailable]);
 return {data,loadError,reload,refresh,job:state};
}

/**
 * Working now. A channel that follows too few channels and was never filled starts the search on its topics by itself, once per screen,
 * and `seeding` is true from the answer until that finishes, so the screen shows progress instead of an empty list.
 */
export function useTrending(){
 const {known,available:aiAvailable}=useAiAvailability();
 const feed=useFeed<TrendingResponse,TrendingRefreshResult>('/trending',"Couldn't load what's working now.");
 const {data,refresh,job}=feed;
 const started=useRef(false);
 const due=data!==null&&needsSeed(data);
 // Allow a later availability change to retry, without looping on a failed job.
 useEffect(()=>{if(job.phase==='failed')started.current=false;},[job.phase]);
 useEffect(()=>{if(known&&aiAvailable&&due&&!started.current){started.current=true;refresh();}},[known,aiAvailable,due,refresh]);
 return {...feed,seeding:job.phase==='running'||(known&&aiAvailable&&due&&job.phase==='idle')};
}
export const useSignals=()=>useFeed<SignalsResponse,SignalsRefreshResult>('/signals',"Couldn't load the posts.");
