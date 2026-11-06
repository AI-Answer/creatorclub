import type {MotionBlock,MotionPlace,MotionTemplateId} from '../types';
import {BRAND_ICONS,LINE_ICONS} from './icons';

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
 id:'lower-third',version:2,label:'Lower third',
 styles:[{id:'block',label:'Block'},{id:'glass',label:'Glass'}],
 defaultDuration:5,minDuration:1.5,maxDuration:20,
 props:[{key:'name',label:'Name',kind:'text',max:40,default:'Your name'},{key:'role',label:'Role or line',kind:'text',max:70,default:'',optional:true}],
 // It sits above the captions (which take the bottom fifth of the frame), at the left.
 box:()=>({x:0,y:.38,width:.66,height:.46}),
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

/** The `|`-separated items of a text prop, trimmed, empty ones dropped, at most `max`. */
const listOf=(text:unknown,max:number)=>String(text??'').split('|').map(s=>s.trim()).filter(Boolean).slice(0,max);
/** The two sides of a `|` pair; a missing side is empty, not dropped, so the sides stay in place. */
const pairOf=(text:unknown):[string,string]=>{const [a='',b='']=String(text??'').split('|').map(s=>s.trim());return [a,b];};
const optionalLine=(cls:string,text:unknown)=>text?`<div class="${cls}">${escape(text)}</div>`:'';

/* ---------- Beats: when each item comes in, on the word that says it ---------- */

/** The `beats` prop every building template has: seconds into the block, joined with `|`, one per item. Set from the card's timeline times. */
const BEATS:MotionPropSpec={key:'beats',label:'When each item comes in (seconds into the graphic, separate with |)',kind:'text',max:80,default:'',optional:true};
/** The beats as numbers, in order; an item past the list builds on its template's own timing. */
export const beatsOf=(text:unknown)=>String(text??'').split('|').map(s=>s.trim()).filter(Boolean).map(Number).filter(n=>Number.isFinite(n)&&n>=0).map(n=>Math.round(n*100)/100);
/** Beats from timeline times: each one's offset into a block that starts at `start` and runs `duration`, kept inside it and in order. */
export function beatsFrom(times:readonly number[]|undefined,start:number,duration:number):string{
 if(!times?.length)return '';
 let last=0;
 return times.slice(0,8).map(t=>{last=Math.max(last,Math.min(Math.max(0,t-start),Math.max(0,duration-.6)));return String(Math.round(last*100)/100);}).join('|');
}
/** The CSS variable that puts item `i` on its beat; empty when it has none, so the template's own timing applies. */
const at=(beats:readonly number[],i:number,shift=0)=>beats[i]!==undefined?`;--mb-at:${Math.max(0,beats[i]+shift).toFixed(2)}s`:'';

/* ---------- Icons: "[name] words" puts an icon before an item ---------- */

/**
 * Products whose marks the open icon set does not carry (their owners had them removed): a letter tile in the brand's own colour, so a
 * creator who names Word or Excel still gets a recognisable tile rather than a grey initial.
 */
const BRAND_LETTERS:Readonly<Record<string,{letters:string;hex:string}>>={word:{letters:'W',hex:'#185abd'},excel:{letters:'X',hex:'#107c41'},powerpoint:{letters:'P',hex:'#c43e1c'},outlook:{letters:'O',hex:'#0f6cbd'},teams:{letters:'T',hex:'#5b5fc7'},pdf:{letters:'PDF',hex:'#d6372b'},linkedin:{letters:'in',hex:'#0a66c2'},slack:{letters:'S',hex:'#4a154b'},canva:{letters:'C',hex:'#00c4cc'},chatgpt:{letters:'GPT',hex:'#10a37f'},openai:{letters:'AI',hex:'#10a37f'},photoshop:{letters:'Ps',hex:'#001e36'},premiere:{letters:'Pr',hex:'#00005b'},capcut:{letters:'CC',hex:'#000000'},skool:{letters:'S',hex:'#f8d247'},lovable:{letters:'L',hex:'#ff4f8b'}};
/** The names an item can start with in brackets: a status (check, x, warn), a line icon, or a brand. */
export const ICON_NAMES:readonly string[]=['warn',...Object.keys(LINE_ICONS),...Object.keys(BRAND_ICONS),...Object.keys(BRAND_LETTERS)];
const STATUS:Record<string,'ok'|'no'|'warn'>={check:'ok',x:'no',warn:'warn'};
/** An item's icon (when it names one) and its words. An unknown name is dropped, so the words still show. */
export function iconItem(item:string):{icon?:string;text:string}{
 const m=/^\[([a-z0-9-]+)\]\s*/i.exec(item);if(!m)return {text:item};
 const name=m[1].toLowerCase(),known=name in STATUS||name in LINE_ICONS||name in BRAND_ICONS||name in BRAND_LETTERS;
 return {...(known?{icon:name}:{}),text:item.slice(m[0].length)};
}
/** A brand mark too dark to see on a dark panel is drawn in the text colour. */
const tooDark=(hex:string)=>{const n=parseInt(hex.slice(1),16);return .2126*(n>>16&255)+.7152*(n>>8&255)+.0722*(n&255)<60;};
function iconSvg(name:string){
 const letter=BRAND_LETTERS[name];
 if(letter){const size=letter.letters.length>2?8.5:letter.letters.length>1?11:14;return `<svg class="mb-ic mb-brand mb-brand-letter" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5.5" fill="${letter.hex}"/><text x="12" y="12" dy=".36em" text-anchor="middle" font-size="${size}" font-weight="800" font-family="Inter Variable,Inter,system-ui,sans-serif" fill="${tooDark(letter.hex)||luminance(letter.hex)<.7?'#ffffff':'#1b1b1b'}">${escape(letter.letters)}</text></svg>`;}
 const brand=BRAND_ICONS[name];
 if(brand)return `<svg class="mb-ic mb-brand" viewBox="0 0 24 24" aria-hidden="true"><path fill="${tooDark(brand.hex)?'currentColor':brand.hex}" d="${brand.path}"/></svg>`;
 return `<svg class="mb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LINE_ICONS[name==='warn'?'triangle-alert':name]??''}</svg>`;
}
/** A status as a coloured ring with its mark; any other icon on a small tile. */
const iconMark=(name:string)=>STATUS[name]?`<span class="mb-badge mb-badge-${STATUS[name]}">${iconSvg(name==='warn'?'warn':name)}</span>`:`<span class="mb-tile">${iconSvg(name)}</span>`;
/** An item's markup: its mark, then its words. */
const itemHtml=(item:string)=>{const {icon,text}=iconItem(item);return {icon,html:`${icon?iconMark(icon):''}<span class="mb-txt">${escape(text)}</span>`};};

