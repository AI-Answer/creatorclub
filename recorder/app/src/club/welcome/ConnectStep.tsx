import type {ConnectResult} from '../../../shared/club';
import {anyConnected,type AiCheck} from '../ai-status';
import {AiRow} from '../AiRow';
import {ErrorLine} from '../ErrorLine';
import {ProgressLine} from '../ProgressLine';
import {ACCOUNT_CHECK_ESTIMATE} from '../welcome';
import {Icon} from '../ui';

/** A row while the accounts have not been read yet: the same shape as the real one, with nothing to press. */
function PendingRow({name,icon}:{name:string;icon:'ai'|'assistant'}){
 return <div className="srow">
  <span className={`logo ${icon==='ai'?'logo-claude':'logo-codex'}`}><Icon name={icon} size={20}/></span>
  <div className="grow"><div style={{fontWeight:600}}>{name}</div><div className="small muted">Checking…</div></div>
 </div>;
}

/**
 * Step 1: sign in to Claude or ChatGPT. The check of which accounts are signed in runs in the background (`check`, owned by Welcome),
 * so a screen that already knows the answer shows it at once, and the first time it says what it is doing, how long it takes and that Continue works meanwhile.
 */
export function ConnectStep({check,onReload,onConnected}:{check:AiCheck;onReload():void;onConnected(result?:ConnectResult):void}){
 const {status}=check;
 const connected=anyConnected(status);
 if(check.phase==='failed'&&!status)return <ErrorLine message={check.message} onRetry={onReload}/>;
 return <div style={{display:'flex',flexDirection:'column',gap:10}}>
  {check.phase==='checking'&&<ProgressLine label="Checking your AI accounts" line={status?'Checking again that your accounts are still signed in…':'Checking which accounts are signed in on this computer…'} estimate={ACCOUNT_CHECK_ESTIMATE} note="You can press Continue and carry on while it runs."/>}
  {check.phase==='failed'&&<ErrorLine message={check.message} onRetry={onReload}/>}
  <div className="card">
   {status
    ?<>
     <AiRow provider="claude" status={status.claude} primary={!connected} description="Recommended. Used for ideas, packaging, scenes and scripts." onChanged={onConnected}/>
     <AiRow provider="codex" status={status.codex} description="Works the same way, if that is the account you have." onChanged={onConnected}/>
    </>
    :<><PendingRow name="Claude" icon="ai"/><PendingRow name="ChatGPT" icon="assistant"/></>}
  </div>
  {status&&!connected&&<div className="small muted" style={{marginTop:4}}>Connect opens Claude's or ChatGPT's own sign-in page in your browser. Creator Compiler never sees your password.</div>}
 </div>;
}
