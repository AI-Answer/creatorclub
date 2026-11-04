import type {Project} from '../../shared/types.js';

/** Prefer the first visible timeline frame, then recorded takes (which may not have been kept on the timeline yet). */
export function coverMediaIds(project:Project):string[]{
 const clips=project.clips.filter(clip=>clip.track==='screen'||clip.track==='camera').sort((a,b)=>a.start-b.start);
 const takes=[...(project.recordedTakes??[])].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 return [...new Set([...clips.map(clip=>clip.mediaId),...takes.flatMap(take=>['screen','camera'].flatMap(track=>{
  const index=take.tracks.indexOf(track as 'screen'|'camera');return index>=0&&take.media[index]?[take.media[index].id]:[];
 }))])];
}
