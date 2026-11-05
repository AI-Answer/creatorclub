import type {Caption} from './types';

const EPSILON=1e-8;
const clean=(n:number)=>Math.abs(n)<EPSILON?0:Math.round(n*1e9)/1e9;

/**
 * A caption split into the groups of at most `maxWords` words the video shows one after another, each with its share of the
 * caption's time. The export burns these parts and the preview shows the part under the playhead, so both show the same words at the
 * same moment. `_wordStart` / `_wordEnd` keep word timing stable when an export window cuts through a caption.
 */
export function captionParts(c:Pick<Caption,'text'|'start'|'end'>&{_wordStart?:number;_wordEnd?:number},maxWords:number){
 const words=c.text.trim().split(/\s+/),max=Math.max(1,Math.floor(maxWords||1));
 const count=Math.ceil(words.length/max),start=c._wordStart??c.start,end=c._wordEnd??c.end;
 return Array.from({length:count},(_,i)=>({
  text:words.slice(i*max,(i+1)*max).join(' '),
  start:clean(Math.max(c.start,start+(end-start)*i/count)),
  end:clean(Math.min(c.end,start+(end-start)*(i+1)/count)),
 })).filter(part=>part.end-part.start>EPSILON);
}
/** The part of `c` showing at `time`, or null between parts. */
export const captionPartAt=(c:Pick<Caption,'text'|'start'|'end'>,maxWords:number,time:number)=>captionParts(c,maxWords).find(part=>time>=part.start&&time<part.end)??null;
