import {useEffect,useState,type ReactNode} from 'react';
import {Progress} from './ui';

/** Whole seconds since this component appeared. The work it describes starts when it does, so this is how long the work has run. */
function useElapsed(){
 const [seconds,setSeconds]=useState(0);
 useEffect(()=>{
  const started=Date.now();
  const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-started)/1000)),1000);
  return()=>clearInterval(timer);
 },[]);
 return seconds;
}

/**
 * What a slow job shows instead of a bare spinner: what it is doing now (`line`, the job's own words when it sends them), a rough time
 * (`estimate`, e.g. "10 to 20 seconds"), how long it has run, and what the person can do meanwhile (`note`). Render it only while the work runs.
 */
export function ProgressLine({label,line,estimate,note}:{label:string;line:string;estimate:string;note?:ReactNode}){
 const seconds=useElapsed();
 return <div className="progress-line" role="status" aria-live="polite">
  <div className="pl-line">{line}</div>
  <Progress label={label}/>
  <div className="small muted pl-time">Usually {estimate}. <span className="tnum">{seconds}s</span> so far.{note?<> {note}</>:null}</div>
 </div>;
}
