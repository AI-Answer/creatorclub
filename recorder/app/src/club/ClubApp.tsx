import {useCallback,useState} from 'react';
import {Button,EmptyState,cn} from './ui';
import {HowItWorksDialog} from './HowItWorksDialog';
import {Sidebar} from './Sidebar';
import {useHashRoute,type VideoStep} from './routes';
import {exampleVideo,findMockVideo} from './mock-videos';
import {BoardScreen} from './screens/BoardScreen';
import {OnboardingScreen} from './screens/OnboardingScreen';
import {SettingsScreen} from './screens/SettingsScreen';
import {VideoScreen} from './screens/VideoScreen';

/** CreatorClub's root: sidebar plus the current route. The video page and first launch use the whole window. */
export default function ClubApp(){
 const [route,navigate]=useHashRoute(),[helpOpen,setHelpOpen]=useState(false);
 const openBoard=useCallback(()=>navigate({name:'board'}),[navigate]);
 const videoId=route.name==='video'?route.id:'';
 const openStep=useCallback((step:VideoStep)=>navigate({name:'video',id:videoId,step}),[navigate,videoId]);
 const withSidebar=route.name==='board'||route.name==='settings';
 let screen;
 if(route.name==='video'){
  const video=findMockVideo(route.id);
  screen=video?<VideoScreen video={video} step={route.step} onStep={openStep} onBoard={openBoard}/>
   :<EmptyState className="flex-1" title="Video not found" description="It may have been removed from the board." action={<Button onClick={openBoard}>Open board</Button>}/>;
 }
 else if(route.name==='settings')screen=<SettingsScreen/>;
 else if(route.name==='onboarding')screen=<OnboardingScreen onBoard={openBoard}/>;
 else screen=<BoardScreen onOpenExample={()=>navigate({name:'video',id:exampleVideo.id,step:'plan'})}/>;
 return <div className={cn('club-root',window.sceneForge&&'club-desktop')}>
  <div className="flex h-full min-h-0">
   {withSidebar&&<Sidebar route={route} navigate={navigate} onHelp={()=>setHelpOpen(true)}/>}
   <main className="flex min-w-0 flex-1 flex-col">{screen}</main>
  </div>
  <HowItWorksDialog open={helpOpen} onClose={()=>setHelpOpen(false)}/>
 </div>;
}