const BULLETS:MotionTemplate={
 id:'bullets',version:3,label:'Bullet points',
 styles:[{id:'dash',label:'Dash'},{id:'panel',label:'Panel'}],
 defaultDuration:6,minDuration:2,maxDuration:20,
 props:[{key:'items',label:'Points (separate with |; start one with [check], [x] or an icon)',kind:'text',max:260,default:'First point | Second point | Third point'},{key:'heading',label:'Heading',kind:'text',max:50,default:'',optional:true},BEATS],
 // Left of centre, and above the bottom fifth that the captions take.
 box:()=>({x:.06,y:.1,width:.72,height:.7}),
 // The type steps down with the number of points, so five points still fit the box.
 body:(p)=>{const list=listOf(p.items,5).map(itemHtml),beats=beatsOf(p.beats);return `<div class="mb-bl mb-bl-${list.length}">${optionalLine('mb-bl-head',p.heading)}<ul class="mb-bl-list">${list.map((t,i)=>`<li${t.icon?' class="mb-has-ic"':''} style="--mb-i:${i}${at(beats,i)}">${t.html}</li>`).join('')}</ul></div>`;},
};
const STAT:MotionTemplate={
 id:'stat',version:1,label:'Stat',
 styles:[{id:'big',label:'Big'},{id:'panel',label:'Panel'}],
 defaultDuration:4,minDuration:1.5,maxDuration:20,
 props:[{key:'value',label:'Number',kind:'text',max:12,default:'100%'},{key:'label',label:'Label',kind:'text',max:70,default:'',optional:true}],
 box:()=>({x:.08,y:.2,width:.84,height:.6}),
 // The figure's size steps down with its length, so "710K" and "12,345,678K" both fit the frame.
 body:(p)=>{const v=String(p.value),size=v.length<=4?'xl':v.length<=7?'l':'m';return `<div class="mb-st"><div class="mb-st-value mb-st-${size}">${escape(v)}</div>${optionalLine('mb-st-label',p.label)}</div>`;},
};
const COMPARE:MotionTemplate={
 id:'compare',version:2,label:'Compare',
 styles:[{id:'split',label:'Split'},{id:'cards',label:'Cards'}],
 defaultDuration:5,minDuration:2,maxDuration:20,
 props:[{key:'titles',label:'Sides (separate with |)',kind:'text',max:100,default:'Old way | New way'},{key:'lines',label:'Lines (sides with |, points in a side with ;)',kind:'text',max:300,default:'',optional:true}],
 box:()=>({x:.06,y:.24,width:.88,height:.5}),
 // The left side (muted) comes in first; the right side (accented) follows it.
 body:(p)=>{const [lt,rt]=pairOf(p.titles),[ll,rl]=pairOf(p.lines);
  // A side's lines are one line, or several points split by ";" (each may start with [check], [x] or an icon).
  const lines=(text:string)=>{const pts=text.split(';').map(s=>s.trim()).filter(Boolean).slice(0,4);return pts.length>1||(pts[0]&&iconItem(pts[0]).icon)?`<ul class="mb-cp-pts">${pts.map((t,i)=>`<li style="--mb-i:${i}">${itemHtml(t).html}</li>`).join('')}</ul>`:optionalLine('mb-cp-line',text);};
  const title=(text:string)=>`<div class="mb-cp-title">${itemHtml(text).html}</div>`;
  return `<div class="mb-cp"><div class="mb-cp-side mb-cp-left">${title(lt)}${lines(ll)}</div><div class="mb-cp-mid"></div><div class="mb-cp-side mb-cp-right">${title(rt)}${lines(rl)}</div></div>`;},
};
const STEPS:MotionTemplate={
 id:'steps',version:4,label:'Steps',
 styles:[{id:'pill',label:'Pill'},{id:'dot',label:'Dot'}],
 defaultDuration:6,minDuration:2.5,maxDuration:20,
 props:[{key:'steps',label:'Steps (separate with |; start one with an icon)',kind:'text',max:200,default:'Plan | Make | Post'},{key:'heading',label:'Heading',kind:'text',max:50,default:'',optional:true},BEATS],
 box:()=>({x:.06,y:.26,width:.88,height:.48}),
 // Step i lights at a share of the block's length; the connector after it draws halfway to the next step.
 body:(p)=>{const names=listOf(p.steps,5),n=names.length,beats=beatsOf(p.beats);
  // On beats, a step lights on its word and the connector after it draws just before the next one's.
  const row=names.map((t,i)=>{const vars=`--mb-i:${i};--mb-n:${n}`,{icon,text}=iconItem(t),link=beats[i+1]!==undefined?`;--mb-at:${Math.max(beats[i]??0,beats[i+1]-.4).toFixed(2)}s`:'';return `<div class="mb-sp-step" style="${vars}${at(beats,i)}"><span class="mb-sp-n">${icon?iconSvg(icon):i+1}</span><span class="mb-sp-text">${escape(text)}</span></div>${i<n-1?`<span class="mb-sp-link" style="${vars}${link}"></span>`:''}`;}).join('');
  return `<div class="mb-sp">${optionalLine('mb-sp-head',p.heading)}<div class="mb-sp-row">${row}</div></div>`;},
};
const QUOTE:MotionTemplate={
 id:'quote',version:1,label:'Quote',
 styles:[{id:'mark',label:'Mark'},{id:'bar',label:'Bar'}],
 defaultDuration:5,minDuration:2,maxDuration:20,
 props:[{key:'quote',label:'Quote',kind:'text',max:200,default:'Your quote goes here.'},{key:'who',label:'Who said it',kind:'text',max:60,default:'',optional:true}],
 box:()=>({x:.08,y:.12,width:.84,height:.66}),
 body:(p)=>{const q=String(p.quote),size=q.length<=80?'s':q.length<=140?'m':'l';
  return `<div class="mb-q"><div class="mb-q-text mb-q-${size}">${escape(q)}</div>${optionalLine('mb-q-who',p.who)}</div>`;},
};
const KEYWORD:MotionTemplate={
 id:'keyword',version:1,label:'Keyword',
 styles:[{id:'pop',label:'Pop'},{id:'mark',label:'Highlight'}],
 defaultDuration:3,minDuration:1,maxDuration:20,
 props:[{key:'word',label:'Word or phrase',kind:'text',max:40,default:'Big idea'},{key:'line',label:'Line under it',kind:'text',max:90,default:'',optional:true}],
 box:()=>({x:.06,y:.18,width:.88,height:.6}),
 // Each letter pops in on its own beat; the size steps down with the length so a short phrase fills the frame and a long one still fits.
 body:(p)=>{const w=String(p.word),size=w.length<=8?'s':w.length<=16?'m':'l';
  const letters=[...w].map((ch,i)=>ch===' '?' ':`<span class="mb-kw-ch" style="--mb-i:${i}">${escape(ch)}</span>`).join('');
  return `<div class="mb-kw"><div class="mb-kw-hl"><div class="mb-kw-word mb-kw-${size}">${letters}</div></div>${optionalLine('mb-kw-line',p.line)}</div>`;},
};

const FLOW:MotionTemplate={
 id:'flow',version:2,label:'Flow',
 styles:[{id:'line',label:'Outline'},{id:'cards',label:'Cards'}],
 defaultDuration:6,minDuration:2.5,maxDuration:20,
 props:[{key:'nodes',label:'Boxes (separate with |; start one with an icon)',kind:'text',max:200,default:'[user] You | [bot] Claude | [check] Done'},{key:'labels',label:'Arrow labels (separate with |)',kind:'text',max:120,default:'',optional:true},BEATS],
 box:()=>({x:.04,y:.28,width:.92,height:.44}),
 // Each box comes in at its share of the block; the arrow after it draws on, then its label, then the next box.
 body:(p)=>{const nodes=listOf(p.nodes,4),labels=String(p.labels??'').split('|').map(s=>s.trim()),n=nodes.length,beats=beatsOf(p.beats);
  return `<div class="mb-fl">${nodes.map((t,i)=>{const vars=`--mb-i:${i};--mb-n:${n}`,{icon,text}=iconItem(t),link=beats[i+1]!==undefined?`;--mb-at:${Math.max(beats[i]??0,beats[i+1]-.45).toFixed(2)}s`:'';
   return `<div class="mb-fl-node" style="${vars}${at(beats,i)}">${icon?iconSvg(icon):''}<span>${escape(text)}</span></div>${i<n-1?`<div class="mb-fl-link" style="${vars}${link}">${labels[i]?`<span class="mb-fl-label">${escape(labels[i])}</span>`:''}<span class="mb-fl-line"></span><svg class="mb-fl-head" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5 L8 5 L3 8.5"/></svg></div>`:''}`;}).join('')}</div>`;},
};
const TREE:MotionTemplate={
 id:'tree',version:2,label:'Tree',
 styles:[{id:'round',label:'Round'},{id:'cards',label:'Cards'}],
 defaultDuration:6,minDuration:2.5,maxDuration:20,
 props:[{key:'root',label:'Top box (may start with an icon)',kind:'text',max:60,default:'[bot] Orchestrator'},{key:'children',label:'Branches (separate with |; start one with an icon)',kind:'text',max:200,default:'[code] Worker | [code] Worker | [code] Worker'},BEATS],
 box:()=>({x:.08,y:.1,width:.84,height:.8}),
 // The top box pops in, the branches draw down from it, then each box at their ends.
 body:(p)=>{const root=iconItem(String(p.root)),kids=listOf(p.children,5),n=kids.length,beats=beatsOf(p.beats);
  const x=(i:number)=>((i+.5)/n*100).toFixed(2);
  const paths=kids.map((_,i)=>`<path pathLength="1" style="--mb-i:${i}${at(beats,i,-.35)}" d="M50 0 C50 7, ${x(i)} 5, ${x(i)} 14"/>`).join('');
  return `<div class="mb-tr"><div class="mb-tr-root">${root.icon?iconSvg(root.icon):''}<span>${escape(root.text)}</span></div><svg class="mb-tr-lines" viewBox="0 0 100 14" aria-hidden="true">${paths}</svg><div class="mb-tr-kids">${kids.map((t,i)=>{const {icon,text}=iconItem(t);return `<div class="mb-tr-kid" style="--mb-i:${i}${at(beats,i)}"><span class="mb-tr-dot">${icon?iconSvg(icon):''}</span><span class="mb-tr-name">${escape(text)}</span></div>`;}).join('')}</div></div>`;},
};

/* ---------- The explainer's own graphics: a headline that builds, a versus table, a row of tool logos ---------- */

