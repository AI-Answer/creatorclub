import {clipDuration,makeId,type Project} from '../shared/types';
import {plainClone,plainView} from './project-draft';
import {remapClipCaptions} from '../shared/caption-timing';
import {deleteItems,freeDelta,linkedIds,remapLinks,splitLinked,syncScenesToTakes,trimClips} from './timeline-edit';
/** All editor surfaces use the same linked, caption-aware timeline operations. */
export const splitAt=splitLinked;
export function deleteSelection(project:Project,ids:ReadonlySet<string>,ripple:boolean){deleteItems(project,ids,ripple);syncScenesToTakes(project);}
export function trimSelection(project:Project,ids:ReadonlySet<string>,time:number,side:'left'|'right',ripple=false){
 const all=linkedIds(project.clips,ids),clip=project.clips.find(c=>all.has(c.id)&&c.start<time&&c.start+clipDuration(c)>time);if(!clip)return false;
 const delta=time-(side==='left'?clip.start:clip.start+clipDuration(clip));trimClips(project,all,side,delta,ripple);syncScenesToTakes(project);return true;
}
export interface TimelineClipboard {clips:Project['clips'];elements:Project['elements'];captions:Project['captions'];zooms:Project['zooms'];layouts?:Project['layouts'];motion?:Project['motion'];media:Project['media'];start:number;}
export function copySelection(p:Project,ids:ReadonlySet<string>):TimelineClipboard|null{
 p=plainView(p);const chosen=linkedIds(p.clips,ids),clips=p.clips.filter(c=>chosen.has(c.id)),elements=p.elements.filter(c=>ids.has(c.id)),captions=[...p.captions.filter(c=>ids.has(c.id)),...remapClipCaptions({...p,captions:p.captions.filter(c=>!ids.has(c.id)&&clips.some(x=>x.start<c.end&&x.start+clipDuration(x)>c.start))},{clips,media:p.media})],zooms=p.zooms.filter(c=>ids.has(c.id)),layouts=p.layouts?.filter(c=>ids.has(c.id)),motion=p.motion?.filter(c=>ids.has(c.id));
 const items=[...clips,...elements,...captions,...zooms,...(layouts??[]),...(motion??[])];if(!items.length)return null;
 const mediaIds=new Set(clips.map(c=>c.mediaId));return plainClone({clips,elements,captions,zooms,...(layouts?.length?{layouts}:{}),...(motion?.length?{motion}:{}),media:p.media.filter(m=>mediaIds.has(m.id)),start:Math.min(...items.map(c=>c.start))});
}
/** The complete selection extent, shared by paste-insert and both duplicate commands. */
export const clipboardEnd=(data:TimelineClipboard)=>Math.max(data.start,...data.clips.map(c=>c.start+clipDuration(c)),...data.elements.map(e=>e.start+e.duration),...data.captions.map(c=>c.end),...data.zooms.map(z=>z.start+z.duration),...(data.layouts??[]).map(l=>l.start+l.duration),...(data.motion??[]).map(m=>m.start+m.duration));
/** Cut only items actually represented by the copy. Unsupported selections (e.g. note pins) remain intact. */
export function cutSelection(p:Project,ids:ReadonlySet<string>):TimelineClipboard|null{
 const data=copySelection(p,ids);if(!data)return null;
 deleteSelection(p,new Set([...data.clips,...data.elements,...data.captions.filter(c=>ids.has(c.id)),...data.zooms,...(data.layouts??[]),...(data.motion??[])].map(i=>i.id)),false);return data;
}
export function pasteSelection(p:Project,clipboard:TimelineClipboard,time:number){
 const data=plainClone(clipboard),ids:string[]=[];
 // Give copies fresh identities before checking the Layout row; originals must remain obstacles.
 for(const key of ['clips','elements','captions','zooms','layouts','motion']as const)for(const item of data[key]??[])item.id=makeId();
 const moving=(data.layouts??[]).map(l=>({...l,row:'layouts'})),offset=moving.length?freeDelta([...moving,{id:makeId(),row:'clipboard-origin',start:data.start,duration:0}],time-data.start,[...(p.layouts??[]).map(l=>({...l,row:'layouts'})),...moving]):time-data.start;
 for(const m of data.media)if(!p.media.some(item=>item.id===m.id))p.media.push(m);
 for(const key of ['clips','elements','captions','zooms','layouts','motion']as const)for(const item of data[key]??[]){
  item.start+=offset;ids.push(item.id);if('end'in item){item.end+=offset;if(item.words)item.words=item.words.map(w=>({...w,start:w.start+offset,end:w.end+offset}));}
  const list=p[key]??=[];(list as Array<typeof item>).push(item);
 }
 if(data.layouts?.length)p.layouts!.sort((a,b)=>a.start-b.start);
 remapLinks(p,new Set(ids));return ids;
}
