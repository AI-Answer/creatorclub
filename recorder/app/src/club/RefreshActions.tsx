import {fmtDate} from './format';
import type {JobRun} from './useJobRun';
import {Icon} from './ui';

/** The right side of a page head that has a list to refresh: when it was last read, how much is in it, and a Refresh button that shows the job's progress while it runs. */
export function RefreshActions({updatedAt,summary,job,onRefresh,disabled,why}:{updatedAt:string|null;summary:string;job:JobRun;onRefresh():void;disabled?:boolean;why?:string}){
 const running=job.phase==='running';
 return <>
  <span className="faint small" aria-live="polite">{running
   ?<><span className="spin" style={{display:'inline-block',verticalAlign:'-3px',marginRight:6,width:14,height:14}}/>{job.line||'Refreshing'}</>
   :<><Icon name="RotateCcw" size={12}/> {updatedAt?`Updated ${fmtDate(updatedAt)} · ${summary}`:'Not refreshed yet'}</>}</span>
  <button type="button" className="btn" onClick={onRefresh} disabled={running||disabled} title={disabled?why:undefined}><Icon name="RotateCcw" size={15}/>Refresh</button>
 </>;
}
