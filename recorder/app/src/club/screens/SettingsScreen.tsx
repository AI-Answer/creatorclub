import {useCallback,useEffect,useState,type FormEvent,type ReactNode} from 'react';
import type {AiProvider,AiStatus,ClubSettings,ConnectProvider,Workspace} from '../../../shared/club';
import {getAppearance,setAppearance,type Appearance} from '../../appearance';
import {clubFetch,errorMessage} from '../api';
import {ConnectStatus} from '../ConnectStatus';
import {ErrorLine} from '../ErrorLine';
import {connectLabel,useConnect} from '../useConnect';
import {useJobRun} from '../useJobRun';
import {VoiceQuestions,voiceNeedsAnswers} from '../VoiceQuestions';
import {Badge,Button,Card,Input,Progress,Spinner,Tabs,Textarea,type Tab} from '../ui';
import {ScreenHeader} from './ScreenHeader';

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

/** Settings, Notion style: one column of sections. */
export function SettingsScreen({onAddChannel}:{onAddChannel():void}){
 const [data,setData]=useState<Loaded|null>(null);
 const [error,setError]=useState('');
 const refresh=useCallback(()=>{
  setError('');
  load().then(setData,reason=>setError(errorMessage(reason)));
 },[]);
 useEffect(refresh,[refresh]);
 const refreshStatus=useCallback(()=>{
  Promise.all([clubFetch<AiStatus>('/ai/status'),clubFetch<ClubSettings>('/settings')])
   .then(([status,settings])=>setData(current=>current&&{...current,status,settings}),()=>{});
 },[]);
 return <>
  <ScreenHeader title="Settings"/>
  <div className="min-h-0 flex-1 overflow-auto">
   <div className="flex w-full max-w-2xl flex-col gap-10 px-8 pt-4 pb-16">
    {error?<ErrorLine message={error} onRetry={refresh} primary/>
     :!data?<div className="flex justify-center py-12"><Spinner label="Loading settings"/></div>
     :<>
      <Section title="Connected AI" description="CreatorClub uses your own accounts. Nothing to paste.">
       <ConnectedAi status={data.status} geminiKey={data.settings.geminiKey} onChanged={refreshStatus} onKeyChanged={geminiKey=>setData({...data,settings:{...data.settings,geminiKey}})}/>
      </Section>
      <Section title="Default AI" description="The AI that does the writing and thinking.">
       <DefaultAi status={data.status} saved={data.settings.defaultAi} onSaved={defaultAi=>setData({...data,settings:{...data.settings,defaultAi}})}/>
      </Section>
      <Section title="Channel" description="What CreatorClub knows about you.">
       {data.workspace?<ChannelForm key={data.workspace.slug} workspace={data.workspace} onSaved={workspace=>setData({...data,workspace})}/>
        :<div className="flex items-center gap-3"><p className="text-base text-muted">No channel yet.</p><Button size="sm" onClick={onAddChannel}>Add your channel</Button></div>}
      </Section>
      <Section title="Appearance"><AppearancePicker/></Section>
     </>}
   </div>
  </div>
 </>;
}

function Section({title,description,children}:{title:string;description?:string;children:ReactNode}){
 const id=`settings-${title.toLowerCase().replace(/\W+/g,'-')}`;
 return <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
  <div className="flex flex-col gap-1">
   <h2 id={id} className="text-lg font-semibold">{title}</h2>
   {description&&<p className="text-base text-muted">{description}</p>}
  </div>
  {children}
 </section>;
}

// ---------------------------------------------------------------- connected AI

const cards:{provider:ConnectProvider}[]=[{provider:'claude'},{provider:'codex'}];

function ConnectedAi({status,geminiKey,onChanged,onKeyChanged}:{status:AiStatus;geminiKey:string|null;onChanged():void;onKeyChanged(masked:string|null):void}){
 return <Card className="divide-y divide-line">
  {cards.map(card=><AiCard key={card.provider} {...card} status={status[card.provider]} onChanged={onChanged}/>)}
  <GeminiKeyCard saved={geminiKey} onChanged={onKeyChanged}/>
 </Card>;
}

