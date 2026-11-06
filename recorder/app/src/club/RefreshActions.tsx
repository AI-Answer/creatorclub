import {AI_CONNECT_HINT,useAiAvailable} from './ai-status';
import {fmtDate} from './format';
import type {JobRun} from './useJobRun';
import {Icon} from './ui';
import {Tooltip} from './ui/Tooltip';

/** The right side of a page head that has a list to refresh: a quiet icon button whose tooltip says when it was last read and how much is in it. While a refresh runs, its progress line sits beside the icon, which turns. */
export function RefreshActions({updatedAt,summary,job,onRefresh,disabled,why}:{updatedAt:string|null;summary:string;job:JobRun;onRefresh():void;disabled?:boolean;why?:string}){
 const aiAvailable=useAiAvailable();
 const running=job.phase==='running';
 const read=updatedAt?`Updated ${fmtDate(updatedAt)} · ${summary}`:'Not updated yet';
 return <>
  {running&&<span className="faint small" aria-live="polite">{job.line||'Refreshing'}</span>}
  <Tooltip text={!aiAvailable?AI_CONNECT_HINT:disabled&&why?why:`Refresh · ${read}`}>
   <button type="button" className="btn ghost sm icon-only" aria-label="Refresh" onClick={onRefresh} disabled={!aiAvailable||running||disabled}><Icon name="retry" size={15} spin={running}/></button>
  </Tooltip>
 </>;
}
