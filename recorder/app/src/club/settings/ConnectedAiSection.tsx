import {useCallback,useState,type FormEvent} from 'react';
import type {AiProvider,AiStatus,ClubSettings} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {AiRow} from '../AiRow';
import {ErrorLine} from '../ErrorLine';
import {connectLabel} from '../useConnect';
import {Button,Icon,Input,Tabs,type Tab} from '../ui';

/** Claude and ChatGPT sign in with your own accounts. Gemini is optional and takes your own API key. Which AI writes is chosen here too. */
export function ConnectedAiSection({status,settings,onStatus,onSettings}:{status:AiStatus;settings:ClubSettings;onStatus():void;onSettings(next:Partial<ClubSettings>):void}){
 return <section className="set-group" id="set-ai" aria-labelledby="set-ai-title"><h2 id="set-ai-title">Connected AI</h2><p>CreatorClub uses your own Claude or ChatGPT account. Nothing is billed here.</p>
  <div className="card">
   <AiRow settings provider="claude" status={status.claude} description="Used for ideas, packaging, scenes and scripts." onChanged={onStatus}/>
   <AiRow settings provider="codex" status={status.codex} description="Optional. Works the same way, if that is the account you have." onChanged={onStatus}/>
   <GeminiRow saved={settings.geminiKey} onChanged={geminiKey=>onSettings({geminiKey})}/>
  </div>
  <DefaultAi status={status} saved={settings.defaultAi} onSaved={defaultAi=>onSettings({defaultAi})}/>
 </section>;
}

const aiTabs:Tab<AiProvider>[]=[{id:'claude',label:'Claude'},{id:'codex',label:'ChatGPT'}];

function DefaultAi({status,saved,onSaved}:{status:AiStatus;saved:AiProvider|null;onSaved(provider:AiProvider):void}){
 const [error,setError]=useState<AiProvider|null>(null);
 const value:AiProvider=saved??(status.claude.signedIn?'claude':status.codex.signedIn?'codex':'claude');
 const choose=useCallback((provider:AiProvider)=>{
  setError(null);
  clubFetch('/settings',{method:'PUT',body:{defaultAi:provider}}).then(()=>onSaved(provider),()=>setError(provider));
 },[onSaved]);
 return <div style={{marginTop:18}}>
  <div className="field" id="default-ai-label">Use for writing and thinking</div>
  <Tabs label="Default AI" tabs={aiTabs} value={value} onChange={choose}/>
  {error&&<div style={{marginTop:10}}><ErrorLine message="Couldn't save that choice." onRetry={()=>choose(error)}/></div>}
  {!error&&!status[value].signedIn&&<p className="small muted" style={{margin:'8px 0 0'}}>{connectLabel[value]} is not connected yet.</p>}
 </div>;
}

/** Google is optional and takes the person's own Gemini API key, saved on this Mac. It only lets Break down watch YouTube videos. */
function GeminiRow({saved,onChanged}:{saved:string|null;onChanged(masked:string|null):void}){
 const [key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const save=async()=>{
  const value=key.trim();if(!value||busy)return;
  setBusy(true);setError('');
  try{const result=await clubFetch<{geminiKey:string|null}>('/settings/gemini-key',{method:'PUT',body:{key:value}});setKey('');onChanged(result.geminiKey);}
  catch(reason){setError(errorMessage(reason,"Couldn't save that key."));}
  finally{setBusy(false);}
 };
 const remove=async()=>{
  setBusy(true);setError('');
  try{await clubFetch('/settings/gemini-key',{method:'DELETE'});setKey('');onChanged(null);}
  catch(reason){setError(errorMessage(reason,"Couldn't remove that key."));}
  finally{setBusy(false);}
 };
 return <div className="srow" style={{alignItems:'flex-start'}}>
  <span className="logo logo-gemini"><Icon name="film" size={20}/></span>
  <div className="grow">
   <div style={{fontWeight:600}}>Gemini <span className="chip" style={{marginLeft:6}}>Optional</span></div>
   <div className="small muted" style={{marginBottom:10}}>Lets CreatorClub watch videos with sound and motion when it breaks them down.</div>
   {saved?<div className="row small"><span className="dotok"/>Key saved {saved} <button type="button" className="linkish" disabled={busy} onClick={()=>void remove()}>Remove key</button></div>
    :<form className="row" onSubmit={(event:FormEvent)=>{event.preventDefault();void save();}}>
      <Input type="password" aria-label="Gemini API key" autoComplete="off" spellCheck={false} value={key} placeholder="Paste your Gemini API key" style={{maxWidth:340}} onChange={event=>{setKey(event.target.value);setError('');}}/>
      <Button type="submit" disabled={!key.trim()||busy}>Save key</Button>
     </form>}
   {error&&<div style={{marginTop:10}}><ErrorLine message={error} onRetry={()=>{if(key.trim())void save();else setError('');}}/></div>}
  </div>
 </div>;
}
