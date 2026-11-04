import type {RecordedTake} from './types';

/** Version 1 takes refer to already-normalized files. Version 2 keeps originals
 * and trims them non-destructively. Offsets remain editable timeline starts.
 */
export function takeSourceRange(take:Pick<RecordedTake,'media'|'offsets'|'synchronization'>,index:number){
 const media=take.media[index],sync=take.synchronization;
 const source=sync?.version===2?sync.sources.find(s=>s.mediaId===media.id):undefined;
 return {start:take.offsets[index]||0,sourceIn:source?.sourceIn??0,sourceOut:source?.sourceOut??(sync?.version===1?sync.duration:media.duration)};
}

export function takeTimelineDuration(take:Pick<RecordedTake,'media'|'offsets'|'synchronization'|'timeline'>){
 return take.timeline?.duration??(take.synchronization?.version===2?take.synchronization.duration:Math.max(0,...take.media.map((m,i)=>(take.offsets[i]||0)+(take.synchronization?.duration??m.duration))));
}
