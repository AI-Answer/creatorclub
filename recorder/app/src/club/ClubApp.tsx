import {useCallback,useEffect,useRef,useState} from 'react';
import type {AiStatus,ClubSettings,Video,Workspace} from '../../shared/club';
import {clubFetch} from './api';
import {Button,EmptyState,Spinner,cn} from './ui';
import {HowItWorksDialog} from './HowItWorksDialog';
import {Sidebar} from './Sidebar';
import {useHashRoute,type VideoStep} from './routes';
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

/** One video's page. Loads the video and notes that it was opened, which feeds Recent videos. */
function VideoRoute({id,step,onStep,onBoard}:{id:string;step:VideoStep;onStep(step:VideoStep):void;onBoard():void}){
 const [video,setVideo]=useState<Video|null|undefined>(undefined);
 useEffect(()=>{
  let live=true;setVideo(undefined);
  const path=`/videos/${encodeURIComponent(id)}`;
  clubFetch<Video>(path).then(found=>{
   if(!live)return;
   setVideo(found);
   clubFetch(`${path}/opened`,{method:'POST'}).catch(()=>{});
  },()=>{if(live)setVideo(null);});
  return()=>{live=false;};
 },[id]);
 if(video===undefined)return <div className="flex flex-1 items-center justify-center"><Spinner label="Loading the video" size={20}/></div>;
 if(video===null)return <EmptyState className="flex-1" title="Video not found" description="It may have been removed from the board." action={<Button onClick={onBoard}>Open board</Button>}/>;
 return <VideoScreen video={video} step={step} onStep={onStep} onBoard={onBoard}/>;
}

/** CreatorClub's root: sidebar plus the current route. The video page and first launch use the whole window. */
export default function ClubApp(){
 const [route,navigate]=useHashRoute(),[helpOpen,setHelpOpen]=useState(false);
 // Bumped when you switch channels, so the screen beside the sidebar loads that channel afresh.
 const [channelEpoch,setChannelEpoch]=useState(0);
 const openBoard=useCallback(()=>navigate({name:'board'}),[navigate]);
 // The first-visit dialog opens once. Closing it for the first time saves that in the workspace's settings.json.
 const firstVisit=useRef(false);
 const welcomeIfNew=useCallback(()=>{
  clubFetch<ClubSettings>('/settings').then(settings=>{if(!settings.welcomed){firstVisit.current=true;setHelpOpen(true);}},()=>{});
 },[]);
 const closeHelp=useCallback(()=>{
  setHelpOpen(false);
  if(firstVisit.current){firstVisit.current=false;clubFetch('/settings/welcomed',{method:'POST'}).catch(()=>{});}
 },[]);
 const finishOnboarding=useCallback(()=>{navigate({name:'board'});welcomeIfNew();},[navigate,welcomeIfNew]);
 // Reaching the board with no AI or no channel sends you to first launch; otherwise a first visit opens the dialog.
 // Checked once, and only if you are still on the board.
 const routeName=useRef(route.name);routeName.current=route.name;
 const checked=useRef(false);
 useEffect(()=>{
  if(route.name!=='board'||checked.current)return;
  checked.current=true;
  void needsOnboarding().then(needed=>{
   if(routeName.current!=='board')return;
   if(needed)navigate({name:'onboarding'});else welcomeIfNew();
  });
 },[route.name,navigate,welcomeIfNew]);
 const videoId=route.name==='video'?route.id:'';
 const openStep=useCallback((step:VideoStep)=>navigate({name:'video',id:videoId,step}),[navigate,videoId]);
 const withSidebar=route.name==='board'||route.name==='settings';
 let screen;
 if(route.name==='video')screen=<VideoRoute id={route.id} step={route.step} onStep={openStep} onBoard={openBoard}/>;
 else if(route.name==='settings')screen=<SettingsScreen onAddChannel={()=>navigate({name:'onboarding'})}/>;
 else if(route.name==='onboarding')screen=<OnboardingScreen onBoard={openBoard} onDone={finishOnboarding}/>;
 else screen=<BoardScreen onOpenVideo={(id,step)=>navigate({name:'video',id,step})}/>;
 return <div className={cn('club-root',window.sceneForge&&'club-desktop')}>
  <div className="flex h-full min-h-0">
   {withSidebar&&<Sidebar route={route} navigate={navigate} onHelp={()=>setHelpOpen(true)} onSwitch={()=>setChannelEpoch(n=>n+1)}/>}
   <main key={channelEpoch} className="flex min-w-0 flex-1 flex-col">{screen}</main>
  </div>
  <HowItWorksDialog open={helpOpen} onClose={closeHelp}/>
 </div>;
}
