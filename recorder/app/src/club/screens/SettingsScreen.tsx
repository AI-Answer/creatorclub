import {useCallback,useEffect,useState} from 'react';
import type {AiStatus,ClubSettings,Workspace} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {ChannelSection} from '../settings/ChannelSection';
import {ConnectedAiSection} from '../settings/ConnectedAiSection';
import {PublishingSection} from '../settings/PublishingSection';
import {usePublishing} from '../publishing/usePublishing';
import type {SettingsSection} from '../routes';

type Loaded={settings:ClubSettings;workspace:Workspace|null};

/** The settings and the current channel: quick reads of saved files. The AI check is read on its own, because it is slow. */
async function load():Promise<Loaded>{
 const [settings,workspace]=await Promise.all([
  clubFetch<ClubSettings>('/settings'),
  clubFetch<{current:string|null}>('/workspaces').then(list=>list.current?clubFetch<Workspace>(`/workspaces/${encodeURIComponent(list.current)}`):null),
 ]);
 return {settings,workspace};
}

/** The element a link's section scrolls to. Followed channels and signal sources sit inside Channel. */
const TARGET:Record<SettingsSection,string>={ai:'set-ai',channel:'set-channel',followed:'set-followed',sources:'set-sources',publishing:'set-publishing'};

/** The page's shape while the settings are read: the three groups as grey blocks, so nothing jumps when they arrive. */
function SettingsSkeleton(){
 const group=(rows:number,key:number)=><div key={key} className="set-group" aria-hidden>
  <div className="shimmer" style={{height:18,width:150,marginBottom:10}}/><div className="shimmer" style={{height:12,width:'55%',marginBottom:16}}/>
  <div className="card" style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>{Array.from({length:rows},(_,i)=><div key={i} className="shimmer" style={{height:34}}/>)}</div>
 </div>;
 return <div aria-busy="true" aria-label="Loading settings" className="set-skel">{[3,2,2].map(group)}</div>;
}

/**
 * Settings, three groups on one page: Connected AI, Channel, and Publishing and look. `onSetup` opens first launch to add or set up a channel.
 * The page shows as soon as the saved settings are read; the AI rows follow when the slower AI check answers (a skeleton until then).
 * A link to a `section` (`#/settings/followed`) scrolls there once the settings are loaded; the followed channels' or the signal sources' first input is focused.
 */
export function SettingsScreen({section:linked,onSetup}:{section?:SettingsSection;onSetup():void}){
 const [data,setData]=useState<Loaded|null>(null),[error,setError]=useState('');
 const [status,setStatus]=useState<AiStatus|null>(null),[statusError,setStatusError]=useState('');
 const publishing=usePublishing();
 const ready=data!==null;
 useEffect(()=>{
  if(!linked||!ready)return;
  document.getElementById(TARGET[linked])?.scrollIntoView?.({block:'start'});
 },[linked,ready]);
 const readStatus=useCallback(()=>{
  setStatusError('');
  clubFetch<AiStatus>('/ai/status').then(setStatus,reason=>setStatusError(errorMessage(reason,"Couldn't check the connected AI.")));
 },[]);
 const refresh=useCallback(()=>{
  setError('');
  load().then(setData,reason=>setError(errorMessage(reason)));
 },[]);
 useEffect(()=>{refresh();readStatus();},[refresh,readStatus]);
 const refreshStatus=useCallback(()=>{
  readStatus();
  clubFetch<ClubSettings>('/settings').then(settings=>setData(current=>current&&{...current,settings}),()=>{});
 },[readStatus]);
 return <div className="page settings-page">
  <div className="page-head"><div><h1>Settings</h1><div className="lede">Your AI, your channel, and how videos get published.</div></div></div>
  {error?<ErrorLine message={error} onRetry={refresh} primary/>
   :!data?<SettingsSkeleton/>
   :<>
     <ConnectedAiSection status={status} statusError={statusError} settings={data.settings} onStatus={refreshStatus} onSettings={change=>setData({...data,settings:{...data.settings,...change}})}/>
     <ChannelSection workspace={data.workspace} focus={linked==='followed'||linked==='sources'?linked:undefined} onSaved={workspace=>setData({...data,workspace})} onSetup={onSetup}/>
     <PublishingSection publishing={publishing.state} error={publishing.error} onReload={publishing.reload} onPublishing={publishing.setState} savedTheme={data.settings.appearance}/>
   </>}
 </div>;
}
