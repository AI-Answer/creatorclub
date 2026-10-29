import type {Video,VideoStage} from '../../shared/club';
import {fmtDate,fmtNum} from './format';
import {recordedCount,type SceneProgress} from './scene-status';
import type {IconName} from './ui';
import type {VideoTab} from './routes';

export const greeting=(date=new Date())=>{const hour=date.getHours();return hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';};

/** Stages where a video is being made. */
export const ACTIVE_STAGES:readonly VideoStage[]=['planning','recording','editing','publishing'];
const isActive=(video:Video)=>ACTIVE_STAGES.includes(video.stage);
const byUpdated=(a:Video,b:Video)=>b.updatedAt.localeCompare(a.updatedAt);

export const firstName=(name:string)=>name.trim().split(/\s+/)[0]||name;

export interface Standing{active:Video[];ideas:Video[];published:Video[]}
/** The videos in production, the ideas waiting (not put off or skipped) and the published ones. */
export function standing(videos:readonly Video[]):Standing{
 return {
  active:videos.filter(isActive).sort(byUpdated),
  ideas:videos.filter(v=>v.stage==='ideas'&&!v.hidden).sort((a,b)=>a.order-b.order||a.createdAt.localeCompare(b.createdAt)),
  published:videos.filter(v=>v.stage==='published').sort((a,b)=>(b.publishedAt??'').localeCompare(a.publishedAt??'')),
 };
}

/** A channel with nothing in production and nothing published yet gets the first-video checklist instead of the working overview. */
export const isFresh=({active,published}:Standing)=>active.length===0&&published.length===0;

const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;
export function overviewLede(standing:Standing):string{
 const {active,ideas,published}=standing;
 if(isFresh(standing))return ideas.length?`You have ${plural(ideas.length,'idea')}. Open one and start planning.`:"Let's find your first video. Start with what's already working in your space.";
 return `${plural(active.length,'video')} in production · ${plural(ideas.length,'idea')} waiting · ${published.length} published`;
}

/** Up to `limit` videos to pick up: the ones opened last first, then the other videos in production, the ones touched last first. */
export function resumeVideos(videos:readonly Video[],recent:readonly string[],limit=3):Video[]{
 const byId=new Map(videos.map(v=>[v.id,v]));
 const opened=recent.flatMap(id=>byId.get(id)??[]).filter(isActive);
 const rest=videos.filter(v=>isActive(v)&&!opened.includes(v)).sort(byUpdated);
 return [...opened,...rest].slice(0,limit);
}

/** Videos per stage for the "In production" card. Put-off and skipped ideas are not counted. */
export function stageCounts(videos:readonly Video[],stages:readonly VideoStage[]):{stage:VideoStage;count:number}[]{
 return stages.map(stage=>({stage,count:videos.filter(v=>v.stage===stage&&!v.hidden).length}));
}

/** How far a video's scenes are, from what is known about them. */
export function progressText(video:Video,scenes:readonly SceneProgress[]):string{
 const total=scenes.length,recorded=recordedCount(scenes);
 switch(video.stage){
  case 'ideas':return 'Idea';
  case 'planning':return total?`Planning · ${total} ${total===1?'scene':'scenes'} drafted`:'Planning · no scenes yet';
  case 'recording':return total?`Recording · ${recorded} of ${total} ${total===1?'scene':'scenes'}`:'Recording';
  case 'editing':return total?`Editing · ${total} ${total===1?'scene':'scenes'} recorded`:'Editing';
  case 'publishing':return 'Publishing · ready to upload';
  case 'published':return video.publishedAt?`Published ${fmtDate(video.publishedAt)}`:'Published';
 }
}

export interface NextAction{label:string;tab:VideoTab;icon:IconName}
/** The one thing to do next on a video. */
export function nextAction(video:Video,scenes:readonly SceneProgress[]):NextAction{
 switch(video.stage){
  case 'ideas':return {label:'Start planning',tab:'board',icon:'ArrowRight'};
  case 'planning':return scenes.length?{label:'Continue to recording',tab:'record',icon:'Mic'}:{label:'Draft scenes from board',tab:'board',icon:'Sparkles'};
  case 'recording':{
   const next=scenes.findIndex(scene=>!scene.takes.some(take=>take.kept));
   return next<0?{label:'Continue to editing',tab:'edit',icon:'Scissors'}:{label:`Record scene ${next+1}`,tab:'record',icon:'Mic'};
  }
  case 'editing':return {label:'Keep editing',tab:'edit',icon:'Scissors'};
  case 'publishing':return {label:'Paste YouTube link',tab:'publish',icon:'Upload'};
  case 'published':return {label:video.views!==undefined?`${fmtNum(video.views)} views`:'Open',tab:'publish',icon:'Eye'};
 }
}
