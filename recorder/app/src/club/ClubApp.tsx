import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {AiStatus,ClubSettings,Video,Workspace} from '../../shared/club';
import {setAppearance} from '../appearance';
import {rememberAiStatus} from './ai-status';
import {clubFetch} from './api';
import {Sidebar} from './Sidebar';
import {defaultTab,routePath,useHashRoute,videoBackRoute,type Route,type VideoTab} from './routes';
import {WelcomeScreen} from './screens/WelcomeScreen';
import {DiscoverScreen} from './screens/DiscoverScreen';
import {HomeScreen} from './screens/HomeScreen';
import {VideosScreen} from './screens/VideosScreen';
import {SettingsScreen} from './screens/SettingsScreen';
import {ResearchScreen} from './screens/ResearchScreen';
import {Help} from './shell/Help';
import {NewVideo} from './shell/NewVideo';
import {Palette} from './shell/Palette';
import {NoChannel} from './shell/NoChannel';
import {ScreenBoundary} from './shell/ScreenBoundary';
import {TabStrip,isHomeTab,type OpenTab} from './shell/TabStrip';
import type {Video as ShellVideo} from '../../shared/club';
import {Button,EmptyState,Spinner,ToastProvider,cn} from './ui';
import {useChannelState} from './useChannelState';
import {useShellVideos} from './useShellVideos';
import {Workspace as VideoWorkspace} from './workspace/Workspace';

/**
 * First launch is needed until setup was finished or skipped once (`welcomed`). An install that already has a channel and a signed-in AI
 * counts as set up: that is saved once so it sticks. A server that cannot be reached never forces it.
 */
export async function needsOnboarding():Promise<boolean>{
 try{
  if((await clubFetch<ClubSettings>('/settings')).welcomed)return false;
  const {workspaces}=await clubFetch<{workspaces:Workspace[]}>('/workspaces');
  // No channel means setup is needed whatever the AI says, so the slow check of the AI accounts (about 15 seconds) is not waited for here: Welcome runs it itself.
  if(!workspaces.length)return true;
  const status=await clubFetch<AiStatus>('/ai/status');
  rememberAiStatus(status);
  if(status.claude.signedIn||status.codex.signedIn){
   await clubFetch('/settings/welcomed',{method:'POST'}).catch(()=>{});
   return false;
  }
  return true;
 }catch{return false;}
}

const isHome=(route:Route)=>route.name==='home'||route.name==='videos';
/** Welcome makes the channel and Settings can add one; every other screen needs it. */
const needsChannel=(route:Route)=>route.name!=='welcome'&&route.name!=='settings';

/** One video's workspace. Loads the video and notes that it was opened, which feeds Recent videos. Without a tab in the link it opens on the tab for the video's stage. */
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
 if(video===undefined)return <div className="flex flex-1 items-center justify-center"><Spinner label="Loading the video" size={20}/></div>;
 if(video===null)return <EmptyState className="flex-1" title="Video not found" description="It may have been removed from the board." action={<Button onClick={()=>navigate({name:'videos',view:'board'})}>Open Videos</Button>}/>;
 return <VideoWorkspace key={video.id} video={video} tab={tab??defaultTab(video.stage)} back={videoBackRoute()} navigate={navigate} onVideo={setVideo}/>;
}

const TABS_KEY='cc.openVideoTabs';
const readTabs=():string[]=>{try{const saved:unknown=JSON.parse(localStorage.getItem(TABS_KEY)??'[]');return Array.isArray(saved)?saved.filter((id):id is string=>typeof id==='string'):[];}catch{return [];}};

/**
 * The videos open as tabs, Borumi-style: opening a video adds its tab, closing the one you are on opens its neighbour (or Home).
 * Kept in localStorage so the tabs come back after a reload. A tab whose video is gone from the channel's list is dropped.
 */
function useOpenTabs(route:Route,videos:readonly ShellVideo[],navigate:(route:Route)=>void){
 const [ids,setIds]=useState<string[]>(readTabs);
 const openId=route.name==='video'?route.id:null;
 useEffect(()=>{if(openId)setIds(current=>current.includes(openId)?current:[...current,openId]);},[openId]);
 useEffect(()=>{if(videos.length)setIds(current=>{const kept=current.filter(id=>videos.some(video=>video.id===id)||id===openId);return kept.length===current.length?current:kept;});},[videos,openId]);
 useEffect(()=>{try{localStorage.setItem(TABS_KEY,JSON.stringify(ids));}catch{/* private mode: tabs last for this session */}},[ids]);
 const close=useCallback((id:string)=>{
  const at=ids.indexOf(id),rest=ids.filter(other=>other!==id);
  setIds(rest);
  if(id===openId){const neighbour=rest[Math.min(at,rest.length-1)];navigate(neighbour?{name:'video',id:neighbour}:{name:'home'});}
 },[ids,openId,navigate]);
 const tabs=useMemo<OpenTab[]>(()=>ids.map(id=>({id,title:videos.find(video=>video.id===id)?.title??''})),[ids,videos]);
 return {tabs,close};
}

