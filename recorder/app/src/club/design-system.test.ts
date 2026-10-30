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
 * The editor's and recorder's own stylesheets still carry raw colours. They are outside `src/club` and owned by the editor
 * work: Task 7b moves them onto the tokens (and points the timeline's kind colours at `ui/kinds.ts`).
 */
export const EDITOR_COLOUR_TODO=['editing-club.css','recording-club.css','original-theme.css'];

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
 // The primary action is the accent, not a separate colour.
 assert.match(tokens,/--cc-primary: var\(--cc-accent\)/);
});

test('editor stylesheets still to move onto the tokens (Task 7b)',{todo:`raw colours remain in ${EDITOR_COLOUR_TODO.join(', ')}`},()=>{
 const found=EDITOR_COLOUR_TODO.flatMap(name=>rawColours(path.join(src,name)));
 assert.deepEqual(found,[]);
});

test('nothing in src/club imports lucide-react except the icon registry',()=>{
 const found=sources.filter(file=>/\.tsx?$/.test(file)&&rel(file)!=='club/ui/icons.tsx'&&/from ['"]lucide-react['"]/.test(fs.readFileSync(file,'utf8'))).map(rel);
 assert.deepEqual(found,[],'Add the icon to ui/icons.tsx under a semantic name and use <Icon name="…"/>.');
});

/** Files another task is rewriting (Discover and Videos screens, the companion). They keep the prototype's icon names until it merges. */
export const LEGACY_ICON_FILES=[
 'club/screens/IdeasScreen.tsx','club/screens/TrendingScreen.tsx','club/screens/SignalsScreen.tsx','club/screens/ProductionScreen.tsx','club/screens/OverviewScreen.tsx',
 'club/Sidebar.tsx','club/workspace/Companion.tsx',
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
