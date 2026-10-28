import {useCallback,useEffect,useState,type FormEvent} from 'react';
import type {AiStatus,Workspace} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ConnectStatus} from '../ConnectStatus';
import {ErrorLine} from '../ErrorLine';
import {useConnect} from '../useConnect';
import {useJobRun} from '../useJobRun';
import {VoiceQuestions,resultSlug,voiceNeedsAnswers} from '../VoiceQuestions';
import {Button,Card,Input,Progress,Spinner} from '../ui';

type Step='loading'|'ai'|'channel';
type Start={step:Step;hasChannel:boolean}|{error:string};

/** First launch: connect your AI, add your channel, then the board. The board is the third screen, so `onDone` hands over to it. */
export function OnboardingScreen({onBoard,onDone}:{onBoard():void;onDone():void}){
 const [start,setStart]=useState<Start|null>(null);
 const load=useCallback(()=>{
  setStart(null);
  Promise.all([clubFetch<AiStatus>('/ai/status'),clubFetch<{workspaces:Workspace[]}>('/workspaces')])
   .then(([status,{workspaces}])=>setStart({step:status.claude.signedIn||status.codex.signedIn?'channel':'ai',hasChannel:workspaces.length>0}))
   .catch(error=>setStart({error:errorMessage(error)}));
 },[]);
 useEffect(load,[load]);
 let body;
 if(start===null)body=<div className="flex justify-center py-8"><Spinner label="Loading"/></div>;
 else if('error' in start)body=<ErrorLine message={start.error} onRetry={load} primary/>;
 else body=<Steps initial={start.step} hasChannel={start.hasChannel} onBoard={onBoard} onDone={onDone}/>;
 return <div className="club-drag flex flex-1 items-center justify-center overflow-auto p-6">
  <Card className="flex w-full max-w-md flex-col gap-5 p-8">{body}</Card>
 </div>;
}

function Steps({initial,hasChannel,onBoard,onDone}:{initial:Step;hasChannel:boolean;onBoard():void;onDone():void}){
 const [step,setStep]=useState<Step>(initial);
 return step==='ai'?<ConnectYourAi onNext={()=>setStep('channel')}/>:<AddYourChannel hasChannel={hasChannel} onBoard={onBoard} onDone={onDone}/>;
}

function ConnectYourAi({onNext}:{onNext():void}){
 const {state,provider,start,cancel}=useConnect();
 return <>
  <div className="flex flex-col gap-1.5">
   <h1 className="text-xl font-semibold tracking-tight">Connect your AI</h1>
   <p className="text-base text-muted">CreatorClub uses your own Claude or ChatGPT account.</p>
  </div>
  {state.phase==='idle'&&<div className="flex flex-wrap gap-2">
   <Button variant="primary" onClick={()=>start('claude')}>Connect Claude</Button>
   <Button onClick={()=>start('codex')}>Connect ChatGPT</Button>
  </div>}
  {provider&&<ConnectStatus state={state} provider={provider} onRetry={()=>start(provider)} onCancel={cancel} primaryRetry/>}
  {state.phase==='connected'&&<div><Button variant="primary" onClick={onNext}>Add your channel</Button></div>}
 </>;
}

function AddYourChannel({hasChannel,onBoard,onDone}:{hasChannel:boolean;onBoard():void;onDone():void}){
 const [url,setUrl]=useState('');
 // Set when the channel had too few captions: the voice guide then comes from three questions.
 const [ask,setAsk]=useState<string|null>(null);
 const {state,run}=useJobRun();
 const add=useCallback(()=>{
  const channelUrl=url.trim();if(!channelUrl)return;
  void run(()=>clubFetch('/workspaces',{body:{channelUrl}}),result=>{
   const slug=voiceNeedsAnswers(result)?resultSlug(result):undefined;
   if(slug)setAsk(slug);else onDone();
  });
 },[url,run,onDone]);
 const submit=(event:FormEvent)=>{event.preventDefault();add();};
 const working=state.phase==='running';
 if(ask)return <>
  <div className="flex flex-col gap-1.5">
   <h1 className="text-xl font-semibold tracking-tight">How do you talk?</h1>
   <p className="text-base text-muted">We couldn't read enough of your videos. Answer three questions instead.</p>
  </div>
  <VoiceQuestions slug={ask} onDone={onDone}/>
 </>;
 return <>
  <div className="flex flex-col gap-1.5">
   <h1 className="text-xl font-semibold tracking-tight">Add your channel</h1>
   <p className="text-base text-muted">Paste your YouTube channel. We'll learn your topics and how you talk.</p>
  </div>
  <form onSubmit={submit} className="flex flex-col gap-3">
   <Input aria-label="YouTube channel" placeholder="youtube.com/@yourchannel" value={url} disabled={working} autoFocus autoComplete="off" spellCheck={false} onChange={event=>setUrl(event.target.value)}/>
   {state.phase==='failed'?<ErrorLine message={state.message} onRetry={add} primary/>
    :working?<div className="flex flex-col gap-2" aria-live="polite">
      <p className="text-base text-muted">{state.line??'Adding your channel…'}</p>
      <Progress label="Adding your channel"/>
     </div>
    :<div className="flex gap-2">
      <Button variant="primary" disabled={!url.trim()} onClick={add}>Add channel</Button>
      {hasChannel&&<Button variant="ghost" onClick={onBoard}>Open board</Button>}
     </div>}
  </form>
 </>;
}