/** A headline line wrapped in *stars* is the line that lands: it is set in the bold sans, the rest in the look's display type. */
const emphasis=(line:string)=>{const m=/^\*(.+)\*$/.exec(line);return m?{em:true,text:m[1].trim()}:{em:false,text:line};};
const HEADLINE:MotionTemplate={
 id:'headline',version:1,label:'Headline',
 styles:[{id:'lines',label:'Line by line'},{id:'reveal',label:'Word by word'}],
 defaultDuration:4,minDuration:1.5,maxDuration:20,
 props:[{key:'lines',label:'Lines (separate with |; wrap the line that lands in *stars*)',kind:'text',max:160,default:'Your headline | *lands here.*'},{key:'kicker',label:'Small label above',kind:'text',max:50,default:'',optional:true},BEATS],
 box:()=>({x:.04,y:.08,width:.92,height:.74}),
 // Lines: each rises on its beat over a hairline that draws in under it. Word by word: every part is there, dim, and lights as it is said.
 body:(p,style)=>{const parts=listOf(p.lines,style==='reveal'?6:4).map(emphasis),beats=beatsOf(p.beats),chars=parts.reduce((n,l)=>n+l.text.length,0);
  const size=style==='reveal'?(chars<=18?'s':chars<=32?'m':'l'):(parts.length<=2&&chars<=30?'s':parts.length<=3&&chars<=60?'m':'l');
  return `<div class="mb-hl mb-hl-${size}">${optionalLine('mb-hl-kick',p.kicker)}<div class="mb-hl-lines">${parts.map((l,i)=>`<div class="mb-hl-line${l.em?' mb-hl-em':''}" style="--mb-i:${i};--mb-n:${parts.length}${at(beats,i)}">${escape(l.text)}</div>`).join('')}</div></div>`;},
};
/** A versus table's rows: "left | label | right", rows split by ";". A row of two parts has no label; one part fills the left only. */
const rowsOf=(text:unknown)=>String(text??'').split(';').map(r=>r.split('|').map(s=>s.trim())).filter(r=>r.some(Boolean)).slice(0,4).map(r=>r.length>=3?{l:r[0],k:r[1],r:r.slice(2).join(' ')}:{l:r[0]??'',k:'',r:r[1]??''});
const VERSUS:MotionTemplate={
 id:'versus',version:1,label:'Versus',
 styles:[{id:'table',label:'Table'},{id:'cards',label:'Cards'}],
 defaultDuration:6,minDuration:3,maxDuration:20,
 props:[{key:'titles',label:'The two sides (separate with |)',kind:'text',max:80,default:'Marketing | Sales'},{key:'rows',label:'Rows: left | label | right, rows separated with ;',kind:'text',max:300,default:'Attention | You get | A yes ; A maybe | It ends in | A payment'},BEATS],
 box:()=>({x:.04,y:.1,width:.92,height:.72}),
 // The two names and the "vs" come in first; each row rises on its beat, the left side right-aligned to the label and the right side after it.
 body:(p)=>{const [lt,rt]=pairOf(p.titles),rows=rowsOf(p.rows),beats=beatsOf(p.beats),span=`grid-row:1 / ${rows.length+2}`;
  const row=(r:{l:string;k:string;r:string},i:number)=>{const vars=`--mb-i:${i};--mb-n:${rows.length}${at(beats,i)}`;return `<div class="mb-vs-c mb-vs-l" style="${vars}">${escape(r.l)}</div><div class="mb-vs-k" style="${vars}">${escape(r.k)}</div><div class="mb-vs-c mb-vs-r" style="${vars}">${escape(r.r)}</div>`;};
  return `<div class="mb-vs mb-vs-${rows.length}"><div class="mb-vs-bg mb-vs-bg-l" style="${span}"></div><div class="mb-vs-bg mb-vs-bg-r" style="${span}"></div><div class="mb-vs-t mb-vs-l">${escape(lt)}</div><div class="mb-vs-x">vs</div><div class="mb-vs-t mb-vs-r">${escape(rt)}</div>${rows.map(row).join('')}</div>`;},
};
/** A tile's letters when no icon is named: "GoHighLevel" is "GHL", "PDF" stays "PDF", "Excel" is "E". */
const initials=(text:string)=>{const caps=text.match(/[A-Z0-9]/g)??[],words=text.trim().split(/\s+/).filter(Boolean);
 return (caps.length>=2?caps.join(''):words.length>1?words.map(w=>w[0]).join(''):text.slice(0,1)).slice(0,3).toUpperCase();};
const LOGOS:MotionTemplate={
 id:'logos',version:1,label:'Logos',
 styles:[{id:'tiles',label:'Tiles'},{id:'chips',label:'Chips'}],
 defaultDuration:5,minDuration:2,maxDuration:20,
 props:[{key:'items',label:'Tools (separate with |; start each with its icon, such as [notion] Notion)',kind:'text',max:300,default:'[claude] Claude | [notion] Notion | [figma] Figma'},{key:'heading',label:'Heading',kind:'text',max:60,default:'',optional:true},BEATS],
 box:()=>({x:.04,y:.12,width:.92,height:.68}),
 // Each tool's tile pops in on its beat, its name under it. Tiles are drawn in one colour, as one set; chips keep each brand's colour.
 body:(p)=>{const items=listOf(p.items,8).map(iconItem),beats=beatsOf(p.beats);
  return `<div class="mb-lg mb-lg-${items.length}">${optionalLine('mb-lg-head',p.heading)}<div class="mb-lg-set">${items.map(({icon,text},i)=>`<div class="mb-lg-i" style="--mb-i:${i};--mb-n:${items.length}${at(beats,i)}"><span class="mb-lg-tile">${icon?iconSvg(icon):`<span class="mb-lg-abbr">${escape(initials(text))}</span>`}</span><span class="mb-lg-name">${escape(text)}</span></div>`).join('')}</div></div>`;},
};

