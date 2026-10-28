import {useEffect,useState} from 'react';
import {TriangleAlert} from 'lucide-react';
import type {DiskSpace} from '../../../shared/club';
import {clubFetch} from '../api';
import {cn} from '../ui';
import type {Problems} from './recorder-checks';

/** How often free space is checked again while the recorder is open. */
export const DISK_CHECK_MS=60_000;

/** Free space where takes are saved, checked on open and every minute. Null until known, or when the check fails (no warning then). */
export function useDiskSpace(enabled:boolean):DiskSpace|null{
 const [disk,setDisk]=useState<DiskSpace|null>(null);
 useEffect(()=>{
  if(!enabled)return;
  let alive=true;
  const check=()=>void clubFetch<DiskSpace>('/disk').then(value=>{if(alive)setDisk(value);},()=>{});
  check();const timer=setInterval(check,DISK_CHECK_MS);
  return()=>{alive=false;clearInterval(timer);};
 },[enabled]);
 return disk;
}

/** Every problem as one coloured card at the top of the sources column, as in Borumi. Renders nothing when all is well. */
export function RecorderWarnings({problems}:{problems:Problems|null}){
 if(!problems)return null;
 const danger=problems.tone==='danger';
 return <div role="alert" data-tone={problems.tone} className={cn('club-recorder-warnings mx-4 mt-4 flex gap-3 rounded-lg border p-3 font-sans text-sm',danger?'border-danger/25 bg-danger-soft text-danger':'border-band-amber/25 bg-band-amber-soft text-band-amber')}>
  <TriangleAlert aria-hidden size={16} className="mt-0.5 shrink-0"/>
  <ul className="m-0 flex min-w-0 list-none flex-col gap-1 p-0">{problems.lines.map(line=><li key={line} className="m-0">{line}</li>)}</ul>
 </div>;
}

/** The pre-flight line under the sources, before the first take. */
export function PreflightLine({text}:{text:string|null}){
 if(!text)return null;
 return <p role="status" className="club-recorder-preflight mx-4 my-3 font-sans text-sm text-muted">{text}</p>;
}
