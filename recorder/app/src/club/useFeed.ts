import {useCallback,useEffect,useRef,useState} from 'react';
import type {SignalsRefreshResult,SignalsResponse,TrendingRefreshResult,TrendingResponse} from '../../shared/club';
import {clubFetch,errorMessage} from './api';
import {useJobRun,type JobRun} from './useJobRun';

export type Feed<Data,Result>={
 /** What the server has. Null until the first answer; stays on screen while it loads again. */
 data:Data|null;
 /** One sentence when it could not be read, with nothing to show. */
 loadError:string|null;
 reload():void;
 /** Starts the refresh job (or joins the one already running) and loads the list again when it is done. */
 refresh(onDone?:(result:Result)=>void):void;
 job:JobRun;
};

/** A list the server keeps for the current channel (`path`) and a job that fills it again (`path/refresh`). Working now and Signals are both this. */
function useFeed<Data,Result>(path:string,fallback:string):Feed<Data,Result>{
 const [data,setData]=useState<Data|null>(null);
 const [loadError,setLoadError]=useState<string|null>(null);
 const latest=useRef(0);
 const {state,run}=useJobRun();
 const reload=useCallback(()=>{
  const mine=++latest.current;
  clubFetch<Data>(path).then(found=>{if(mine===latest.current){setData(found);setLoadError(null);}},reason=>{if(mine===latest.current)setLoadError(errorMessage(reason,fallback));});
 },[path,fallback]);
 useEffect(()=>{reload();return()=>{latest.current++;};},[reload]);
 const refresh=useCallback((onDone?:(result:Result)=>void)=>{
  void run(()=>clubFetch(`${path}/refresh`,{method:'POST'}),result=>{reload();onDone?.(result as Result);});
 },[path,reload,run]);
 return {data,loadError,reload,refresh,job:state};
}

export const useTrending=()=>useFeed<TrendingResponse,TrendingRefreshResult>('/trending',"Couldn't load what's working now.");
export const useSignals=()=>useFeed<SignalsResponse,SignalsRefreshResult>('/signals',"Couldn't load the posts.");
