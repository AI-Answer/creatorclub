import {clipDuration,makeId,type Project} from '../shared/types';
import {plainClone,plainView} from './project-draft';
import {remapClipCaptions} from '../shared/caption-timing';
import {deleteItems,linkedIds,remapLinks,splitLinked,syncScenesToTakes,trimClips} from './timeline-edit';
/** All editor surfaces use the same linked, caption-aware timeline operations. */
export const splitAt=splitLinked;
export function deleteSelection(project:Project,ids:ReadonlySet<string>,ripple:boolean){deleteItems(project,ids,ripple);syncScenesToTakes(project);}
export function trimSelection(project:Project,ids:ReadonlySet<string>,time:number,side:'left'|'right',ripple=false){
 const all=linkedIds(project.clips,ids),clip=project.clips.find(c=>all.has(c.id)&&c.start<time&&c.start+clipDuration(c)>time);if(!clip)return false;
 const delta=time-(side==='left'?clip.start:clip.start+clipDuration(clip));trimClips(project,all,side,delta,ripple);syncScenesToTakes(project);return true;
}
export interface TimelineClipboard {clips:Project['clips'];elements:Project['elements'];captions:Project['captions'];zooms:Project['zooms'];media:Project['media'];start:number;}
export function copySelection(p:Project,ids:ReadonlySet<string>):TimelineClipboard|null{
 p=plainView(p);const chosen=linkedIds(p.clips,ids);const clips=p.clips.filter(c=>chosen.has(c.id)),elements=p.elements.filter(c=>ids.has(c.id)),captions=remapClipCaptions({...p,captions:p.captions.filter(c=>ids.has(c.id)||clips.some(x=>x.start<c.end&&x.start+clipDuration(x)>c.start))},{clips,media:p.media}),zooms=p.zooms.filter(c=>ids.has(c.id));const items=[...clips,...elements,...captions,...zooms];if(!items.length)return null;const mediaIds=new Set(clips.map(c=>c.mediaId));return {clips:clips.map(plainClone),elements:elements.map(plainClone),captions:captions.map(plainClone),zooms:zooms.map(plainClone),media:p.media.filter(m=>mediaIds.has(m.id)).map(plainClone),start:Math.min(...items.map(c=>c.start))};
}
export function pasteSelection(p:Project,clipboard:TimelineClipboard,time:number){const data=plainClone(clipboard),offset=time-data.start,ids:string[]=[];for(const m of data.media)if(!p.media.some(item=>item.id===m.id))p.media.push(m);for(const key of ['clips','elements','captions','zooms']as const)for(const item of data[key]){item.id=makeId();item.start+=offset;ids.push(item.id);if('end'in item){item.end+=offset;if(item.words)item.words=item.words.map(w=>({...w,start:w.start+offset,end:w.end+offset}));}(p[key]as Array<typeof item>).push(item);}remapLinks(p,new Set(ids));return ids;}
