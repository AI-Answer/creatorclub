import type {MotionBlock,MotionTemplateId} from '../types';

/*
 * The motion templates: title card, lower third, callout and chapter label, two styles each. One registry serves the editor's preview
 * (`src/MotionLayer.tsx`) and the export (`shared/motion/document.ts`, captured frame by frame in Chromium): both render `motionMarkup`
 * with `MOTION_CSS`, sized in container units (`cqw`, `cqh`) so the same markup draws a 640 px preview and a 1080p frame alike, and both
 * seek with `seekAnimations`. Colours come only from the token block at the top of `MOTION_CSS` (a brand kit later sets those variables).
 * No `backdrop-filter` or blend modes: a pre-rendered overlay has nothing underneath to blur or blend with.
 */

export interface MotionStyle {id:string;label:string}
/** A text prop, or a position across the frame (0 to 1). */
export type MotionPropSpec={key:string;label:string;kind:'text';max:number;default:string;optional?:boolean}|{key:string;label:string;kind:'position';default:number};
/** The part of the frame a block can draw in, as fractions of the canvas: the export captures only this box. */
export interface MotionBox {x:number;y:number;width:number;height:number}
export interface MotionTemplate {
 id:MotionTemplateId;
 /** Bumped when the template's look changes, so cached renders are not reused. */
 version:number;
 label:string;
 styles:readonly MotionStyle[];
 defaultDuration:number;
 minDuration:number;
 maxDuration:number;
 props:readonly MotionPropSpec[];
 box(props:Readonly<Record<string,string|number>>):MotionBox;
 /** The inner markup; `motionMarkup` wraps it in the block's root. Props arrive normalized; text is escaped here. */
 body(props:Readonly<Record<string,string|number>>,style:string):string;
}

const escape=(text:unknown)=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const clamp01=(n:number)=>Math.max(0,Math.min(1,n));
const boxAround=(x:number,y:number,w:number,h:number):MotionBox=>{const left=clamp01(x),top=clamp01(y),right=clamp01(x+w),bottom=clamp01(y+h);return {x:left,y:top,width:right-left,height:bottom-top};};

const TITLE_CARD:MotionTemplate={
 id:'title-card',version:1,label:'Title card',
 styles:[{id:'clean',label:'Clean'},{id:'bold',label:'Bold'}],
 defaultDuration:4,minDuration:1,maxDuration:20,
 props:[{key:'title',label:'Title',kind:'text',max:80,default:'Your title here'},{key:'subtitle',label:'Subtitle',kind:'text',max:120,default:'',optional:true}],
 box:()=>({x:0,y:.2,width:1,height:.6}),
 body:(p)=>`<div class="mb-card"><div class="mb-card-rule"></div><div class="mb-card-title">${escape(p.title)}</div>${p.subtitle?`<div class="mb-card-sub">${escape(p.subtitle)}</div>`:''}</div>`,
};
const LOWER_THIRD:MotionTemplate={
 id:'lower-third',version:1,label:'Lower third',
 styles:[{id:'block',label:'Block'},{id:'glass',label:'Glass'}],
 defaultDuration:5,minDuration:1.5,maxDuration:20,
 props:[{key:'name',label:'Name',kind:'text',max:40,default:'Your name'},{key:'role',label:'Role or line',kind:'text',max:70,default:'',optional:true}],
 box:()=>({x:0,y:.5,width:.66,height:.48}),
 body:(p)=>`<div class="mb-lt"><div class="mb-lt-name">${escape(p.name)}</div>${p.role?`<div class="mb-lt-role">${escape(p.role)}</div>`:''}</div>`,
};
const CALLOUT:MotionTemplate={
 id:'callout',version:1,label:'Callout',
 styles:[{id:'arrow',label:'Arrow'},{id:'ring',label:'Ring'}],
 defaultDuration:3,minDuration:1,maxDuration:20,
 props:[{key:'label',label:'Label',kind:'text',max:40,default:'Look here'},{key:'x',label:'Across',kind:'position',default:.5},{key:'y',label:'Down',kind:'position',default:.5}],
 box:(p)=>boxAround(Number(p.x)-.3,Number(p.y)-.4,.6,.8),
 // The label sits on the side of the point with more room; the arrow comes from that side.
 body:(p)=>{const x=Number(p.x),y=Number(p.y),h=x<.5?'r':'l',v=y<.5?'b':'t';
  return `<div class="mb-co mb-co-${v}${h}" style="left:${(x*100).toFixed(3)}cqw;top:${(y*100).toFixed(3)}cqh"><svg class="mb-co-arrow" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M94 94 C 70 60, 40 50, 8 46"/><path pathLength="1" class="mb-co-head" d="M94 94 L 74 88 M94 94 L 90 73"/></svg><div class="mb-co-ring"></div><div class="mb-co-label">${escape(p.label)}</div></div>`;},
};
const CHAPTER_LABEL:MotionTemplate={
 id:'chapter-label',version:1,label:'Chapter label',
 styles:[{id:'tag',label:'Tag'},{id:'number',label:'Number'}],
 defaultDuration:3,minDuration:1,maxDuration:20,
 props:[{key:'number',label:'Number',kind:'text',max:6,default:'1',optional:true},{key:'title',label:'Chapter title',kind:'text',max:60,default:'Chapter title'}],
 box:()=>({x:0,y:0,width:.62,height:.32}),
 body:(p)=>`<div class="mb-ch">${p.number?`<div class="mb-ch-num"><span class="mb-ch-word">Chapter </span>${escape(p.number)}</div>`:''}<div class="mb-ch-title">${escape(p.title)}</div></div>`,
};