export const MOTION_TEMPLATES:Readonly<Record<MotionTemplateId,MotionTemplate>>={'title-card':TITLE_CARD,'lower-third':LOWER_THIRD,callout:CALLOUT,'chapter-label':CHAPTER_LABEL,bullets:BULLETS,stat:STAT,compare:COMPARE,steps:STEPS,quote:QUOTE,keyword:KEYWORD,flow:FLOW,tree:TREE,headline:HEADLINE,versus:VERSUS,logos:LOGOS};
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
/** The companion's flat fields for a block: `text` is the main line, `detail` the second, `x` and `y` a callout's point. */
type FlatFields={text?:string;detail?:string;x?:number;y?:number;beats?:string};
/** Each template's props from those fields: `text` is the main content (title, name, label, chapter title, items, number, quote...), `detail` the second line. */
const FLAT_TO_PROPS:Record<MotionTemplateId,(f:FlatFields)=>Record<string,unknown>>={
 'title-card':({text,detail})=>({title:text,subtitle:detail}),
 'lower-third':({text,detail})=>({name:text,role:detail}),
 callout:({text,x,y})=>({label:text,x,y}),
 'chapter-label':({text,detail})=>({title:text,number:detail}),
 bullets:({text,detail})=>({items:text,heading:detail}),
 stat:({text,detail})=>({value:text,label:detail}),
 compare:({text,detail})=>({titles:text,lines:detail}),
 steps:({text,detail})=>({steps:text,heading:detail}),
 quote:({text,detail})=>({quote:text,who:detail}),
 keyword:({text,detail})=>({word:text,line:detail}),
 flow:({text,detail})=>({nodes:text,labels:detail}),
 tree:({text,detail})=>({root:text,children:detail}),
 headline:({text,detail})=>({lines:text,kicker:detail}),
 versus:({text,detail})=>({titles:text,rows:detail}),
 logos:({text,detail})=>({items:text,heading:detail}),
};
/** A template's props from the companion's flat fields (see `FLAT_TO_PROPS`). */
export function motionPropsFrom(template:MotionTemplateId,fields:FlatFields):Record<string,string|number>{
 // Beats go to every template that builds; the others drop them with the unknown keys.
 return normalizeMotionProps(template,Object.fromEntries(Object.entries({...FLAT_TO_PROPS[template](fields),beats:fields.beats}).filter(([,v])=>v!==undefined)));
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
/** The prop that holds each block's main text (what the timeline and the companion show). */
const MAIN_PROP:Record<MotionTemplateId,string>={'title-card':'title','lower-third':'name',callout:'label','chapter-label':'title',bullets:'items',stat:'value',compare:'titles',steps:'steps',quote:'quote',keyword:'word',flow:'nodes',tree:'root',headline:'lines',versus:'titles',logos:'items'};
/** What the block says, for the timeline and the companion: its main text. */
export function motionText(b:MotionBlock){return String(b.props[MAIN_PROP[b.template]]??'');}
/** A graphic's words as a person reads them: no [icon] names or *stars*, items joined with " · ", rows with " / ". */
export const motionReadable=(text:unknown)=>String(text??'').split(';').map(row=>row.split('|').map(item=>{const t=iconItem(item.trim()).text;return emphasis(t).text;}).filter(Boolean).join(' · ')).filter(Boolean).join(' / ');
export const motionLabel=(b:MotionBlock)=>`${MOTION_TEMPLATES[b.template]?.label??'Motion'}: ${motionReadable(motionText(b))}`;
/** The places each text template can take: a side for the ones that narrow well, a band for the wide ones. Others keep their own spot. */
export const PLACEABLE:Partial<Record<MotionTemplateId,readonly MotionPlace[]>>={'title-card':['left','right','top','bottom','stage'],keyword:['left','right','top','bottom','stage'],stat:['left','right','top','bottom','stage'],quote:['left','right','top','bottom','stage'],bullets:['left','right','stage'],compare:['top','bottom','stage'],steps:['top','bottom','stage'],flow:['top','bottom','stage'],tree:['stage'],headline:['left','right','stage'],versus:['top','bottom','stage'],logos:['top','bottom','stage']};
/** The side or band for a graphic, given the speaker's face as fractions of the frame (centre x, centre y): the free side for one that narrows, the band away from the face for a wide one. */
export function placeAwayFrom(template:MotionTemplateId,face:{x:number;y:number}|undefined):MotionPlace|undefined{
 const can=PLACEABLE[template];if(!can||!face)return undefined;
 if(can.includes('left'))return face.x>=.5?'left':'right';
 return face.y<.5?'bottom':'top';
}
/** A placed block draws in its side or band, so the export captures the whole frame for it. */
export const motionBox=(b:MotionBlock)=>b.place&&PLACEABLE[b.template]?.includes(b.place)?{x:0,y:0,width:1,height:1}:MOTION_TEMPLATES[b.template].box(normalizeMotionProps(b.template,b.props));

/** The panel beside the stage's tile (see `stageTile` in shared/look.ts): the rest of the frame, inside the same margins. */
function stagePanel(stage:{side:'right'|'left';size:number}|undefined){
 // Kept in step with `stagePanel` in shared/look.ts.
 const size=stage?.size??.2,margin=3.5,gap=2.5,width=100-size*100-margin*2-gap;
 return `left:${(stage?.side==='left'?margin+size*100+gap:margin).toFixed(2)}cqw;width:${width.toFixed(2)}cqw`;
}

/** A #rrggbb colour's relative brightness, 0 (black) to 1 (white). */
const luminance=(hex:string)=>{const n=parseInt(hex.slice(1),16);return (.2126*(n>>16&255)+.7152*(n>>8&255)+.0722*(n&255))/255;};
/** The block's markup: the same string in the preview and in the export page. `--mb-d` is the block's length, which times the way out. */
export function motionMarkup(b:MotionBlock):string{
 const t=MOTION_TEMPLATES[b.template],style=styleOf(t,b.style),props=normalizeMotionProps(b.template,b.props),place=b.place&&PLACEABLE[b.template]?.includes(b.place)?` mb-at-${b.place}`:'';
 // The look: its type and motion as classes, its colours as the tokens every template reads. Clean (no look) changes nothing.
 // A look whose highlight is its text colour is monochrome: brand marks are drawn in the text colour too, and nothing glows.
 const look=b.look,mono=!!look&&look.accent.toLowerCase()===look.paper.toLowerCase(),looks=look?`${look.display==='serif'?' mb-serif':''}${mono?' mb-mono':''}${luminance(look.accent)>.55?' mb-ring':''}${look.motion!=='lively'?` mb-motion-${look.motion}`:''}`:'';
 // Text on a highlight-coloured plate reads in whichever of the text and panel colours stands out against it.
 const tokens=look?`;--mb-paper:${look.paper};--mb-ink:${look.ink};--mb-accent:${look.accent};--mb-muted:${look.muted};--mb-on-accent:${luminance(look.accent)>.55?look.ink:look.paper}`:'';
 // On the stage the graphic sits in a panel beside the speaker's tile. The panel does not animate, so one graphic after another reads as
 // one panel whose content changes.
 const body=t.body(props,style),staged=place===' mb-at-stage'?stagePanel(b.look?.stage):undefined;
 return `<div class="mb mb-${t.id} mb-s-${style}${place}${looks}" style="--mb-d:${Math.max(.1,b.duration).toFixed(3)}s${tokens}">${staged?`<div class="mb-panel" style="${staged}"><div class="mb-panel-in">${body}</div></div>`:body}</div>`;
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
.mb{--mb-ink:#151413;--mb-paper:#ffffff;--mb-accent:#2563eb;--mb-scrim:rgb(21 20 19 / .62);--mb-shade:rgb(0 0 0 / .38);--mb-ease:cubic-bezier(.2,.8,.2,1);--mb-out:.4s;--mb-muted:#b8b3ab;--mb-plate:rgb(0 0 0 / .52);--mb-plate-soft:rgb(0 0 0 / .3);--mb-track:rgb(255 255 255 / .26);--mb-edge:rgb(255 255 255 / .12);--mb-edge-soft:rgb(255 255 255 / .07);--mb-ok:#3fbf7f;--mb-no:#ef5a5a;--mb-warn:#e9b04a;--mb-on-accent:#ffffff;
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
@keyframes mb-slide-r{from{opacity:0;transform:translateX(5cqw)}}
@keyframes mb-drop{from{transform:scaleY(0)}}
@keyframes mb-lit{from{opacity:0}}

.mb-title-card .mb-card{position:absolute;left:8cqw;right:8cqw;top:50%;translate:0 -50%;display:flex;flex-direction:column;align-items:center;text-align:center;gap:1.1cqw}
.mb-card-title{font-size:5.4cqw;font-weight:800;letter-spacing:-.02em;line-height:1.05;animation:mb-rise .6s var(--mb-ease) .1s both}
.mb-card-sub{font-size:2cqw;font-weight:500;opacity:.92;animation:mb-rise .6s var(--mb-ease) .25s both}
.mb-card-rule{width:7cqw;height:.45cqw;border-radius:.3cqw;background:var(--mb-accent);animation:mb-grow .5s var(--mb-ease) both}
.mb-s-clean .mb-card-title,.mb-s-clean .mb-card-sub{text-shadow:0 .25cqw 1.6cqw var(--mb-shade)}
.mb-s-bold .mb-card{left:0;right:0;padding:3cqw 8cqw;background:var(--mb-ink);align-items:flex-start;text-align:left;box-shadow:0 1cqw 3cqw var(--mb-shade);transform-origin:left center;animation:mb-grow .55s var(--mb-ease) both}
.mb-s-bold .mb-card-rule{order:3;width:12cqw}
.mb-s-bold .mb-card-title{font-size:5cqw}

.mb-lower-third .mb-lt{position:absolute;left:4.5cqw;bottom:20%;max-width:56cqw;display:flex;flex-direction:column;align-items:flex-start;gap:.35cqw}
.mb-lt-name{font-size:2.7cqw;font-weight:800;letter-spacing:-.01em}
.mb-lt-role{font-size:1.65cqw;font-weight:600}
.mb-s-block .mb-lt-name{background:var(--mb-accent);color:var(--mb-on-accent);padding:.55cqw 1.3cqw;animation:mb-slide .5s var(--mb-ease) both}
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
.mb-s-tag .mb-ch-num{font-size:1.3cqw;font-weight:700;text-transform:uppercase;letter-spacing:.08em;background:var(--mb-accent);color:var(--mb-on-accent);border-radius:5cqw;padding:.45cqw 1cqw}
.mb-s-tag .mb-ch-title{font-size:1.8cqw}
.mb-s-number .mb-ch{align-items:flex-end;gap:1.6cqw}
.mb-s-number .mb-ch-num{font-size:7cqw;font-weight:800;line-height:.85;letter-spacing:-.04em;padding-bottom:.5cqw;border-bottom:.5cqw solid var(--mb-accent);text-shadow:0 .25cqw 1.6cqw var(--mb-shade);animation:mb-rise .55s var(--mb-ease) both}
.mb-s-number .mb-ch-word{display:none}
.mb-s-number .mb-ch-title{font-size:2.4cqw;padding-bottom:1cqw;text-shadow:0 .25cqw 1.6cqw var(--mb-shade);animation:mb-slide .55s var(--mb-ease) .15s both}

/* Bullet points: a heading, then the points build in one by one, left of centre and above the captions. */
.mb-bullets .mb-bl{position:absolute;left:6cqw;top:10%;width:72cqw;height:70%;display:flex;flex-direction:column;justify-content:center;gap:2.2cqw}
.mb-bl-4 .mb-bl-list li{font-size:2.9cqw}
.mb-bl-5 .mb-bl-list li{font-size:2.6cqw}
.mb-bl-head{font-size:2cqw;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mb-accent);text-shadow:0 .25cqw 1.2cqw var(--mb-shade);animation:mb-rise .5s var(--mb-ease) both}
.mb-bl-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1.7cqw}
.mb-bl-list li{position:relative;font-size:3.4cqw;font-weight:700;line-height:1.15;letter-spacing:-.01em;animation:mb-rise .5s var(--mb-ease) both;animation-delay:var(--mb-at,calc(.45s + .34s * var(--mb-i)))}
.mb-s-dash .mb-bl-list li{padding-left:5.4cqw;text-shadow:0 .25cqw 1.6cqw var(--mb-shade)}
.mb-s-dash .mb-bl-list li::before{content:"";position:absolute;left:0;top:calc(.575em - .25cqw);width:3.4cqw;height:.5cqw;border-radius:.3cqw;background:var(--mb-accent)}
.mb-s-panel .mb-bl-list{padding:2cqw 2.6cqw;gap:1.6cqw;border-radius:1.4cqw;background:var(--mb-ink);box-shadow:0 1cqw 3cqw var(--mb-shade)}
.mb-s-panel .mb-bl-list li{padding-left:4.2cqw}
.mb-s-panel .mb-bl-list li::before{content:"";position:absolute;left:0;top:calc(.575em - 1.05cqw);width:2.1cqw;height:2.1cqw;border-radius:50%;background:var(--mb-accent)}

/* Stat: the figure pops in, its label rises after it. */
.mb-stat .mb-st{position:absolute;left:50%;top:50%;translate:-50% -50%;width:84cqw;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:1.8cqw}
.mb-st-value{font-weight:800;letter-spacing:-.045em;line-height:.92;white-space:nowrap;text-shadow:0 .4cqw 2.4cqw var(--mb-shade);animation:mb-pop .6s cubic-bezier(.34,1.56,.64,1) both}
.mb-st-xl{font-size:17cqw}
.mb-st-l{font-size:11.5cqw}
.mb-st-m{font-size:7.6cqw}
.mb-st-label{max-width:64cqw;font-size:2.6cqw;font-weight:600;line-height:1.2;text-wrap:balance;text-shadow:0 .25cqw 1.6cqw var(--mb-shade);animation:mb-rise .5s var(--mb-ease) .3s both}
.mb-s-big .mb-st-label::before{content:"";display:block;width:7cqw;height:.5cqw;margin:0 auto 1.8cqw;border-radius:.3cqw;background:var(--mb-accent)}
.mb-s-panel .mb-st{width:auto;min-width:44cqw;padding:3.2cqw 4cqw;gap:1.6cqw;border-top:.6cqw solid var(--mb-accent);border-radius:1.6cqw;background:var(--mb-ink);box-shadow:0 1.2cqw 3.6cqw var(--mb-shade);animation:mb-pop .55s var(--mb-ease) both}
.mb-s-panel .mb-st-value{text-shadow:none}

/* Compare: the muted left side comes in first, the accented right side after it. */
.mb-compare .mb-cp{position:absolute;left:50%;top:50%;translate:-50% -50%;width:88cqw;display:grid;grid-template-columns:1fr .5cqw 1fr;align-items:stretch;gap:3.4cqw}
.mb-cp-side{display:flex;flex-direction:column;justify-content:center;gap:1.4cqw;padding:2.8cqw 3cqw;border-radius:1.6cqw}
.mb-cp-title{font-size:4.2cqw;font-weight:800;letter-spacing:-.025em;line-height:1.05}
.mb-cp-line{font-size:2.2cqw;font-weight:600;line-height:1.25}
.mb-cp-left{color:var(--mb-muted);animation:mb-slide .6s var(--mb-ease) both}
.mb-cp-right{animation:mb-slide-r .6s var(--mb-ease) .3s both}
.mb-cp-mid{border-radius:.3cqw;background:var(--mb-track);transform-origin:center top;animation:mb-drop .5s var(--mb-ease) .15s both}
.mb-s-split .mb-cp-side{padding:1.6cqw 0}
.mb-s-split .mb-cp-left{border-top:.7cqw solid var(--mb-track);padding-top:2.4cqw}
.mb-s-split .mb-cp-right{border-top:.7cqw solid var(--mb-accent);padding-top:2.4cqw}
.mb-s-split .mb-cp-right .mb-cp-title{font-size:4.8cqw}
.mb-s-cards .mb-cp-left{background:var(--mb-ink);box-shadow:0 1cqw 3cqw var(--mb-shade)}
.mb-s-cards .mb-cp-right{background:var(--mb-accent);box-shadow:0 1.2cqw 3.2cqw var(--mb-shade)}

/* Steps: each step lights in turn across the block, and the connector draws on to the next. */
.mb-steps .mb-sp{position:absolute;left:50%;top:50%;translate:-50% -50%;width:88cqw;display:flex;flex-direction:column;align-items:center;gap:3.2cqw}
.mb-sp-head{font-size:2.2cqw;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mb-accent);text-shadow:0 .25cqw 1.2cqw var(--mb-shade);animation:mb-rise .5s var(--mb-ease) both}
.mb-sp-row{width:100%;display:flex;align-items:center}
.mb-sp-step{position:relative;flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;text-align:center}
.mb-sp-n,.mb-sp-text{position:relative}
.mb-sp-n{font-size:1.9cqw;font-weight:800}
.mb-sp-text{font-size:2.4cqw;font-weight:700;line-height:1.15}
.mb-sp-link{position:relative;flex:0 0 3.4cqw;height:.5cqw;border-radius:.3cqw;background:var(--mb-track);overflow:hidden;animation:mb-lit .35s linear both;animation-delay:calc(.2s + .1s * var(--mb-i))}
.mb-sp-link::after{content:"";position:absolute;inset:0;background:var(--mb-accent);transform-origin:left center;animation:mb-grow .4s var(--mb-ease) both;animation-delay:var(--mb-at,calc(var(--mb-d) * (.1 + .75 * (var(--mb-i) + .5) / var(--mb-n))))}
.mb-s-pill .mb-sp-step{flex:1 0 auto;flex-direction:column;gap:1cqw;min-height:13cqw;padding:2cqw 1.4cqw;border-radius:2.6cqw;background:var(--mb-ink);box-shadow:0 .8cqw 2.4cqw var(--mb-shade);animation:mb-rise .5s var(--mb-ease) both;animation-delay:calc(.1s * var(--mb-i))}
.mb-s-pill .mb-sp-step::before{content:"";position:absolute;inset:0;border-radius:inherit;background:var(--mb-accent);animation:mb-lit .35s linear both;animation-delay:var(--mb-at,calc(var(--mb-d) * (.1 + .75 * var(--mb-i) / var(--mb-n))))}
.mb-s-dot .mb-sp-row{align-items:flex-start}
.mb-s-dot .mb-sp-step{flex-direction:column;gap:1.8cqw}
.mb-s-dot .mb-sp-n{isolation:isolate;display:grid;place-items:center;width:7cqw;height:7cqw;border-radius:50%;background:var(--mb-ink);font-size:2.8cqw;box-shadow:0 .8cqw 2.4cqw var(--mb-shade);animation:mb-pop .5s cubic-bezier(.34,1.56,.64,1) both;animation-delay:calc(.1s * var(--mb-i))}
.mb-s-dot .mb-sp-n::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:50%;background:var(--mb-accent);animation:mb-lit .35s linear both;animation-delay:var(--mb-at,calc(var(--mb-d) * (.1 + .75 * var(--mb-i) / var(--mb-n))))}
.mb-s-dot .mb-sp-text{font-size:2.2cqw}
.mb-s-dot .mb-sp-link{margin-top:3.25cqw}

