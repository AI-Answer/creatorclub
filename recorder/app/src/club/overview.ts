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

/** Who the greeting names: the person, else the first word of a channel's name when it was added from its link (a fresh channel has no link, so its name is a topic, not a person). */
export const greetingName=(profile:{person?:string;name:string;channelUrl:string}|null|undefined)=>{
 if(!profile)return '';
 if(profile.person?.trim())return firstName(profile.person);
 return profile.channelUrl.trim()?firstName(profile.name.replace(/^@/,'')):'';
};

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

/** How far a video's scenes are, from what is known about them. `scenes` is undefined while they are not known (still loading, or could not be read): then only the stage is said. */
export function progressText(video:Video,scenes:readonly SceneProgress[]|undefined):string{
 if(!scenes){
  switch(video.stage){
   case 'ideas':return 'Idea';
   case 'planning':return 'Planning';
   case 'recording':return 'Recording';
   case 'editing':return 'Editing';
   case 'publishing':return 'Publishing · ready to upload';
   case 'published':return video.publishedAt?`Published ${fmtDate(video.publishedAt)}`:'Published';
  }
 }
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
/**
 * The one thing to do next on a video. `scenes` is undefined while they are not known: a stage-only action then, with no claim about scenes.
 * An empty list is a known outline with no scenes in it.
 */
export function nextAction(video:Video,scenes:readonly SceneProgress[]|undefined):NextAction{
 if(!scenes){
  if(video.stage==='planning')return {label:'Continue planning',tab:'plan',icon:'next'};
  if(video.stage==='recording')return {label:'Continue recording',tab:'record',icon:'microphone'};
 }
 const known=scenes??[];
 switch(video.stage){
  case 'ideas':return {label:'Start planning',tab:'board',icon:'next'};
  case 'planning':return known.length?{label:'Continue to recording',tab:'record',icon:'microphone'}:{label:'Draft scenes from board',tab:'board',icon:'ai'};
  case 'recording':{
   if(!known.length)return {label:'Draft scenes from board',tab:'board',icon:'ai'};
   const next=known.findIndex(scene=>!scene.takes.some(take=>take.kept));
   return next<0?{label:'Continue to editing',tab:'edit',icon:'cut'}:{label:`Record scene ${next+1}`,tab:'record',icon:'microphone'};
  }
  case 'editing':return {label:'Keep editing',tab:'edit',icon:'cut'};
  case 'publishing':return {label:'Publish it',tab:'publish',icon:'upload'};
  case 'published':return {label:video.views!==undefined?`${fmtNum(video.views)} views`:'Open',tab:'publish',icon:'preview'};
 }
}
