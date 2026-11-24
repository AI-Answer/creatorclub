import {clipDuration,clipEffectTiming,type Clip,type Media,type Project} from './types';

/**
 * What goes behind a camera clip whose background is removed (a virtual green screen). It fills the clip's own box, under the
 * cut-out person: a solid colour, a picture, a video (muted, looping), or the screen recording playing at that moment.
 * Stored per clip in `effects.backdrop`, so a split clip or a Layout stretch can have its own. Read only while `background` is 'remove'.
 */
export type Backdrop={kind:'color';color:string}|{kind:'image';mediaId:string}|{kind:'video';mediaId:string}|{kind:'screen'};
/** The choices the Background picker offers: 'none' leaves the cut-out see-through, 'blur' is the older blurred-room mode. */
export type BackdropChoice='none'|'color'|'image'|'video'|'screen'|'blur';
export const BACKDROP_CHOICES:ReadonlyArray<{value:BackdropChoice;label:string}>=[{value:'none',label:'None'},{value:'color',label:'Color'},{value:'image',label:'Picture'},{value:'video',label:'Video'},{value:'screen',label:'Screen recording'},{value:'blur',label:'Blur'}];
export const DEFAULT_BACKDROP_COLOR='#1f7a4d';
const HEX=/^#[0-9a-f]{6}$/i;

/** The shape check the project validator runs: true for a well-formed backdrop, without looking up its media. */
export function isBackdrop(value:unknown):value is Backdrop{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const b=value as Record<string,unknown>,keys=Object.keys(b).sort().join();
 if(b.kind==='color')return keys==='color,kind'&&typeof b.color==='string'&&HEX.test(b.color);
 if(b.kind==='image'||b.kind==='video')return keys==='kind,mediaId'&&typeof b.mediaId==='string'&&b.mediaId.length>0&&b.mediaId.length<=200;
 return b.kind==='screen'&&keys==='kind';
}
/** The backdrop that is drawn: only with Remove background on, and a picture or video only when its media is there and of that kind. */
export function activeBackdrop(clip:Pick<Clip,'effects'>,media?:ReadonlyArray<Media>):Backdrop|undefined{
 const b=clip.effects.backdrop;
 if(clip.effects.background!=='remove'||!isBackdrop(b))return undefined;
 if(b.kind==='image'||b.kind==='video'){const m=media?.find(x=>x.id===b.mediaId);if(media&&(!m||m.kind!==b.kind))return undefined;}
 return b;
}
/** What the picker shows for a clip. */
export function backdropChoice(effects:Clip['effects']):BackdropChoice{
 if(effects.background==='blur')return 'blur';
 if(effects.background!=='remove'||!isBackdrop(effects.backdrop))return 'none';
 return effects.backdrop.kind;
}
/**
 * Writes a picker choice in one place. Every choice keeps the person cut out ('blur' uses the blur mode); picture and video need the
 * media they show, and keep the clip's current one of that kind when none is given. Returns false when a picture or video has none yet.
 */
export function setBackdropChoice(effects:Clip['effects'],choice:BackdropChoice,detail:{color?:string;mediaId?:string}={}):boolean{
 if(choice==='blur'){effects.background='blur';delete effects.backdrop;return true;}
 if(choice==='none'){effects.background='remove';delete effects.backdrop;return true;}
 if(choice==='color'){const old=effects.backdrop?.kind==='color'?effects.backdrop.color:DEFAULT_BACKDROP_COLOR,color=detail.color??old;effects.background='remove';effects.backdrop={kind:'color',color:HEX.test(color)?color.toLowerCase():DEFAULT_BACKDROP_COLOR};return true;}
 if(choice==='screen'){effects.background='remove';effects.backdrop={kind:'screen'};return true;}
 const mediaId=detail.mediaId??(effects.backdrop?.kind===choice?effects.backdrop.mediaId:undefined);
 if(!mediaId)return false;
 effects.background='remove';effects.backdrop={kind:choice,mediaId};return true;
}
/** Media a project needs only as a backdrop: kept with the project, fingerprinted by exports and relinked by media recovery. */
export function backdropMediaIds(p:Pick<Project,'clips'>):string[]{
 const ids=new Set<string>();
 for(const c of p.clips){const b=c.effects?.backdrop;if(isBackdrop(b)&&(b.kind==='image'||b.kind==='video'))ids.add(b.mediaId);}
 return [...ids];
}
/** Points every backdrop at a relinked media file. */
export function relinkBackdrops(p:Pick<Project,'clips'>,from:string,to:string){for(const c of p.clips){const b=c.effects?.backdrop;if(isBackdrop(b)&&(b.kind==='image'||b.kind==='video')&&b.mediaId===from)b.mediaId=to;}}
/**
 * Where a looping backdrop video is at a timeline time. The loop counts from the clip's original start (its effect timing), so a split
 * or a Layout stretch carries the same video on without a jump, and the preview and the export show the same frame.
 */
export function backdropLoopTime(clip:Clip,time:number,loopDuration:number,elapsedAtStart=clipEffectTiming(clip).offset){
 if(!(loopDuration>0)||!Number.isFinite(time))return 0;
 const at=(Math.max(0,time-clip.start)+Math.max(0,elapsedAtStart))%loopDuration;
 return Number.isFinite(at)?at:0;
}
/** One screen clip's share of a camera clip's backdrop: timeline `from`..`to` and the source second it opens on. */
export interface ScreenPiece {clip:Clip;from:number;to:number;sourceStart:number;}
/**
 * The screen recording behind a camera clip between `from` and `to` (timeline seconds): every visual clip on the screen track in that
 * range, in timeline order. Where screen clips overlap, the later one in the list is drawn on top, as the export stacks them.
 */
export function screenBehind(p:Pick<Project,'clips'>,from:number,to:number):ScreenPiece[]{
 return p.clips.filter(c=>c.track==='screen').map(c=>({clip:c,from:Math.max(from,c.start),to:Math.min(to,c.start+clipDuration(c))})).filter(x=>x.to-x.from>1e-6)
  .sort((a,b)=>a.from-b.from).map(x=>({...x,sourceStart:x.clip.sourceIn+(x.from-x.clip.start)*x.clip.speed}));
}
/** The screen clip whose picture is behind the camera at `time`, for the preview: the last one that covers it. */
export function screenAt(p:Pick<Project,'clips'>,time:number):Clip|undefined{
 return screenBehind(p,time,time+1e-3).filter(x=>x.from<=time+1e-6).at(-1)?.clip;
}
