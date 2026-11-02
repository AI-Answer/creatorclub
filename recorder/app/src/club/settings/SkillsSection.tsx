import {useEffect,useState} from 'react';
import {EDIT_SKILL_WHY,type EditSkill} from '../../../shared/skills';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {Card,Input,Spinner} from '../ui';

/**
 * Which of your Claude Code skills show on Edit, where a skill runs for real and makes something for the timeline. Video skills are
 * picked from their own description, and a skill can say it is for Edit (`creatorclub: edit`); a switch here adds or removes any
 * skill and wins over both. "Automatic" puts a skill you changed back to the automatic pick.
 */
export function SkillsSection(){
 const [skills,setSkills]=useState<EditSkill[]|null>(null),[error,setError]=useState(''),[query,setQuery]=useState(''),[showAll,setShowAll]=useState(false);
 const load=()=>{setError('');clubFetch<EditSkill[]>('/skills/edit').then(setSkills,reason=>setError(errorMessage(reason,"Couldn't read your skills.")));};
 useEffect(load,[]);
 const choose=(name:string,on:boolean|null)=>{
  setSkills(current=>current?.map(skill=>skill.name===name&&on!==null?{...skill,on,reason:on?'added':'removed'}:skill)??null);
  clubFetch<EditSkill[]>(`/skills/edit/${encodeURIComponent(name)}`,{method:'PUT',body:{on}}).then(setSkills,reason=>{setError(errorMessage(reason,"Couldn't save that choice."));load();});
 };
 const q=query.trim().toLowerCase();
 const found=(skills??[]).filter(skill=>!q||skill.name.toLowerCase().includes(q)||skill.description.toLowerCase().includes(q));
 const on=found.filter(skill=>skill.on),off=found.filter(skill=>!skill.on);
 const row=(skill:EditSkill)=><div key={skill.name} className="srow2 sk-row">
  <div className="grow" style={{minWidth:0}}>
   <div className="st">/{skill.name}</div>
   <div className="sd sk-desc">{skill.description}</div>
   <div className={`sk-why ${skill.reason}`}>{EDIT_SKILL_WHY[skill.reason]}{(skill.reason==='added'||skill.reason==='removed')&&<> · <button type="button" className="linkish" onClick={()=>choose(skill.name,null)}>Automatic</button></>}</div>
  </div>
  <button type="button" role="switch" aria-checked={skill.on} aria-label={`Show /${skill.name} on Edit`} className="sk-switch" onClick={()=>choose(skill.name,!skill.on)}><span/></button>
 </div>;
 return <section className="set-group" id="set-skills" aria-labelledby="set-skills-title"><h2 id="set-skills-title">Skills on Edit</h2>
  <p>On Edit, a skill runs for real and makes something for the timeline. Video skills are picked for you; switch any skill on or off here.</p>
  <Card>
   {error?<div style={{padding:16}}><ErrorLine message={error} onRetry={load}/></div>:!skills?<div style={{padding:16}}><Spinner label="Reading your skills"/></div>:<>
    <div className="srow2"><Input aria-label="Find a skill" placeholder="Find a skill" value={query} onChange={event=>setQuery(event.target.value)}/></div>
    {on.length?on.map(row):<div className="srow2 sd">No skill matches on Edit.</div>}
    {off.length>0&&(showAll||q?<><div className="srow2 sk-sub">Not on Edit · {off.length}</div>{off.map(row)}</>
     :<div className="srow2"><button type="button" className="linkish" onClick={()=>setShowAll(true)}>Show the other {off.length} skills</button></div>)}
   </>}
  </Card>
 </section>;
}
