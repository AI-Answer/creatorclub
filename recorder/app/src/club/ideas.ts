import type {ConceptLevel,Video} from '../../shared/club';
import {youtubeId} from './board';
import type {IdeaFilter} from './routes';

/** The three lists on Ideas: what is new, what waits for later, and what was skipped. */
export type IdeaTab='new'|IdeaFilter;
export const IDEA_TABS:ReadonlyArray<readonly [IdeaTab,string]>=[['new','New'],['later','Later'],['skipped','Skipped']];

/** The reasons offered when skipping an idea. */
export const SKIP_REASONS=['Too generic','Not their style','Already covered',"Can't show it",'Bad timing'] as const;

const isIdea=(video:Video)=>video.stage==='ideas';
export const tabOf=(filter:IdeaFilter|undefined):IdeaTab=>filter??'new';

export function ideaCounts(videos:readonly Video[]):Record<IdeaTab,number>{
 const ideas=videos.filter(isIdea);
 return {new:ideas.filter(v=>!v.hidden).length,later:ideas.filter(v=>v.hidden==='later').length,skipped:ideas.filter(v=>v.hidden==='skipped').length};
}

/** The ideas of one list, the one just added first, then the newest. */
export function ideasIn(videos:readonly Video[],tab:IdeaTab,newId?:string):Video[]{
 return videos.filter(v=>isIdea(v)&&(tab==='new'?!v.hidden:v.hidden===tab))
  .sort((a,b)=>(a.id===newId?-1:b.id===newId?1:b.createdAt.localeCompare(a.createdAt)||a.order-b.order));
}

/** The YouTube video an idea came from, when its first source is one. It gives the card its picture and its outlier chip. */
export const ideaSourceVideoId=(video:Video)=>youtubeId(video.idea?.sources?.[0]?.url);

/** The picture a video gets: the source video's for an idea, the published video's once it is out, and none in between (those show a draft thumbnail, so they look different from videos made by others). */
export function videoThumbId(video:Video):string|undefined{
 if(video.stage==='ideas')return ideaSourceVideoId(video);
 return video.stage==='published'?youtubeId(video.youtubeUrl):undefined;
}

/** The one line a row of the Ideas list shows under the title: why it could work, else the angle, the note it was made from or the hook. */
export const ideaWhy=(video:Pick<Video,'idea'>):string=>{
 const notes=video.idea;
 return notes?.why||notes?.angle||notes?.note||notes?.hook||'';
};

/**
 * For each idea of a list, whether its row shows the source video's picture: when it has one, and it is not the picture of the row above.
 * Ideas from one video sit together in the list, so the picture shows once for the group instead of on every row.
 */
export function showSourceThumbs(videos:readonly Video[]):boolean[]{
 let previous:string|undefined;
 return videos.map(video=>{
  const id=ideaSourceVideoId(video);
  const show=!!id&&id!==previous;
  previous=id;
  return show;
 });
}

const YOUTUBE_ID=/^[\w-]{11}$/;
/** What `?bd=` carries is a link (YouTube or Instagram) or a YouTube video id. This is the link to break down. */
export const breakdownUrl=(bd:string)=>YOUTUBE_ID.test(bd)?`https://www.youtube.com/watch?v=${bd}`:bd;

export const LEVEL_WORD:Record<ConceptLevel,string>={high:'High',mid:'Medium',low:'Low'};

/** An idea is timely when its lane says so ("timely", or "both" for one that is timely and evergreen). */
export const isTimely=(video:Pick<Video,'idea'>)=>video.idea?.lane==='timely'||video.idea?.lane==='both';
