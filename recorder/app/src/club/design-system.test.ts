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
 // The primary action is the dark button of the approved prototype (light in dark mode); blue is for focus, selection and links.
 assert.match(tokens,/--cc-primary: #151413/);
 assert.match(tokens,/data-theme=dark[^}]*--cc-primary: #f3f1ed/s);
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
 for(const kind of ['screen','camera','audio','graphics','captions','zoom','markers'])assert.match(editor,new RegExp(`var\\(--kind-${kind}\\)`),`the timeline uses --kind-${kind}`);
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

test('Task 14: timeline kinds are told apart from selection blue and from "done" green; markers have their own visible colour',()=>{
 const tokens=fs.readFileSync(path.join(src,TOKENS),'utf8'),light=tokens.slice(0,tokens.indexOf('data-theme=dark'));
 const value=(name:string)=>light.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`,'i'))?.[1];
 const hsl=(hex:string)=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2,s=d?d/(1-Math.abs(2*l-1)):0;
  let h=0;if(d){h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360;}return {h,s};};
 const far=(a:string,b:string,deg:number)=>{const x=hsl(a),y=hsl(b),dh=Math.min(Math.abs(x.h-y.h),360-Math.abs(x.h-y.h));return x.s<.15||dh>=deg;};
 const accent=value('--cc-accent')!,ok=value('--cc-ok')!;
 for(const kind of ['--kind-audio','--kind-captions','--kind-markers']){const v=value(kind);assert.ok(v,`${kind} is its own colour`);assert.ok(far(v!,accent,40),`${kind} is not selection blue`);assert.ok(far(v!,ok,40),`${kind} is not "done" green`);}
 assert.ok(far(value('--kind-captions')!,value('--kind-zoom')!,20)&&far(value('--kind-markers')!,value('--kind-zoom')!,15),'captions and markers differ from zoom');
 const css=fs.readFileSync(path.join(src,'editing-club.css'),'utf8');
 assert.match(css,/\.club-marker\{[^}]*background:var\(--kind-markers\)/,'markers use their token');
 assert.match(css,/:is\(\.club-clip,\.club-effect\)\.selected\{outline:2px solid var\(--tl-select\)/,'selection is the accent outline only');
});
