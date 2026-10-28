import {useCallback} from 'react';
import {ChevronRight,FileText,ListChecks,Scissors,Upload} from 'lucide-react';
import {ClubRecorder} from '../ClubRecorder';
import {EmptyState} from '../ui';
import {VideoBottomBar} from '../VideoBottomBar';
import type {VideoStep} from '../routes';
import {backLabel,continueLabel,nextStep,previousStep,videoStepList} from '../video-steps';

export type VideoScreenVideo={id:string;title:string;recorderProjectId?:string};

/**
 * One video's page, the same frame for every step: breadcrumb on top, step content, bottom bar.
 * Record and Edit show SceneForge for the video's recording project once it has one.
 */
export function VideoScreen({video,step,done=[],onStep,onBoard}:{video:VideoScreenVideo;step:VideoStep;done?:readonly VideoStep[];onStep(step:VideoStep):void;onBoard():void}){
 const previous=previousStep(step),next=nextStep(step);
 const back=useCallback(()=>previous==='board'?onBoard():onStep(previous),[previous,onBoard,onStep]);
 return <div className="flex h-full min-h-0 flex-col">
  <header className="club-drag club-traffic flex h-12 shrink-0 items-center border-b border-line px-4">
   <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-base">
    <button type="button" onClick={onBoard} className="rounded-sm px-1.5 py-0.5 text-muted hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">Board</button>
    <ChevronRight aria-hidden size={14} className="text-muted"/>
    <span aria-current="page" className="truncate px-1.5 font-medium text-ink">{video.title}</span>
   </nav>
  </header>
  <div className="flex min-h-0 flex-1 flex-col overflow-auto">
   <StepContent video={video} step={step} onBoard={onBoard}/>
  </div>
  <VideoBottomBar steps={videoStepList} current={step} done={done} onStep={onStep}
   backLabel={backLabel(step)} onBack={back}
   continueLabel={continueLabel(step)} onContinue={next?()=>onStep(next):undefined}/>
 </div>;
}

function StepContent({video,step,onBoard}:{video:VideoScreenVideo;step:VideoStep;onBoard():void}){
 if((step==='record'||step==='edit')&&video.recorderProjectId)return <ClubRecorder projectId={video.recorderProjectId} mode={step==='record'?'Record':'Edit'} onBack={onBoard}/>;
 if(step==='plan')return <EmptyState icon={<ListChecks/>} title="Research" description="Collect anything that helps: links, videos, notes, screenshots."/>;
 if(step==='record')return <EmptyState icon={<FileText/>} title="No scenes yet" description="Create the outline first. Each scene is recorded on its own."/>;
 if(step==='edit')return <EmptyState icon={<Scissors/>} title="Nothing to edit yet" description="Record a scene first."/>;
 return <EmptyState icon={<Upload/>} title="Publish" description="Upload to YouTube, then paste the link here."/>;
}
