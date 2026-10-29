import type {ConceptLevel,Video} from '../../shared/club';
import {youtubeId} from './board';
import type {IdeaHeld} from './routes';

/** The reasons offered when skipping an idea. */
export const SKIP_REASONS=['Too generic','Not their style','Already covered',"Can't show it",'Bad timing'] as const;

/**
 * The groups of the Ideas lane on Videos. Timely ideas (news, newest first) and Evergreen ideas (best rated first) are open;
 * the ideas put off with Later and the ones skipped are folded groups of their own, so an idea is in exactly one place.
 */
export type IdeaGroup='timely'|'evergreen'|IdeaHeld;
export const IDEA_GROUPS:ReadonlyArray<readonly [IdeaGroup,string]>=[['timely','Timely'],['evergreen','Evergreen'],['later','Later'],['skipped','Skipped']];

const LEVEL_POINTS:Record<ConceptLevel,number>={high:3,mid:2,low:1};
/** How good an idea looks from its three ratings (demand, gap, easy to show): 3 for high, 2 for medium, 1 for low, 0 when not rated. */
export const ideaScore=(video:Pick<Video,'idea'>)=>(['demand','gap','show'] as const).reduce((sum,key)=>sum+(video.idea?.[key]?LEVEL_POINTS[video.idea[key].level]??0:0),0);

const newest=(a:Video,b:Video)=>b.createdAt.localeCompare(a.createdAt)||a.order-b.order;

/** Which group an idea is in. */
export const ideaGroupOf=(video:Video):IdeaGroup=>video.hidden??(isTimely(video)?'timely':'evergreen');

/** The ideas of each group: Timely newest first, Evergreen by score then newest, Later and Skipped newest first. The idea just added (`newId`) leads its group. */
export function ideaGroups(videos:readonly Video[],newId?:string):Record<IdeaGroup,Video[]>{
 const groups:Record<IdeaGroup,Video[]>={timely:[],evergreen:[],later:[],skipped:[]};
 for(const video of videos)if(video.stage==='ideas')groups[ideaGroupOf(video)].push(video);
 const first=(order:(a:Video,b:Video)=>number)=>(a:Video,b:Video)=>a.id===newId?-1:b.id===newId?1:order(a,b);
 groups.timely.sort(first(newest));
 groups.evergreen.sort(first((a,b)=>ideaScore(b)-ideaScore(a)||newest(a,b)));
 groups.later.sort(first(newest));groups.skipped.sort(first(newest));
 return groups;
}

/** Ideas you haven't put off or skipped. */
export const openIdeas=(videos:readonly Video[])=>videos.filter(video=>video.stage==='ideas'&&!video.hidden);

/** The YouTube video an idea came from, when its first source is one. It gives the card its picture and its outlier chip. */
export const ideaSourceVideoId=(video:Video)=>youtubeId(video.idea?.sources?.[0]?.url);

/** The picture a video gets: the source video's for an idea, the published video's once it is out, and none in between (those show a draft thumbnail, so they look different from videos made by others). */
export function videoThumbId(video:Video):string|undefined{
 if(video.stage==='ideas')return ideaSourceVideoId(video);
 return video.stage==='published'?youtubeId(video.youtubeUrl):undefined;
}

/** The one line an idea's card shows under the title: why it could work, else the angle, the note it was made from or the hook. */
export const ideaWhy=(video:Pick<Video,'idea'>):string=>{
 const notes=video.idea;
 return notes?.why||notes?.angle||notes?.note||notes?.hook||'';
};

const YOUTUBE_ID=/^[\w-]{11}$/;
/** What `?bd=` carries is a link (YouTube or Instagram) or a YouTube video id. This is the link to break down. */
export const breakdownUrl=(bd:string)=>YOUTUBE_ID.test(bd)?`https://www.youtube.com/watch?v=${bd}`:bd;

export const LEVEL_WORD:Record<ConceptLevel,string>={high:'High',mid:'Medium',low:'Low'};

/** An idea is timely when its lane says so ("timely", or "both" for one that is timely and evergreen). */
export const isTimely=(video:Pick<Video,'idea'>)=>video.idea?.lane==='timely'||video.idea?.lane==='both';
