import type { ConceptRating, Package } from './club';

/** The part of a package a run may be asked to write again whole. */
export type PackageGroup = 'titles' | 'hook';


const fill=(have:string,wanted:string)=>have.trim()?have:wanted;
const rating=(have:ConceptRating|undefined,wanted:ConceptRating|undefined)=>have??wanted;

/**
 * What a package run changes: only the fields that are empty take its words. With `replace`, the given group takes the run's words
 * whole as well (the person asked to write it again). Without an earlier package the run's package is used as it is.
 */
export function mergePackage(earlier:Package|null,written:Package,replace?:PackageGroup):Package{
 if(!earlier)return written;
 const merged:Package={
  angle:fill(earlier.angle,written.angle),twist:fill(earlier.twist,written.twist),thumbnailText:fill(earlier.thumbnailText,written.thumbnailText),
  titles:[0,1,2].map(i=>fill(earlier.titles[i],written.titles[i])) as Package['titles'],
  hook:{visual:fill(earlier.hook.visual,written.hook.visual),spoken:fill(earlier.hook.spoken,written.hook.spoken),text:fill(earlier.hook.text,written.hook.text)},
 };
 const demand=rating(earlier.demand,written.demand),gap=rating(earlier.gap,written.gap),show=rating(earlier.show,written.show);
 if(earlier.description)merged.description=earlier.description;
 if(demand)merged.demand=demand;if(gap)merged.gap=gap;if(show)merged.show=show;
 if(replace==='titles')merged.titles=written.titles;
 if(replace==='hook')merged.hook=written.hook;
 return merged;
}