/** Google is optional and takes the person's own Gemini API key, saved on this Mac. It only lets Break down watch YouTube videos. */
function GeminiKeyCard({saved,onChanged}:{saved:string|null;onChanged(masked:string|null):void}){
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
 return <div className="flex flex-col gap-3 px-4 py-3">
  <div className="min-w-0">
   <div className="flex items-center gap-2"><p className="text-base font-medium">Google</p><Badge>Optional</Badge></div>
   <p className="text-sm text-muted">{saved?`Key saved ${saved}`:'No key saved'}</p>
   <p className="text-sm text-muted">Lets CreatorClub watch YouTube videos with sound and motion.</p>
  </div>
  <form onSubmit={(event:FormEvent)=>{event.preventDefault();void save();}} className="flex items-center gap-2">
   <Input type="password" aria-label="Gemini API key" placeholder="Gemini API key" autoComplete="off" spellCheck={false} value={key} onChange={event=>{setKey(event.target.value);setError('');}}/>
   <Button type="submit" size="sm" disabled={!key.trim()||busy}>Save key</Button>
   {saved&&<Button size="sm" variant="ghost" disabled={busy} onClick={remove}>Remove key</Button>}
  </form>
  {error&&<ErrorLine message={error} onRetry={()=>{if(key.trim())void save();else setError('');}}/>}
 </div>;
}

function AiCard({provider,status,onChanged}:{provider:ConnectProvider;status:AiStatus[ConnectProvider];onChanged():void}){
 const {state,start,cancel}=useConnect(onChanged);
 const name=connectLabel[provider];
 const busy=state.phase==='installing'||state.phase==='signing-in';
 return <div className="flex flex-col gap-3 px-4 py-3">
  <div className="flex items-center gap-4">
   <div className="min-w-0 flex-1">
    <div className="flex items-center gap-2">
     <p className="text-base font-medium">{name}</p>
    </div>
    <p className="text-sm text-muted">{status.signedIn?(status.account?`Connected as ${status.account}`:'Connected'):'Not connected'}</p>
   </div>
   {!busy&&<Button size="sm" aria-label={`${status.signedIn?'Reconnect':'Connect'} ${name}`} onClick={()=>start(provider,status.signedIn)}>{status.signedIn?'Reconnect':'Connect'}</Button>}
  </div>
  {state.phase!=='idle'&&state.phase!=='connected'&&<ConnectStatus state={state} provider={provider} onRetry={()=>start(provider,status.signedIn)} onCancel={cancel}/>}
 </div>;
}

// ---------------------------------------------------------------- default AI

const aiTabs:Tab<AiProvider>[]=[{id:'claude',label:'Claude'},{id:'codex',label:'ChatGPT'}];

function DefaultAi({status,saved,onSaved}:{status:AiStatus;saved:AiProvider|null;onSaved(provider:AiProvider):void}){
 const [error,setError]=useState<AiProvider|null>(null);
 const value:AiProvider=saved??(status.claude.signedIn?'claude':status.codex.signedIn?'codex':'claude');
 const choose=useCallback((provider:AiProvider)=>{
  setError(null);
  clubFetch<ClubSettings>('/settings',{method:'PUT',body:{defaultAi:provider}}).then(()=>onSaved(provider),()=>setError(provider));
 },[onSaved]);
 return <div className="flex flex-col gap-3">
  <div><Tabs label="Default AI" tabs={aiTabs} value={value} onChange={choose}/></div>
  {error&&<ErrorLine message="Couldn't save that choice." onRetry={()=>choose(error)}/>}
  {!error&&!status[value].signedIn&&<p className="text-sm text-muted">{connectLabel[value]} is not connected yet.</p>}
 </div>;
}

// ---------------------------------------------------------------- channel

const topicsText=(topics:string[])=>topics.join(', ');
const parseTopics=(text:string)=>text.split(',').map(topic=>topic.trim()).filter(Boolean);

