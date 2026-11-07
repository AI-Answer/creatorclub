import {clearWelcomeProgress,restoreWelcomeProgress,saveWelcomeProgress} from '../welcome-progress';
import {BrandMark} from '../../BrandMark';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {AddChannelResult,Workspace} from '../../../shared/club';
import {aiState,useAiCheck} from '../ai-status';
import {clubFetch,errorMessage,selectClubWorkspace} from '../api';
import {ErrorLine} from '../ErrorLine';
import type {Route} from '../routes';
import {useBreakdowns} from '../useBreakdowns';
import {useJobRun} from '../useJobRun';
import {useTrending} from '../useFeed';
import {useVideos} from '../useVideos';
import {addChannelBlock,canContinue,canWriteVoice,freshReady,reachableStep,startingVideos,voiceFromDraft,WELCOME_STEPS,type VoiceDraft,type WelcomeChannel,type WelcomePath} from '../welcome';
import {ChannelStep,type FreshDraft} from '../welcome/ChannelStep';
import {ConnectStep} from '../welcome/ConnectStep';
import {VoiceStep} from '../welcome/VoiceStep';
import {WorkingStep} from '../welcome/WorkingStep';
import {Button,Icon} from '../ui';

const NO_FRESH:FreshDraft={name:'',channelName:'',topics:[],audience:[]};
const asChannel=(workspace:Workspace,voice:WelcomeChannel['voice']):WelcomeChannel=>({slug:workspace.slug,name:workspace.name,handle:workspace.handle,about:workspace.about,voice});
const sameList=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((item,index)=>item===b[index]);
const sameFresh=(a:FreshDraft,b:FreshDraft)=>a.name.trim()===b.name.trim()&&a.channelName.trim()===b.channelName.trim()&&sameList(a.topics,b.topics)&&sameList(a.audience,b.audience);
const sameVoice=(a:Partial<Record<string,string>>,b:Partial<Record<string,string>>)=>JSON.stringify(a)===JSON.stringify(b);

/** What the search for videos that work says while it runs behind the other steps. */
type Scan={line?:string}|null;

/**
 * Step 4's content, and the search behind it. It is mounted as soon as the channel exists (not when step 4 opens), so the search runs while you answer
 * the voice questions and is often finished by the time you get here. It only shows on step 4; the rest of the time it reports what it is doing through `onScan`.
 */
function WorkingData({visible,onAdded,onSettings,onScan}:{visible:boolean;onAdded(id:string):void;onSettings():void;onScan(scan:Scan):void}){
 const feed=useTrending(),saved=useBreakdowns(),{state}=useVideos();
 const items=useMemo(()=>feed.data&&startingVideos(feed.data.items),[feed.data]);
 const line=(feed.job.phase==='starting'||feed.job.phase==='running')?feed.job.line:undefined;
 const {seeding}=feed;
 useEffect(()=>{onScan(seeding?{line}:null);},[seeding,line,onScan]);
 return <div hidden={!visible}><WorkingStep items={items} searching={seeding} scanLine={line} loadError={feed.loadError} onReload={feed.reload} saved={saved} videos={state.status==='ready'?state.videos:[]} onAdded={onAdded} onSettings={onSettings}/></div>;
}

/**
 * First launch, in four steps with a why line on each: connect your AI, add your channel or start fresh, how you talk, and what's working for you.
 * The step is in the address (`#/welcome?step=2`), Back keeps every answer and lets you change it, and Skip setup is the one way out.
 * Reaching the last step (or skipping) saves that setup is done. Adding a concept there lands on Videos.
 * The slow parts run in the background and say so: the AI account check starts at once, and the search for videos that work starts when the channel exists.
 */
