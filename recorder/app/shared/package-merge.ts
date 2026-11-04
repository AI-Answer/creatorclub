import type { ConceptRating, Package } from './club';
import { pairThumbs } from './package-rules';

/** The part of a package a run may be asked to write again whole. */
export type PackageGroup = 'titles' | 'thumbnail' | 'hook';

/** Every group a run may be asked to write again, for the server's check of the request. */
export const PACKAGE_GROUPS = ['titles', 'thumbnail', 'hook'] as const satisfies readonly PackageGroup[];


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
 if(earlier.thumbs||written.thumbs){const have=pairThumbs(earlier),wanted=pairThumbs(written);merged.thumbs=[0,1,2].map(i=>fill(have[i],wanted[i])) as Package['thumbs'];}
 if(earlier.description)merged.description=earlier.description;
 if(earlier.tags)merged.tags=earlier.tags;
 if(demand)merged.demand=demand;if(gap)merged.gap=gap;if(show)merged.show=show;
 // A pair is a title and its words: writing the titles again writes their words too, so no new title keeps another title's words.
 if(replace==='titles'){merged.titles=written.titles;if(written.thumbs)merged.thumbs=written.thumbs;}
 if(replace==='thumbnail'){merged.thumbnailText=written.thumbnailText;if(written.thumbs)merged.thumbs=written.thumbs;}
 if(replace==='hook')merged.hook=written.hook;
 return merged;
}

