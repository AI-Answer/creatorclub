import {ErrorLine} from '../ErrorLine';
import type {JobRun} from '../useJobRun';
import {WELCOME_QUESTIONS,type VoiceDraft,type WelcomeChannel,type WelcomePath} from '../welcome';
import {Icon,Progress,Textarea} from '../ui';

/** Step 3: three optional voice questions, or what was learned from the channel's videos. Questions are sent by Continue, not here. */
export function VoiceStep({path,channel,draft,onDraft,save,onRetry}:{path:WelcomePath|null;channel:WelcomeChannel|null;draft:VoiceDraft;onDraft(next:VoiceDraft):void;save:JobRun;onRetry():void}){
 if(path==='fresh'&&channel)return <div className="card" style={{padding:18}}>
  <div className="row"><Icon name="done" size={16} style={{color:'var(--cc-ok)'}}/><b>{channel.voice==='none'?'Skipped for now':'Your voice guide is saved'}</b></div>
  <div className="small faint" style={{marginTop:12}}>You can change this any time in Settings.</div>
 </div>;
 if(path==='channel'&&channel?.voice==='built')return <div className="card" style={{padding:18}}>
  <div className="row" style={{marginBottom:10}}><Icon name="done" size={16} style={{color:'var(--cc-ok)'}}/><b>Learned from your videos</b></div>
  {channel.about&&<div className="muted" style={{lineHeight:1.6,fontSize:14}}>{channel.about}</div>}
  <div className="small faint" style={{marginTop:12}}>You can change this any time in Settings.</div>
 </div>;
 return <div style={{display:'flex',flexDirection:'column',gap:14}}>
  {path==='channel'&&<p className="muted" style={{margin:0}}>We couldn't read enough of your videos. Answer the first two questions instead.</p>}
  {WELCOME_QUESTIONS.map((question,index)=>{
   const value=draft[question.key]??'';
   return <div key={question.key} className="card" style={{padding:16}}>
    <div className="row" style={{alignItems:'flex-start'}}><span className="chip" style={{flex:'none'}}>{index+1} of 3</span><b style={{fontSize:14.5}}>{question.q}</b></div>
    <div className="small muted" style={{margin:'4px 0 10px'}}>{question.why}</div>
    {question.options
     ?<div className="row" role="group" aria-label={question.q} style={{flexWrap:'wrap',gap:6}}>{question.options.map(option=><button key={option} type="button" className={`chip ${value===option?'b-blue':'outline'}`} style={{height:30,padding:'0 12px',cursor:'pointer',fontSize:13}} aria-pressed={value===option} onClick={()=>onDraft({...draft,[question.key]:option})}>{value===option&&<Icon name="check" size={12} stroke={2.6}/>}{option}</button>)}</div>
     :<Textarea rows={2} value={value} placeholder={question.ph} aria-label={question.q} onChange={event=>onDraft({...draft,[question.key]:event.target.value})}/>}
   </div>;
  })}
  <div className="small faint">All three are optional. Skip any you're unsure about.</div>
  {save.phase==='running'&&<div aria-live="polite" style={{display:'flex',flexDirection:'column',gap:8}}><div className="muted">{save.line??'Writing your voice guide…'}</div><Progress label="Writing your voice guide"/></div>}
  {save.phase==='failed'&&<ErrorLine message={save.message} onRetry={onRetry}/>}
 </div>;
}