export function WelcomeScreen({navigate,initialStep}:{navigate(route:Route,options?:{replace?:boolean}):void;initialStep?:number}){
 const restored=useRef(restoreWelcomeProgress(initialStep)).current;
 const [step,setStep]=useState((initialStep??(restored.created?(restored.savedVoice||restored.channel?.voice==='built'?4:3):1))-1);
 const {check,reload:recheck,connected}=useAiCheck(true);
 const ai=aiState(check);
 const [path,setPath]=useState<WelcomePath|null>(restored.path??null),[url,setUrl]=useState('');
 const [fresh,setFresh]=useState<FreshDraft>(restored.fresh??NO_FRESH),[voice,setVoice]=useState<VoiceDraft>(restored.voice??{});
 const [channel,setChannel]=useState<WelcomeChannel|null>(restored.channel??(restored.created?asChannel(restored.created,'none'):null));
 // What was last saved from the answers, so going Back and changing one is noticed, and sending nothing is the same as nothing changed.
 const [savedFresh,setSavedFresh]=useState<FreshDraft|null>(restored.savedFresh??null),[savedVoice,setSavedVoice]=useState<VoiceDraft|null>(restored.savedVoice??null);
 const [scan,setScan]=useState<Scan>(null),[passedConnect,setPassedConnect]=useState(false);
 const add=useJobRun(),save=useJobRun(),edit=useJobRun();
 const busy=(add.state.phase==='starting'||add.state.phase==='running')||(save.state.phase==='starting'||save.state.phase==='running')||(edit.state.phase==='starting'||edit.state.phase==='running');
 const welcomed=useRef(false),created=useRef<Workspace|null>(restored.created??null),body=useRef<HTMLDivElement>(null);
 const welcomePending=useRef<Promise<void>|null>(null),creating=useRef<Promise<Workspace>|null>(null);
 useEffect(()=>{if(!welcomed.current)saveWelcomeProgress({path,fresh,voice,channel,savedFresh,savedVoice});},[path,fresh,voice,channel,savedFresh,savedVoice]);
 const rememberCreated=(workspace:Workspace)=>{created.current=workspace;saveWelcomeProgress({created:workspace});return workspace;};
 const [selecting,setSelecting]=useState(false),[selectionError,setSelectionError]=useState(''),[selectionReady,setSelectionReady]=useState(restored.path!=='channel'||!restored.created);
 const selectingNow=useRef<Promise<void>|null>(null);
 const activateImported=useCallback((result:AddChannelResult)=>{
  if(selectingNow.current)return selectingNow.current;
  rememberCreated(result.workspace);setSelecting(true);setSelectionReady(false);setSelectionError('');
  const request=selectClubWorkspace(result.workspace.slug).then(()=>{setChannel(asChannel(result.workspace,result.voice));setSelectionReady(true);},reason=>{setSelectionError(errorMessage(reason,"Couldn't open that channel."));}).finally(()=>{selectingNow.current=null;setSelecting(false);});
  selectingNow.current=request;return request;
 },[]);
 useEffect(()=>{if(restored.path==='channel'&&restored.created)void activateImported({workspace:restored.created,voice:restored.channel?.voice??'none'} as AddChannelResult);},[activateImported,restored]);
 const [leaveError,setLeaveError]=useState<{message:string;route:Route}|null>(null);

 const state={ai,path,channelAdded:channel!==null,fresh:freshReady(fresh.name,fresh.topics,fresh.audience),channelMade:channel!==null,passedConnect};
 const furthest=reachableStep(state);
 /** The step shown: the one the address names, kept inside what exists so far. */
 const shown=Math.max(0,Math.min(step,furthest));

 // The address is the step: Back and forward in the browser move between steps, and a link to a step that is not ready yet opens the furthest one.
 useEffect(()=>{if(initialStep!==undefined)setStep(initialStep-1);},[initialStep]);
 useEffect(()=>{
  if(shown!==step){setStep(shown);navigate({name:'welcome',step:shown+1},{replace:true});}
 },[shown,step,navigate]);
 useEffect(()=>{body.current?.scrollTo?.(0,0);},[shown]);

 /** Saves that setup is done. Resolves when it is saved; throws the one sentence to show when it is not. */
 const saveWelcomed=useCallback(():Promise<void>=>{
  if(welcomed.current)return Promise.resolve();
  if(welcomePending.current)return welcomePending.current;
  const request=(async()=>{
   if(creating.current)await creating.current;
   if(selectingNow.current)await selectingNow.current;
   if(path==='channel'&&created.current&&!selectionReady){await selectClubWorkspace(created.current.slug);setSelectionReady(true);}
   if(!channel&&!created.current){
    const {workspaces}=await clubFetch<{workspaces:Workspace[]}>('/workspaces');
    if(!workspaces.length)rememberCreated(await clubFetch<Workspace>('/workspaces/fresh',{body:{name:'My channel',topics:[],audience:[]}}));
   }
   await clubFetch('/settings/welcomed',{method:'POST'});welcomed.current=true;clearWelcomeProgress();
  })().finally(()=>{if(welcomePending.current===request)welcomePending.current=null;});
  welcomePending.current=request;return request;
 },[channel,path,selectionReady]);
 /** Leaves setup for `route`, but only once setup is saved, so a failed save does not send you back here at every launch. */
 const leave=useCallback(async(route:Route)=>{
  setLeaveError(null);
  try{await saveWelcomed();navigate(route);}
  catch(reason){setLeaveError({message:errorMessage(reason),route});}
 },[saveWelcomed,navigate]);
 const markWelcomed=()=>{void saveWelcomed().catch(()=>{});};
 const home=()=>void leave({name:'home'});
 const goTo=(next:number)=>{if(next===3)markWelcomed();if(next>0)setPassedConnect(true);setStep(next);navigate({name:'welcome',step:next+1});};

 const addChannel=()=>{
  const channelUrl=url.trim();if(!channelUrl)return;
  void add.run(()=>clubFetch('/workspaces',{body:{channelUrl}}),result=>{
   void activateImported(result as AddChannelResult);
  });
 };

 /** Leaves step 2. A fresh channel that already exists (you came Back) is updated when its answers changed, never made twice. */
 const finishChannel=()=>{
  if(path==='fresh'&&channel&&(!savedFresh||!sameFresh(fresh,savedFresh))){
   const named=fresh.channelName.trim()||fresh.name.trim();
   void edit.run(()=>clubFetch<Workspace>(`/workspaces/${encodeURIComponent(channel.slug)}`,{method:'PUT',body:{person:fresh.name.trim(),name:named,topics:fresh.topics,audience:fresh.audience}}),result=>{
    setChannel(asChannel(result as Workspace,channel.voice));setSavedFresh(fresh);goTo(2);
   });
   return;
  }
  goTo(2);
 };

 /** Leaves the voice step. A channel short on captions writes its guide from the answers; a fresh one is created here with them, or has its guide written again when you came Back and changed them. */
 const finishVoice=()=>{
  const answers=voiceFromDraft(voice);
  const voiceUnchanged=sameVoice(answers,voiceFromDraft(savedVoice??{}));
  if(ai==='connected'&&path==='channel'&&channel?.voice==='needs-answers'&&canWriteVoice(answers)){
   const body={voice:answers.voice!,audience:answers.audience!,...(answers.moves&&{moves:answers.moves})};
   void save.run(()=>clubFetch(`/workspaces/${encodeURIComponent(channel.slug)}/voice`,{body:{answers:body}}),()=>{setChannel({...channel,voice:'built'});setSavedVoice(voice);goTo(3);});
   return;
  }
  if(path==='fresh'&&!channel){
   const hasAnswers=ai==='connected'&&Object.keys(answers).length>0;
   void save.run(async()=>{
    // The channel is made once. A retry after a failed rename only repeats the rename.
    if(!created.current){creating.current??=clubFetch<Workspace>('/workspaces/fresh',{body:{name:fresh.name.trim(),topics:fresh.topics,audience:fresh.audience,...(hasAnswers&&{voice:answers})}}).then(rememberCreated).finally(()=>{creating.current=null;});await creating.current;}
    const named=fresh.channelName.trim();
    return named?clubFetch<Workspace>(`/workspaces/${encodeURIComponent(created.current!.slug)}`,{method:'PUT',body:{name:named}}):created.current;
   },result=>{setChannel(asChannel(result as Workspace,hasAnswers?'built':'none'));setSavedFresh(fresh);setSavedVoice(voice);if(ai==='connected')goTo(3);else void leave({name:'home'});});
   return;
  }
  // Back with a changed answer: the guide is written again from the new answers (it needs the first two).
  if(ai==='connected'&&channel&&!voiceUnchanged&&canWriteVoice(answers)){
   const body={voice:answers.voice!,audience:answers.audience!,...(answers.moves&&{moves:answers.moves})};
   void save.run(()=>clubFetch(`/workspaces/${encodeURIComponent(channel.slug)}/voice`,{body:{answers:body}}),()=>{setChannel({...channel,voice:'built'});setSavedVoice(voice);goTo(3);});
   return;
  }
  goTo(3);
 };

 const next=()=>{if(shown===1)finishChannel();else if(shown===2)finishVoice();else goTo(shown+1);};
 const block=path==='channel'?addChannelBlock(ai):null;
 const allowed=canContinue(shown,state)&&!busy&&!selecting&&selectionReady;
 const info=WELCOME_STEPS[shown];
 // A guide that came from the channel's own videos has nothing to answer; every other voice step shows the questions, filled with what was said.
 const fromVideos=path==='channel'&&channel?.voice==='built'&&savedVoice===null;
 const title=shown===2&&fromVideos?'This is how you talk':info.title;
 const typed=voiceFromDraft(voice);
 const incomplete=channel!==null&&!fromVideos&&!sameVoice(typed,voiceFromDraft(savedVoice??{}))&&!canWriteVoice(typed);
 const onScan=useCallback((next:Scan)=>setScan(next),[]);
 const editFailed=edit.state.phase==='failed'?edit.state.message:'';

 return <div className="welcome">
  <div className="row club-drag welcome-header" style={{padding:window.sceneForge?.platform==='darwin'?'18px 28px 18px 94px':'18px 28px'}}>
   <span className="welcome-brand"><BrandMark size={30}/></span><b style={{letterSpacing:'-0.01em'}}>Creator Compiler</b>
   <span className="grow"/><button type="button" className="linkish" style={{color:'var(--cc-text-2)'}} onClick={home}>Skip setup</button>
  </div>
  <div className="welcome-body" ref={body}>
   <div className="welcome-col" aria-live="polite">
    <div className="row" style={{margin:'20px 0 14px',gap:10}}>
     <span className="small muted tnum">Step {shown+1} of 4</span>
     <div style={{display:'flex',gap:4,flex:1,maxWidth:220}}>{WELCOME_STEPS.map((_,index)=><span key={index} style={{flex:1,height:4,borderRadius:'var(--cc-r-sm)',background:index<=shown?'var(--cc-primary)':'var(--cc-line-strong)',transition:'background .3s'}}/>)}</div>
    </div>
    <h1 className="welcome-title">{title}</h1>
    <p className="muted welcome-why">{info.why}</p>
    {shown===0&&<ConnectStep check={check} onReload={recheck} onConnected={result=>connected(result?.provider??'claude',result?.account)}/>}
    {shown===1&&<ChannelStep path={path} onPath={setPath} url={url} onUrl={setUrl} job={add.state} onAdd={addChannel} block={block} onConnect={()=>goTo(0)} channel={channel} fresh={fresh} onFresh={setFresh}/>}
    {shown===2&&<VoiceStep path={path} channel={channel} fromVideos={fromVideos} draft={voice} onDraft={setVoice} save={save.state} onRetry={finishVoice} incomplete={incomplete} saved={savedVoice!==null}/>}
    {channel&&selectionReady&&<WorkingData visible={shown===3} onAdded={id=>void leave({name:'videos',view:'board',new:id})} onSettings={()=>void leave({name:'settings',section:'followed'})} onScan={onScan}/>}
    {selectionError&&<ErrorLine message={selectionError} onRetry={()=>{if(created.current)void activateImported({workspace:created.current,voice:channel?.voice??'none'} as AddChannelResult);}}/>}
    {shown===1&&editFailed&&<div style={{marginTop:14}}><ErrorLine message={editFailed} onRetry={finishChannel}/></div>}
    {leaveError&&<div style={{marginTop:14}}><ErrorLine message={leaveError.message} onRetry={()=>void leave(leaveError.route)}/></div>}
   </div>
  </div>
  <div className="welcome-foot"><div className="welcome-col">
   {shown>0?<Button variant="ghost" disabled={busy} onClick={()=>goTo(shown-1)}><Icon name="back" size={15}/>Back</Button>:<span/>}
   {scan&&shown<3&&<span className="welcome-aside" role="status">Searching YouTube for your topics in the background. It never holds you up.</span>}
   <span className="grow"/>
   {shown<3
    ?<Button variant={allowed?'primary':'secondary'} disabled={!allowed} onClick={next}>Continue<Icon name="forward" size={15}/></Button>
    :<Button onClick={home}>Go to Video board<Icon name="forward" size={15}/></Button>}
  </div></div>
 </div>;
}
