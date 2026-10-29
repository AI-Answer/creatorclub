import {SEED_BELOW,type TrendingEntry,type TrendingResponse} from '../../shared/club';

/** The three lists on Working now. */
export type TrendShow='fit'|'followed'|'all';
export type TrendSort='vpd'|'views'|'outlier';
export const TREND_SORTS:ReadonlyArray<readonly [TrendSort,string]>=[['vpd','Views per day'],['views','Total views'],['outlier','Outlier score']];

const DAY_MS=86_400_000;

/** Views gained per day between the last two readings. Zero when the video was only read once. */
export function growthPerDay(item:Pick<TrendingEntry,'history'>):number{
 const readings=[...item.history].sort((a,b)=>a.d.localeCompare(b.d));
 if(readings.length<2)return 0;
 const before=readings[readings.length-2],last=readings[readings.length-1];
 const days=Math.max(1,(Date.parse(last.d)-Date.parse(before.d))/DAY_MS);
 return (last.v-before.v)/days;
}

/** A video "For you" lists: about the channel's topics, and not under its creator's usual views (a video below 1× is no outlier). An unknown usual stays. */
export const qualifies=(item:Pick<TrendingEntry,'fit'|'mult'>)=>item.fit&&(item.mult===null||item.mult>=1);

export const trendCounts=(items:readonly TrendingEntry[])=>({fit:items.filter(qualifies).length,followed:items.filter(i=>i.kind==='followed').length,all:items.length});
/** Videos "For you" leaves out: not about the channel's topics, or under their creator's usual. */
export const offTopic=(items:readonly TrendingEntry[])=>items.filter(i=>!qualifies(i)).length;

/** The videos to show for a list and a sort. A video the feed lists twice (found by a search and by a followed channel) shows once, so its picture is not repeated. */
export function trendList(items:readonly TrendingEntry[],show:TrendShow,sort:TrendSort):TrendingEntry[]{
 const seen=new Set<string>();
 const list=items.filter(i=>(show==='all'||(show==='fit'?qualifies(i):i.kind==='followed'))&&!seen.has(i.videoId)&&!!seen.add(i.videoId));
 list.sort((a,b)=>sort==='views'?b.views-a.views:sort==='outlier'?(b.mult??-1)-(a.mult??-1)||b.vpd-a.vpd:b.vpd-a.vpd);
 // Videos known to beat their creator's usual come first; those with no usual known follow.
 return show==='fit'?[...list.filter(i=>i.mult!==null),...list.filter(i=>i.mult===null)]:list;
}

/** "New": first seen in the last refresh and still under two days old. */
export const isNew=(item:Pick<TrendingEntry,'firstSeen'|'ageDays'>,updatedAt:string|null)=>!!updatedAt&&item.firstSeen===updatedAt.slice(0,10)&&item.ageDays<2;

/** Whether Working now was never filled and the channel follows too few channels to fill it by reading them: the search on its topics should run. */
export const needsSeed=(data:Pick<TrendingResponse,'items'|'updatedAt'|'followed'>)=>data.followed<SEED_BELOW&&data.items.length===0&&data.updatedAt===null;

/** The channel to follow for a video, or null when it is from a followed channel already or its channel id is not known. */
export const followTarget=(item:Pick<TrendingEntry,'kind'|'channel'|'channelId'>)=>item.kind==='followed'||!item.channelId?null:{name:item.channel,channelId:item.channelId};