/* Quote: large type, with a quote mark above it or an accent bar beside it. */
.mb-quote .mb-q{position:absolute;left:50%;top:50%;translate:-50% -50%;width:80cqw;display:flex;flex-direction:column;gap:2.4cqw}
.mb-q-text{font-weight:700;letter-spacing:-.02em;line-height:1.12;text-wrap:balance;text-shadow:0 .3cqw 2cqw var(--mb-shade);animation:mb-rise .6s var(--mb-ease) .1s both}
.mb-q-s{font-size:5.6cqw}
.mb-q-m{font-size:4.4cqw}
.mb-q-l{font-size:3.5cqw}
.mb-q-who{font-size:2.1cqw;font-weight:600;text-shadow:0 .25cqw 1.6cqw var(--mb-shade);animation:mb-rise .5s var(--mb-ease) .45s both}
.mb-q-who::before{content:"\\2014\\00a0"}
.mb-s-mark .mb-q{align-items:flex-start;text-align:left}
.mb-s-mark .mb-q-text::before{content:"\\201C";display:block;height:.5em;font-size:2.4em;line-height:.8;color:var(--mb-accent)}
.mb-s-bar .mb-q{width:76cqw;padding-left:4.4cqw;border-left:.9cqw solid var(--mb-accent);align-items:flex-start;text-align:left}
.mb-s-bar .mb-q-who{font-size:1.8cqw;letter-spacing:.14em;text-transform:uppercase;color:var(--mb-muted)}
.mb-s-bar .mb-q-who::before{content:""}

