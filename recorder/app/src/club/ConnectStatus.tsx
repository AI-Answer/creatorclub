import type {ConnectProvider} from '../../shared/club';
import {connectLabel,type ConnectState} from './useConnect';
import {ErrorLine} from './ErrorLine';
import {Button,Progress,Spinner} from './ui';

/** What connecting looks like: a progress bar with the last few installer lines, a wait for the browser, the result or one error. */
export function ConnectStatus({state,provider,onRetry,onCancel,primaryRetry=false}:{state:ConnectState;provider:ConnectProvider;onRetry():void;onCancel?():void;primaryRetry?:boolean}){
 const name=connectLabel[provider];
 if(state.phase==='installing')return <div className="flex flex-col gap-2" aria-live="polite">
  <p className="text-base text-muted">Installing {name}…</p>
  <Progress label={`Installing ${name}`}/>
  {state.lines.length>0&&<ul className="flex flex-col gap-0.5 font-mono text-xs text-muted">{state.lines.map((line,index)=><li key={`${index}-${line}`} className="truncate">{line}</li>)}</ul>}
 </div>;
 if(state.phase==='signing-in')return <div className="flex flex-wrap items-center gap-2 text-base text-muted" aria-live="polite">
  <Spinner label={`Signing in to ${name}`}/>Finish signing in to {name} in your browser.
  {onCancel&&<Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
 </div>;
 if(state.phase==='stopping')return <p role="status" className="row small muted"><Spinner label="Stopping"/>Stopping…</p>;
 if(state.phase==='connected')return <p className="text-base font-medium text-success" aria-live="polite">{state.account?`Connected as ${state.account}`:'Connected'}</p>;
 if(state.phase==='cancelled')return <p role="status" className="small muted">Sign-in cancelled.</p>;
 if(state.phase==='failed')return <ErrorLine message={state.message} onRetry={onRetry} primary={primaryRetry}/>;
 return null;
}
