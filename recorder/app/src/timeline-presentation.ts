import {captionWordsByClip,narrationClips} from '../shared/caption-timing';
import {clipDuration,type Project} from '../shared/types';
import {isSoundTag} from '../shared/sound-tags';

/** Borumi names scene boundaries, with a short number when the scene is too narrow for its name. */
export const sceneLabel=(i:number,name:string,width:number)=>{const number=String(i+1).padStart(2,'0'),clean=name.replace(/^\s*\d+\.\s*/, '').trim();return width<24?'':width<65?number:/^Scene\s+\d+$/i.test(clean)?clean.toUpperCase():`${number}${clean?' '+clean.toUpperCase():''}`;};
/** A view preference, deliberately separate from the project and everything the exporter reads. */
export const hiddenRowsKey=(id:string)=>`creator-compiler:timeline-hidden-rows:${id}`;
export function readHiddenRows(id:string):string[]{try{const value=JSON.parse(localStorage.getItem(hiddenRowsKey(id))??'[]');return Array.isArray(value)?value.filter((x):x is string=>typeof x==='string'):[];}catch{return [];}}
export function saveHiddenRows(id:string,rows:readonly string[]){try{localStorage.setItem(hiddenRowsKey(id),JSON.stringify(rows));}catch{/* Private browsing and full storage must never prevent editing. */}}
/** Duplicate transcription passes can overlap; prefer the first complete caption, retaining legitimate repeated words in sequence. */
export function clipCaptionBands(p:Pick<Project,'clips'|'media'|'captions'>){
 const captions=p.captions.filter(c=>c.end>c.start&&!isSoundTag(c.text)&&c.text.trim()).sort((a,b)=>a.start-b.start||b.end-a.end),accepted:typeof captions=[];
 let active:typeof captions=[];for(const c of captions){active=active.filter(a=>a.end>c.start);if(active.some(a=>Math.min(a.end,c.end)-Math.max(a.start,c.start)>Math.min(a.end-a.start,c.end-c.start)*.5))continue;accepted.push(c);active.push(c);}
 const clean={...p,captions:accepted},out=captionWordsByClip(clean);
 for(const c of narrationClips(p)){
  const words=out.get(c.id)??[],stop=c.start+clipDuration(c);
  // Plain captions have no defensible word positions: show their complete sentence once, as a one-line band.
  const plain=accepted.filter(a=>!a.words?.length&&a.start<stop&&a.end>c.start).map(a=>({text:a.text.trim(),start:Math.max(c.start,a.start),end:Math.min(stop,a.end),plain:true}));
  if(plain.length)out.set(c.id,[...words,...plain].sort((a,b)=>a.start-b.start));
 }
 return out as Map<string,Array<{text:string;start:number;end:number;plain?:boolean}>>;
}