/* Keyword: each letter pops in on its own beat; the highlight style wipes a bar in behind the word. */
.mb-keyword .mb-kw{position:absolute;left:50%;top:50%;translate:-50% -50%;width:88cqw;display:flex;flex-direction:column;align-items:center;gap:2.4cqw;text-align:center}
.mb-kw-hl{position:relative;isolation:isolate;max-width:100%}
.mb-kw-word{font-weight:900;letter-spacing:-.035em;line-height:1;text-wrap:balance;overflow-wrap:anywhere}
/* One shadow for the whole word, not one per letter: per-letter shadows show as grey halos over the neighbouring letters. */
.mb-s-pop .mb-kw-word{filter:drop-shadow(0 .4cqw 1.2cqw var(--mb-shade))}
.mb-kw-s{font-size:15cqw}
.mb-kw-m{font-size:10cqw}
.mb-kw-l{font-size:7.2cqw}
.mb-kw-ch{display:inline-block;animation:mb-pop .42s cubic-bezier(.34,1.56,.64,1) both;animation-delay:calc(.03s * var(--mb-i))}
.mb-kw-line{font-size:2.6cqw;font-weight:600;text-shadow:0 .25cqw 1.6cqw var(--mb-shade);animation:mb-rise .5s var(--mb-ease) .5s both}
.mb-s-mark .mb-kw-hl{display:inline-block;padding:0 2.4cqw;color:var(--mb-on-accent)}
.mb-s-mark .mb-kw-hl::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:1.2cqw;background:var(--mb-accent);transform-origin:left center;animation:mb-grow .45s var(--mb-ease) both}

/* Readable over any picture, light walls included: a layered shadow under text that has no panel of its own (a soft glow plate read as
   a smudge on real footage). */
.mb-headline .mb-hl :is(.mb-hl-line,.mb-hl-kick),.mb-versus .mb-vs :is(.mb-vs-t,.mb-vs-c,.mb-vs-k,.mb-vs-x),.mb-logos :is(.mb-lg-head,.mb-lg-name),.mb-s-clean .mb-card :is(.mb-card-title,.mb-card-sub),.mb-s-bold .mb-card :is(.mb-card-title,.mb-card-sub),.mb-s-pop .mb-kw .mb-kw-line,.mb-s-big .mb-st :is(.mb-st-value,.mb-st-label),.mb-quote .mb-q :is(.mb-q-text,.mb-q-who),.mb-s-dash .mb-bl :is(li,.mb-bl-head),.mb-s-split .mb-cp *{text-shadow:0 .15cqw .35cqw var(--mb-plate),0 .3cqw 1.6cqw var(--mb-plate),0 0 4cqw var(--mb-plate-soft)}
/* The keyword's letters are separate spans: a text shadow would halo each one, so the whole word gets one drop shadow. */
.mb-s-pop .mb-kw-word{filter:drop-shadow(0 .15cqw .35cqw var(--mb-plate)) drop-shadow(0 .4cqw 1.8cqw var(--mb-plate))}
/* Away from the face: a side narrows the text to the free half; a band keeps a wide graphic above or below. */
.mb.mb-at-left :is(.mb-card,.mb-kw,.mb-st,.mb-q,.mb-bl,.mb-hl),.mb.mb-at-right :is(.mb-card,.mb-kw,.mb-st,.mb-q,.mb-bl,.mb-hl){top:50%;width:36cqw;height:auto;translate:0 -50%}
.mb.mb-at-left :is(.mb-card,.mb-kw,.mb-st,.mb-q,.mb-bl,.mb-hl){left:5cqw;right:auto;align-items:flex-start;text-align:left}
.mb.mb-at-right :is(.mb-card,.mb-kw,.mb-st,.mb-q,.mb-bl,.mb-hl){left:auto;right:5cqw;align-items:flex-end;text-align:right}
/* A list reads from its dashes: on the right it keeps to the right edge as a block, its lines still aligned left. */
.mb.mb-at-right .mb-bl{width:auto;max-width:36cqw;align-items:flex-start;text-align:left}
.mb.mb-at-left .mb-card-title,.mb.mb-at-right .mb-card-title{font-size:4.6cqw}
.mb.mb-at-left .mb-kw-word,.mb.mb-at-right .mb-kw-word{font-size:5.4cqw;overflow-wrap:normal;word-break:keep-all}
.mb.mb-at-left .mb-st-value,.mb.mb-at-right .mb-st-value{font-size:9cqw}
.mb.mb-at-left .mb-q-text,.mb.mb-at-right .mb-q-text{font-size:3.4cqw}
.mb.mb-at-top :is(.mb-kw,.mb-st,.mb-q,.mb-cp,.mb-sp,.mb-vs,.mb-lg){top:7cqh;translate:-50% 0}
.mb.mb-at-bottom :is(.mb-kw,.mb-st,.mb-q,.mb-cp,.mb-sp,.mb-vs,.mb-lg){top:auto;bottom:24cqh;translate:-50% 0}
.mb.mb-at-top .mb-card{top:7cqh;translate:0 0}
.mb.mb-at-bottom .mb-card{top:auto;bottom:24cqh;translate:0 0}

/* The look's type: headlines, lists, big numbers and quotes in the editorial serif; small labels and captions stay sans. */
.mb.mb-serif :is(.mb-card-title,.mb-kw-word,.mb-st-value,.mb-q-text,.mb-bl-list li,.mb-cp-title,.mb-sp-label,.mb-ch-title,.mb-lt-name,.mb-tr-root,.mb-hl-line,.mb-vs-t,.mb-vs-c,.mb-vs-x,.mb-lg-head){font-family:"Instrument Serif",Georgia,"Times New Roman",serif;font-weight:400;letter-spacing:-.01em}
.mb.mb-serif :is(.mb-card-title,.mb-kw-word,.mb-st-value){letter-spacing:-.015em;line-height:1.02}
/* The serif look's headings are quiet labels in the serif, as in the reference ("What the prompt asks for"), not tracked capitals. */
.mb.mb-serif :is(.mb-sp-head,.mb-bl-head){font-family:"Instrument Serif",Georgia,"Times New Roman",serif;font-weight:400;font-size:3cqw;letter-spacing:-.005em;text-transform:none;color:var(--mb-paper)}
/* The look's motion. Still: graphics come and go with a cut. Subtle: they only fade, and lists still build one line at a time. */
.mb.mb-motion-still,.mb.mb-motion-still *{animation:none!important}
.mb.mb-motion-subtle *{animation-name:mb-fade-in!important;animation-timing-function:ease-out!important}
@keyframes mb-fade-in{from{opacity:0}}
/* Word by word keeps its words on screen, dim until they are said, in every look that moves. */
.mb.mb-motion-subtle.mb-s-reveal .mb-hl-line{animation-name:mb-light!important}

/* Icons: a status as a coloured ring with its mark, any other icon on a small tile. Sized in em, so they follow the line they sit on. */
.mb-ic{width:1em;height:1em;flex:none;display:block}
.mb-txt{min-width:0}
.mb-badge,.mb-tile{flex:none;display:grid;place-items:center;width:1.3em;height:1.3em;animation:mb-pop .4s cubic-bezier(.34,1.56,.64,1) both;animation-delay:inherit}
.mb-badge{border-radius:50%;border:.09em solid currentColor;--mb-c:currentColor}
.mb-badge .mb-ic{width:.7em;height:.7em;stroke-width:3}
.mb-badge-ok{color:var(--mb-ok)}
.mb-badge-no{color:var(--mb-no)}
.mb-badge-warn{color:var(--mb-warn)}
.mb-tile{border-radius:.3em;background:var(--mb-ink);box-shadow:inset 0 0 0 .04em var(--mb-edge);color:var(--mb-accent)}
.mb-tile .mb-ic{width:.72em;height:.72em}
.mb-bl-list li.mb-has-ic{display:flex;align-items:center;gap:.55em;padding-left:0}
.mb-bl-list li.mb-has-ic::before{display:none}
.mb-cp-title{display:flex;align-items:center;gap:.4em}
.mb-cp-title .mb-tile{font-size:.8em}
.mb-cp-pts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.9cqw}
.mb-cp-pts li{display:flex;align-items:center;gap:.6em;font-size:2.1cqw;font-weight:600;line-height:1.2;animation:mb-rise .45s var(--mb-ease) both;animation-delay:calc(.55s + .18s * var(--mb-i))}
.mb-cp-pts .mb-badge{width:1.25em;height:1.25em}
.mb-cp-left .mb-cp-pts li{animation-delay:calc(.25s + .18s * var(--mb-i))}
/* Cards: both sides are panels, the right one ringed in the highlight colour, like a choice made. */
.mb-s-cards .mb-cp-left{color:var(--mb-paper);opacity:.78}
.mb-s-cards .mb-cp-right{background:var(--mb-ink);box-shadow:0 0 0 .22cqw var(--mb-accent),0 0 4cqw color-mix(in srgb,var(--mb-accent) 28%,transparent),0 1.2cqw 3.2cqw var(--mb-shade)}
.mb-sp-n .mb-ic{width:1.15em;height:1.15em}

