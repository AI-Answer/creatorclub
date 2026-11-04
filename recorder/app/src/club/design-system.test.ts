import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/*
 * The design system's rules, checked on the source: colours live only in `ui/tokens.css`, icons come only from `ui/icons.tsx`,
 * and the prototype's icon names survive only in the files another task is still rewriting.
 */
const club=path.dirname(fileURLToPath(import.meta.url));
const src=path.dirname(club);
const walk=(dir:string):string[]=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const rel=(file:string)=>path.relative(src,file).split(path.sep).join('/');
/** Club source a person sees: stylesheets and components, not tests or test fakes. */
const sources=walk(club).filter(file=>/\.(css|tsx?)$/.test(file)&&!/\.test\.tsx?$/.test(file)&&!/(^|\/)test-[^/]*$/.test(rel(file)));

/** A hex colour (#abc, #aabbcc, #aabbccdd) after a CSS or JS delimiter, or an rgb/rgba/hsl/hsla call. */
const RAW_COLOUR=/(?:^|[\s:,('"`])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b(?![-/])|\b(?:rgba?|hsla?)\(/;
const TOKENS='club/ui/tokens.css';

/** Shipped Heptabase values are documented in docs/design/heptabase-dark-theme.md. */
const declarations=(sheet:string,selector:string)=>{
 const css=sheet.replace(/\/\*[\s\S]*?\*\//g,'');
 const start=css.indexOf(selector);assert.ok(start>=0,`${selector} exists`);
 const body=css.slice(css.indexOf('{',start)+1,css.indexOf('}',start));
 return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);?/g)].map(([,name,value])=>[name,value.trim()]));
};
const themeTokens=()=>{
 const css=fs.readFileSync(path.join(src,TOKENS),'utf8');
 return {light:declarations(css,'.club-root {'),dark:declarations(css,'.club-root:where([data-theme=dark]')};
};

test('dark surfaces, text, focus and board primitives match Heptabase',()=>{
 const {dark}=themeTokens();
 for(const [name,value] of Object.entries({
  '--cc-bg':'#212121','--cc-bg-sunk':'#191919','--cc-surface':'#242629','--cc-surface-2':'#242629',
  '--cc-text':'#e1e1e1','--cc-text-2':'rgba(255, 255, 255, .65)','--cc-text-3':'#b0b0b5',
  '--cc-line':'rgba(255, 255, 255, .08)','--cc-hover':'rgba(255, 255, 255, .06)',
  '--cc-accent':'#61c6fa','--cc-accent-soft':'rgba(35, 131, 226, .2)',
  '--cc-board-bg':'#191919','--cc-board-grid':'rgba(255, 255, 255, .18)',
  '--cc-card-bg':'#242629','--cc-card-border':'rgba(255, 255, 255, .12)',
  '--cc-card-border-hover':'rgba(255, 255, 255, .36)','--cc-selection':'#61c6fa',
  '--cc-selection-bg':'rgba(35, 131, 226, .3)','--cc-section-bg':'rgba(47, 48, 49, .5)',
  '--cc-section-title-bg':'hsl(210 2% 19%)','--cc-popover-bg':'#3d4046',
 }))assert.equal(dark[name],value,name);
});

test('existing light shell colours stay unchanged and board primitives match Heptabase light',()=>{
 const {light}=themeTokens();
 for(const [name,value] of Object.entries({
  '--cc-bg':'#ffffff','--cc-bg-sunk':'#fafafa','--cc-surface':'#fafafa','--cc-surface-2':'#fafafa',
  '--cc-line':'#e5e5e5','--cc-text':'#0a0a0a','--cc-text-2':'#404040','--cc-text-3':'#737373',
  '--cc-accent':'#3b82f6','--cc-primary':'#0a0a0a',
  '--cc-board-bg':'#eeeded','--cc-board-grid':'rgba(0, 0, 0, .2)',
  '--cc-card-bg':'#ffffff','--cc-card-border':'rgba(0, 0, 0, .13)',
  '--cc-card-border-hover':'rgba(0, 0, 0, .32)','--cc-selection':'#207dff',
  '--cc-selection-bg':'rgba(75, 155, 230, .3)','--cc-section-bg':'rgba(225, 225, 225, .4)',
  '--cc-section-title-bg':'hsl(0 0% 88%)',
 }))assert.equal(light[name],value,name);
});

