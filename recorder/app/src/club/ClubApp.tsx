import {useCallback,useEffect,useRef,useState} from 'react';
import type {AiStatus,Workspace} from '../../shared/club';
import {clubFetch} from './api';
import {Button,EmptyState,cn} from './ui';
import {HowItWorksDialog} from './HowItWorksDialog';
import {Sidebar} from './Sidebar';
import {useHashRoute,type VideoStep} from './routes';
import {exampleVideo,findMockVideo} from './mock-videos';
import {BoardScreen} from './screens/BoardScreen';
import {OnboardingScreen} from './screens/OnboardingScreen';
import {SettingsScreen} from './screens/SettingsScreen';
import {VideoScreen} from './screens/VideoScreen';

/** First launch is needed when no AI is signed in or there is no channel. A server that cannot be reached never forces it. */
export async function needsOnboarding():Promise<boolean>{
 try{
  const [status,{workspaces}]=await Promise.all([clubFetch<AiStatus>('/ai/status'),clubFetch<{workspaces:Workspace[]}>('/workspaces')]);
  return !(status.claude.signedIn||status.codex.signedIn)||workspaces.length===0;
 }catch{return false;}
}

const WELCOMED='creatorclub.welcomed';
const wasWelcomed=()=>{try{return localStorage.getItem(WELCOMED)==='1';}catch{return true;}};
const markWelcomed=()=>{try{localStorage.setItem(WELCOMED,'1');}catch{/* the dialog may show again; that is harmless */}};

/** CreatorClub's root: sidebar plus the current route. The video page and first launch use the whole window. */
export default function ClubApp(){
 const [route,navigate]=useHashRoute(),[helpOpen,setHelpOpen]=useState(false);
 // Bumped when you switch channels, so the screen beside the sidebar loads that channel afresh.
 const [channelEpoch,setChannelEpoch]=useState(0);
 const openBoard=useCallback(()=>navigate({name:'board'}),[navigate]);
 // After the first launch the board opens with the first-visit dialog (a placeholder until the board task builds its own).
 const finishOnboarding=useCallback(()=>{navigate({name:'board'});if(!wasWelcomed()){markWelcomed();setHelpOpen(true);}},[navigate]);
 // Opening on the board with no AI or no channel sends you to first launch. Checked once, and only if you are still on the board.
 const routeName=useRef(route.name);routeName.current=route.name;
 useEffect(()=>{
  if(route.name!=='board')return;
  let cancelled=false;
  void needsOnboarding().then(needed=>{if(needed&&!cancelled&&routeName.current==='board')navigate({name:'onboarding'});});
  return()=>{cancelled=true;};
 },[]);
 const videoId=route.name==='video'?route.id:'';
 const openStep=useCallback((step:VideoStep)=>navigate({name:'video',id:videoId,step}),[navigate,videoId]);
 const withSidebar=route.name==='board'||route.name==='settings';
 let screen;
 if(route.name==='video'){
  const video=findMockVideo(route.id);
  screen=video?<VideoScreen video={video} step={route.step} onStep={openStep} onBoard={openBoard}/>
   :<EmptyState className="flex-1" title="Video not found" description="It may have been removed from the board." action={<Button onClick={openBoard}>Open board</Button>}/>;
 }
 else if(route.name==='settings')screen=<SettingsScreen onAddChannel={()=>navigate({name:'onboarding'})}/>;
 else if(route.name==='onboarding')screen=<OnboardingScreen onBoard={openBoard} onDone={finishOnboarding}/>;
 else screen=<BoardScreen onOpenExample={()=>navigate({name:'video',id:exampleVideo.id,step:'plan'})}/>;
 return <div className={cn('club-root',window.sceneForge&&'club-desktop')}>
  <div className="flex h-full min-h-0">
   {withSidebar&&<Sidebar route={route} navigate={navigate} onHelp={()=>setHelpOpen(true)} onSwitch={()=>setChannelEpoch(n=>n+1)}/>}
   <main key={channelEpoch} className="flex min-w-0 flex-1 flex-col">{screen}</main>
  </div>
  <HowItWorksDialog open={helpOpen} onClose={()=>setHelpOpen(false)}/>
 </div>;
}