/* Flow: boxes joined by arrows, each box and arrow in turn. */
.mb-flow .mb-fl{position:absolute;left:50%;top:50%;translate:-50% -50%;width:88cqw;display:flex;align-items:center;justify-content:center}
.mb-fl-node{flex:none;display:flex;align-items:center;gap:.6em;padding:1.3cqw 2cqw;border-radius:1.2cqw;background:var(--mb-ink);box-shadow:inset 0 0 0 .1cqw var(--mb-edge),0 .8cqw 2.4cqw var(--mb-shade);font-size:2.4cqw;font-weight:700;animation:mb-pop .45s var(--mb-ease) both;animation-delay:var(--mb-at,calc(var(--mb-d) * (.04 + .62 * var(--mb-i) / var(--mb-n))))}
.mb-fl-node .mb-ic{color:var(--mb-accent)}
.mb-fl-node:last-child{box-shadow:0 0 0 .2cqw var(--mb-accent),0 0 3.4cqw color-mix(in srgb,var(--mb-accent) 30%,transparent),0 .8cqw 2.4cqw var(--mb-shade)}
.mb-fl-link{position:relative;flex:1 1 6cqw;min-width:4cqw;max-width:12cqw;height:2.4cqw;margin:0 1.2cqw}
.mb-fl-line{position:absolute;left:0;right:.5cqw;top:50%;height:.22cqw;margin-top:-.11cqw;border-radius:.2cqw;background:var(--mb-accent);transform-origin:left center;animation:mb-grow .45s var(--mb-ease) both;animation-delay:var(--mb-at,calc(var(--mb-d) * (.04 + .62 * (var(--mb-i) + .5) / var(--mb-n))))}
.mb-fl-head{position:absolute;right:0;top:50%;width:1.4cqw;height:1.4cqw;translate:0 -50%;fill:none;stroke:var(--mb-accent);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;animation:mb-pop .25s var(--mb-ease) both;animation-delay:calc(var(--mb-at,calc(var(--mb-d) * (.04 + .62 * (var(--mb-i) + .5) / var(--mb-n)))) + .4s)}
.mb-fl-label{position:absolute;left:50%;bottom:100%;translate:-50% -.3cqw;font-size:1.5cqw;font-weight:700;color:var(--mb-accent);white-space:nowrap;animation:mb-rise .4s var(--mb-ease) both;animation-delay:calc(var(--mb-at,calc(var(--mb-d) * (.04 + .62 * (var(--mb-i) + .5) / var(--mb-n)))) + .2s)}
.mb-fl-node>span{max-width:17cqw;text-wrap:balance;text-align:center;line-height:1.2}
/* Outline: plain rounded boxes on a dark plate, thin arrows between them, the last one a pill: where it ends. */
.mb-s-line .mb-fl-node{padding:1.4cqw 2.2cqw;border-radius:.9cqw;background:color-mix(in srgb,var(--mb-ink) 78%,transparent);box-shadow:inset 0 0 0 .14cqw color-mix(in srgb,var(--mb-paper) 62%,transparent);font-size:2.1cqw;font-weight:600}
.mb-s-line .mb-fl-node:last-child{border-radius:5cqw;box-shadow:inset 0 0 0 .14cqw var(--mb-paper)}
.mb-s-line .mb-fl-line{height:.14cqw;margin-top:-.07cqw;background:color-mix(in srgb,var(--mb-paper) 70%,transparent)}
.mb-s-line .mb-fl-head{stroke:color-mix(in srgb,var(--mb-paper) 70%,transparent);width:1.1cqw;height:1.1cqw}
.mb-s-line .mb-fl-label{color:var(--mb-muted);font-weight:600}
.mb-s-cards .mb-fl-node{flex-direction:column;gap:.8cqw;padding:2cqw 2.4cqw;font-size:2.1cqw}
.mb-s-cards .mb-fl-node .mb-ic{width:1.6em;height:1.6em}

/* Tree: one box, branches drawn down from it, a box at the end of each. */
.mb-tree .mb-tr{position:absolute;left:50%;top:50%;translate:-50% -50%;width:76cqw;display:flex;flex-direction:column;align-items:center}
.mb-tr-root{display:flex;align-items:center;gap:.55em;padding:1.4cqw 2.6cqw;border-radius:1.4cqw;background:var(--mb-ink);box-shadow:0 0 0 .2cqw var(--mb-accent),0 0 4cqw color-mix(in srgb,var(--mb-accent) 30%,transparent),0 1cqw 3cqw var(--mb-shade);font-size:3.2cqw;font-weight:700;white-space:nowrap;animation:mb-pop .5s var(--mb-ease) both}
.mb-tr-root .mb-ic{color:var(--mb-accent)}
.mb-tr-lines{display:block;width:100%;aspect-ratio:100/14;height:auto;overflow:visible;fill:none;stroke:var(--mb-accent);stroke-width:.28;stroke-linecap:round;stroke-dasharray:1}
.mb-tr-lines path{animation:mb-draw .55s var(--mb-ease) both;animation-delay:var(--mb-at,calc(.4s + .08s * var(--mb-i)))}
.mb-tr-kids{width:100%;display:flex}
.mb-tr-kid{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:1.2cqw;animation:mb-pop .45s cubic-bezier(.34,1.56,.64,1) both;animation-delay:var(--mb-at,calc(.8s + .12s * var(--mb-i)))}
.mb-tr-dot{display:grid;place-items:center;width:7cqw;height:7cqw;border-radius:50%;background:var(--mb-ink);box-shadow:inset 0 0 0 .12cqw var(--mb-edge),0 .8cqw 2.4cqw var(--mb-shade);font-size:3cqw}
.mb-tr-name{font-size:2cqw;font-weight:700;text-align:center}
.mb-s-round .mb-tr-dot{border-radius:50%}
.mb-s-cards .mb-tr-dot{border-radius:1.4cqw}

/* Headline: a few lines that build as they are said. Lines rise over a hairline that draws in under each; the line in *stars* lands in the
   bold sans. Word by word: every part is on screen, dim, and lights as it is said. */
.mb-headline .mb-hl{position:absolute;left:50%;top:50%;translate:-50% -50%;width:84cqw;display:flex;flex-direction:column;align-items:flex-start;gap:1.4cqw}
.mb-hl-kick{font-size:2cqw;font-weight:500;letter-spacing:.01em;color:var(--mb-muted);animation:mb-rise .5s var(--mb-ease) both}
.mb-hl-lines{width:100%;display:flex;flex-direction:column;align-items:stretch}
.mb-hl-s .mb-hl-lines{font-size:8cqw}
.mb-hl-m .mb-hl-lines{font-size:6.4cqw}
.mb-hl-l .mb-hl-lines{font-size:5cqw}
.mb-hl-line{position:relative;font-weight:800;letter-spacing:-.03em;line-height:1.04;padding:.16em 0 .1em;animation:mb-rise .55s var(--mb-ease) both;animation-delay:var(--mb-at,calc(.1s + var(--mb-d) * .5 * var(--mb-i) / var(--mb-n)))}
.mb-s-reveal .mb-hl-em{color:var(--mb-accent)}
.mb.mb-serif .mb-hl-line.mb-hl-em{color:var(--mb-paper);font-family:"Inter Variable",Inter,system-ui,sans-serif;font-weight:700;font-size:.84em;letter-spacing:-.035em;line-height:1.12}
.mb-s-lines .mb-hl-line::after{content:"";position:absolute;left:0;right:0;bottom:0;height:.12cqw;background:color-mix(in srgb,var(--mb-paper) 18%,transparent);transform-origin:left center;animation:mb-grow .7s var(--mb-ease) both;animation-delay:inherit}
.mb-s-lines .mb-hl-line.mb-hl-em::after{height:.45cqw;background:var(--mb-accent)}
.mb.mb-serif.mb-s-lines .mb-hl-line.mb-hl-em::after{height:.12cqw;background:color-mix(in srgb,var(--mb-paper) 18%,transparent)}
.mb-s-reveal .mb-hl{align-items:center;text-align:center}
.mb-s-reveal .mb-hl-lines{flex-direction:row;flex-wrap:wrap;justify-content:center;column-gap:.24em}
.mb-s-reveal.mb-headline .mb-hl-s .mb-hl-lines{font-size:9cqw}
.mb-s-reveal.mb-headline .mb-hl-m .mb-hl-lines{font-size:7cqw}
.mb-s-reveal.mb-headline .mb-hl-l .mb-hl-lines{font-size:5.4cqw}
.mb-s-reveal .mb-hl-line{padding:0;animation:mb-light .45s ease-out both;animation-delay:var(--mb-at,calc(.15s + var(--mb-d) * .6 * var(--mb-i) / var(--mb-n)))}
@keyframes mb-light{from{opacity:.2}}
.mb.mb-at-left .mb-hl-lines,.mb.mb-at-right .mb-hl-lines{font-size:4.6cqw!important}