export const MOTION_TEMPLATES:Readonly<Record<MotionTemplateId,MotionTemplate>>={'title-card':TITLE_CARD,'lower-third':LOWER_THIRD,callout:CALLOUT,'chapter-label':CHAPTER_LABEL};
export const MOTION_TEMPLATE_IDS=Object.keys(MOTION_TEMPLATES) as MotionTemplateId[];
export const isMotionTemplate=(id:unknown):id is MotionTemplateId=>typeof id==='string'&&Object.hasOwn(MOTION_TEMPLATES,id);

/** The template's props filled from its defaults, text trimmed to its limit and positions kept inside the frame. Unknown keys are dropped. */
export function normalizeMotionProps(template:MotionTemplateId,props:Readonly<Record<string,unknown>>={}):Record<string,string|number>{
 const out:Record<string,string|number>={};
 for(const spec of MOTION_TEMPLATES[template].props){
  const value=props[spec.key];
  if(spec.kind==='position'){const n=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;out[spec.key]=Number.isFinite(n)?Math.round(clamp01(n)*1000)/1000:spec.default;}
  else{const text=typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,spec.max):undefined;out[spec.key]=text!==undefined&&(text||spec.optional)?text:spec.default;}
 }
 return out;
}
const styleOf=(template:MotionTemplate,style:string)=>template.styles.some(s=>s.id===style)?style:template.styles[0].id;
/**
 * A template's props from the companion's flat fields: `text` is the main line (title, name, label, chapter title), `detail` the second
 * (subtitle, role, chapter number), `x` and `y` a callout's point.
 */
export function motionPropsFrom(template:MotionTemplateId,{text,detail,x,y}:{text?:string;detail?:string;x?:number;y?:number}):Record<string,string|number>{
 const raw:Record<string,unknown>=template==='title-card'?{title:text,subtitle:detail}:template==='lower-third'?{name:text,role:detail}:template==='callout'?{label:text,x,y}:{title:text,number:detail};
 return normalizeMotionProps(template,Object.fromEntries(Object.entries(raw).filter(([,v])=>v!==undefined)));
}
/** A block with its template's defaults; `overrides` may set the style, the length and props. */
export function newMotionBlock(template:MotionTemplateId,start:number,id:string,overrides:Partial<Omit<MotionBlock,'id'|'template'>>={}):MotionBlock{
 const t=MOTION_TEMPLATES[template];
 return {id,template,style:styleOf(t,overrides.style??''),start:Math.max(0,start),duration:clampDuration(template,overrides.duration??t.defaultDuration),props:normalizeMotionProps(template,overrides.props)};
}
export const clampDuration=(template:MotionTemplateId,duration:number)=>{const t=MOTION_TEMPLATES[template];return Math.max(t.minDuration,Math.min(t.maxDuration,Number.isFinite(duration)?duration:t.defaultDuration));};
/** Why a stored block cannot be shown, or undefined. */
export function motionBlockProblem(b:unknown):string|undefined{
 if(!b||typeof b!=='object')return 'Invalid motion block';const m=b as MotionBlock;
 if(typeof m.id!=='string'||!m.id)return 'Invalid motion block id';
 if(!isMotionTemplate(m.template))return 'Unknown motion template';
 if(typeof m.style!=='string'||!MOTION_TEMPLATES[m.template].styles.some(s=>s.id===m.style))return 'Unknown motion style';
 if(![m.start,m.duration].every(Number.isFinite)||m.start<0||m.duration<=0||m.duration>3600)return 'Invalid motion block timing';
 if(!m.props||typeof m.props!=='object'||Array.isArray(m.props))return 'Invalid motion block props';
 return undefined;
}
/** What the block says, for the timeline and the companion: its main text. */
export function motionText(b:MotionBlock){const p=b.props;return String(b.template==='title-card'?p.title:b.template==='lower-third'?p.name:b.template==='callout'?p.label:p.title??'');}
export const motionLabel=(b:MotionBlock)=>`${MOTION_TEMPLATES[b.template]?.label??'Motion'}: ${motionText(b)}`;
export const motionBox=(b:MotionBlock)=>MOTION_TEMPLATES[b.template].box(normalizeMotionProps(b.template,b.props));

