import {useEffect,useState} from 'react';
import type {MCPSettings} from '../../../shared/types';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {mcpSetup,type MCPInfo} from '../../mcp-setup';
import {Button,Card,Icon,Spinner,useToast} from '../ui';
import {BrandLogo} from '../../BrandLogo';

type AgentApp='claude'|'codex';
const APP_LABEL:Record<AgentApp,string>={claude:'Claude Code',codex:'Codex'};

/** What an agent connected here can do, in the words the app uses. */
export const AGENT_CAN=[
 'Read your channel: who it is for and how it sounds',
 'Read and add to video boards and the Channel board: notes, links, frames and connections',
 'Plan a video: titles, hook, scenes and scripts',
 'Edit the recording: cut pauses and filler words, captions, zooms, text and motion graphics',
 'Export the finished video',
] as const;

async function readJSON<T>(url:string,init?:RequestInit):Promise<T>{
 const response=await fetch(url,init);
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error((body as {error?:string}).error||`Request failed (${response.status})`);
 return body as T;
}

/**
 * Settings › Your AI agent: lets Claude Code, Codex or any MCP app work in Creator Compiler with the person's own agent. One switch
 * allows it; Claude Code and Codex are added with one click (their own `mcp add`); other apps get the entry to paste.
 */
export function AgentSection(){
 const toast=useToast();
 const [info,setInfo]=useState<MCPInfo|null|undefined>(undefined),[settings,setSettings]=useState<MCPSettings|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState<AgentApp|'switch'|null>(null),[added,setAdded]=useState<AgentApp[]>(()=>{try{return JSON.parse(localStorage.getItem('cc.agent.added')??'[]').filter((app:unknown)=>app==='claude'||app==='codex');}catch{return [];}}),[other,setOther]=useState(false);
 const load=()=>{
  setError('');
  Promise.all([readJSON<{mcp?:MCPInfo}>('/api/health'),readJSON<MCPSettings>('/api/mcp/settings')])
   .then(([health,saved])=>{setInfo(health.mcp??null);setSettings(saved);},reason=>setError(errorMessage(reason,"Couldn't read the agent settings.")));
 };
 useEffect(load,[]);
 const enabled=settings?.enabled??true;
 const toggle=()=>{
  setBusy('switch');
  readJSON<MCPSettings>('/api/mcp/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:!enabled})})
   .then(setSettings,reason=>toast(errorMessage(reason,"Couldn't save that."),{refused:true})).finally(()=>setBusy(null));
 };
 const connect=(app:AgentApp)=>{
  setBusy(app);
  clubFetch('/agent/connect',{body:{app}})
   .then(()=>{setAdded(current=>{const next=[...new Set([...current,app])];try{localStorage.setItem('cc.agent.added',JSON.stringify(next));}catch{/* keep the successful connection in this session */}return next;});toast(`Added to ${APP_LABEL[app]}. Start a new session there to use it.`);},reason=>toast(errorMessage(reason,`Couldn't add it to ${APP_LABEL[app]}.`),{refused:true}))
   .finally(()=>setBusy(null));
 };
 const copy=(text:string)=>{navigator.clipboard?.writeText(text).then(()=>toast('Copied'),()=>toast("Couldn't copy that.",{refused:true}));};
 const config=info?mcpSetup('other',info).blocks[0]?.text:'';
 const appRow=(app:AgentApp)=><div key={app} className="srow2">
  <span className={`logo ${app==='claude'?'logo-claude':'logo-codex'}`}><BrandLogo brand={app==='claude'?'claude':'chatgpt'} size={22}/></span>
  <div className="grow" style={{minWidth:0}}><div className="st">{APP_LABEL[app]}</div><div className="sd">{added.includes(app)?'Connected':`Work on your videos from ${APP_LABEL[app]}.`}</div></div>
  <Button size="sm" variant="secondary" disabled={!enabled||!!busy} onClick={()=>added.includes(app)?setOther(true):connect(app)}>{busy===app?<span className="spin"/>:<Icon name={added.includes(app)?'check':'add'} size={14}/>}{added.includes(app)?'Manage':`Add to ${APP_LABEL[app]}`}</Button>
 </div>;
 return <section className="set-group" id="set-agent" aria-labelledby="set-agent-title"><h2 id="set-agent-title">Your AI agent</h2>
  <p>Work on your videos from Claude Code, Codex or another AI app. You can undo every change.</p>
  <Card>
   {error?<div style={{padding:16}}><ErrorLine message={error} onRetry={load}/></div>:info===undefined||!settings?<div className="row small muted" role="status" style={{padding:16}}><Spinner label="Reading the agent settings"/>Reading the agent settings…</div>:<>
    <div className="srow2">
     <div className="grow"><div className="st">Allow AI agents</div><div className="sd">{enabled?'Connected agents can read and change your videos.':'Connected agents are told it is turned off.'}</div></div>
     <button type="button" role="switch" aria-checked={enabled} aria-label="Allow AI agents" className="sk-switch" disabled={busy==='switch'} onClick={toggle}><span/></button>
    </div>
    {info===null?<div className="srow2 sd">This copy of Creator Compiler has no agent connector. It comes with the installed app.</div>:<>
     {appRow('claude')}{appRow('codex')}
     <div className="srow2">
      <div className="grow" style={{minWidth:0}}><div className="st">Other apps</div><div className="sd">Connect another AI app to your videos.</div>
       {other&&<div className="agent-setup-details"><p className="sd">Add this entry to your AI app’s MCP settings using stdio.</p><pre className="agent-config" aria-label="MCP configuration">{config}</pre></div>}</div>
      {other?<Button size="sm" variant="secondary" onClick={()=>copy(config)}><Icon name="copy" size={14}/>Copy</Button>:<Button size="sm" variant="secondary" onClick={()=>setOther(true)}>Show setup details</Button>}
     </div>
    </>}
   </>}
  </Card>
  <h3 className="agent-can-h">What your agent can do</h3>
  <Card><ul className="agent-can">{AGENT_CAN.map(line=><li key={line}><Icon name="check" size={14}/>{line}</li>)}</ul></Card>
  <p className="small muted">In a video, open <b>⋯</b> and choose <b>Copy prompt for your AI agent</b> to hand it that video.</p>
 </section>;
}
