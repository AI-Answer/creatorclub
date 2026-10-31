import type {SignalEntry,SignalSource} from '../../shared/club';

export type SignalFilter='all'|SignalSource;
export type SignalSort='top'|'new';
export const SIGNAL_FILTERS:ReadonlyArray<readonly [SignalFilter,string]>=[['all','All'],['x','X'],['reddit','Reddit']];
export const SIGNAL_SORTS:ReadonlyArray<readonly [SignalSort,string]>=[['top','Most liked'],['new','Newest']];

/** Posts from one source (or all), in one order, with the ones about the channel's topics first. `off` counts the others; `everything` adds them after. */
export function signalList(items:readonly SignalEntry[],source:SignalFilter,sort:SignalSort,everything:boolean):{shown:SignalEntry[];off:number}{
 const list=items.filter(i=>source==='all'||i.source===source).sort((a,b)=>sort==='new'?a.ageHours-b.ageHours:b.likes-a.likes);
 const mine=list.filter(i=>i.fit),others=list.filter(i=>!i.fit);
 return {shown:everything?mine.concat(others):mine,off:others.length};
}

/** How many posts about the channel's topics each source has. */
export const signalCounts=(items:readonly SignalEntry[]):Record<SignalFilter,number>=>({
 all:items.filter(i=>i.fit).length,
 x:items.filter(i=>i.fit&&i.source==='x').length,
 reddit:items.filter(i=>i.fit&&i.source==='reddit').length,
});
