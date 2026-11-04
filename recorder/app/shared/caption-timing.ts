import {clipDuration,narrationPriority,type Caption,type Clip,type Project} from './types';

type CaptionTimeline=Pick<Project,'clips'|'media'>;
export const snapshotCaptionTiming=(p:CaptionTimeline&Pick<Project,'captions'>)=>({...p,clips:p.clips.map(c=>({...c})),captions:p.captions.map(c=>({...c,words:c.words?.map(w=>({...w}))}))});
const EPS=1e-7;
const stop=(c:Clip)=>c.start+clipDuration(c);
/** The audible source carrying the transcript, rather than a silent picture or music under it. */
export function narrationClips(p:CaptionTimeline){
 const media=new Map(p.media.map(m=>[m.id,m]));
 return p.clips.filter(c=>c.track!=='music'&&!c.muted&&(c.track==='audio'||media.get(c.mediaId)?.hasAudio!==false&&media.get(c.mediaId)?.kind==='video'))
  .sort((a,b)=>narrationPriority(a,media.get(a.mediaId))-narrationPriority(b,media.get(b.mediaId))||a.start-b.start||a.id.localeCompare(b.id));
}
/** Words keyed by their actual narration clip; render inside that clip so empty time can never display floating words. */
export function captionWordsByClip(p:CaptionTimeline&Pick<Project,'captions'>){
 const clips=narrationClips(p),out=new Map<string,NonNullable<Caption['words']>>();
 for(const cap of p.captions)for(const word of cap.words??[]){
  const cuts=[...new Set([word.start,word.end,...clips.filter(c=>c.start<word.end&&stop(c)>word.start).flatMap(c=>[Math.max(word.start,c.start),Math.min(word.end,stop(c))])])].sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){const start=cuts[i-1],end=cuts[i],mid=(start+end)/2,c=clips.find(c=>c.start<=mid&&stop(c)>mid);if(!c||end-start<=EPS)continue;const words=out.get(c.id)??[];words.push({...word,start,end});out.set(c.id,words);}
 }
 return out;
}
/**
 * Captions belong to source audio. Project times are projected through the old narration clips into the new source ranges.
 * Split captions at every clip boundary, including words straddling a cut. A removed/trimmed source range takes its words with it.
 * Exact clip identity wins when a source is used more than once; source ranges also find new split pieces and pre-split undo states.
 * Manually placed captions that never covered narration are retained unchanged.
 */
export function remapClipCaptions(before:CaptionTimeline&Pick<Project,'captions'>,after:CaptionTimeline,captions:readonly Caption[]=before.captions):Caption[]{
 const old=narrationClips(before),next=narrationClips(after),out:Caption[]=[];
 for(const cap of captions){
  const covers=old.filter(c=>c.start<cap.end-EPS&&stop(c)>cap.start+EPS);
  if(!covers.length){out.push({...cap,words:cap.words?.map(w=>({...w}))});continue;}
  const cuts=[...new Set([cap.start,cap.end,...covers.flatMap(c=>[Math.max(cap.start,c.start),Math.min(cap.end,stop(c))])])].sort((a,b)=>a-b);
  let pieces=0;
  for(let i=1;i<cuts.length;i++){
   const left=cuts[i-1],right=cuts[i],mid=(left+right)/2,owner=covers.find(c=>c.start<=mid&&stop(c)>mid);if(!owner||right-left<=EPS)continue;
   const sourceLeft=owner.sourceIn+(left-owner.start)*owner.speed,sourceRight=owner.sourceIn+(right-owner.start)*owner.speed;
   const candidates=next.filter(c=>c.mediaId===owner.mediaId&&c.track===owner.track&&c.recordingTakeId===owner.recordingTakeId&&c.sourceIn<sourceRight-EPS&&c.sourceOut>sourceLeft+EPS)
    .sort((a,b)=>Number(b.id===owner.id)-Number(a.id===owner.id)||Number(b.linkId===owner.linkId)-Number(a.linkId===owner.linkId)||Math.abs(a.start-owner.start)-Math.abs(b.start-owner.start));
   const sourceCuts=[...new Set([sourceLeft,sourceRight,...candidates.flatMap(c=>[Math.max(sourceLeft,c.sourceIn),Math.min(sourceRight,c.sourceOut)])])].sort((a,b)=>a-b);
   for(let j=1;j<sourceCuts.length;j++){
    const a=sourceCuts[j-1],b=sourceCuts[j],destination=candidates.find(c=>c.sourceIn<=(a+b)/2&&c.sourceOut>(a+b)/2);if(!destination||b-a<=EPS)continue;
    const map=(time:number)=>destination.start+(owner.sourceIn+(time-owner.start)*owner.speed-destination.sourceIn)/destination.speed;
    const from=owner.start+(a-owner.sourceIn)/owner.speed,to=owner.start+(b-owner.sourceIn)/owner.speed;
    const words=cap.words?.length?cap.words.filter(w=>w.start<to-EPS&&w.end>from+EPS).map(w=>({...w,start:Math.max(0,map(Math.max(from,w.start))),end:map(Math.min(to,w.end))})).filter(w=>w.end-w.start>EPS):undefined;
    if(cap.words?.length&&!words?.length)continue;
    const start=Math.max(0,map(from)),end=map(to);if(end-start<=EPS)continue;
    out.push({...cap,id:pieces++===0?cap.id:`${cap.id.split('~')[0]}~${destination.id}~${Math.round(a*1e6)}`,start,end,...(words?{words,text:words.map(w=>w.text).join(' ')}:{})});
   }
  }
 }
 return out.sort((a,b)=>a.start-b.start||a.end-b.end);
}
