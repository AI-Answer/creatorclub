import {useEffect,useState} from 'react';
import {TriangleAlert} from 'lucide-react';
import type {DiskSpace} from '../../../shared/club';
import type {DesktopMediaPermissions} from '../../desktop';
import {readMediaPermissions} from '../../media-permissions';
import type {PreviewSnapshot} from '../../capture-preview';
import {clubFetch} from '../api';
import {Button,cn} from '../ui';
import {PROBLEM_ACTION_LABELS,type ProblemAction,type Problems} from './recorder-checks';

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

/**
 * macOS's camera, microphone and screen-recording answers, read without asking (no prompt). Read again when SceneForge reports a
 * permission change, when the window gets focus (back from System Settings) and when a preview changes state. Null until known.
 */
export function useMediaAccess(enabled:boolean,previews:PreviewSnapshot):DesktopMediaPermissions|null{
 const [access,setAccess]=useState<DesktopMediaPermissions|null>(null);
 const statuses=`${previews.camera.status}:${previews.microphone.status}:${previews.screen.status}`;
 useEffect(()=>{
  if(!enabled)return;
  let alive=true;
  const read=()=>void readMediaPermissions(window.sceneForge,navigator.permissions).then(value=>{if(alive)setAccess(value);},()=>{});
  read();window.addEventListener('sceneforge-media-permissions',read);window.addEventListener('focus',read);
  return()=>{alive=false;window.removeEventListener('sceneforge-media-permissions',read);window.removeEventListener('focus',read);};
 },[enabled,statuses]);
 return access;
}

/** Every problem as one coloured card at the top of the sources column, as in Borumi: one sentence per problem, each with at most one button. Renders nothing when all is well. */
export function RecorderWarnings({problems,onAction}:{problems:Problems|null;onAction(action:ProblemAction):void}){
 if(!problems)return null;
 const danger=problems.tone==='danger';
 return <div role="alert" data-tone={problems.tone} className={cn('club-recorder-warnings mx-4 mt-4 flex gap-3 rounded-lg border p-3 font-sans text-sm',danger?'border-danger/25 bg-danger-soft text-danger':'border-band-amber/25 bg-band-amber-soft text-band-amber')}>
  <TriangleAlert aria-hidden size={16} className="mt-0.5 shrink-0"/>
  <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-2 p-0">{problems.lines.map(line=><li key={line.text} className="m-0 flex flex-col items-start gap-2">
   <span>{line.text}</span>
   {line.action&&<Button size="sm" className="text-ink" onClick={()=>onAction(line.action!)}>{PROBLEM_ACTION_LABELS[line.action]}</Button>}
  </li>)}</ul>
 </div>;
}

/** The pre-flight line under the sources, before the first take. */
export function PreflightLine({text}:{text:string|null}){
 if(!text)return null;
 return <p role="status" className="club-recorder-preflight mx-4 my-3 font-sans text-sm text-muted">{text}</p>;
}