/** Creator Compiler's root: the tab strip over the current screen, with search (⌘K), New video, the How it works dialog and toasts above them. */
export default function ClubApp(){
 return <div className={cn('club-root',window.sceneForge&&'club-desktop')} data-platform={window.sceneForge?.platform}>
  <ToastProvider><Shell/></ToastProvider>
 </div>;
}

function Shell(){
 const [route,navigate]=useHashRoute();
 const [paletteOpen,setPaletteOpen]=useState(false),[newOpen,setNewOpen]=useState(false);
 // `null` is closed; the topic is where Help opens (a step, a word, the shortcuts), empty for the top.
 const [help,setHelp]=useState<{topic?:string}|null>(null);
 // Bumped when you switch channels, so the sidebar and the screen beside it load that channel afresh.
 const [channelEpoch,setChannelEpoch]=useState(0);
 const path=routePath(route);
 const main=useRef<HTMLElement>(null);
 // Asked again when you switch channels, and when you leave Welcome (where a channel may just have been made).
 const channel=useChannelState(`${channelEpoch}${route.name==='welcome'}`);
 const videos=useShellVideos(`${channelEpoch}${path}`,channel==='ready');
 const openTabs=useOpenTabs(route,videos,navigate);

 useEffect(()=>{if(main.current&&route.name!=='video')main.current.scrollTop=0;},[path,route.name]);
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setPaletteOpen(open=>!open);}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[]);

 // Reaching Home or Videos before setup was finished or skipped sends you to first launch. Checked once, and only if you are still on one of them.
 const current=useRef(route);current.current=route;
 const checked=useRef(false);
 useEffect(()=>{
  if(!isHome(route)||checked.current)return;
  checked.current=true;
  void needsOnboarding().then(needed=>{if(needed&&isHome(current.current))navigate({name:'welcome'});});
 },[route,navigate]);
 // The theme chosen in Settings is kept in settings.json, so it applies when the app opens.
 useEffect(()=>{
  clubFetch<ClubSettings>('/settings').then(settings=>{if(settings.appearance)setAppearance(settings.appearance);},()=>{});
 },[]);

 const switched=useCallback(()=>{setChannelEpoch(n=>n+1);navigate({name:'home'});},[navigate]);
 // Adding a channel has one entry: Welcome from its first step, from the channel menu, Settings and the empty screens alike. Step 1 is quick when the AI is already known to be connected.
 const addChannel=useCallback(()=>navigate({name:'welcome'}),[navigate]);
 const openNewVideo=useCallback(()=>setNewOpen(true),[]);

 let screen;
 switch(route.name){
  case 'welcome':screen=<WelcomeScreen navigate={navigate} initialStep={route.step??1}/>;break;
  case 'home':screen=<HomeScreen navigate={navigate} onNewVideo={openNewVideo}/>;break;
  case 'discover':screen=<DiscoverScreen show={route.show} navigate={navigate}/>;break;
  case 'videos':screen=<VideosScreen route={route} navigate={navigate} onNewVideo={openNewVideo}/>;break;
  case 'video':screen=<VideoRoute id={route.id} tab={route.tab} navigate={navigate}/>;break;
  case 'research':screen=<ResearchScreen navigate={navigate}/>;break;
  case 'settings':screen=<SettingsScreen section={route.section} onSetup={addChannel}/>;break;
 }
 if(needsChannel(route)&&channel!=='ready')screen=channel==='none'?<NoChannel onStart={addChannel}/>:<div className="flex flex-1 items-center justify-center"><Spinner label="Loading" size={20}/></div>;
 return <div className="shell">
  {route.name!=='welcome'&&<TabStrip route={route} tabs={openTabs.tabs} onClose={openTabs.close} onNewVideo={openNewVideo} onSearch={()=>setPaletteOpen(true)} onHelp={topic=>setHelp({topic})}/>}
  <div className="shell-row">
   {isHomeTab(route)&&<Sidebar route={route} onSearch={()=>setPaletteOpen(true)} onSwitched={switched} onAdd={addChannel} videos={videos} epoch={channelEpoch}/>}
   <div className="main-col">
    {window.sceneForge&&route.name==='welcome'&&<div className="club-drag main-drag" aria-hidden/>}
    <main key={channelEpoch} ref={main} className="main" id="main"><ScreenBoundary key={route.name==='video'?`video/${route.id}`:path}>{screen}</ScreenBoundary></main>
   </div>
  </div>
  {paletteOpen&&<Palette videos={videos} openId={route.name==='video'?route.id:null} onClose={()=>setPaletteOpen(false)} onOpen={navigate} onNewVideo={()=>setNewOpen(true)} onHelp={topic=>setHelp({topic})}/>}
  {newOpen&&<NewVideo onClose={()=>setNewOpen(false)} onOpen={navigate}/>}
  {help&&<Help topic={help.topic} onClose={()=>setHelp(null)}/>}
 </div>;
}