test('global dark token blocks agree with the club theme',()=>{
 const {dark}=themeTokens();
 const aliases={'--background':'--cc-bg','--foreground':'--cc-text','--secondary':'--cc-surface-2','--line':'--cc-line','--muted':'--cc-text-2','--accent':'--cc-accent'};
 const compact=(value:string)=>value.replace(/\s+/g,'');
 for(const file of ['original-theme.css','creator-theme.css']){
  const sheet=fs.readFileSync(path.join(src,file),'utf8');
  const blocks=[...sheet.matchAll(/:root\[data-theme=dark\][^{]*\{[^}]*\}/g)];assert.ok(blocks.length);
  for(const [block] of blocks){
   const tokens=declarations(block,':root[data-theme=dark]');
   // A compatibility name either points at its club token or repeats its value.
   for(const [name,target] of Object.entries(aliases))if(tokens[name])assert.ok(compact(tokens[name])===`var(${target})`||compact(tokens[name])===compact(dark[target]),`${file}: ${name} is ${tokens[name]}`);
  }
 }
 const interactions=declarations(fs.readFileSync(path.join(src,'interaction-theme.css'),'utf8'),':root[data-theme=dark]');
 const resolve=(value:string)=>compact(value).replace(/^var\((--cc-[\w-]+)\)$/,(_,name:string)=>compact(dark[name]));
 assert.equal(resolve(interactions['--focus-ring']),compact(dark['--cc-selection']));
 assert.equal(resolve(interactions['--muted']),compact(dark['--cc-text-2']));
});

test('dark body and secondary text meet contrast targets on boards, panels, hover and menus',()=>{
 const {dark}=themeTokens();
 const rgba=(value:string):number[]=>value.startsWith('#')?[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)):[...value.matchAll(/[\d.]+/g)].map(m=>Number(m[0]));
 const over=(fg:number[],bg:number[])=>fg.slice(0,3).map((v,i)=>v*(fg[3]??1)+bg[i]*(1-(fg[3]??1)));
 const luminance=(rgb:number[])=>rgb.map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const contrast=(fg:number[],bg:number[])=>{const a=luminance(over(fg,bg)),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
 for(const background of ['--cc-board-bg','--cc-bg','--cc-surface','--cc-popover-bg']){
  const bg=rgba(dark[background]);
  for(const surface of [bg,over(rgba(dark['--cc-hover']),bg)])for(const [name,min] of [['--cc-text',4.5],['--cc-text-2',3],['--cc-text-3',3]] as const){
   const ratio=contrast(rgba(dark[name]),surface);assert.ok(ratio>=min,`${name} on ${background}: ${ratio.toFixed(2)} >= ${min}`);
  }
 }
 assert.ok(contrast(rgba(dark['--cc-on-accent']),rgba(dark['--cc-accent']))>=4.5,'text on the light blue accent stays readable');
});

/**
 * The editor's and recorder's own stylesheets restyle SceneForge's screens from outside `src/club`, and follow the same rule.
 * `original-theme.css` is SceneForge's standalone theme: it has no club-mode rule, and any rule that names a club class must use tokens too.
 */
const EDITOR_STYLES=['editing-club.css','recording-club.css'];

