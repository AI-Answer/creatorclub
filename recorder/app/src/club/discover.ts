import type {SignalEntry,TrendingEntry} from '../../shared/club';
import type {DiscoverShow} from './routes';
import {signalList} from './signals-view';
import {trendList,type TrendSort} from './trending-view';

/*
 * The logic behind Discover: videos doing better than usual (YouTube) and posts (X, Reddit) in one ranked feed. Pure, so the screen only draws it.
 */

/** One card of the feed: a YouTube video or a post. */
export type FeedItem={kind:'video';item:TrendingEntry}|{kind:'post';item:SignalEntry};

/** The chips above the feed, in order. */
export const DISCOVER_SHOWS:ReadonlyArray<readonly [DiscoverShow,string]>=[['fit','For you'],['followed','Followed'],['youtube','YouTube'],['x','X'],['reddit','Reddit']];

/** The two views: everything ranked for you, or the channels you follow. */
export const DISCOVER_VIEWS:ReadonlyArray<readonly ['fit'|'followed',string]>=[['fit','For you'],['followed','Followed']];
/** The sources For you can be narrowed to, under the view switch. "All" is For you itself. */
export const DISCOVER_SOURCES:ReadonlyArray<readonly [DiscoverShow,string]>=[['fit','All'],['youtube','YouTube'],['x','X'],['reddit','Reddit']];
/** The view a chip belongs to: Followed is its own view; every source is a part of For you. */
export const viewOf=(show:DiscoverShow):'fit'|'followed'=>show==='followed'?'followed':'fit';

export type DiscoverSort='top'|'new'|TrendSort;

/** The orders a chip offers. The first is the default: Top for the mixed feed, views per day for videos, likes for posts. */
export function sortsFor(show:DiscoverShow):ReadonlyArray<readonly [DiscoverSort,string]>{
 if(show==='youtube'||show==='followed')return [['vpd','Most views per day'],['views','Most views'],['outlier','Furthest above their usual'],['new','Newest']];
 if(show==='x'||show==='reddit')return [['top','Most liked'],['new','Newest']];
 return [['top','Views per day and likes'],['new','Newest']];
}

/** The sort to use: the one chosen when the chip offers it, else the chip's default. */
export const sortFor=(show:DiscoverShow,sort:DiscoverSort):DiscoverSort=>sortsFor(show).some(([key])=>key===sort)?sort:sortsFor(show)[0][0];

/** How old a card is, in hours, so videos and posts can be put in one order. */
const ageHours=(entry:FeedItem)=>entry.kind==='video'?entry.item.ageDays*24:entry.item.ageHours;

/**
 * Two ranked lists in one: each card goes where its rank sits in its own list (the third of ten videos next to the thirtieth of a hundred posts),
 * a video first on a tie. So neither source buries the other, and each keeps its own order.
 */
export function interleave(videos:readonly FeedItem[],posts:readonly FeedItem[]):FeedItem[]{
 const out:FeedItem[]=[];
 let v=0,p=0;
 while(v<videos.length||p<posts.length){
  if(p>=posts.length||(v<videos.length&&v/videos.length<=p/posts.length))out.push(videos[v++]);
  else out.push(posts[p++]);
 }
 return out;
}

const videoItems=(items:readonly TrendingEntry[])=>items.map<FeedItem>(item=>({kind:'video',item}));
const postItems=(items:readonly SignalEntry[])=>items.map<FeedItem>(item=>({kind:'post',item}));

/**
 * The cards for a chip and a sort. Without `everything`, For you shows what is about the channel's topics (and, for videos, not under the creator's usual)
 * and every video from the channels you follow, so For you always holds Followed; `off` counts what that leaves out, and `everything` adds it after.
 * Followed lists every video from the channels you follow.
 */
export function discoverFeed(trending:readonly TrendingEntry[],signals:readonly SignalEntry[],show:DiscoverShow,chosen:DiscoverSort,everything:boolean):{shown:FeedItem[];off:number}{
 const sort=sortFor(show,chosen);
 let videos:FeedItem[]=[],posts:FeedItem[]=[],off=0;
 if(show==='fit'||show==='youtube'||show==='followed'){
  const by:TrendSort=sort==='views'||sort==='outlier'?sort:'vpd';
  if(show==='followed')videos=videoItems(trendList(trending,'followed',by));
  else{
   const fit=trendList(trending,'fit',by),fitIds=new Set(fit.map(item=>item.videoId));
   const mine=[...fit,...trendList(trending,'followed',by).filter(item=>!fitIds.has(item.videoId))],ids=new Set(mine.map(item=>item.videoId));
   const rest=trendList(trending,'all',by).filter(item=>!ids.has(item.videoId));
   off+=rest.length;
   videos=videoItems(everything?[...mine,...rest]:mine);
  }
 }
 if(show==='fit'||show==='x'||show==='reddit'){
  const list=signalList(signals,show==='fit'?'all':show,sort==='new'?'new':'top',everything);
  off+=list.off;posts=postItems(list.shown);
 }
 const shown=sort==='new'
  ?[...videos,...posts].sort((a,b)=>ageHours(a)-ageHours(b)||(a.kind===b.kind?0:a.kind==='video'?-1:1))
  :interleave(videos,posts);
 return {shown,off};
}

/** How many cards each chip shows without Show everything: counted from the same lists the chips draw, so a count never disagrees with its list. */
export function discoverCounts(trending:readonly TrendingEntry[],signals:readonly SignalEntry[]):Record<DiscoverShow,number>{
 const count=(show:DiscoverShow)=>discoverFeed(trending,signals,show,'top',false).shown.length;
 return {fit:count('fit'),followed:count('followed'),youtube:count('youtube'),x:count('x'),reddit:count('reddit')};
}

/** The id a card is known by in the list. */
export const feedKey=(entry:FeedItem)=>entry.kind==='video'?`v:${entry.item.videoId}`:`p:${entry.item.id}`;

/** The later of two "last read" times, or null when neither list was ever read. */
export const latestRead=(...times:ReadonlyArray<string|null|undefined>)=>times.filter((time):time is string=>!!time).sort().at(-1)??null;

/** True when two feeds show the same cards in the same order: a refresh that changed nothing needs no "New results". */
export const sameFeed=(a:readonly FeedItem[],b:readonly FeedItem[])=>a.length===b.length&&a.every((entry,index)=>feedKey(entry)===feedKey(b[index]));

/** "r/ClaudeAI", "r/ClaudeAI and r/codex", "r/a, r/b and r/c": the sources an error line names. */
export function sourceList(names:readonly string[]):string{
 if(names.length<2)return names[0]??'';
 return `${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
}
