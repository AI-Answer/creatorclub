import {rememberAiStatus} from '../ai-status';
import {useCallback,useEffect,useState} from 'react';
import type {AiStatus,ClubSettings,Workspace} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {AgentSection} from '../settings/AgentSection';
import {ChannelSection} from '../settings/ChannelSection';
import {ConnectedAiSection} from '../settings/ConnectedAiSection';
import {PublishingSection} from '../settings/PublishingSection';
import {SkillsSection} from '../settings/SkillsSection';
import {usePublishing} from '../publishing/usePublishing';
import type {SettingsSection} from '../routes';
import {Icon,cn,type IconName} from '../ui';

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
const TARGET:Record<SettingsSection,string>={ai:'set-ai',agent:'set-agent',channel:'set-channel',followed:'set-followed',sources:'set-sources',skills:'set-skills',publishing:'set-publishing'};

/** The page's shape while the settings are read: the three groups as grey blocks, so nothing jumps when they arrive. */
function SettingsSkeleton(){
 const group=(rows:number,key:number)=><div key={key} className="set-group" aria-hidden>
  <div className="shimmer" style={{height:18,width:150,marginBottom:10}}/><div className="shimmer" style={{height:12,width:'55%',marginBottom:16}}/>
  <div className="card" style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>{Array.from({length:rows},(_,i)=><div key={i} className="shimmer" style={{height:34}}/>)}</div>
 </div>;
 return <div aria-busy="true" aria-label="Loading settings" className="set-skel">{[3,2,2].map(group)}</div>;
}

type Tab='ai'|'agent'|'channel'|'skills'|'publishing';
/** Borumi's Settings nav: one tab per group, each with its icon. Followed channels and signal sources open the Channel tab. */
const TABS:ReadonlyArray<{key:Tab;label:string;icon:IconName}>=[
 {key:'ai',label:'AI',icon:'ai'},{key:'agent',label:'Your AI agent',icon:'connect'},{key:'channel',label:'Channel',icon:'video'},{key:'skills',label:'Skills',icon:'draft'},{key:'publishing',label:'Publishing & look',icon:'upload'},
];
const tabFor=(section?:SettingsSection):Tab=>section==='followed'||section==='sources'?'channel':section??'ai';

/**
 * Settings, laid out like Borumi's: a 256px nav on the left (the title, then one row per group) and the chosen group on the right.
 * The groups: Connected AI, Channel, Skills, and Publishing and look. Connected AI, Channel, and Publishing and look. `onSetup` opens first launch to add or set up a channel.
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
  clubFetch<AiStatus>('/ai/status').then(status=>{rememberAiStatus(status);setStatus(status);},reason=>setStatusError(errorMessage(reason,"Couldn't check the connected AI.")));
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
 const tab=tabFor(linked);
 return <div className="settings-layout-b">
  <nav className="settings-nav" aria-label="Settings">
   <h1>Settings</h1>
   {TABS.map(({key,label,icon})=><a key={key} href={`#/settings/${key}`} className={cn('settings-tab',tab===key&&'on')} aria-current={tab===key?'page':undefined}><Icon name={icon} size={16}/>{label}</a>)}
  </nav>
  <div className="settings-body-b page settings-page">
   {error?<ErrorLine message={error} onRetry={refresh} primary/>
    :!data?<SettingsSkeleton/>
    :<>
      {tab==='ai'&&<ConnectedAiSection status={status} statusError={statusError} settings={data.settings} onStatus={refreshStatus} onSettings={change=>setData({...data,settings:{...data.settings,...change}})}/>}
      {tab==='agent'&&<AgentSection/>}
      {tab==='channel'&&<ChannelSection workspace={data.workspace} focus={linked==='followed'||linked==='sources'?linked:undefined} onSaved={workspace=>setData({...data,workspace})} onSetup={onSetup}/>}
      {tab==='skills'&&<SkillsSection/>}
      {tab==='publishing'&&<PublishingSection publishing={publishing.state} error={publishing.error} onReload={publishing.reload} onPublishing={publishing.setState} savedTheme={data.settings.appearance}/>}
    </>}
  </div>
 </div>;
}