/* Versus: the two names with a quiet "vs", then a row at a time: the left side ends at the label, the right side starts after it. */
.mb-versus .mb-vs{position:absolute;left:50%;top:50%;translate:-50% -50%;width:80cqw;display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;isolation:isolate}
.mb-vs-bg{display:none}
.mb-vs-l{grid-column:1}
.mb-vs-x,.mb-vs-k{grid-column:2}
.mb-vs-r{grid-column:3}
.mb-vs-t{display:flex;align-items:flex-end;padding:0 2.2cqw 2.4cqw;font-size:5.4cqw;font-weight:800;letter-spacing:-.03em;line-height:1;animation:mb-rise .55s var(--mb-ease) both}
.mb-vs-t.mb-vs-l,.mb-vs-c.mb-vs-l{justify-content:flex-end;text-align:right}
.mb-vs-t.mb-vs-r{animation-delay:.3s}
.mb-vs-x{display:flex;align-items:flex-end;justify-content:center;padding-bottom:2.6cqw;font-size:2.6cqw;font-style:italic;color:var(--mb-muted);animation:mb-lit .4s linear .15s both}
.mb-vs-c,.mb-vs-k{display:flex;align-items:center;border-top:.12cqw solid color-mix(in srgb,var(--mb-paper) 16%,transparent);animation-delay:var(--mb-at,calc(.7s + var(--mb-d) * .55 * var(--mb-i) / var(--mb-n)))}
.mb-vs-c{padding:1.2cqw 2.2cqw;font-size:3.6cqw;font-weight:600;line-height:1.1;letter-spacing:-.015em;animation-name:mb-rise;animation-duration:.5s;animation-timing-function:var(--mb-ease);animation-fill-mode:both}
.mb-vs-k{justify-content:center;padding:0 1.2cqw;font-size:1.5cqw;font-weight:500;color:var(--mb-muted);white-space:nowrap;animation-name:mb-lit;animation-duration:.4s;animation-timing-function:linear;animation-fill-mode:both}
.mb-vs-4 .mb-vs-c{font-size:3.1cqw;padding-top:1cqw;padding-bottom:1cqw}
.mb-s-table .mb-vs-x{padding-left:.6cqw;padding-right:.6cqw}
.mb-s-cards .mb-vs-bg{display:block;position:absolute;inset:0;z-index:-1;border-radius:1.4cqw;background:var(--mb-ink);box-shadow:inset 0 0 0 .1cqw var(--mb-edge),0 1cqw 3cqw var(--mb-shade);animation:mb-lit .4s linear both}
.mb-s-cards .mb-vs-bg-l{grid-column:1 / -1}
.mb-s-cards .mb-vs-bg-r{grid-column:3;z-index:-1;background:color-mix(in srgb,var(--mb-accent) 16%,transparent);box-shadow:inset 0 0 0 .14cqw var(--mb-accent);animation-delay:.3s}
.mb-s-cards .mb-vs-t{padding-top:2.4cqw}
.mb-s-cards :is(.mb-vs-c,.mb-vs-k){border-top-color:transparent}

/* Logos: the tools that are named, each a tile that pops in on its word, its name under it. Tiles are one colour, as one set; chips keep
   each brand's colour. */
.mb-logos .mb-lg{position:absolute;left:50%;top:50%;translate:-50% -50%;width:84cqw;display:flex;flex-direction:column;align-items:center;gap:3cqw}
.mb-lg-head{font-size:3.4cqw;font-weight:700;letter-spacing:-.02em;text-align:center;animation:mb-rise .5s var(--mb-ease) both}
.mb-lg-set{display:flex;flex-wrap:wrap;justify-content:center;gap:2.6cqw 2.2cqw;max-width:80cqw}
.mb-lg-i{display:flex;flex-direction:column;align-items:center;gap:1.1cqw;width:10cqw;animation:mb-pop .45s cubic-bezier(.34,1.56,.64,1) both;animation-delay:var(--mb-at,calc(.25s + var(--mb-d) * .45 * var(--mb-i) / var(--mb-n)))}
.mb-lg-tile{display:grid;place-items:center;width:6.6cqw;height:6.6cqw;border-radius:1.5cqw;background:var(--mb-paper);color:var(--mb-ink);box-shadow:0 .6cqw 2cqw var(--mb-shade);font-size:3.4cqw}
.mb-lg-tile .mb-ic{width:1.05em;height:1.05em}
.mb-lg-abbr{font-size:.62em;font-weight:800;letter-spacing:-.02em;line-height:1}
.mb-lg-name{max-width:100%;font-size:1.6cqw;font-weight:500;line-height:1.15;color:var(--mb-muted);text-align:center}
.mb-lg-6 .mb-lg-i,.mb-lg-7 .mb-lg-i,.mb-lg-8 .mb-lg-i{width:8.6cqw}
.mb-lg-6 .mb-lg-tile,.mb-lg-7 .mb-lg-tile,.mb-lg-8 .mb-lg-tile{width:5.8cqw;height:5.8cqw;font-size:3cqw}
.mb-s-tiles .mb-lg-tile .mb-brand path{fill:currentColor}
.mb-s-chips .mb-lg-set{gap:1.4cqw}
.mb-s-chips .mb-lg-i{flex-direction:row;width:auto;gap:1cqw;padding:.8cqw 1.8cqw .8cqw .8cqw;border-radius:5cqw;background:color-mix(in srgb,var(--mb-ink) 84%,transparent);box-shadow:inset 0 0 0 .12cqw var(--mb-edge),0 .6cqw 2cqw var(--mb-shade)}
.mb-s-chips .mb-lg-tile{width:3.6cqw;height:3.6cqw;border-radius:.8cqw;font-size:2.1cqw;box-shadow:none}
.mb-s-chips .mb-lg-name{font-size:2.2cqw;font-weight:650;color:var(--mb-paper);white-space:nowrap}

/* A monochrome look draws brand marks in its text colour and lets nothing glow; a light highlight marks the current step with a ring, so
   the text on it stays readable. */
.mb-mono .mb-brand path,.mb-s-tiles .mb-lg-tile .mb-brand-letter rect,.mb-mono .mb-brand-letter rect{fill:currentColor}
.mb-s-tiles .mb-lg-tile .mb-brand-letter text,.mb-mono .mb-brand-letter text{fill:var(--mb-paper)}
.mb-mono :is(.mb-fl-node:last-child,.mb-tr-root){box-shadow:inset 0 0 0 .14cqw var(--mb-paper),0 .8cqw 2.4cqw var(--mb-shade)}
.mb-mono.mb-s-cards .mb-cp-right{box-shadow:inset 0 0 0 .14cqw var(--mb-paper),0 1.2cqw 3.2cqw var(--mb-shade)}
.mb-ring.mb-s-pill .mb-sp-step{box-shadow:inset 0 0 0 .12cqw color-mix(in srgb,var(--mb-paper) 22%,transparent)}
.mb-ring.mb-s-pill .mb-sp-step::before{background:transparent;box-shadow:inset 0 0 0 .2cqw var(--mb-accent)}
.mb-ring.mb-s-dot .mb-sp-n::before{background:transparent;box-shadow:inset 0 0 0 .22cqw var(--mb-accent)}

/* On the stage (the speaker a tile at the side): the graphic sits in a panel that takes the rest of the frame, centred in it. The panel
   holds still and only what is in it comes and goes, so one graphic after another reads as one panel. */
.mb.mb-at-stage{animation:none}
.mb-panel{position:absolute;top:5cqh;bottom:5cqh;border-radius:1.4cqw;background:color-mix(in srgb,var(--mb-ink) 55%,transparent);box-shadow:inset 0 0 0 .08cqw var(--mb-edge-soft),0 1.4cqw 4cqw var(--mb-shade);overflow:hidden}
.mb-panel-in{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:4cqw;animation:mb-fade-out var(--mb-out) ease-in calc(var(--mb-d) - var(--mb-out)) forwards}
.mb-panel-in>*{position:relative!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;translate:none!important;height:auto!important;max-width:100%}
.mb-panel-in>:is(.mb-card,.mb-kw,.mb-st,.mb-q,.mb-bl){width:auto!important}
.mb-panel-in>:is(.mb-cp,.mb-sp,.mb-fl,.mb-tr,.mb-vs,.mb-lg,.mb-hl){width:100%!important}
.mb-panel-in .mb-fl-node{font-size:2cqw}
.mb-panel-in .mb-fl-link{margin:0 .8cqw;min-width:2.6cqw}
.mb-panel-in .mb-sp-text{font-size:1.8cqw}
.mb-panel-in .mb-sp-link{flex-basis:1.6cqw}
.mb-s-pill .mb-panel-in .mb-sp-step{padding:1.8cqw 1cqw;min-height:11cqw}
.mb-panel-in .mb-fl{flex-wrap:nowrap}
.mb-panel-in .mb-tr-root{font-size:2.8cqw}
.mb-panel-in .mb-cp-title{font-size:3.2cqw}
.mb-panel-in .mb-q-text{font-size:4cqw}
.mb-panel-in .mb-s-panel .mb-bl-list,.mb-panel-in .mb-s-panel.mb-st{box-shadow:inset 0 0 0 .08cqw var(--mb-edge-soft)}
`;
