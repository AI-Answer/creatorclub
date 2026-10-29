import {useCallback,useEffect,useState} from 'react';
import type {AiStatus,ClubSettings,Workspace} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {ChannelSection} from '../settings/ChannelSection';
import {ConnectedAiSection} from '../settings/ConnectedAiSection';
import {PublishingSection} from '../settings/PublishingSection';
import {usePublishing} from '../publishing/usePublishing';
import type {SettingsSection} from '../routes';
import {Spinner} from '../ui';

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

/** The element a link's section scrolls to. Followed channels and signal sources sit inside Channel. */
const TARGET:Record<SettingsSection,string>={ai:'set-ai',channel:'set-channel',followed:'set-followed',sources:'set-sources',publishing:'set-publishing'};

/**
 * Settings, three groups on one page: Connected AI, Channel, and Publishing and look. `onSetup` opens first launch to add or set up a channel.
 * A link to a `section` (`#/settings/followed`) scrolls there once the settings are loaded; the followed channels' or the signal sources' first input is focused.
 */
export function SettingsScreen({section:linked,onSetup}:{section?:SettingsSection;onSetup():void}){
 const [data,setData]=useState<Loaded|null>(null),[error,setError]=useState('');
 const publishing=usePublishing();
 const ready=data!==null;
 useEffect(()=>{
  if(!linked||!ready)return;
  document.getElementById(TARGET[linked])?.scrollIntoView?.({block:'start'});
 },[linked,ready]);
 const refresh=useCallback(()=>{
  setError('');
  load().then(setData,reason=>setError(errorMessage(reason)));
 },[]);
 useEffect(refresh,[refresh]);
 const refreshStatus=useCallback(()=>{
  Promise.all([clubFetch<AiStatus>('/ai/status'),clubFetch<ClubSettings>('/settings')])
   .then(([status,settings])=>setData(current=>current&&{...current,status,settings}),()=>{});
 },[]);
 return <div className="page" style={{maxWidth:760}}>
  <div className="page-head"><div><h1>Settings</h1><div className="lede">Your AI, your channel, and how videos get published.</div></div></div>
  {error?<ErrorLine message={error} onRetry={refresh} primary/>
   :!data?<div className="flex justify-center py-12"><Spinner label="Loading settings"/></div>
   :<>
     <ConnectedAiSection status={data.status} settings={data.settings} onStatus={refreshStatus} onSettings={change=>setData({...data,settings:{...data.settings,...change}})}/>
     <ChannelSection workspace={data.workspace} focus={linked==='followed'||linked==='sources'?linked:undefined} onSaved={workspace=>setData({...data,workspace})} onSetup={onSetup}/>
     <PublishingSection publishing={publishing.state} error={publishing.error} onReload={publishing.reload} onPublishing={publishing.setState} savedTheme={data.settings.appearance}/>
   </>}
 </div>;
}
