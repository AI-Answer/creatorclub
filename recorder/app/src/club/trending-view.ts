import type {TrendingEntry,TrendingResponse} from '../../shared/club';

/** The three lists on Working now. */
export type TrendShow='fit'|'followed'|'all';
export type TrendSort='vpd'|'views'|'growth';
export const TREND_SORTS:ReadonlyArray<readonly [TrendSort,string]>=[['vpd','Views per day'],['views','Total views'],['growth','Growth']];

const DAY_MS=86_400_000;

/** Views gained per day between the last two readings. Zero when the video was only read once. */
export function growthPerDay(item:Pick<TrendingEntry,'history'>):number{
 const readings=[...item.history].sort((a,b)=>a.d.localeCompare(b.d));
 if(readings.length<2)return 0;
 const before=readings[readings.length-2],last=readings[readings.length-1];
 const days=Math.max(1,(Date.parse(last.d)-Date.parse(before.d))/DAY_MS);
 return (last.v-before.v)/days;
}

export const trendCounts=(items:readonly TrendingEntry[])=>({fit:items.filter(i=>i.fit).length,followed:items.filter(i=>i.kind==='followed').length,all:items.length});
/** Videos that are not about the channel's topics, which "For you" leaves out. */
export const offTopic=(items:readonly TrendingEntry[])=>items.filter(i=>!i.fit).length;

/** The videos to show for a list and a sort. */
export function trendList(items:readonly TrendingEntry[],show:TrendShow,sort:TrendSort):TrendingEntry[]{
 const list=items.filter(i=>show==='all'||(show==='fit'?i.fit:i.kind==='followed'));
 return list.sort((a,b)=>sort==='views'?b.views-a.views:sort==='growth'?growthPerDay(b)-growthPerDay(a)||b.vpd-a.vpd:b.vpd-a.vpd);
}

/** "New": first seen in the last refresh and still under two days old. */
export const isNew=(item:Pick<TrendingEntry,'firstSeen'|'ageDays'>,updatedAt:string|null)=>!!updatedAt&&item.firstSeen===updatedAt.slice(0,10)&&item.ageDays<2;

/** A channel that follows fewer channels than this has Working now filled from a search on its topics. Same number as the server's. */
export const SEED_BELOW=3;
/** Whether Working now was never filled and the channel follows too few channels to fill it by reading them: the search on its topics should run. */
export const needsSeed=(data:Pick<TrendingResponse,'items'|'updatedAt'|'followed'>)=>data.followed<SEED_BELOW&&data.items.length===0&&data.updatedAt===null;

/** The channel to follow for a video, or null when it is from a followed channel already or its channel id is not known. */
export const followTarget=(item:Pick<TrendingEntry,'kind'|'channel'|'channelId'>)=>item.kind==='followed'||!item.channelId?null:{name:item.channel,channelId:item.channelId};
