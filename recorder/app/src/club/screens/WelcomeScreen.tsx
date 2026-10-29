import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {AddChannelResult,Workspace} from '../../../shared/club';
import {clubFetch} from '../api';
import type {Route} from '../routes';
import {useBreakdowns} from '../useBreakdowns';
import {useJobRun} from '../useJobRun';
import {useTrending} from '../useFeed';
import {useVideos} from '../useVideos';
import {canContinue,canWriteVoice,freshReady,startingVideos,voiceFromDraft,WELCOME_STEPS,type VoiceDraft,type WelcomeChannel,type WelcomePath} from '../welcome';
import {ChannelStep,type FreshDraft} from '../welcome/ChannelStep';
import {ConnectStep} from '../welcome/ConnectStep';
import {VoiceStep} from '../welcome/VoiceStep';
import {WorkingStep} from '../welcome/WorkingStep';
import {Button,Icon} from '../ui';

const NO_FRESH:FreshDraft={name:'',channelName:'',topics:[],audience:[]};
const asChannel=(workspace:Workspace,voice:WelcomeChannel['voice']):WelcomeChannel=>({slug:workspace.slug,name:workspace.name,handle:workspace.handle,about:workspace.about,voice});

/** What step 4 shows once the channel exists: Working now ranked for it, the saved breakdowns and your videos. Mounted only then, so nothing loads for a channel that isn't there yet. */
function WorkingData({onAdded,onSettings}:{onAdded(id:string):void;onSettings():void}){
 const feed=useTrending(),saved=useBreakdowns(),{state}=useVideos();
 const items=useMemo(()=>feed.data&&startingVideos(feed.data.items),[feed.data]);
 return <WorkingStep items={items} loadError={feed.loadError} onReload={feed.reload} saved={saved} videos={state.status==='ready'?state.videos:[]} onAdded={onAdded} onSettings={onSettings}/>;
}

/**
 * First launch, in four steps with a why line on each, Back, and Skip setup: connect your AI, add your channel or start fresh, how you talk,
 * and what's working for you. Reaching the last step (or skipping) saves that setup is done. Adding a concept there lands on Ideas.
 */
