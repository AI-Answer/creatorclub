import type {Caption,Project} from '../shared/types';
import {remapClipCaptions} from '../shared/caption-timing';

const EPS=1e-6;
/** IDs may change when a caption is split, but its spoken text and source timing do not. */
const captionKey=(c:Caption)=>JSON.stringify([c.text,c.start.toFixed(5),c.end.toFixed(5),(c.words??[]).map(w=>[w.text,w.start.toFixed(5),w.end.toFixed(5)])]);
/** A caption update can be rebased only when the server changed no other project content. */
export function isCaptionOnlyUpdate(before:Project,incoming:Project):boolean{
 const {captions:_old,updatedAt:_oldTime,...base}=before,{captions:_new,updatedAt:_newTime,...next}=incoming;
 return before.id===incoming.id&&JSON.stringify(base)===JSON.stringify(next);
}

/**
 * Merge transcription into an open edit in source time. Local text edits/deletions win over generated words.
 * The same rebase is applied to undo/redo snapshots, so finishing transcription never adds or resets a gesture.
 */
export function mergeCaptionUpdate(before:Project,incoming:Project,local:Project):Project{
 const expected=remapClipCaptions(before,local),mapped=remapClipCaptions(before,local,incoming.captions);
 const expectedKeys=new Set(expected.map(captionKey)),localByContent=new Map(local.captions.map(c=>[captionKey(c),c]));
 const preserved=local.captions.filter(c=>!expectedKeys.has(captionKey(c)));
 const missing=expected.filter(c=>!localByContent.has(captionKey(c)));
 const protectedRanges=[...preserved,...missing];
 const overlaps=(start:number,end:number)=>protectedRanges.some(c=>start<c.end-EPS&&end>c.start+EPS);
 const additions=mapped.flatMap(c=>{
  if(!overlaps(c.start,c.end))return [c];
  if(!c.words?.length)return [];
  const words=c.words.filter(w=>!overlaps(w.start,w.end));
  return words.length?[{...c,words,text:words.map(w=>w.text).join(' '),start:words[0].start,end:words.at(-1)!.end}]:[];
 });
 const captions=[...preserved,...additions].sort((a,b)=>a.start-b.start||a.end-b.end);
 // Retain local objects when their content already matches, including locally generated split IDs.
 const kept=captions.map(c=>localByContent.get(captionKey(c))??c);
 return {...local,captions:kept};
}
