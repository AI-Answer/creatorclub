import {useCallback,useEffect,useState} from 'react';
import type {AiStatus} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {AiRow} from '../AiRow';
import {ErrorLine} from '../ErrorLine';
import {Spinner} from '../ui';

/** Step 1: sign in to Claude or ChatGPT. `onConnected` says whether either one is signed in, which is what lets Continue work. */
export function ConnectStep({onConnected}:{onConnected(connected:boolean):void}){
 const [status,setStatus]=useState<AiStatus|null>(null),[error,setError]=useState('');
 const load=useCallback(()=>{
  setError('');
  clubFetch<AiStatus>('/ai/status').then(setStatus,reason=>setError(errorMessage(reason)));
 },[]);
 useEffect(load,[load]);
 const connected=!!status&&(status.claude.signedIn||status.codex.signedIn);
 useEffect(()=>onConnected(connected),[connected,onConnected]);
 if(error)return <ErrorLine message={error} onRetry={load}/>;
 if(!status)return <Spinner label="Checking your AI" size={18}/>;
 return <div style={{display:'flex',flexDirection:'column',gap:10}}>
  <div className="card">
   <AiRow provider="claude" status={status.claude} primary={!connected} description="Recommended. Used for ideas, packaging, scenes and scripts." onChanged={load}/>
   <AiRow provider="codex" status={status.codex} description="Works the same way, if that is the account you have." onChanged={load}/>
  </div>
  <div className="small muted" style={{marginTop:4}}>Opens Claude's or ChatGPT's own sign-in page in your browser. CreatorClub never sees your password.</div>
 </div>;
}
