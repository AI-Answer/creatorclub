import type {SignalEntry,TrendingEntry} from '../../shared/club';
import type {DiscoverShow} from './routes';
import {signalCounts,signalList} from './signals-view';
import {trendCounts,trendList,type TrendSort} from './trending-view';

/*
 * The logic behind Discover: videos doing better than usual (YouTube) and posts (X, Reddit) in one ranked feed. Pure, so the screen only draws it.
 */

/** One card of the feed: a YouTube video or a post. */
export type FeedItem={kind:'video';item:TrendingEntry}|{kind:'post';item:SignalEntry};

/** The chips above the feed, in order. */
export const DISCOVER_SHOWS:ReadonlyArray<readonly [DiscoverShow,string]>=[['fit','For you'],['followed','Followed'],['youtube','YouTube'],['x','X'],['reddit','Reddit']];

export type DiscoverSort='top'|'new'|TrendSort;

/** The orders a chip offers. The first is the default: Top for the mixed feed, views per day for videos, likes for posts. */
export function sortsFor(show:DiscoverShow):ReadonlyArray<readonly [DiscoverSort,string]>{
 if(show==='youtube'||show==='followed')return [['vpd','Views per day'],['views','Total views'],['outlier','Outlier score'],['new','Newest']];
 if(show==='x'||show==='reddit')return [['top','Most liked'],['new','Newest']];
 return [['top','Top'],['new','Newest']];
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
 * The cards for a chip and a sort. Without `everything`, only what is about the channel's topics shows (and, for videos, not under the creator's usual);
 * `off` counts what that leaves out, and `everything` adds it after. Followed lists every video from the channels you follow.
 */
export function discoverFeed(trending:readonly TrendingEntry[],signals:readonly SignalEntry[],show:DiscoverShow,chosen:DiscoverSort,everything:boolean):{shown:FeedItem[];off:number}{
 const sort=sortFor(show,chosen);
 let videos:FeedItem[]=[],posts:FeedItem[]=[],off=0;
 if(show==='fit'||show==='youtube'||show==='followed'){
  const by:TrendSort=sort==='views'||sort==='outlier'?sort:'vpd';
  if(show==='followed')videos=videoItems(trendList(trending,'followed',by));
  else{
   const fit=trendList(trending,'fit',by),ids=new Set(fit.map(item=>item.videoId));
   const rest=trendList(trending,'all',by).filter(item=>!ids.has(item.videoId));
   off+=rest.length;
   videos=videoItems(everything?[...fit,...rest]:fit);
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

/** How many cards each chip shows without Show everything. */
export function discoverCounts(trending:readonly TrendingEntry[],signals:readonly SignalEntry[]):Record<DiscoverShow,number>{
 const videos=trendCounts(trending),posts=signalCounts(signals);
 return {fit:videos.fit+posts.all,followed:videos.followed,youtube:videos.fit,x:posts.x,reddit:posts.reddit};
}

/** The id a card is known by in the list. */
export const feedKey=(entry:FeedItem)=>entry.kind==='video'?`v:${entry.item.videoId}`:`p:${entry.item.id}`;

/** The later of two "last read" times, or null when neither list was ever read. */
export const latestRead=(...times:ReadonlyArray<string|null|undefined>)=>times.filter((time):time is string=>!!time).sort().at(-1)??null;
