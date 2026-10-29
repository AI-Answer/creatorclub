import {useCallback,useEffect,useState,type ReactNode} from 'react';
import {AUDIENCE_LABELS,type VoiceGuideSummary,type Workspace} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {useJobRun} from '../useJobRun';
import {VoiceQuestions,voiceNeedsAnswers} from '../VoiceQuestions';
import {topicLabel} from '../format';
import {handleLabel} from '../settings';
import {addTopic,toggle} from '../welcome';
import {Avatar,Button,Card,Icon,Input,Progress,Textarea} from '../ui';
import {FollowedChannels,SignalSources} from './Lists';
import {TagEditor} from './TagEditor';

function Field({label,help,children}:{label:string;help?:string;children:ReactNode}){
 return <label style={{display:'block'}}><span className="field">{label}</span>{children}{help&&<span className="small muted" style={{display:'block',marginTop:6}}>{help}</span>}</label>;
}

const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((item,index)=>item===b[index]);
const labels:readonly string[]=AUDIENCE_LABELS;

type Row='channel'|'follow'|'voice';

/**
 * What CreatorClub knows about the channel, as three rows that open in place: the channel itself (name, topics, who it's for),
 * the channels you follow and where signals come from, and how you sound. Nothing is edited until a row is opened.
 */
export function ChannelSection({workspace,focus,onSaved,onSetup}:{workspace:Workspace|null;focus?:'followed'|'sources';onSaved(workspace:Workspace):void;onSetup():void}){
 const [open,setOpen]=useState<readonly Row[]>(focus?['follow']:[]);
 const toggle=(row:Row)=>setOpen(now=>now.includes(row)?now.filter(item=>item!==row):[...now,row]);
 return <section className="set-group" id="set-channel" aria-labelledby="set-channel-title"><h2 id="set-channel-title">Channel</h2><p>What CreatorClub knows about your channel. It shapes every idea and script.</p>
  {workspace
   ?<Card>
    <Fold title={workspace.name} summary={<>{handleLabel(workspace.handle)||'No YouTube channel yet'}{workspace.channelUrl&&<a style={{marginLeft:8,color:'var(--cc-accent-text)'}} href={workspace.channelUrl} target="_blank" rel="noopener noreferrer">Open on YouTube</a>}{workspace.topics.length>0&&<span className="faint"> · {workspace.topics.map(topicLabel).join(', ')}</span>}</>}
     lead={<Avatar name={workspace.name} size="lg"/>} verb="Edit" noun="channel" open={open.includes('channel')} onToggle={()=>toggle('channel')}>
     <ChannelForm key={workspace.slug} workspace={workspace} onSaved={onSaved} onSetup={onSetup}/>
    </Fold>
    <Fold id="set-followed" title="Channels you follow" summary="Working now and Signals look here for what is doing well." verb="Manage" noun="follows" open={open.includes('follow')} onToggle={()=>toggle('follow')}>
     <div className="fold-pad"><FollowedChannels key={`followed-${workspace.slug}`} focus={focus==='followed'}/><SignalSources key={`signals-${workspace.slug}`} focus={focus==='sources'} topics={workspace.topics}/></div>
    </Fold>
    <Fold title="How you sound" summary="How CreatorClub writes like you." verb="Edit" noun="voice" open={open.includes('voice')} onToggle={()=>toggle('voice')}>
     <div className="fold-pad"><VoiceGuide key={`voice-${workspace.slug}`} workspace={workspace} onSaved={onSaved}/></div>
    </Fold>
   </Card>
   :<Card className="p-4"><div className="row"><p className="muted" style={{margin:0}}>No channel yet.</p><Button size="sm" variant="primary" onClick={onSetup}>Add your channel</Button></div></Card>}
 </section>;
}

