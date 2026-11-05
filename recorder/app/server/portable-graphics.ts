import path from 'node:path';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
// Loaded on first use: the native binding takes ~35 ms to open, which every service start would otherwise pay.
let resvg:typeof import('@resvg/resvg-js')|undefined;
const loadResvg=()=>resvg??=createRequire(import.meta.url)('@resvg/resvg-js') as typeof import('@resvg/resvg-js');
type Config={width:number;height:number;type:string;text?:string;x:number;y:number;boxWidth:number;boxHeight:number;color?:string;background?:string;fontSize?:number;opacity?:number;rotation?:number;radius?:number;strokeWidth?:number};
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const color=(s:string|undefined,fallback:string)=>s&&/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(s)?s:fallback;
/** Native resvg rasterization on Windows; no Swift, browser, or remote service. */
export function portableGraphics(c:Config):Buffer{
 const w=Math.max(1,Math.min(7680,c.width)),h=Math.max(1,Math.min(4320,c.height));
 const x=c.x*w,y=c.y*h,bw=c.boxWidth*w,bh=c.boxHeight*h,size=Math.max(6,c.fontSize||48);
 const fg=color(c.color,'#ffffff'),bg=color(c.background,'#00000000');let shape='';
 if(c.type==='text'){
  const max=Math.max(1,Math.floor((bw-24)/(size*.56))),lines:string[]=[];
  for(const paragraph of (c.text||'').split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(line&&line.length+word.length+1>max){lines.push(line);line=word;}else line+=(line?' ':'')+word;}lines.push(line);}
  const lineHeight=size*1.2,total=lines.length*lineHeight,top=y+bh/2-total/2;
  shape=`<rect x="${x}" y="${Math.max(y,top-8)}" width="${bw}" height="${Math.min(bh,total+16)}" rx="8" fill="${bg}"/><text font-family="Inter, Segoe UI, sans-serif" font-size="${size}" font-weight="600" text-anchor="middle" fill="${fg}">${lines.map((line,i)=>`<tspan x="${x+bw/2}" y="${top+size+i*lineHeight}">${esc(line)}</tspan>`).join('')}</text>`;
 }else if(c.type==='ellipse'||c.type==='rectangle'||c.type==='highlight'){
  // As the preview draws them (src/Stage.tsx): the background fills the box, the colour outlines it on the inside.
  const lw=c.strokeWidth??(c.type==='highlight'?4:3),r=c.type==='highlight'?c.radius??8:0;
  shape=c.type==='ellipse'?`<ellipse cx="${x+bw/2}" cy="${y+bh/2}" rx="${bw/2}" ry="${bh/2}" fill="${bg}"/><ellipse cx="${x+bw/2}" cy="${y+bh/2}" rx="${Math.max(0,bw/2-lw/2)}" ry="${Math.max(0,bh/2-lw/2)}" fill="none" stroke="${fg}" stroke-width="${lw}"/>`
   :`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${r}" fill="${bg}"/><rect x="${x+lw/2}" y="${y+lw/2}" width="${Math.max(0,bw-lw)}" height="${Math.max(0,bh-lw)}" rx="${Math.max(0,r-lw/2)}" fill="none" stroke="${fg}" stroke-width="${lw}"/>`;
 }
 else if(c.type==='arrow'){const sx=bw/100,sy=bh/40,pt=(px:number,py:number)=>`${x+px*sx} ${y+py*sy}`;shape=`<path d="M${pt(2,20)}L${pt(90,20)}M${pt(72,4)}L${pt(94,20)}L${pt(72,36)}" fill="none" stroke="${fg}" stroke-width="${Math.max(1,4*sy)}"/>`;}
 else if(c.type==='cursor')shape=`<path d="M${w*.47} ${h*.43}l0 ${h*.045} ${w*.009} -${h*.012} ${w*.009} ${h*.018} ${w*.008} -${h*.006} -${w*.01} -${h*.018} ${w*.014} 0Z" fill="${fg}" stroke="#000" stroke-width="2"/>`;
 else shape=`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${c.type==='mask'?c.radius||0:8}" fill="${c.type==='mask'?'#ffffff':fg}"/>`;
 const font=path.join(process.env.CREATOR_COMPILER_RUNTIME_DIR||path.resolve(import.meta.dirname,'../../../engine/cutroom/crates/gfx/assets'),'fonts/Inter-SemiBold.ttf');
 const {Resvg}=loadResvg();
 return Buffer.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g opacity="${c.opacity??1}" transform="rotate(${c.rotation||0} ${x+bw/2} ${y+bh/2})">${shape}</g></svg>`,{font:{loadSystemFonts:true,...(existsSync(font)?{fontFiles:[font]}:{})}}).render().asPng());
}