export function WelcomeScreen({navigate}:{navigate(route:Route):void}){
 const [step,setStep]=useState(0),[aiConnected,setAiConnected]=useState(false);
 const [path,setPath]=useState<WelcomePath|null>(null),[url,setUrl]=useState('');
 const [fresh,setFresh]=useState<FreshDraft>(NO_FRESH),[voice,setVoice]=useState<VoiceDraft>({});
 const [channel,setChannel]=useState<WelcomeChannel|null>(null);
 const add=useJobRun(),save=useJobRun();
 const busy=add.state.phase==='running'||save.state.phase==='running';
 const welcomed=useRef(false);

 const markWelcomed=useCallback(()=>{
  if(welcomed.current)return;
  welcomed.current=true;
  clubFetch('/settings/welcomed',{method:'POST'}).catch(()=>{welcomed.current=false;});
 },[]);
 const overview=()=>{markWelcomed();navigate({name:'overview'});};
 const goTo=(next:number)=>{if(next===3)markWelcomed();setStep(next);};

 const addChannel=()=>{
  const channelUrl=url.trim();if(!channelUrl)return;
  void add.run(()=>clubFetch('/workspaces',{body:{channelUrl}}),result=>{
   const {workspace,voice:built}=result as AddChannelResult;
   setChannel(asChannel(workspace,built));
  });
 };

 /** Leaves the voice step: a channel short on captions writes its guide from the answers, a fresh one is created here with them. `skip` leaves the answers out. */
 const finishVoice=(skip:boolean)=>{
  const answers=skip?{}:voiceFromDraft(voice);
  if(path==='channel'&&channel?.voice==='needs-answers'&&canWriteVoice(answers)){
   const body={voice:answers.voice!,audience:answers.audience!,...(answers.moves&&{moves:answers.moves})};
   void save.run(()=>clubFetch(`/workspaces/${encodeURIComponent(channel.slug)}/voice`,{body:{answers:body}}),()=>{setChannel({...channel,voice:'built'});goTo(3);});
   return;
  }
  if(path==='fresh'&&!channel){
   const hasAnswers=Object.keys(answers).length>0;
   void save.run(async()=>{
    const created=await clubFetch<Workspace>('/workspaces/fresh',{body:{name:fresh.name.trim(),topics:fresh.topics,audience:fresh.audience,...(hasAnswers&&{voice:answers})}});
    const named=fresh.channelName.trim();
    return named?clubFetch<Workspace>(`/workspaces/${encodeURIComponent(created.slug)}`,{method:'PUT',body:{name:named}}):created;
   },result=>{setChannel(asChannel(result as Workspace,hasAnswers?'built':'none'));goTo(3);});
   return;
  }
  goTo(3);
 };

 const next=()=>{if(step===2)finishVoice(false);else goTo(step+1);};
 const allowed=canContinue(step,{aiConnected,path,channelAdded:channel!==null,fresh:freshReady(fresh.name,fresh.topics,fresh.audience)})&&!busy;
 const info=WELCOME_STEPS[step];
 const title=step===2&&channel?.voice==='built'&&path==='channel'?'This is how you talk':info.title;
 const questions=step===2&&!(channel?.voice==='built')&&!(path==='fresh'&&channel);
 useEffect(()=>{window.scrollTo?.(0,0);},[step]);

 return <div style={{minHeight:'100%',background:'var(--cc-bg)',display:'flex',flexDirection:'column'}}>
  <div className="row club-drag" style={{padding:'18px 28px'}}>
   <span className="logo" style={{width:30,height:30,borderRadius:8,background:'var(--cc-primary)',color:'var(--cc-on-primary)'}}><Icon name="Clapperboard" size={16}/></span><b style={{letterSpacing:'-0.01em'}}>CreatorClub</b>
   <span className="grow"/><button type="button" className="linkish" style={{color:'var(--cc-text-2)'}} onClick={overview}>Skip setup</button>
  </div>
  <div style={{flex:1,display:'flex',justifyContent:'center',alignItems:step<3?'center':'flex-start',padding:'20px 24px 80px'}}>
   <div style={{width:step===3?900:640,maxWidth:'100%'}} key={step} className="page" aria-live="polite">
    <div className="row" style={{marginBottom:14,gap:10}}>
     <span className="small muted tnum">Step {step+1} of 4</span>
     <div style={{display:'flex',gap:4,flex:1,maxWidth:220}}>{WELCOME_STEPS.map((_,index)=><span key={index} style={{flex:1,height:4,borderRadius:4,background:index<=step?'var(--cc-primary)':'var(--cc-line-strong)',transition:'background .3s'}}/>)}</div>
    </div>
    <h1 style={{fontSize:28,letterSpacing:'-0.025em',margin:'0 0 8px',lineHeight:1.15}}>{title}</h1>
    <p className="muted" style={{margin:'0 0 22px',fontSize:15,lineHeight:1.55,maxWidth:600}}>{info.why}</p>
    {step===0&&<ConnectStep onConnected={setAiConnected}/>}
    {step===1&&<ChannelStep path={path} onPath={setPath} url={url} onUrl={setUrl} job={add.state} onAdd={addChannel} channel={channel} fresh={fresh} onFresh={setFresh}/>}
    {step===2&&<VoiceStep path={path} channel={channel} draft={voice} onDraft={setVoice} save={save.state} onRetry={()=>finishVoice(false)}/>}
    {step===3&&<WorkingData onAdded={id=>{markWelcomed();navigate({name:'ideas',new:id});}} onSettings={()=>{markWelcomed();navigate({name:'settings'});}}/>}
    <div className="row" style={{marginTop:26}}>
     {step>0?<Button variant="ghost" disabled={busy} onClick={()=>setStep(step-1)}><Icon name="ChevronLeft" size={15}/>Back</Button>:<span/>}
     <span className="grow"/>
     {questions&&<Button variant="ghost" disabled={busy} onClick={()=>finishVoice(true)}>Skip questions</Button>}
     {step<3
      ?<Button variant={allowed?'primary':'secondary'} disabled={!allowed} onClick={next}>Continue<Icon name="ChevronRight" size={15}/></Button>
      :<Button onClick={overview}>I'll look around first<Icon name="ChevronRight" size={15}/></Button>}
    </div>
   </div>
  </div>
 </div>;
}