/** A row of a group: what it is, a button that opens it in place, and the editing inside while open. */
function Fold({id,title,summary,lead,verb,noun,open,onToggle,children}:{id?:string;title:string;summary:ReactNode;lead?:ReactNode;verb:'Edit'|'Manage';noun:string;open:boolean;onToggle():void;children:ReactNode}){
 return <div className="fold" id={id}>
  <div className="srow2">{lead}<div className="grow" style={{minWidth:0}}><div className="st">{title}</div><div className="sd">{summary}</div></div>
   <div className="sv"><Button size="sm" aria-expanded={open} aria-label={`${open?'Close':verb} ${noun}`} onClick={onToggle}>{open?'Close':verb}</Button></div></div>
  {open&&<div className="fold-body">{children}</div>}
 </div>;
}

function ChannelForm({workspace,onSaved,onSetup}:{workspace:Workspace;onSaved(workspace:Workspace):void;onSetup():void}){
 const [name,setName]=useState(workspace.name),[person,setPerson]=useState(workspace.person??''),[handle,setHandle]=useState(workspace.handle);
 const [topics,setTopics]=useState(workspace.topics),[audience,setAudience]=useState(workspace.audience),[about,setAbout]=useState(workspace.about),[cta,setCta]=useState(workspace.cta);
 const [other,setOther]=useState('');
 const [saving,setSaving]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');
 const dirty=name!==workspace.name||person!==(workspace.person??'')||handle!==workspace.handle||about!==workspace.about||cta!==workspace.cta||!same(topics,workspace.topics)||!same(audience,workspace.audience);
 const edit=<T,>(set:(value:T)=>void)=>(value:T)=>{set(value);setSaved(false);};
 const save=useCallback(async()=>{
  setSaving(true);setError('');
  try{
   const updated=await clubFetch<Workspace>(`/workspaces/${encodeURIComponent(workspace.slug)}`,{method:'PUT',body:{name:name.trim(),person:person.trim(),handle:handle.trim(),topics,audience,about,cta}});
   setName(updated.name);setPerson(updated.person??'');setHandle(updated.handle);setTopics(updated.topics);setAudience(updated.audience);setAbout(updated.about);setCta(updated.cta);
   onSaved(updated);setSaved(true);
  }catch(reason){setError(errorMessage(reason));}
  finally{setSaving(false);}
 },[workspace.slug,name,person,handle,topics,audience,about,cta,onSaved]);
 const audiences=[...labels,...audience.filter(item=>!labels.includes(item))];
 const addAudience=()=>{edit(setAudience)(addTopic(audience,other));setOther('');};
 return <div className="fold-pad">
  <div style={{display:'flex',flexDirection:'column',gap:16}}>
   <div className="grid g2" style={{gap:12}}>
    <Field label="Your first name" help="Used in your greeting."><Input value={person} onChange={event=>edit(setPerson)(event.target.value)}/></Field>
    <Field label="Channel name"><Input value={name} onChange={event=>edit(setName)(event.target.value)}/></Field>
   </div>
   <Field label="Handle"><Input value={handle} placeholder="@yourchannel" autoComplete="off" spellCheck={false} onChange={event=>edit(setHandle)(event.target.value)}/></Field>
   <Field label="About"><Textarea rows={3} value={about} onChange={event=>edit(setAbout)(event.target.value)}/></Field>
   <div><div className="field">Topics</div><TagEditor label="Topics" values={topics} placeholder="Add a topic" show={topicLabel} onAdd={addTopic} onChange={next=>edit(setTopics)(next)}/></div>
   <div><div className="field" id="set-audience">Who it's for</div>
    <div className="row" role="group" aria-labelledby="set-audience" style={{flexWrap:'wrap',gap:6}}>{audiences.map(label=>{const on=audience.includes(label);return <button key={label} type="button" className={`chip ${on?'b-blue':'outline'}`} style={{height:30,padding:'0 12px',cursor:'pointer',fontSize:13}} aria-pressed={on} onClick={()=>edit(setAudience)(toggle(audience,label))}>{on&&<Icon name="Check" size={12} stroke={2.6}/>}{label}</button>;})}</div>
    <div className="row" style={{marginTop:8}}><Input aria-label="Another audience" value={other} placeholder="Someone else" style={{maxWidth:260}} onChange={event=>setOther(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addAudience();}}}/><Button size="sm" disabled={!other.trim()} onClick={addAudience}><Icon name="Plus" size={14}/>Add</Button></div>
   </div>
   <Field label="Ending rule" help="How your videos end. Scripts follow it."><Textarea rows={2} value={cta} onChange={event=>edit(setCta)(event.target.value)}/></Field>
   <div className="row"><Button variant="primary" disabled={!dirty||saving||!name.trim()} onClick={()=>void save()}>Save changes</Button>{saved&&!dirty&&<span role="status" className="small muted">Saved</span>}<button type="button" className="linkish" style={{marginLeft:'auto'}} onClick={onSetup}>Run setup again</button></div>
   {error&&<ErrorLine message={error} onRetry={()=>void save()}/>}
  </div>
 </div>;
}

