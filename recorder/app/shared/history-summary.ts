import {projectDuration,type Project} from './types';

/** What a saved version holds, in the numbers a person notices: length, clips, captions, graphics, zooms, markers, scenes, name, and fingerprints of the clip timing, the caption words and the style. */
export interface VersionSummary {duration:number;clips:number;captions:number;elements:number;zooms:number;markers:number;scenes:number;name:string;timing:string;words:string;style:string}
const hash=(value:unknown)=>{const text=JSON.stringify(value)??'';let h=5381;for(let i=0;i<text.length;i++)h=(h*33+text.charCodeAt(i))|0;return (h>>>0).toString(36);};
export function summarizeProject(p:Project):VersionSummary{
 return {duration:Math.round(projectDuration(p)*100)/100,clips:p.clips.length,captions:p.captions.length,elements:p.elements.length,zooms:p.zooms.length,markers:p.markers?.length??0,scenes:p.scenes.length,name:p.name,
  timing:hash(p.clips.map(c=>[c.id,c.start,c.sourceIn,c.sourceOut,c.track])),words:hash(p.captions.map(c=>c.text)),style:hash([p.canvas,p.captionStyle,p.clips.map(c=>[c.transform,c.effects]),p.elements.map(e=>[e.text,e.color,e.background]),p.zooms.map(z=>[z.scale,z.x,z.y])])};
}
const count=(n:number,one:string,many=one+'s')=>`${n} ${n===1?one:many}`;
const secs=(n:number)=>n>=60?`${Math.floor(n/60)} min ${Math.round(n%60)} s`:`${n<10?Math.round(n*10)/10:Math.round(n)} s`;
/** A version history title: what changed from the older version to this one ("Cut 4.2 s · Removed 2 clips", "Wrote 40 captions", "Renamed to “Intro”"). */
export function historyTitle(older:VersionSummary|undefined,now:VersionSummary):string{
 if(!older)return 'Earliest saved version';
 const parts:string[]=[],d=now.duration-older.duration;
 if(Math.abs(d)>=.05)parts.push(d<0?`Cut ${secs(-d)}`:`Added ${secs(d)}`);
 const diff=(a:number,b:number,one:string,many?:string)=>{if(b>a)parts.push(`Added ${count(b-a,one,many)}`);else if(b<a)parts.push(`Removed ${count(a-b,one,many)}`);};
 diff(older.clips,now.clips,'clip');
 if(!older.captions&&now.captions)parts.push(`Wrote ${count(now.captions,'caption')}`);else{diff(older.captions,now.captions,'caption');if(older.captions===now.captions&&older.words!==now.words)parts.push('Edited captions');}
 diff(older.elements,now.elements,'graphic');diff(older.zooms,now.zooms,'zoom');diff(older.markers,now.markers,'marker');diff(older.scenes,now.scenes,'scene');
 if(older.name!==now.name)parts.push(`Renamed to “${now.name}”`);
 if(!parts.length&&older.timing!==now.timing)parts.push('Moved or trimmed clips');
 if(!parts.length&&older.style!==now.style)parts.push('Changed the style');
 return parts.length?parts.slice(0,2).join(' · '):'Small changes';
}