/** The block's markup: the same string in the preview and in the export page. `--mb-d` is the block's length, which times the way out. */
export function motionMarkup(b:MotionBlock):string{
 const t=MOTION_TEMPLATES[b.template],style=styleOf(t,b.style),props=normalizeMotionProps(b.template,b.props);
 return `<div class="mb mb-${t.id} mb-s-${style}" style="--mb-d:${Math.max(.1,b.duration).toFixed(3)}s">${t.body(props,style)}</div>`;
}

/**
 * Pauses every animation and sets it to `ms` into the block: the preview calls it on each frame and seek, the export page before each
 * captured frame. It is self-contained (the export sends its source into the page), so the two seek alike by construction.
 */
export function seekAnimations(animations:Iterable<{pause():void;currentTime:unknown}>,ms:number){for(const a of animations){a.pause();a.currentTime=ms;}}

/**
 * Every template's look. The tokens are the only colour values; the rest reads them. Sizes are container units of the stage the block is
 * drawn in (the preview's stage, or the full export frame), so the preview and the export agree at any size.
 */
export const MOTION_CSS=`
.mb{--mb-ink:#151413;--mb-paper:#ffffff;--mb-accent:#2563eb;--mb-scrim:rgb(21 20 19 / .62);--mb-shade:rgb(0 0 0 / .38);--mb-ease:cubic-bezier(.2,.8,.2,1);--mb-out:.4s;
 position:absolute;inset:0;overflow:hidden;pointer-events:none;font-family:"Inter Variable",Inter,system-ui,sans-serif;color:var(--mb-paper);line-height:1.15;-webkit-font-smoothing:antialiased;font-synthesis:none;
 animation:mb-fade-out var(--mb-out) ease-in calc(var(--mb-d) - var(--mb-out)) forwards}
.mb *{box-sizing:border-box}
@keyframes mb-fade-out{to{opacity:0}}
@keyframes mb-rise{from{opacity:0;transform:translateY(2.4cqw)}}
@keyframes mb-slide{from{opacity:0;transform:translateX(-5cqw)}}
@keyframes mb-grow{from{transform:scaleX(0)}}
@keyframes mb-pop{from{opacity:0;transform:scale(.72)}}
@keyframes mb-draw{from{stroke-dashoffset:1}}
@keyframes mb-ring{0%{opacity:0;transform:scale(.4)}45%{opacity:1}}

.mb-title-card .mb-card{position:absolute;left:8cqw;right:8cqw;top:50%;translate:0 -50%;display:flex;flex-direction:column;align-items:center;text-align:center;gap:1.1cqw}
.mb-card-title{font-size:5.4cqw;font-weight:800;letter-spacing:-.02em;line-height:1.05;animation:mb-rise .6s var(--mb-ease) .1s both}
.mb-card-sub{font-size:2cqw;font-weight:500;opacity:.92;animation:mb-rise .6s var(--mb-ease) .25s both}
.mb-card-rule{width:7cqw;height:.45cqw;border-radius:.3cqw;background:var(--mb-accent);animation:mb-grow .5s var(--mb-ease) both}
.mb-s-clean .mb-card-title,.mb-s-clean .mb-card-sub{text-shadow:0 .25cqw 1.6cqw var(--mb-shade)}
.mb-s-bold .mb-card{left:0;right:0;padding:3cqw 8cqw;background:var(--mb-ink);align-items:flex-start;text-align:left;box-shadow:0 1cqw 3cqw var(--mb-shade);transform-origin:left center;animation:mb-grow .55s var(--mb-ease) both}
.mb-s-bold .mb-card-rule{order:3;width:12cqw}
.mb-s-bold .mb-card-title{font-size:5cqw}

.mb-lower-third .mb-lt{position:absolute;left:4.5cqw;bottom:11%;max-width:56cqw;display:flex;flex-direction:column;align-items:flex-start;gap:.35cqw}
.mb-lt-name{font-size:2.7cqw;font-weight:800;letter-spacing:-.01em}
.mb-lt-role{font-size:1.65cqw;font-weight:600}
.mb-s-block .mb-lt-name{background:var(--mb-accent);padding:.55cqw 1.3cqw;animation:mb-slide .5s var(--mb-ease) both}
.mb-s-block .mb-lt-role{background:var(--mb-ink);padding:.45cqw 1.3cqw;animation:mb-slide .5s var(--mb-ease) .12s both}
.mb-s-glass .mb-lt{background:var(--mb-scrim);border-left:.5cqw solid var(--mb-accent);border-radius:1cqw;padding:1.1cqw 2cqw 1.2cqw 1.6cqw;box-shadow:0 1cqw 3cqw var(--mb-shade);transform-origin:left bottom;animation:mb-pop .6s cubic-bezier(.34,1.56,.64,1) both}
.mb-s-glass .mb-lt-role{font-weight:500;opacity:.9}

.mb-callout .mb-co{position:absolute;width:0;height:0}
.mb-co-label{position:absolute;white-space:nowrap;font-size:1.9cqw;font-weight:700;padding:.6cqw 1.3cqw;border-radius:5cqw;background:var(--mb-ink);color:var(--mb-paper);box-shadow:0 .6cqw 2cqw var(--mb-shade);animation:mb-pop .45s var(--mb-ease) .25s both}
.mb-co-arrow{position:absolute;width:11cqw;height:11cqw;overflow:visible;fill:none;stroke:var(--mb-accent);stroke-width:4.5;stroke-linecap:round;stroke-dasharray:1;filter:drop-shadow(0 .3cqw .6cqw var(--mb-shade))}
.mb-co-arrow path{animation:mb-draw .5s var(--mb-ease) both}
.mb-co-arrow .mb-co-head{animation-delay:.35s;animation-duration:.2s}
.mb-co-ring{position:absolute;left:0;top:0;translate:-50% -50%;width:9cqw;height:9cqw;border-radius:50%;border:.55cqw solid var(--mb-accent);box-shadow:0 0 0 .4cqw var(--mb-scrim),0 .6cqw 2cqw var(--mb-shade);animation:mb-ring .55s var(--mb-ease) both}
.mb-s-arrow .mb-co-ring,.mb-s-ring .mb-co-arrow{display:none}
.mb-s-arrow.mb-callout .mb-co-tl .mb-co-arrow{right:0;bottom:0}
.mb-s-arrow.mb-callout .mb-co-tr .mb-co-arrow{left:0;bottom:0;transform:scaleX(-1)}
.mb-s-arrow.mb-callout .mb-co-bl .mb-co-arrow{right:0;top:0;transform:scaleY(-1)}
.mb-s-arrow.mb-callout .mb-co-br .mb-co-arrow{left:0;top:0;transform:scale(-1,-1)}
.mb-s-arrow .mb-co-tl .mb-co-label{right:9.4cqw;bottom:4.4cqw}
.mb-s-arrow .mb-co-tr .mb-co-label{left:9.4cqw;bottom:4.4cqw}
.mb-s-arrow .mb-co-bl .mb-co-label{right:9.4cqw;top:4.4cqw}
.mb-s-arrow .mb-co-br .mb-co-label{left:9.4cqw;top:4.4cqw}
.mb-s-ring .mb-co-tl .mb-co-label,.mb-s-ring .mb-co-tr .mb-co-label{bottom:5.6cqw;left:0;translate:-50% 0}
.mb-s-ring .mb-co-bl .mb-co-label,.mb-s-ring .mb-co-br .mb-co-label{top:5.6cqw;left:0;translate:-50% 0}
.mb-s-ring .mb-co-label{animation-name:mb-rise}

.mb-chapter-label .mb-ch{position:absolute;left:4.5cqw;top:4.5cqw;display:flex;align-items:center;gap:1cqw;max-width:56cqw}
.mb-ch-title{font-weight:700}
.mb-s-tag .mb-ch{background:var(--mb-ink);border-radius:5cqw;padding:.7cqw 1.6cqw .7cqw .8cqw;box-shadow:0 .6cqw 2cqw var(--mb-shade);transform-origin:left center;animation:mb-pop .5s var(--mb-ease) both}
.mb-s-tag .mb-ch-num{font-size:1.3cqw;font-weight:700;text-transform:uppercase;letter-spacing:.08em;background:var(--mb-accent);border-radius:5cqw;padding:.45cqw 1cqw}
.mb-s-tag .mb-ch-title{font-size:1.8cqw}
.mb-s-number .mb-ch{align-items:flex-end;gap:1.6cqw}
.mb-s-number .mb-ch-num{font-size:7cqw;font-weight:800;line-height:.85;letter-spacing:-.04em;padding-bottom:.5cqw;border-bottom:.5cqw solid var(--mb-accent);text-shadow:0 .25cqw 1.6cqw var(--mb-shade);animation:mb-rise .55s var(--mb-ease) both}
.mb-s-number .mb-ch-word{display:none}
.mb-s-number .mb-ch-title{font-size:2.4cqw;padding-bottom:1cqw;text-shadow:0 .25cqw 1.6cqw var(--mb-shade);animation:mb-slide .55s var(--mb-ease) .15s both}
`;