/**
 * The voice guide: how CreatorClub writes like you, with where it came from. A channel with videos can write it again from them; one without
 * answers the three voice questions again instead, since there is nothing to learn from.
 */
function VoiceGuide({workspace,onSaved}:{workspace:Workspace;onSaved(workspace:Workspace):void}){
 const voice=useJobRun();
 const [answered,setAnswered]=useState(false),[asking,setAsking]=useState(false);
 const [guide,setGuide]=useState<VoiceGuideSummary|null>(null),[reads,setReads]=useState(0);
 const hasVideos=Boolean(workspace.channelUrl);
 const slug=encodeURIComponent(workspace.slug);
 useEffect(()=>{
  let live=true;
  clubFetch<VoiceGuideSummary|null>(`/workspaces/${slug}/voice`).then(found=>{if(live)setGuide(found);},()=>{});
  return()=>{live=false;};
 },[slug,reads]);
 const rebuild=()=>{setAnswered(false);void voice.run(()=>clubFetch(`/workspaces/${slug}/voice`,{method:'POST',body:{}}),()=>setReads(count=>count+1));};
 const answers=()=>{setAnswered(true);setAsking(false);setReads(count=>count+1);clubFetch<Workspace>(`/workspaces/${slug}`).then(onSaved,()=>{});};
 const state=voice.state;
 return <div style={{display:'flex',flexDirection:'column',gap:8}}>
  <div className="field">Voice guide</div>
  {guide
   ?<Card className="p-4" style={{background:'var(--cc-bg-sunk)',fontSize:13.5,lineHeight:1.6,color:'var(--cc-text-2)'}}>{guide.summary}
     <div className="small faint" style={{marginTop:8}}>{guide.transcripts>0?`Built from ${guide.transcripts} of your transcripts.`:'Built from your answers.'}</div></Card>
   :<p className="small muted" style={{margin:0}}>{hasVideos?'No voice guide yet. Write one from your latest videos.':'No voice guide yet. Answer three questions and CreatorClub writes one.'}</p>}
  <div className="row">
   {hasVideos
    ?<Button disabled={state.phase==='running'} onClick={rebuild}>Rebuild voice guide</Button>
    :<Button disabled={asking} onClick={()=>{setAsking(true);setAnswered(false);}}>Answer the three voice questions again</Button>}
   {state.phase==='done'&&(!voiceNeedsAnswers(state.result)||answered)&&<span role="status" className="small muted">{answered?'Saved your voice guide':'Rebuilt your voice guide'}</span>}
   {answered&&!hasVideos&&<span role="status" className="small muted">Saved your voice guide</span>}</div>
  {hasVideos&&<p className="small muted" style={{margin:0}}>Learns how you talk again from your latest videos.</p>}
  {asking&&<Card className="p-4"><VoiceQuestions slug={workspace.slug} onDone={answers}/></Card>}
  {state.phase==='running'&&<div aria-live="polite" style={{display:'flex',flexDirection:'column',gap:8}}><p className="muted" style={{margin:0}}>{state.line??'Writing your voice guide…'}</p><Progress label="Rebuilding your voice guide"/></div>}
  {state.phase==='failed'&&<ErrorLine message={state.message} onRetry={rebuild}/>}
  {state.phase==='done'&&voiceNeedsAnswers(state.result)&&!answered&&<Card className="p-4"><p className="muted" style={{margin:'0 0 12px'}}>We couldn't read enough of your videos. Answer three questions instead.</p><VoiceQuestions slug={workspace.slug} onDone={answers}/></Card>}
 </div>;
}
