import {useState,type FormEvent} from 'react';
import {AUDIENCE_LABELS,TOPIC_LABELS} from '../../../shared/club';
import {ErrorLine} from '../ErrorLine';
import {ProgressLine} from '../ProgressLine';
import {ADD_CHANNEL_ESTIMATE,addTopic,freshReady,toggle,type WelcomeChannel,type WelcomePath} from '../welcome';
import type {JobRun} from '../useJobRun';
import {Avatar,Button,Icon,Input,type IconName} from '../ui';

export interface FreshDraft{name:string;channelName:string;topics:string[];audience:string[]}

const PATHS:readonly {key:WelcomePath;icon:IconName;title:string;text:string}[]=[
 {key:'channel',icon:'youtube',title:'Add my channel',text:"Paste the link. We'll read your recent videos."},
 {key:'fresh',icon:'first-steps',title:"I'm starting fresh",text:'No channel yet. Tell us what you want to talk about.'},
];

const chipStyle={height:30,padding:'0 12px',cursor:'pointer',fontSize:13} as const;

function Choice({label,on,onToggle}:{label:string;on:boolean;onToggle():void}){
 return <button type="button" className={`chip ${on?'b-blue':'outline'}`} style={chipStyle} aria-pressed={on} onClick={onToggle}>{on&&<Icon name="check" size={12} stroke={2.6}/>}{label}</button>;
}

/**
 * Step 2: add your YouTube channel (a real Add channel job) or describe a new one. A channel read from its link is shown as added (what was read stays; Settings changes it).
 * A fresh start keeps its form after the channel is saved, so coming Back lets you change the answers. `block` says why Add channel waits for the AI, with a way back to step 1.
 */
export function ChannelStep({path,onPath,url,onUrl,job,onAdd,block,onConnect,channel,fresh,onFresh}:{path:WelcomePath|null;onPath(path:WelcomePath):void;url:string;onUrl(url:string):void;job:JobRun;onAdd():void;block:'checking'|'missing'|null;onConnect():void;channel:WelcomeChannel|null;fresh:FreshDraft;onFresh(next:FreshDraft):void}){
 const [other,setOther]=useState('');
 const done=channel!==null;
 const running=job.phase==='running';
 const topics=TOPIC_LABELS.map<string>(label=>label).concat(fresh.topics.filter(topic=>!(TOPIC_LABELS as readonly string[]).includes(topic)));
 const submit=(event:FormEvent)=>{event.preventDefault();if(url.trim()&&!running&&!block)onAdd();};
 const add=()=>{onFresh({...fresh,topics:addTopic(fresh.topics,other)});setOther('');};
 const patch=(change:Partial<FreshDraft>)=>onFresh({...fresh,...change});
 return <div>
  {!done&&<div className="grid g2" style={{gap:12,marginBottom:18}}>{PATHS.map(option=><button key={option.key} type="button" className={`topt${path===option.key?' on':''}`} style={{flexDirection:'column',gap:8,padding:16,textAlign:'left',background:path===option.key?'var(--cc-surface-2)':'var(--cc-surface)'}} disabled={running} aria-pressed={path===option.key} aria-label={`${option.title}. ${option.text}`} onClick={()=>onPath(option.key)}>
   <span className="row" style={{width:'100%'}}><Icon name={option.icon} size={20}/><span className="grow"/><span className="radio"/></span><b style={{fontSize:15}}>{option.title}</b><span className="small muted">{option.text}</span></button>)}</div>}

  {path==='channel'&&<div className="card" style={{padding:16}}>
   {done?<div className="row" style={{gap:12}}><Avatar name={channel.name} size="lg"/><div className="grow"><b>{channel.name}</b><div className="small muted">{channel.handle||'Your channel'}</div></div><span className="chip b-green"><Icon name="check" size={12}/>Added</span></div>
   :<form onSubmit={submit}>
    <label className="field" htmlFor="ch-url">Your channel</label>
    <div className="row"><Input id="ch-url" autoFocus autoComplete="off" spellCheck={false} disabled={running} value={url} placeholder="youtube.com/@yourchannel" onChange={event=>onUrl(event.target.value)}/><Button type="submit" variant="primary" disabled={!url.trim()||running||block!==null}>Add channel</Button></div>
    {block==='checking'&&!running&&<div className="small muted" style={{marginTop:10}}>Still checking your AI account (10 to 20 seconds). Adding a channel waits for it, because the AI writes how you talk.</div>}
    {block==='missing'&&!running&&<div className="row" style={{marginTop:10,gap:10}}><span className="small" style={{color:'var(--cc-warn)'}}>No AI account is signed in yet. Adding a channel needs one.</span><Button size="sm" onClick={onConnect}>Connect an AI</Button></div>}
    {running&&<div style={{marginTop:14}}><ProgressLine label="Adding your channel" line={job.line??'Reading your channel…'} estimate={ADD_CHANNEL_ESTIMATE} note="Skip setup, top right, leaves this for later."/></div>}
    {job.phase==='failed'&&<div style={{marginTop:12}}><ErrorLine message={job.message} onRetry={onAdd}/></div>}
   </form>}
  </div>}

  {path==='fresh'&&(
   <div className="card" style={{padding:18}}>
    <div className="grid g2" style={{gap:12,marginBottom:16}}>
     <div><label className="field" htmlFor="w-name">Your first name</label><Input id="w-name" autoFocus value={fresh.name} placeholder="Your first name" onChange={event=>patch({name:event.target.value})}/></div>
     <div><label className="field" htmlFor="w-ch">Channel name <span className="faint" style={{fontWeight:500}}>· optional</span></label><Input id="w-ch" value={fresh.channelName} placeholder="You can decide later" onChange={event=>patch({channelName:event.target.value})}/></div>
    </div>
    <div className="field" id="w-topics">What do you want to talk about?</div>
    <div className="row" role="group" aria-labelledby="w-topics" style={{flexWrap:'wrap',gap:6,marginBottom:8}}>{topics.map(topic=><Choice key={topic} label={topic} on={fresh.topics.includes(topic)} onToggle={()=>patch({topics:toggle(fresh.topics,topic)})}/>)}</div>
    <label className="field" htmlFor="w-other" style={{marginTop:10}}>Not about AI? Type your own topic</label>
    <div className="row" style={{marginBottom:16}}><Input id="w-other" value={other} placeholder="e.g. Home cooking, Personal finance, Woodworking" onChange={event=>setOther(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();add();}}}/><Button disabled={!other.trim()} onClick={add}><Icon name="add" size={15}/>Add</Button></div>
    <div className="field" id="w-audience">Who is it for?</div>
    <div className="row" role="group" aria-labelledby="w-audience" style={{flexWrap:'wrap',gap:6}}>{AUDIENCE_LABELS.map(label=><Choice key={label} label={label} on={fresh.audience.includes(label)} onToggle={()=>patch({audience:toggle(fresh.audience,label)})}/>)}</div>
    {!freshReady(fresh.name,fresh.topics,fresh.audience)
     ?<div className="small faint" style={{marginTop:14}}>Add your name, at least one topic and who it's for to continue.</div>
     :done&&<div className="small muted row" style={{marginTop:14}}><Icon name="check" size={12}/>Saved. Change anything here and Continue saves it.</div>}
   </div>)}
 </div>;
}
