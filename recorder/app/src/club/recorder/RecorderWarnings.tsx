import {visibleInterval} from '../visible-interval';
import {useEffect,useState} from 'react';
import type {DiskSpace} from '../../../shared/club';
import type {DesktopMediaPermissions} from '../../desktop';
import {readMediaPermissions} from '../../media-permissions';
import type {PreviewSnapshot} from '../../capture-preview';
import {clubFetch} from '../api';
import {Button,Icon,cn} from '../ui';
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
  const stop=visibleInterval(check,DISK_CHECK_MS,true);
  return()=>{alive=false;stop();};
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

/** Every problem as one amber card (the colour rule: amber is for problems to fix; a problem that blocks recording is in medium weight) that takes the place of the readiness line above the Record button: one sentence per problem, each with at most one button. Renders nothing when all is well. */
export function RecorderWarnings({problems,onAction}:{problems:Problems|null;onAction(action:ProblemAction):void}){
 if(!problems)return null;
 return <div role="alert" data-tone={problems.tone} className={cn('club-recorder-warnings flex min-w-0 flex-1 gap-3 rounded-[var(--cc-r-lg)] border p-3 font-sans text-sm border-warn/25 bg-warn-soft text-warn',problems.tone==='danger'&&'font-medium')}>
  <Icon name="warning" size={16} className="mt-0.5 shrink-0"/>
  <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-2 p-0">{problems.lines.map(line=><li key={line.text} className="m-0 flex flex-col items-start gap-2">
   <span>{line.text}</span>
   {line.action&&<Button size="sm" className="text-ink" onClick={()=>onAction(line.action!)}>{PROBLEM_ACTION_LABELS[line.action]}</Button>}
  </li>)}</ul>
 </div>;
}