function rawColours(file:string){
 return fs.readFileSync(file,'utf8').split('\n').flatMap((line,index)=>{
  // Comments may name a colour to explain a token; only code counts.
  const code=line.replace(/\/\*.*?\*\//g,'').replace(/^\s*(\*|\/\/).*$/,'');
  return RAW_COLOUR.test(code)?[`${rel(file)}:${index+1}: ${line.trim().slice(0,120)}`]:[];
 });
}

test('no raw colour (hex, rgb, hsl) in club CSS or TSX outside ui/tokens.css',()=>{
 const found=sources.filter(file=>rel(file)!==TOKENS).flatMap(rawColours);
 assert.deepEqual(found,[],`Use a token from ${TOKENS} instead:\n${found.join('\n')}`);
});

test('the tokens file defines every colour the rule allows, light and dark',()=>{
 const tokens=fs.readFileSync(path.join(src,TOKENS),'utf8');
 for(const name of ['--cc-accent','--cc-rec','--cc-ok','--cc-warn','--cc-surface','--cc-text','--cc-line','--kind-screen','--kind-camera','--kind-audio','--kind-graphics','--kind-captions','--kind-zoom','--kind-marker','--cc-shadow-1','--cc-r','--cc-dur'])
  assert.match(tokens,new RegExp(`${name}:`),`${name} is defined`);
 assert.match(tokens,/data-theme=dark/,'a dark set');
 // Borumi's palette: the primary action is near-black in light and white in dark; blue is for focus, selection and links.
 assert.match(tokens,/--cc-primary: #0a0a0a/);
 assert.match(tokens,/data-theme=dark[^}]*--cc-primary: #ffffff/s);
});

test('no raw colour in the editor and recorder club stylesheets',()=>{
 const found=EDITOR_STYLES.flatMap(name=>rawColours(path.join(src,name)));
 assert.deepEqual(found,[],`Use a token from ${TOKENS} instead:\n${found.join('\n')}`);
});

test('club-mode rules of original-theme.css use tokens',()=>{
 // The file is minified (many rules per line), so rules are read as `selector{body}`, nested at-rules aside.
 const rules=[...fs.readFileSync(path.join(src,'original-theme.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
 const found=rules.filter(([,selector,body])=>/club-(root|embed)|\.club-/.test(selector)&&RAW_COLOUR.test(body)).map(([,selector,body])=>`${selector.trim()}{${body.slice(0,80)}}`);
 assert.deepEqual(found,[],`Use a token from ${TOKENS} instead.`);
});

test('the timeline, the scene chips and the take chips paint a kind with the one shared token, and the editor defines no kind colour of its own',()=>{
 const editor=fs.readFileSync(path.join(src,'editing-club.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(editor,/--kind-[a-z-]+\s*:/,'editing-club.css reads --kind-* from tokens.css and does not redefine it');
 for(const kind of ['screen','camera','audio','graphics','captions','zoom','layout','markers'])assert.match(editor,new RegExp(`var\\(--kind-${kind}\\)`),`the timeline uses --kind-${kind}`);
 const recorder=fs.readFileSync(path.join(src,'recording-club.css'),'utf8');
 for(const kind of ['screen','camera','audio'])assert.match(recorder,new RegExp(`var\\(--kind-${kind}\\)`),`take chips use --kind-${kind}`);
});

test('nothing in src/club imports lucide-react except the icon registry',()=>{
 const found=sources.filter(file=>/\.tsx?$/.test(file)&&rel(file)!=='club/ui/icons.tsx'&&/from ['"]lucide-react['"]/.test(fs.readFileSync(file,'utf8'))).map(rel);
 assert.deepEqual(found,[],'Add the icon to ui/icons.tsx under a semantic name and use <Icon name="…"/>.');
});

/** Files another task is rewriting (the companion). They keep the prototype's icon names until it merges. */
export const LEGACY_ICON_FILES=[
 'club/workspace/Companion.tsx',
];

test('icons are asked for by meaning; the old picture names stay only in the files still being rewritten',async()=>{
 const {legacyIconNames}=await import('./ui/icons');
 const names=new Set<string>(legacyIconNames);
 const context=/(?:name=|icon\s*[:=]\s*|icon=\{[^}]*|name=\{[^}]*)$/;
 const found:string[]=[];
 for(const file of sources.filter(file=>/\.tsx?$/.test(file)&&!LEGACY_ICON_FILES.includes(rel(file))&&rel(file)!=='club/ui/icons.tsx')){
  const text=fs.readFileSync(file,'utf8');
  for(const match of text.matchAll(/(['"])([A-Z][A-Za-z0-9]+)\1/g)){
   if(!names.has(match[2]))continue;
   if(context.test(text.slice(Math.max(0,match.index!-60),match.index)))found.push(`${rel(file)}: ${match[2]}`);
  }
 }
 assert.deepEqual(found,[]);
});

test('an icon-only button always has an accessible name',()=>{
 // Plain buttons whose only child is an <Icon/> must carry aria-label; IconButton requires `label` by its type.
 const found:string[]=[];
 for(const file of sources.filter(file=>file.endsWith('.tsx'))){
  const text=fs.readFileSync(file,'utf8');
  for(const match of text.matchAll(/<button\b([^>]*)>\s*<Icon\b[^>]*\/>\s*<\/button>/g))if(!/aria-label=/.test(match[1]))found.push(`${rel(file)}: ${match[0].slice(0,100)}`);
 }
 assert.deepEqual(found,[]);
});

test('timeline kinds keep Borumi hues with readable dark graphics and controls',()=>{
 const tokens=fs.readFileSync(path.join(src,TOKENS),'utf8'),split=tokens.indexOf('data-theme=dark'),light=tokens.slice(0,split),dark=tokens.slice(split);
 const value=(block:string,name:string)=>block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
 // Borumi 0.32.1's scale (index-DXJH5HZm.css). Its dark scale runs backwards, so its blue-400 is a deeper blue and its yellow-400 an orange there.
 for(const kind of ['--kind-screen','--kind-camera']){assert.equal(value(light,kind),'hsl(213 94% 68%)',`${kind} is light blue-400`);assert.equal(value(dark,kind),'hsl(221 83% 53%)',`${kind} is dark blue-400`);}
 assert.equal(value(light,'--kind-audio'),'hsl(142 69% 58%)');assert.equal(value(dark,'--kind-audio'),'hsl(142 76% 36%)');
 assert.equal(value(light,'--kind-control'),'hsl(43 96% 56%)');assert.equal(value(dark,'--kind-control'),'#854508');
 assert.equal(value(light,'--kind-graphics'),'rgb(192 132 252)');
 for(const kind of ['--kind-captions','--kind-zoom','--kind-layout'])assert.equal(value(light,kind),'var(--kind-control)',`${kind} is a control row`);
 // Words on a clip are Borumi's text-primary; on a take the pill is the background at half strength and the waveform black.
 assert.equal(value(light,'--kind-ink'),'#0a0a0a');assert.equal(value(dark,'--kind-ink'),'#ffffff');
 assert.equal(value(light,'--kind-audio-band'),'rgb(255 255 255 / 0.5)');assert.equal(value(dark,'--kind-audio-band'),'rgb(10 10 10 / 0.5)');
 const css=fs.readFileSync(path.join(src,'editing-club.css'),'utf8'),club=fs.readFileSync(path.join(src,'club/borumi.css'),'utf8');
 assert.match(css,/\.club-marker\{[^}]*var\(--kind-markers\)/,'markers use their token');
 assert.match(css,/:is\(\.club-clip,\.club-effect\)\.selected\{outline:2px solid var\(--tl-select\)/,'selection is an outline only');
 assert.match(club,/:is\(\.club-clip, \.club-effect\)\.selected \{ outline: 2px solid var\(--cc-accent\); outline-offset: 1px; \}/,'in the club, Borumi\'s blue-500 ring one pixel off');
 // The waveform is Borumi's black envelope, but strong enough to read: at least 3:1 on every clip colour in both themes.
 const waveOpacity=Number(/\.club-wave \{ opacity: ([\d.]+); \}/.exec(club)?.[1]);
 const toRgb=(h:number,s:number,l:number)=>{s/=100;l/=100;const k=(n:number)=>(n+h/30)%12,a=s*Math.min(l,1-l),f=(n:number)=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return [f(0),f(8),f(4)];};
 const lin=(v:number)=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4,lum=(c:number[])=>.2126*lin(c[0])+.7152*lin(c[1])+.0722*lin(c[2]);
 for(const [h,sat,l] of [[213,94,68],[142,69,58],[221,83,53],[142,76,36]] as const){
  const bg=toRgb(h,sat,l),wave=bg.map(v=>v*(1-waveOpacity)),ratio=(lum(bg)+.05)/(lum(wave)+.05);
  assert.ok(ratio>=3,`waveform contrast ${ratio.toFixed(2)}:1 on hsl(${h} ${sat}% ${l}%) at opacity ${waveOpacity}`);
 }
 assert.match(club,/\.row-layouts \.club-effect \{[^}]*background: var\(--kind-layout\)/,'layout stretches are the control colour');
});

test('every stylesheet, the editor\'s included, takes text sizes and corner radii from the token scale',()=>{
 // Only tiny ruler and timeline labels (under 10px) and hairline corners (under 5px) may be written as plain pixels.
 const sheets=walk(src).filter(file=>file.endsWith('.css')&&rel(file)!==TOKENS&&!rel(file).includes('node_modules'));
 const off=sheets.flatMap(file=>{
  const css=fs.readFileSync(file,'utf8');
  const sizes=[...css.matchAll(/font-size:\s*([0-9.]+)px/g)].filter(m=>Number(m[1])>=10).map(m=>`${rel(file)}: ${m[0]}`);
  const radii=[...css.matchAll(/border-radius:\s*([0-9.]+)px\s*[;}!]/g)].filter(m=>Number(m[1])>=5).map(m=>`${rel(file)}: ${m[0]}`);
  return [...sizes,...radii];
 });
 assert.deepEqual(off,[],'use --cc-text-* and --cc-r-* from club/ui/tokens.css');
});

test('P2 small dark effect labels reach 4.5:1, including Layout at 80% opacity',()=>{
 const {light,dark}=themeTokens(),tokens={...light,...dark};
 const rgb=(value:string):number[]=>{
  if(value.startsWith('var('))return rgb(tokens[value.slice(4,-1)]);
  if(value.startsWith('#'))return [1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
  const n=[...value.matchAll(/[\d.]+/g)].map(m=>Number(m[0]));if(!value.startsWith('hsl'))return n;
  const [h,s,l]=[n[0]/30,n[1]/100,n[2]/100],a=s*Math.min(l,1-l);return [0,8,4].map(o=>{const k=(o+h)%12;return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)));});
 };
 const luminance=(c:number[])=>c.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const ink=rgb(tokens['--kind-ink']);
 for(const kind of ['graphics','control','captions','zoom','layout'])for(const alpha of [1,.8]){
  const bg=rgb(tokens[`--kind-${kind}`]),a=luminance(ink.map((v,i)=>v*alpha+bg[i]*(1-alpha))),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  assert.ok(ratio>=4.5,`${kind} at ${alpha}: ${ratio.toFixed(2)}`);
 }
});

test('take outlines and sync badges reach 3:1 against clip fills in both themes',()=>{
 const {light,dark}=themeTokens();
 for(const tokens of [light,{...light,...dark}]){
  const rgb=(value:string):number[]=>{
   if(value.startsWith('var('))return rgb(tokens[value.slice(4,-1)]);
   if(value.startsWith('#'))return [1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255);
   const n=[...value.matchAll(/[\d.]+/g)].map(m=>Number(m[0]));if(!value.startsWith('hsl'))return n.map(v=>v/255);
   const [h,s,l]=[n[0]/30,n[1]/100,n[2]/100],a=s*Math.min(l,1-l),f=(k:number)=>{const x=(k+h)%12;return l-a*Math.max(-1,Math.min(x-3,9-x,1));};return [f(0),f(8),f(4)];
  };
  const lum=(v:string)=>rgb(v).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
  const contrast=(a:string,b:string)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  for(const fill of ['--kind-screen','--kind-camera','--kind-audio','--kind-graphics','--kind-control'])assert.ok(contrast(tokens['--take-outline'],tokens[fill])>=3,fill);
  assert.ok(contrast(tokens['--take-badge-ink'],tokens['--take-badge-bg'])>=4.5);
 }
 const css=fs.readFileSync(path.join(src,'editing-club.css'),'utf8');assert.match(css,/\.club-clip.take-related\{outline:2px solid var\(--take-outline\)/);assert.match(css,/\.club-clip.take-related-take\{outline-style:dashed/);
});