function ChannelForm({workspace,onSaved}:{workspace:Workspace;onSaved(workspace:Workspace):void}){
 const [name,setName]=useState(workspace.name),[handle,setHandle]=useState(workspace.handle),[topics,setTopics]=useState(topicsText(workspace.topics)),[about,setAbout]=useState(workspace.about);
 const [saving,setSaving]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');
 const voice=useJobRun();
 const [answered,setAnswered]=useState(false);
 const dirty=name!==workspace.name||handle!==workspace.handle||topics!==topicsText(workspace.topics)||about!==workspace.about;
 const edit=(set:(value:string)=>void)=>(value:string)=>{set(value);setSaved(false);};
 const save=useCallback(async()=>{
  setSaving(true);setError('');
  try{
   const updated=await clubFetch<Workspace>(`/workspaces/${encodeURIComponent(workspace.slug)}`,{method:'PUT',body:{name:name.trim(),handle:handle.trim(),topics:parseTopics(topics),about}});
   setName(updated.name);setHandle(updated.handle);setTopics(topicsText(updated.topics));setAbout(updated.about);
   onSaved(updated);setSaved(true);
  }catch(reason){setError(errorMessage(reason));}
  finally{setSaving(false);}
 },[workspace.slug,name,handle,topics,about,onSaved]);
 const rebuild=()=>{setAnswered(false);void voice.run(()=>clubFetch(`/workspaces/${encodeURIComponent(workspace.slug)}/voice`,{method:'POST',body:{}}));};
 const answers=()=>{setAnswered(true);clubFetch<Workspace>(`/workspaces/${encodeURIComponent(workspace.slug)}`).then(updated=>{setAbout(updated.about);onSaved(updated);},()=>{});};
 return <div className="flex flex-col gap-5">
  <Card className="flex flex-col gap-4 p-4">
   <Field label="Name"><Input value={name} onChange={event=>edit(setName)(event.target.value)}/></Field>
   <Field label="Handle"><Input value={handle} placeholder="@yourchannel" autoComplete="off" spellCheck={false} onChange={event=>edit(setHandle)(event.target.value)}/></Field>
   <Field label="Topics" help="Separate with commas."><Input value={topics} onChange={event=>edit(setTopics)(event.target.value)}/></Field>
   <Field label="About"><Textarea value={about} rows={4} onChange={event=>edit(setAbout)(event.target.value)}/></Field>
   <div className="flex items-center gap-3">
    <Button variant="primary" disabled={!dirty||saving||!name.trim()} onClick={save}>Save changes</Button>
    {saved&&!dirty&&<p role="status" className="text-sm text-muted">Saved</p>}
   </div>
   {error&&<ErrorLine message={error} onRetry={save}/>}
  </Card>
  <div className="flex flex-col gap-2">
   <div className="flex items-center gap-3">
    <Button disabled={voice.state.phase==='running'} onClick={rebuild}>Rebuild voice guide</Button>
    {voice.state.phase==='done'&&(!voiceNeedsAnswers(voice.state.result)||answered)&&<p role="status" className="text-sm text-muted">{answered?'Saved your voice guide':'Rebuilt your voice guide'}</p>}
   </div>
   <p className="text-sm text-muted">Learns how you talk again from your latest videos.</p>
   {voice.state.phase==='running'&&<div className="flex flex-col gap-2" aria-live="polite">
    <p className="text-base text-muted">{voice.state.line??'Writing your voice guide…'}</p>
    <Progress label="Rebuilding your voice guide"/>
   </div>}
   {voice.state.phase==='failed'&&<ErrorLine message={voice.state.message} onRetry={rebuild}/>}
   {voice.state.phase==='done'&&voiceNeedsAnswers(voice.state.result)&&!answered&&<Card className="flex flex-col gap-3 p-4">
    <p className="text-base text-muted">We couldn't read enough of your videos. Answer three questions instead.</p>
    <VoiceQuestions slug={workspace.slug} onDone={answers}/>
   </Card>}
  </div>
 </div>;
}

function Field({label,help,children}:{label:string;help?:string;children:ReactNode}){
 return <label className="flex flex-col gap-1.5">
  <span className="text-sm font-medium">{label}</span>
  {children}
  {help&&<span className="text-sm text-muted">{help}</span>}
 </label>;
}

// ---------------------------------------------------------------- appearance

const appearanceTabs:Tab<Appearance>[]=[{id:'system',label:'System'},{id:'light',label:'Light'},{id:'dark',label:'Dark'}];

function AppearancePicker(){
 const [value,setValue]=useState<Appearance>(()=>getAppearance());
 return <div><Tabs label="Appearance" tabs={appearanceTabs} value={value} onChange={next=>{setAppearance(next);setValue(next);}}/></div>;
}
