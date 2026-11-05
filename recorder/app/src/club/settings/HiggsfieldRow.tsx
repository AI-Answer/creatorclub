import {useEffect,useState} from 'react';
import type {HiggsfieldStatus} from '../../../shared/higgsfield';
import {clubFetch,errorMessage} from '../api';
import {Button,Icon} from '../ui';

export function HiggsfieldRow(){
 const [status,setStatus]=useState<HiggsfieldStatus>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const check=async()=>{setBusy(true);setError('');try{setStatus(await clubFetch<HiggsfieldStatus>('/higgsfield/status'));}catch(reason){setError(errorMessage(reason));}finally{setBusy(false);}};
 useEffect(()=>{void check();},[]);
 return <div className="srow"><span className="logo"><Icon name="image" size={25}/></span><div className="grow"><b>Higgsfield</b>
  <div className="small muted">{error||(!status?'Checking Higgsfield…':status.signedIn?`Connected as ${status.email}${status.plan?` · ${status.plan}`:''}${status.credits!==undefined?` · ${status.credits.toLocaleString()} credits`:''}`:status.hint)}</div>
  <div className="small muted">Makes thumbnails with your own Higgsfield account and credits.</div>
 </div><Button size="sm" disabled={busy} onClick={()=>void check()}>Check again</Button></div>;
}
