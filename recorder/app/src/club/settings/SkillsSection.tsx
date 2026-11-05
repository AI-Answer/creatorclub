import {useEffect,useState} from 'react';
import {EDIT_SKILL_WHY,type EditSkill} from '../../../shared/skills';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {Card,Input,Spinner} from '../ui';

export const skillTitle=(name:string)=>name.replace(/^\/+/, '').replace(/[-_]+/g,' ').replace(/\b\w/g,char=>char.toUpperCase());

/** Keep the row useful at a glance; the full supplied text remains in Details. */
export function skillSummary(skill:Pick<EditSkill,'name'|'description'>):string{
 const summaries:Record<string,string>={
  cutroom:'Edit talking-head and screen recordings from start to finish.',
  'proof-edit':'Polish a recorded talking-head or screen video in Creator Compiler.',
  'proof-first-video-editor':'Turn raw recordings into YouTube videos backed by on-screen proof.',
  sagecut:'Review and improve animated graphics for your video.',
  'screenplay-edit':'Shape talking-head recordings into polished animated tutorials.',
  'video-edit-pipeline':'Edit in stages, adding proof visuals after the first cut.',
 };
 const known=summaries[skill.name.replace(/^\/+/, '')];if(known)return known;
 const sentence=skill.description.trim().split(/(?<=[.!?])\s/)[0].replace(/\s+/g,' ').replace(/\bRemotion\b/gi,'animated video').replace(/\bengine\b/gi,'tools').replace(/\bingest\b/gi,'import').replace(/runs for real/gi,'creates a finished result').replace(/[.!?…]$/,'');
 if(!sentence)return `Use ${skillTitle(skill.name)} to work on your video.`;
 const concise=sentence.length>112?sentence.slice(0,112).replace(/\s+\S*$/,''):sentence;
 return `${concise}.`;
}

/**
 * Which of your Claude Code skills show on Edit, where a skill runs for real and makes something for the timeline. Video skills are
 * picked from their own description, and a skill can say it is for Edit (`creatorclub: edit`); a switch here adds or removes any
 * skill and wins over both. "Automatic" puts a skill you changed back to the automatic pick.
 */
export function SkillsSection(){
 const [skills,setSkills]=useState<EditSkill[]|null>(null),[error,setError]=useState(''),[query,setQuery]=useState(''),[showAll,setShowAll]=useState(false),[expanded,setExpanded]=useState<string[]>([]);
 const load=()=>{setError('');clubFetch<EditSkill[]>('/skills/edit').then(setSkills,reason=>setError(errorMessage(reason,"Couldn't read your skills.")));};
 useEffect(load,[]);
 const choose=(name:string,on:boolean|null)=>{
  setSkills(current=>current?.map(skill=>skill.name===name&&on!==null?{...skill,on,reason:on?'added':'removed'}:skill)??null);
  clubFetch<EditSkill[]>(`/skills/edit/${encodeURIComponent(name)}`,{method:'PUT',body:{on}}).then(setSkills,reason=>{setError(errorMessage(reason,"Couldn't save that choice."));load();});
 };
 const q=query.trim().toLowerCase();
 const found=(skills??[]).filter(skill=>!q||skill.name.toLowerCase().includes(q)||skill.description.toLowerCase().includes(q));
 const on=found.filter(skill=>skill.on),off=found.filter(skill=>!skill.on);
 const row=(skill:EditSkill)=>{const open=expanded.includes(skill.name),id=`skill-details-${encodeURIComponent(skill.name)}`;return <div key={skill.name} className="srow2 sk-row">
  <div className="sk-row-main"><div className="grow" style={{minWidth:0}}><div className="st">{skillTitle(skill.name)}</div><div className="sd sk-desc" title={skillSummary(skill)}>{skillSummary(skill)}</div></div>
   <button type="button" className="btn sm ghost skill-details-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setExpanded(current=>open?current.filter(name=>name!==skill.name):[...current,skill.name])}>Details</button>
   <button type="button" role="switch" aria-checked={skill.on} aria-label={`Show /${skill.name} on Edit`} className="sk-switch" onClick={()=>choose(skill.name,!skill.on)}><span/></button>
  </div>
  <div className="skill-details" id={id} hidden={!open}><div className="sk-command">/{skill.name}</div><p>{skill.description}</p><div className="sk-why">{EDIT_SKILL_WHY[skill.reason]}{(skill.reason==='added'||skill.reason==='removed')&&<> · <button type="button" className="linkish" onClick={()=>choose(skill.name,null)}>Automatic</button></>}</div></div>
 </div>;};
 return <section className="set-group" id="set-skills" aria-labelledby="set-skills-title"><h2 id="set-skills-title">Skills</h2>
  <p>Choose the tools available when you edit a video. Turn any skill on or off here.</p>
  <Card>
   {error?<div style={{padding:16}}><ErrorLine message={error} onRetry={load}/></div>:!skills?<div className="row small muted" role="status" style={{padding:16}}><Spinner label="Reading your skills"/>Reading your skills…</div>:<>
    <div className="srow2"><Input aria-label="Find a skill" placeholder="Find a skill" value={query} onChange={event=>setQuery(event.target.value)}/></div>
    {on.length?on.map(row):<div className="srow2 sd">{q?'No skills match this search on Edit. Try another name or description.':skills.length?'No skills are on Edit. Show the other skills below to turn one on.':'No skills found. Add a Claude Code skill, then reopen Settings.'}</div>}
    {off.length>0&&(showAll||q?<><div className="srow2 sk-sub">Not on Edit · {off.length}</div>{off.map(row)}</>
     :<div className="srow2"><button type="button" className="btn sm" onClick={()=>setShowAll(true)}>Show the other {off.length} skills</button></div>)}
   </>}
  </Card>
 </section>;
}
