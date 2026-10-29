import {useState} from 'react';
import {VOICE_QUESTIONS,type VoiceAnswers} from '../../shared/club';
import {clubFetch} from './api';
import {ErrorLine} from './ErrorLine';
import {useJobRun} from './useJobRun';
import {Button,Progress,Textarea} from './ui';

/** The job result that means the channel had too few captions to learn a voice from. */
export const voiceNeedsAnswers=(result:unknown):boolean=>
 typeof result==='object'&&result!==null&&(result as {voice?:unknown}).voice==='needs-answers';

const empty:VoiceAnswers={voice:'',audience:'',moves:''};

/** The three Voice DNA questions as a small form. Saving writes the voice guide from the answers. */
export function VoiceQuestions({slug,onDone}:{slug:string;onDone():void}){
 const [answers,setAnswers]=useState<VoiceAnswers>(empty);
 const {state,run}=useJobRun();
 const ready=VOICE_QUESTIONS.every(question=>!question.required||answers[question.key].trim());
 const save=()=>void run(()=>clubFetch(`/workspaces/${encodeURIComponent(slug)}/voice`,{body:{answers}}),onDone);
 const working=state.phase==='running';
 return <form onSubmit={event=>{event.preventDefault();if(ready&&!working)save();}} className="flex flex-col gap-4">
  {VOICE_QUESTIONS.map(question=><label key={question.key} className="flex flex-col gap-1.5">
   <span className="text-sm font-medium">{question.label}</span>
   <Textarea rows={2} value={answers[question.key]} disabled={working} onChange={event=>setAnswers({...answers,[question.key]:event.target.value})}/>
   {'help' in question&&<span className="text-sm text-muted">{question.help}</span>}
  </label>)}
  {state.phase==='failed'?<ErrorLine message={state.message} onRetry={save} primary/>
   :working?<div className="flex flex-col gap-2" aria-live="polite"><p className="text-base text-muted">{state.line??'Writing your voice guide…'}</p><Progress label="Writing your voice guide"/></div>
   :<div><Button variant="primary" disabled={!ready} onClick={save}>Save answers</Button></div>}
 </form>;
}
