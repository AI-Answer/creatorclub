import {useCallback,useEffect,useState} from 'react';
import type {AiStatus,ClubSettings,Workspace} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {AppearanceSection} from '../settings/AppearanceSection';
import {ChannelSection} from '../settings/ChannelSection';
import {ConnectedAiSection} from '../settings/ConnectedAiSection';
import {Icon,Spinner,type IconName} from '../ui';

type Loaded={status:AiStatus;settings:ClubSettings;workspace:Workspace|null};

async function load():Promise<Loaded>{
 const [status,settings,list]=await Promise.all([
  clubFetch<AiStatus>('/ai/status'),
  clubFetch<ClubSettings>('/settings'),
  clubFetch<{current:string|null}>('/workspaces'),
 ]);
 const workspace=list.current?await clubFetch<Workspace>(`/workspaces/${encodeURIComponent(list.current)}`):null;
 return {status,settings,workspace};
}

const SECTIONS:readonly {id:string;label:string;icon:IconName}[]=[
 {id:'set-ai',label:'Connected AI',icon:'Bot'},
 {id:'set-channel',label:'Channel',icon:'Youtube'},
 {id:'set-appearance',label:'Appearance',icon:'Sun'},
];

/** Settings: Connected AI, Channel and Appearance, with a list on the left to jump between them. `onSetup` opens first launch to add or set up a channel. */
export function SettingsScreen({onSetup}:{onSetup():void}){
 const [data,setData]=useState<Loaded|null>(null),[error,setError]=useState('');
 const [section,setSection]=useState(SECTIONS[0].id);
 const refresh=useCallback(()=>{
  setError('');
  load().then(setData,reason=>setError(errorMessage(reason)));
 },[]);
 useEffect(refresh,[refresh]);
 const refreshStatus=useCallback(()=>{
  Promise.all([clubFetch<AiStatus>('/ai/status'),clubFetch<ClubSettings>('/settings')])
   .then(([status,settings])=>setData(current=>current&&{...current,status,settings}),()=>{});
 },[]);
 const jump=(id:string)=>{setSection(id);document.getElementById(id)?.scrollIntoView?.({behavior:'smooth',block:'start'});};
 return <div className="page" style={{maxWidth:1040}}>
  <div className="page-head"><div><h1>Settings</h1><div className="lede">Your AI, your channel, and how CreatorClub looks.</div></div></div>
  {error?<ErrorLine message={error} onRetry={refresh} primary/>
   :!data?<div className="flex justify-center py-12"><Spinner label="Loading settings"/></div>
   :<div className="set">
    <nav className="set-nav" aria-label="Settings sections">{SECTIONS.map(item=><button key={item.id} type="button" className={`nav-item${section===item.id?' active':''}`} aria-current={section===item.id?'true':undefined} onClick={()=>jump(item.id)}><Icon name={item.icon} size={16}/><span className="label">{item.label}</span></button>)}</nav>
    <div>
     <ConnectedAiSection status={data.status} settings={data.settings} onStatus={refreshStatus} onSettings={change=>setData({...data,settings:{...data.settings,...change}})}/>
     <ChannelSection workspace={data.workspace} onSaved={workspace=>setData({...data,workspace})} onSetup={onSetup}/>
     <AppearanceSection saved={data.settings.appearance}/>
    </div>
   </div>}
 </div>;
}
