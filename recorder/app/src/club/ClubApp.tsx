import {useCallback,useEffect,useRef,useState} from 'react';
import type {AiStatus,ClubSettings,Video,Workspace} from '../../shared/club';
import {clubFetch} from './api';
import {Sidebar} from './Sidebar';
import {autoCollapses,defaultTab,routePath,stepForTab,useHashRoute,type Route,type VideoStep,type VideoTab} from './routes';
import {BoardScreen} from './screens/BoardScreen';
import {OnboardingScreen} from './screens/OnboardingScreen';
import {PlaceholderScreen} from './screens/PlaceholderScreen';
import {SettingsScreen} from './screens/SettingsScreen';
import {VideoScreen} from './screens/VideoScreen';
import {Help} from './shell/Help';
import {NewVideo} from './shell/NewVideo';
import {Palette} from './shell/Palette';
import {ScreenBoundary} from './shell/ScreenBoundary';
import {Button,EmptyState,Spinner,ToastProvider,cn} from './ui';
import {useShellVideos} from './useShellVideos';

/** First launch is needed when no AI is signed in or there is no channel. A server that cannot be reached never forces it. */
export async function needsOnboarding():Promise<boolean>{
 try{
  const [status,{workspaces}]=await Promise.all([clubFetch<AiStatus>('/ai/status'),clubFetch<{workspaces:Workspace[]}>('/workspaces')]);
  return !(status.claude.signedIn||status.codex.signedIn)||workspaces.length===0;
 }catch{return false;}
}

const isHome=(route:Route)=>route.name==='overview'||route.name==='production';

/** One video's page. Loads the video and notes that it was opened, which feeds Recent videos. Without a tab in the link it opens on the tab for the video's stage. */
function VideoRoute({id,tab,navigate}:{id:string;tab?:VideoTab;navigate(route:Route,options?:{replace?:boolean}):void}){
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
 const stage=video?.stage;
 useEffect(()=>{if(stage&&!tab)navigate({name:'video',id,tab:defaultTab(stage)},{replace:true});},[stage,tab,id,navigate]);
 const openProduction=useCallback(()=>navigate({name:'production',view:'board'}),[navigate]);
 const openStep=useCallback((step:VideoStep)=>navigate({name:'video',id,tab:step}),[navigate,id]);
 if(video===undefined)return <div className="flex flex-1 items-center justify-center"><Spinner label="Loading the video" size={20}/></div>;
 if(video===null)return <EmptyState className="flex-1" title="Video not found" description="It may have been removed from the board." action={<Button onClick={openProduction}>Open board</Button>}/>;
 return <VideoScreen key={video.id} video={video} step={stepForTab(tab??defaultTab(video.stage))} onStep={openStep} onBoard={openProduction} onVideo={setVideo}/>;
}

/** CreatorClub's root: the sidebar beside the current screen, with search (⌘K), New video, the How it works dialog and toasts above them. */
export default function ClubApp(){
 return <div className={cn('club-root',window.sceneForge&&'club-desktop')}>
  <ToastProvider><Shell/></ToastProvider>
 </div>;
}

function Shell(){
 const [route,navigate]=useHashRoute();
 const [paletteOpen,setPaletteOpen]=useState(false),[newOpen,setNewOpen]=useState(false),[helpOpen,setHelpOpen]=useState(false);
 // Bumped when you switch channels, so the sidebar and the screen beside it load that channel afresh.
 const [channelEpoch,setChannelEpoch]=useState(0);
 // `null` follows the route (folded on Record and Edit); true or false is a choice made with the collapse button, kept until you go elsewhere.
 const [sidebarOpen,setSidebarOpen]=useState<boolean|null>(null);
 const path=routePath(route);
 const main=useRef<HTMLElement>(null);
 const videos=useShellVideos(`${channelEpoch}${path}`);

 useEffect(()=>{setSidebarOpen(null);if(main.current&&route.name!=='video')main.current.scrollTop=0;},[path,route.name]);
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setPaletteOpen(open=>!open);}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[]);

 // The first-visit dialog opens once. Closing it for the first time saves that in the workspace's settings.json.
 const firstVisit=useRef(false);
 const welcomeIfNew=useCallback(()=>{
  clubFetch<ClubSettings>('/settings').then(settings=>{if(!settings.welcomed){firstVisit.current=true;setHelpOpen(true);}},()=>{});
 },[]);
 const closeHelp=useCallback(()=>{
  setHelpOpen(false);
  if(firstVisit.current){firstVisit.current=false;clubFetch('/settings/welcomed',{method:'POST'}).catch(()=>{});}
 },[]);
 const finishOnboarding=useCallback(()=>{navigate({name:'overview'});welcomeIfNew();},[navigate,welcomeIfNew]);
 // Reaching the overview or Production with no AI or no channel sends you to first launch; otherwise a first visit opens the dialog.
 // Checked once, and only if you are still on one of them.
 const current=useRef(route);current.current=route;
 const checked=useRef(false);
 useEffect(()=>{
  if(!isHome(route)||checked.current)return;
  checked.current=true;
  void needsOnboarding().then(needed=>{
   if(!isHome(current.current))return;
   if(needed)navigate({name:'welcome'});else welcomeIfNew();
  });
 },[route,navigate,welcomeIfNew]);

 const switched=useCallback(()=>{setChannelEpoch(n=>n+1);navigate({name:'overview'});},[navigate]);
 const openProduction=useCallback(()=>navigate({name:'production',view:'board'}),[navigate]);
 const addChannel=useCallback(()=>navigate({name:'welcome'}),[navigate]);

 let screen;
 switch(route.name){
  case 'welcome':screen=<OnboardingScreen onBoard={openProduction} onDone={finishOnboarding}/>;break;
  case 'overview':screen=<PlaceholderScreen title="Overview" icon="House"/>;break;
  case 'ideas':screen=<PlaceholderScreen title="Ideas" icon="Lightbulb"/>;break;
  case 'trending':screen=<PlaceholderScreen title="Working now" icon="TrendingUp"/>;break;
  case 'signals':screen=<PlaceholderScreen title="Signals" icon="MessagesSquare"/>;break;
  case 'production':screen=<BoardScreen onOpenVideo={(id,step)=>navigate({name:'video',id,tab:step})}/>;break;
  case 'video':screen=<VideoRoute id={route.id} tab={route.tab} navigate={navigate}/>;break;
  case 'settings':screen=<SettingsScreen onAddChannel={addChannel}/>;break;
 }
 const collapsed=sidebarOpen===null?autoCollapses(route):!sidebarOpen;
 return <div className="shell">
  {route.name!=='welcome'&&<Sidebar route={route} collapsed={collapsed} onToggle={()=>setSidebarOpen(collapsed)} onSearch={()=>setPaletteOpen(true)} onHelp={()=>setHelpOpen(true)} onSwitched={switched} onAdd={addChannel} videos={videos} epoch={channelEpoch}/>}
  <div className="main-col">
   {window.sceneForge&&<div className="club-drag main-drag" aria-hidden/>}
   <main key={channelEpoch} ref={main} className="main" id="main"><ScreenBoundary key={route.name==='video'?`video/${route.id}`:path}>{screen}</ScreenBoundary></main>
  </div>
  {paletteOpen&&<Palette videos={videos} onClose={()=>setPaletteOpen(false)} onOpen={navigate} onNewVideo={()=>setNewOpen(true)}/>}
  {newOpen&&<NewVideo onClose={()=>setNewOpen(false)} onOpen={navigate}/>}
  {helpOpen&&<Help onClose={closeHelp}/>}
 </div>;
}
