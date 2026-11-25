#!/usr/bin/env node
/**
 * Captures the README and landing-page screenshots from the running app, on demo data only.
 *
 *   node scripts/capture-screenshots.mjs            # writes docs/screenshots/*.png and recorder/site/img/*.webp
 *   node scripts/capture-screenshots.mjs --keep     # also keeps the demo data folder and prints where it is
 *   node scripts/capture-screenshots.mjs --serve    # seeds the demo, then leaves the app running for a look around
 *
 * What it does:
 * - Builds the interface and starts the local service from source on its own port (4384, or SHOTS_PORT), with its own data,
 *   channel, secrets and home folders inside a temporary folder. Your projects, channels and accounts are never read.
 * - Puts stand-in `claude`, `codex` and `higgsfield` commands first on PATH, so any account line reads creator@example.com.
 * - Draws all the media with resvg and ffmpeg: a code editor screen recording, a cartoon presenter in a room, a picture
 *   background, and a voice track from the system text-to-speech when there is one (macOS `say`), else a tone.
 * - Builds a channel, videos and one edited project through the app's own HTTP API: an outline with scene scripts, the
 *   recording project, clips, word-timed captions, graphics, Auto layout and a picture behind the cut-out presenter.
 * - Takes the shots with Playwright (through npx) at 1600 × 1000, device scale 2, in the light theme.
 *
 * Remove background needs Apple Vision, which finds no person in a drawing. For the greenscreen shot the capture answers the
 * preview's mask request with the drawing's own silhouette, which is exactly what Vision returns for a real person. Everything
 * else on screen is drawn by the app.
 *
 * Needs: Node 24, `npm run setup` done, ffmpeg and cwebp on PATH (Homebrew: `brew install ffmpeg webp`), and network
 * access the first time npx fetches Playwright. Playwright's Chromium is used when installed, else Google Chrome.
 * PNGs are shrunk with oxipng or pngquant when either is installed, else with an ffmpeg 256-colour palette.
 * `ONLY=editor,cutroom` retakes some shots; `--no-build` reuses the last interface build.
 */
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=path.join(root,'recorder/app');
const flags=new Set(process.argv.slice(2));
const SERVICE_PORT=Number(process.env.SHOTS_PORT)||4384;
const API=`http://127.0.0.1:${SERVICE_PORT}/api`,UI=`http://127.0.0.1:${SERVICE_PORT}/`;
const PLAYWRIGHT='playwright@1.59.0';
const VIEWPORT={width:1600,height:1000},SCALE=2;
const OUT=path.join(root,'docs/screenshots'),SITE=path.join(root,'recorder/site/img');

const work=fs.mkdtempSync(path.join(os.tmpdir(),'creator-compiler-shots-'));
const dirs=Object.fromEntries(['bin','home','studio','channels','secrets','media','raw'].map(name=>[name,path.join(work,name)]));
for(const dir of Object.values(dirs))fs.mkdirSync(dir,{recursive:true});
const log=(...args)=>console.log('·',...args);
const children=[];
function cleanup(){for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');if(!flags.has('--keep')&&!flags.has('--serve'))fs.rmSync(work,{recursive:true,force:true});}
process.on('exit',cleanup);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>process.exit(130));

const run=(cmd,args,options={})=>{const r=spawnSync(cmd,args,{stdio:['ignore','pipe','pipe'],encoding:'utf8',...options});if(r.status!==0)throw Error(`${cmd} ${args.slice(0,4).join(' ')} failed: ${r.stderr||r.error}`);return r.stdout;};
const has=cmd=>spawnSync('sh',['-c',`command -v ${cmd}`]).status===0;
const ffmpeg=(...args)=>run('ffmpeg',['-hide_banner','-loglevel','error','-y',...args]);
const duration=file=>Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file]).trim());
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// ---------------------------------------------------------------- stand-in AI command-line tools

const stubs={
 claude:`#!/bin/sh\ncase "$1" in\n --version) echo "2.1.300 (Claude Code)";;\n auth) echo '{"loggedIn":true,"email":"creator@example.com"}';;\n *) echo '{}';;\nesac\n`,
 codex:`#!/bin/sh\ncase "$1" in\n --version) echo "codex-cli 0.80.0";;\n login) echo "Logged in using ChatGPT" >&2;;\nesac\nexit 0\n`,
 higgsfield:`#!/bin/sh\necho '{"email":"creator@example.com","subscription_plan_type":"pro","credits":1200}'\n`,
};
for(const [name,body] of Object.entries(stubs)){const file=path.join(dirs.bin,name);fs.writeFileSync(file,body);fs.chmodSync(file,0o755);}

// ---------------------------------------------------------------- the script the presenter reads

const SCENES=[
 {title:'Start with one idea',show:'Talking to camera',points:['One idea is enough to start','The whole edit fits in an afternoon'],
  lines:['Every video starts with one idea.','Today I will show you how I turn it into a finished edit in one afternoon.'],
  script:'Every video starts with one idea. Today I will show you how I turn it into a finished edit in one afternoon. No studio and no second monitor: one screen recording, one camera, and a plan I wrote before I pressed record. If you have an idea sitting in your notes, this is for you.'},
 {title:'Plan it in code',show:'The editor, typing the plan',points:['Each scene gets talking points and a length','Run it and read the outline'],
  lines:['Let me show you the plan in code.','Here you can see each scene with its talking points and its length.','I paste in the idea, run it, and the outline prints below.'],
  script:'Let me show you the plan in code. Here you can see each scene with its talking points and its length. I paste in the idea, run it, and the outline prints below. If a scene runs long, I see it here, before I record it, not in the edit. Three scenes, about two minutes, and every scene knows what it has to say.'},
 {title:'Check the result',show:'Scroll through the output, then back to camera',points:['Scroll to the result','Close with one next step'],
  lines:['Now I scroll down to the result and check the timing.','That is the whole workflow.','Thanks for watching, and subscribe for the next one.'],
  script:'Now I scroll down to the result and check the timing. Cut the pauses, add one graphic per idea, and let Auto layout choose when the camera or the screen fills the frame. Read the captions once, fix the two words it misheard, and export. That is the whole workflow. Thanks for watching, and subscribe for the next one.'},
];

// ---------------------------------------------------------------- media

const requireApp=createRequire(path.join(app,'package.json'));
const {Resvg}=requireApp('@resvg/resvg-js');
const fontFiles=['Inter-Regular.ttf','Inter-SemiBold.ttf','Inter-Bold.ttf','JetBrainsMono-Regular.ttf'].map(f=>path.join(app,'runtime/fonts',f));
const svgToPng=(svg,file)=>fs.writeFileSync(file,new Resvg(svg,{font:{fontFiles,loadSystemFonts:false,defaultFontFamily:'Inter'}}).render().asPng());
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/** Voice: one file per sentence, so word timings can be laid out from known sentence lengths. */
function makeVoice(){
 const lines=SCENES.flatMap((scene,sceneIndex)=>scene.lines.map(text=>({text,sceneIndex})));
 const useSay=process.platform==='darwin'&&has('say');
 let t=0.6;const timed=[];
 lines.forEach((line,i)=>{
  const file=path.join(dirs.raw,`line-${i}.wav`);
  if(useSay){run('say',['-r','175','-o',path.join(dirs.raw,`line-${i}.aiff`),line.text]);ffmpeg('-i',path.join(dirs.raw,`line-${i}.aiff`),'-ar','48000','-ac','1',file);}
  else ffmpeg('-f','lavfi','-i',`sine=frequency=180:duration=${(line.text.length*0.06).toFixed(2)}`,'-af','volume=0.2','-ar','48000','-ac','1',file);
  const length=duration(file);timed.push({...line,file,start:t,end:t+length});t+=length+(i+1<lines.length&&lines[i+1].sceneIndex!==line.sceneIndex?0.9:0.45);
 });
 const total=Math.ceil((t+0.6)*10)/10;
 const inputs=timed.flatMap(l=>['-i',l.file]);
 const mix=timed.map((l,i)=>`[${i}]adelay=${Math.round(l.start*1000)}|${Math.round(l.start*1000)}[a${i}]`).join(';')+';'+timed.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${timed.length}:normalize=0,apad,atrim=0:${total}[out]`;
 const voice=path.join(dirs.raw,'voice.wav');
 ffmpeg(...inputs,'-filter_complex',mix,'-map','[out]','-ar','48000','-ac','1',voice);
 return {timed,total,voice};
}

/** Word timings inside each sentence, shared out by word length. */
function captionsOf(timed){
 return timed.map((line,i)=>{
  const words=line.text.split(' '),weight=words.reduce((n,w)=>n+w.length+1,0),span=line.end-line.start;
  let at=line.start;
  const timedWords=words.map(text=>{const d=span*(text.length+1)/weight,w={text,start:+at.toFixed(3),end:+(at+d*0.92).toFixed(3)};at+=d;return w;});
  return {id:`cap_${i}`,start:+line.start.toFixed(3),end:+line.end.toFixed(3),text:line.text,words:timedWords};
 });
}

const PERSON=`<path d="M560 1080 C560 860 700 790 960 790 C1220 790 1360 860 1360 1080 Z" fill="#3f6f8f"/>
<path d="M880 800 L960 880 L1040 800 Z" fill="#f4f1ea"/>
<rect x="905" y="640" width="110" height="170" rx="40" fill="#c58d6c"/>
<ellipse cx="960" cy="520" rx="150" ry="185" fill="#d39c7a"/>
<ellipse cx="808" cy="540" rx="26" ry="44" fill="#c58d6c"/><ellipse cx="1112" cy="540" rx="26" ry="44" fill="#c58d6c"/>
<path d="M806 500 C800 340 880 300 960 300 C1060 300 1125 350 1114 500 C1100 420 1040 395 960 400 C880 400 830 430 806 500 Z" fill="#2b211c"/>
<ellipse cx="905" cy="530" rx="13" ry="15" fill="#2b211c"/><ellipse cx="1015" cy="530" rx="13" ry="15" fill="#2b211c"/>
<path d="M880 492 Q905 478 930 490" stroke="#2b211c" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M990 490 Q1015 478 1040 492" stroke="#2b211c" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M955 545 Q948 590 962 598" stroke="#b07a5b" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M915 625 Q960 660 1005 625" stroke="#8c4a3c" stroke-width="9" fill="none" stroke-linecap="round"/>`;
const SILHOUETTE=`<path d="M560 1080 C560 860 700 790 960 790 C1220 790 1360 860 1360 1080 Z"/><rect x="905" y="640" width="110" height="170" rx="40"/>
<ellipse cx="960" cy="520" rx="150" ry="185"/><ellipse cx="808" cy="540" rx="26" ry="44"/><ellipse cx="1112" cy="540" rx="26" ry="44"/>
<path d="M806 500 C800 340 880 300 960 300 C1060 300 1125 350 1114 500 Z"/>`;
const ROOM=`<defs><linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9e1d6"/><stop offset="1" stop-color="#cfc3b2"/></linearGradient>
<radialGradient id="l" cx="0.18" cy="0.25" r="0.5"><stop offset="0" stop-color="#fff6e0" stop-opacity="0.9"/><stop offset="1" stop-color="#fff6e0" stop-opacity="0"/></radialGradient></defs>
<rect width="1920" height="1080" fill="url(#w)"/><rect width="1920" height="1080" fill="url(#l)"/>
<rect x="1310" y="300" width="460" height="18" rx="4" fill="#8a6a4f"/>
<rect x="1340" y="200" width="46" height="100" rx="4" fill="#3c6e71"/><rect x="1392" y="222" width="38" height="78" rx="4" fill="#d9a441"/><rect x="1436" y="190" width="52" height="110" rx="4" fill="#284b63"/>
<circle cx="1640" cy="262" r="38" fill="#7a9e7e"/><rect x="1620" y="262" width="40" height="38" fill="#b5835a"/>
<rect x="1360" y="520" width="400" height="18" rx="4" fill="#8a6a4f"/><rect x="1400" y="440" width="120" height="80" rx="6" fill="#f3efe8" stroke="#8a6a4f" stroke-width="6"/>
<path d="M210 1080 L210 700 Q210 640 270 640 L330 640" stroke="#5b4636" stroke-width="14" fill="none"/><path d="M300 600 L380 600 L410 680 L270 680 Z" fill="#f2d38a"/>
<rect x="0" y="930" width="1920" height="150" fill="#b9ab98"/>`;
/** The picture that goes behind the cut-out presenter: a calm studio wall with soft panels. */
const BACKDROP=`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3b4f"/><stop offset="1" stop-color="#0f2230"/></linearGradient></defs>
<rect width="1920" height="1080" fill="url(#g)"/>
${Array.from({length:9},(_,i)=>`<rect x="${-40+i*230}" y="120" width="190" height="640" rx="16" fill="#ffffff" opacity="${(0.04+0.02*(i%3)).toFixed(2)}"/>`).join('')}
<circle cx="1560" cy="260" r="120" fill="#f0b25a" opacity="0.85"/><rect x="0" y="860" width="1920" height="220" fill="#0b1922"/>
<text x="120" y="110" font-family="Inter" font-weight="700" font-size="44" fill="#f0b25a" letter-spacing="3">BUILD WITH AI</text>`;

const CODE=[
 '// plan.ts: turn one idea into scenes',
 'type Scene = { title: string; points: string[]; seconds: number };',
 '',
 'export function planVideo(idea: string): Scene[] {',
 '  return [',
 "    { title: 'Hook', points: [idea, 'Why it matters now'], seconds: 20 },",
 "    { title: 'Show the workflow', points: ['Script', 'Record', 'Cut'], seconds: 90 },",
 "    { title: 'Wrap up', points: ['One next step'], seconds: 15 },",
 '  ];',
 '}',
 '',
 "const scenes = planVideo('Edit a video in one afternoon');",
 'for (const scene of scenes) console.log(scene.title, scene.seconds);',
];
const OUTPUT=['$ npx tsx plan.ts','Hook 20','Show the workflow 90','Wrap up 15','','Total: 2 min 5 s across 3 scenes','Ready to record.','','$ npm run check','✔ 3 scenes have talking points','✔ every scene has a length','✔ the hook is under 30 seconds','','$ _'];
function highlight(line){
 const spans=[];const re=/(\/\/.*$)|('[^']*')|\b(type|export|function|return|const|for|of)\b|\b(\d+)\b|(\b[A-Za-z_]\w*(?=\())/g;let last=0,m;
 while((m=re.exec(line))){if(m.index>last)spans.push(['#d6d9e0',line.slice(last,m.index)]);spans.push([m[1]?'#7f8796':m[2]?'#9fd18b':m[3]?'#c49cf5':m[4]?'#f2b36b':'#7cc4f8',m[0]]);last=m.index+m[0].length;}
 if(last<line.length)spans.push(['#d6d9e0',line.slice(last)]);
 return spans.map(([c,t])=>`<tspan fill="${c}">${esc(t)}</tspan>`).join('');
}
/** One frame of the code editor with `lines` lines typed and the terminal scrolled by `scroll` pixels. */
function editorSvg(lines,{terminal=0,scroll=0}={}){
 const code=CODE.slice(0,lines).map((l,i)=>`<text x="360" y="${170+i*40}" font-family="JetBrains Mono" font-size="24" xml:space="preserve">${highlight(l)}</text><text x="300" y="${170+i*40}" font-family="JetBrains Mono" font-size="22" fill="#5d6472" text-anchor="end">${i+1}</text>`).join('');
 const caret=lines<CODE.length?`<rect x="${360+14.4*(CODE[Math.max(0,lines-1)]?.length??0)}" y="${148+(Math.max(lines,1)-1)*40}" width="3" height="30" fill="#e8b04a"/>`:'';
 const out=OUTPUT.slice(0,terminal).map((l,i)=>`<text x="270" y="${760+i*36-scroll}" font-family="JetBrains Mono" font-size="22" fill="${l.startsWith('$')?'#e8b04a':l.startsWith('✔')?'#9fd18b':'#c9ced8'}" xml:space="preserve">${esc(l)}</text>`).join('');
 const files=['plan.ts','script.md','scenes.json','README.md'].map((f,i)=>`<text x="40" y="${150+i*44}" font-family="Inter" font-size="22" fill="${i===0?'#ffffff':'#9aa1ad'}">${f}</text>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#16181d"/>
<rect width="240" height="1080" fill="#1d2027"/><text x="40" y="96" font-family="Inter" font-weight="600" font-size="18" fill="#6c7380" letter-spacing="2">EXPLORER</text>${files}
<rect x="18" y="122" width="204" height="40" rx="8" fill="#ffffff" opacity="0.06"/>
<rect x="240" y="0" width="1680" height="72" fill="#1d2027"/><rect x="240" y="0" width="220" height="72" fill="#16181d"/><text x="276" y="45" font-family="Inter" font-size="22" fill="#e6e8ee">plan.ts</text>
${code}${caret}
<rect x="240" y="690" width="1680" height="390" fill="#121419"/><rect x="240" y="690" width="1680" height="2" fill="#2a2e37"/>
<text x="270" y="725" font-family="Inter" font-weight="600" font-size="18" fill="#6c7380" letter-spacing="2">TERMINAL</text>
<svg x="240" y="735" width="1680" height="345" viewBox="240 735 1680 345">${out}</svg></svg>`;
}

/** The screen recording, timed to the voice: still while the presenter talks, typing through the demo, a scroll through the output. */
function makeScreen(timed,total){
 const demo=timed.filter(l=>l.sceneIndex===1),check=timed.filter(l=>l.sceneIndex===2);
 const states=[];const push=(svg,seconds)=>states.push({svg,seconds});
 const typeStart=demo[0].start,typeEnd=demo.at(-1).end-1.2;
 push(editorSvg(1),typeStart);
 const steps=CODE.length-1,step=(typeEnd-typeStart)/steps;
 for(let n=2;n<=CODE.length;n++)push(editorSvg(n),step);
 const runAt=demo.at(-1).end-1.2;
 for(let n=1;n<=7;n++)push(editorSvg(CODE.length,{terminal:n}),n<7?0.18:Math.max(0.2,check[0].start-runAt-0.18*6));
 const scrollFrames=Math.round((check[0].end-check[0].start)*10);
 for(let i=1;i<=scrollFrames;i++)push(editorSvg(CODE.length,{terminal:OUTPUT.length,scroll:Math.round(250*Math.min(1,i/scrollFrames))}),0.1);
 const used=states.reduce((n,s)=>n+s.seconds,0);
 push(editorSvg(CODE.length,{terminal:OUTPUT.length,scroll:250}),Math.max(0.5,total-used));
 const list=[];
 states.forEach((s,i)=>{const file=path.join(dirs.raw,`screen-${String(i).padStart(3,'0')}.png`);svgToPng(s.svg,file);list.push(`file '${file}'`,`duration ${s.seconds.toFixed(3)}`);});
 list.push(list.at(-2));
 fs.writeFileSync(path.join(dirs.raw,'screen.txt'),list.join('\n'));
 const out=path.join(dirs.media,'screen-recording.mp4');
 ffmpeg('-f','concat','-safe','0','-i',path.join(dirs.raw,'screen.txt'),'-vf','fps=30,format=yuv420p','-t',String(total),'-c:v','libx264','-preset','veryfast','-crf','20',out);
 return out;
}

function makeCamera(voice,total){
 const still=path.join(dirs.raw,'camera.png');
 svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${ROOM}${PERSON}</svg>`,still);
 const out=path.join(dirs.media,'camera.mp4');
 ffmpeg('-loop','1','-framerate','30','-i',still,'-i',voice,'-t',String(total),'-vf','format=yuv420p','-c:v','libx264','-preset','veryfast','-tune','stillimage','-crf','20','-c:a','aac','-b:a','128k','-shortest',out);
 return out;
}

function makeStills(){
 const backdrop=path.join(dirs.media,'studio-wall.png');
 svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${BACKDROP}</svg>`,backdrop);
 const mask=path.join(work,'mask.png');
 svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#000"/><g fill="#fff">${SILHOUETTE}</g></svg>`,mask);
 return {backdrop,mask};
}

// ---------------------------------------------------------------- the app

const env={...process.env,PATH:`${dirs.bin}${path.delimiter}${process.env.PATH}`,HOME:dirs.home,SCENEFORGE_PORT:String(SERVICE_PORT),SCENEFORGE_DATA_DIR:dirs.studio,
 CREATORCLUB_DIR:dirs.channels,CREATORCLUB_SECRETS_DIR:dirs.secrets,SCENEFORGE_CLAUDE_PATH:path.join(dirs.bin,'claude'),NODE_ENV:'development'};
for(const key of ['ANTHROPIC_API_KEY','OPENAI_API_KEY','HIGGSFIELD_API_KEY','GEMINI_API_KEY'])delete env[key];

/**
 * The service serves the interface itself (recorder/app/dist), so the page and the API share one isolated origin: the service only
 * takes requests from its own port and the usual dev ports, and the usual dev ports may be in use.
 */
function startApp(){
 const bin=name=>path.join(app,'node_modules/.bin',name);
 if(!flags.has('--no-build')){log('building the interface');run(bin('vite'),['build','--logLevel','error'],{cwd:app,env});}
 const logFile=fs.openSync(path.join(work,'app.log'),'a');
 children.push(spawn(bin('tsx'),['server/index.ts'],{cwd:app,env,stdio:['ignore',logFile,logFile]}));
}
async function waitFor(url,label){
 for(let i=0;i<240;i++){try{const r=await fetch(url);if(r.ok)return;}catch{}await sleep(500);}
 throw Error(`${label} did not start. See ${path.join(work,'app.log')}`);
}
async function api(method,route,body,headers={}){
 const r=await fetch(API+route,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}).catch(error=>{throw Error(`${method} ${route}: ${error.cause?.message??error.message}`);});
 const text=await r.text();if(!r.ok)throw Error(`${method} ${route} ${r.status} ${text.slice(0,400)}`);
 return {data:text?JSON.parse(text):null,etag:r.headers.get('etag')};
}
const club=(method,route,body)=>api(method,'/club'+route,body).then(r=>r.data);

const OTHER_VIDEOS=[
 ['Claude Code for people who never coded','ideas'],
 ['What I would automate first in a small business','ideas'],
 ['5 no-code tools that replaced my assistant','ideas'],
 ['I automated my YouTube research with Claude','ideas'],
 ['Why my thumbnails get clicked','ideas'],
 ['How I plan a video in 20 minutes','planning'],
 ['Building a Notion CRM from scratch','planning'],
 ['Recording a screen tutorial people finish','recording',{text:'FINISH RATE',bg:'#f3e6cf',ink:'#1d2a33',accent:'#c4521f'}],
 ['My desk setup for screen tutorials','recording'],
 ['Cutting a 40 minute call into a 6 minute video','editing',{text:'40 → 6 MIN',bg:'#1d2a33',ink:'#f4f1ea',accent:'#f0b25a'}],
 ['The one prompt I use for every script','publishing',{text:'ONE PROMPT',bg:'#c4521f',ink:'#fff8ef',accent:'#1d2a33'}],
];
const TITLE='Edit a video in one afternoon';

/** Where each scene starts on the timeline: halfway through the pause before its first line. */
function sceneBounds(media){
 const firsts=SCENES.map((_,i)=>media.timed.find(l=>l.sceneIndex===i)),lasts=SCENES.map((_,i)=>media.timed.findLast(l=>l.sceneIndex===i));
 const starts=firsts.map((line,i)=>i===0?0:+((lasts[i-1].end+line.start)/2).toFixed(3));
 return starts.map((start,i)=>({start,end:starts[i+1]??media.total}));
}

/** One take per scene, as the recorder saves them: a screen file and a camera file each. */
function makeMedia(){
 const media=makeVoice();
 const screen=makeScreen(media.timed,media.total),camera=makeCamera(media.voice,media.total);
 const takes=sceneBounds(media).map(({start,end},i)=>{
  const cut=(source,name)=>{const file=path.join(dirs.media,`scene-${i+1}-${name}.mp4`);ffmpeg('-ss',String(start),'-i',source,'-t',(end-start).toFixed(3),'-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','128k',file);return file;};
  return {start,end,screen:cut(screen,'screen'),camera:cut(camera,'camera')};
 });
 log('media ready',`${media.total}s in ${takes.length} takes`);
 return {media,captions:captionsOf(media.timed),takes,stills:makeStills()};
}

const EFFECTS={brightness:0,contrast:1,saturation:1,blur:0,grayscale:false,flipX:false,fadeIn:0,fadeOut:0,denoise:false,normalize:false};
const FULL={x:0,y:0,width:1,height:1,rotation:0,opacity:1,fit:'cover',borderRadius:0};
const BUBBLE={x:.72,y:.63,width:.25,height:.32,rotation:0,opacity:1,fit:'cover',borderRadius:28};

/** A made-up YouTube thumbnail: big words on the left, the cartoon presenter on the right. */
function thumbnail({text,bg,ink,accent}){
 const file=path.join(dirs.raw,`thumb-${text.replace(/\W+/g,'-').toLowerCase()}.png`);
 svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="${bg}"/>
<rect x="70" y="420" width="120" height="14" fill="${accent}"/>
<text x="70" y="390" font-family="Inter" font-weight="700" font-size="104" fill="${ink}">${esc(text.split(' ')[0])}</text>
<text x="70" y="540" font-family="Inter" font-weight="700" font-size="104" fill="${ink}">${esc(text.split(' ').slice(1).join(' '))}</text>
<g transform="translate(560 40) scale(0.66)">${PERSON}</g></svg>`,file);
 return file;
}
async function uploadThumbnail(id,file){
 const form=new FormData();form.append('file',new Blob([fs.readFileSync(file)],{type:'image/png'}),path.basename(file));
 const r=await fetch(`${API}/club/videos/${id}/thumbnail`,{method:'POST',body:form});
 if(!r.ok)throw Error(`thumbnail upload ${r.status} ${await r.text()}`);
}

async function seed({captions,takes,stills}){
 const workspace=await club('POST','/workspaces/fresh',{name:'Build With AI',topics:['AI tools','Automation','Video editing'],audience:['Creators','Small-business owners']});
 const {name,topics,audience}=workspace;
 await club('PUT',`/workspaces/${workspace.slug}`,{name,topics,audience,person:'Alex Rivera',handle:'@buildwithai'}).catch(error=>log('kept the default person name:',error.message.slice(0,160)));
 await club('POST','/settings/welcomed');
 for(const [title,stage,thumb] of OTHER_VIDEOS){const v=await club('POST','/videos',{title,stage});if(thumb)await uploadThumbnail(v.id,thumbnail(thumb));}
 const video=await club('POST','/videos',{title:TITLE,stage:'planning'});
 await club('PUT',`/videos/${video.id}/package`,{
  angle:'A real edit, start to finish, on one short video',twist:'Planned in code, cut by the transcript',
  titles:[TITLE,'From one idea to a finished edit','My whole editing workflow in 3 scenes'],thumbnailText:'ONE AFTERNOON',
  hook:{visual:'Me at the desk, then the finished timeline',spoken:SCENES[0].lines.join(' '),text:'One idea, one edit'},
 });
 const outline=await club('PUT',`/videos/${video.id}/outline`,{scenes:SCENES.map(s=>({title:s.title,talkingPoints:s.points,show:s.show,seconds:Math.round(s.lines.length*4)}))});
 for(const [i,scene] of outline.scenes.entries())await club('PUT',`/videos/${video.id}/script/scene/${scene.id}`,{text:SCENES[i].script});
 await club('PUT',`/videos/${video.id}/onepager`,{title:TITLE,backupTitle:'From one idea to a finished edit',
  logline:'One short video, planned in code, recorded in three takes and edited by its transcript, start to finish in an afternoon.',
  thumbnail:{headline:'ONE AFTERNOON',visual:'Me pointing at a finished timeline, a clock in the corner',closer:'Start to finish'},
  skeleton:SCENES.map(scene=>({label:scene.title,line:scene.points.join('. ')})),
  whys:['Most people stall between the idea and the edit','Seeing a whole edit makes it feel doable','The same steps work for any screen tutorial']});
 const linked=await club('POST',`/videos/${video.id}/recorder`,{});
 await uploadThumbnail(video.id,thumbnail({text:'ONE AFTERNOON',bg:'#1d3b4f',ink:'#f4f1ea',accent:'#f0b25a'}));

 const {data:imported}=await api('POST','/media/import',{paths:[...takes.flatMap(t=>[t.screen,t.camera]),stills.backdrop]});
 const backdropMedia=imported.at(-1);
 const {data:project,etag}=await api('GET',`/projects/${linked.recorderProjectId}`);
 project.media.push(...imported);
 project.recordedTakes=[];project.clips=[];
 takes.forEach((take,i)=>{
  const scene=project.scenes[i],[screenMedia,cameraMedia]=imported.slice(i*2,i*2+2),id=`take_${i+1}`;
  // Both sources of a take share one length, and each take starts where the last one ends.
  const length=+Math.min(screenMedia.duration,cameraMedia.duration).toFixed(3),start=+(i?project.scenes[i-1].start+project.scenes[i-1].duration:0).toFixed(3);
  Object.assign(scene,{start,duration:length});
  const clip=(media,track,transform,extra={})=>({id:`clip_${track}_${i+1}`,mediaId:media.id,name:`${i+1} · ${scene.name} · Take 1`,track,start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,
   transform,effects:{...EFFECTS},recordingTakeId:id,linkId:`link_${i+1}`,...extra});
  const clips=[clip(screenMedia,'screen',FULL,{gain:0,muted:true}),clip(cameraMedia,'camera',BUBBLE)];
  project.clips.push(...clips);
  project.recordedTakes.push({id,createdAt:new Date(Date.now()+i*1000).toISOString(),sceneId:scene.id,media:[screenMedia,cameraMedia],tracks:['screen','camera'],offsets:[0,0],
   clipIds:clips.map(c=>c.id),confirmedAt:new Date().toISOString(),installedRoles:['screen','camera']});
 });
 project.captions=captions;
 project.captionStyle={...project.captionStyle,enabled:true};
 await api('PUT',`/projects/${project.id}`,project,{'If-Match':etag});
 await club('POST',`/videos/${video.id}/move`,{stage:'editing'});

 const demoStart=takes[1].start;
 const actions=[
  {type:'add_motion_block',template:'lower-third',start:1,duration:4,text:'Alex Rivera',detail:'Build With AI'},
  {type:'add_motion_block',template:'steps',start:+(demoStart+4.5).toFixed(2),duration:6,text:'Script | Record | Cut'},
  {type:'auto_layout'},
 ];
 for(const action of actions)await club('POST',`/videos/${video.id}/agent/actions`,{actions:[action]});

 // The presenter cut out of the room and put in front of the studio wall picture, on every camera piece.
 const {data:laid,etag:laidTag}=await api('GET',`/projects/${project.id}`);
 for(const clip of laid.clips)if(clip.track==='camera'){clip.effects.background='remove';clip.effects.backdrop={kind:'image',mediaId:backdropMedia.id};}
 await api('PUT',`/projects/${project.id}`,laid,{'If-Match':laidTag});
 return {video,projectId:project.id,takes,layouts:laid.layouts??[],mask:stills.mask};
}

// ---------------------------------------------------------------- Playwright through npx

async function loadPlaywright(){
 try{return await import('playwright');}catch{}
 const found=spawnSync('npx',['--yes','-p',PLAYWRIGHT,'sh','-c','command -v playwright'],{encoding:'utf8',stdio:['ignore','pipe','inherit']});
 if(found.status!==0)throw Error('Could not fetch Playwright through npx.');
 const cli=fs.realpathSync(found.stdout.trim());
 let dir=path.dirname(cli);while(!fs.existsSync(path.join(dir,'package.json')))dir=path.dirname(dir);
 return import(pathToFileURL(path.join(dir,'index.mjs')).href);
}
async function launch(chromium){
 try{return await chromium.launch();}
 catch(error){log(`Playwright's own Chromium is not installed (npx ${PLAYWRIGHT} install chromium); using Google Chrome`);return chromium.launch({channel:'chrome'});}
}

// ---------------------------------------------------------------- the shots

/** Seeks the editor by clicking a word in its transcript ("Click to jump"), then clears the selection it makes. */
async function seekToWord(page,word){
 await page.getByText(word,{exact:true}).first().click();
 await page.waitForTimeout(300);await page.keyboard.press('Escape');await page.mouse.click(5,995);
 await page.waitForTimeout(1500);
}
async function settle(page,ms=1200){
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(ms);
}
async function openEditor(page,demo){
 await page.goto(`${UI}#/video/${demo.video.id}/edit`,{waitUntil:'load'});
 await page.getByText('Layout',{exact:true}).first().waitFor();
 await settle(page,2500);
}

const SHOTS={
 async studio(page){await page.goto(`${UI}#/home`,{waitUntil:'load'});await settle(page,2000);},
 async script(page,demo){
  await page.goto(`${UI}#/video/${demo.video.id}/idea`,{waitUntil:'load'});
  await page.getByText('Script',{exact:true}).first().click();await settle(page);
 },
 async editor(page,demo){await openEditor(page,demo);await seekToWord(page,'paste');},
 async 'auto-layout'(page,demo){
  await openEditor(page,demo);await seekToWord(page,'outline');
  await page.getByText('Layout',{exact:true}).first().click();await settle(page);
 },
 async greenscreen(page,demo){
  await openEditor(page,demo);await seekToWord(page,'starts');
  await page.getByText('Layout',{exact:true}).first().click();await page.waitForTimeout(500);
  await page.getByText('Properties',{exact:true}).first().click();await page.waitForTimeout(800);
  await page.getByText('Remove background',{exact:true}).first().evaluate(el=>el.scrollIntoView({block:'start'}));
  await settle(page,2500);
 },
 async cutroom(page,demo){
  await openEditor(page,demo);
  await page.getByText('More',{exact:true}).first().click();
  await page.getByText('Cutroom cuts and graphics').click();
  await page.getByRole('button',{name:'Prepare this video'}).click();
  await page.getByRole('button',{name:'Detect cuts'}).waitFor({timeout:120000});
  await page.getByRole('button',{name:'Detect cuts'}).click();
  await page.getByText(/proposed cuts/).waitFor({timeout:120000});
  await page.getByLabel('Motion graphic start').fill('o:1');
  await page.getByLabel('Motion graphic text').fill('One idea, *one* afternoon');
  await page.getByRole('button',{name:'Add graphic'}).click();
  await page.waitForTimeout(2500);
  await page.getByLabel('Cutroom preview anchor').fill('o:3.4');
  await page.getByRole('button',{name:'Render frame'}).click();
  const img=page.locator('img[src*="preview.png"]');
  await img.waitFor({timeout:120000});
  await img.evaluate(el=>new Promise(resolve=>el.complete?resolve():el.addEventListener('load',resolve,{once:true})));
  await page.getByText('Motion graphics',{exact:true}).first().evaluate(el=>el.scrollIntoView({block:'start'}));
  await settle(page,1500);
 },
};

/** Cuts the Ask Claude panel out of the editor for the landing page. */
async function assistant(page,demo,file){
 await openEditor(page,demo);
 const panel=page.getByText('Ask Claude',{exact:true}).first();
 const box=await panel.evaluate(el=>{let node=el;while(node.parentElement&&node.getBoundingClientRect().width<300)node=node.parentElement;const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};});
 await page.screenshot({path:file,clip:{x:box.x,y:box.y,width:box.width,height:Math.round(box.width*0.86)}});
}

function optimisePng(file){
 if(has('oxipng'))return run('oxipng',['-o','4','--strip','safe','-q',file]);
 if(has('pngquant'))return run('pngquant',['--force','--skip-if-larger','--quality','80-95','--output',file,file]);
 // Neither is installed: ffmpeg's own 256-colour palette with error diffusion, much as pngquant does it.
 const tmp=file+'.tmp.png';ffmpeg('-i',file,'-vf','split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a','-compression_level','100',tmp);
 if(fs.statSync(tmp).size<fs.statSync(file).size)fs.renameSync(tmp,file);else fs.rmSync(tmp);
}
function webp(file,out,width){
 if(!has('cwebp'))throw Error('cwebp is needed for the landing-page images (brew install webp).');
 run('cwebp',['-quiet','-q','82','-m','6','-sharp_yuv',...(width?['-resize',String(width),'0']:[]),file,'-o',out]);
}
/** The widths recorder/site/index.html asks for, per image. */
const SITE_SIZES={studio:[960,1600],script:[960,1600],editor:[960,1600,2400],cutroom:[960,1600]};

async function shoot(demo){
 const {chromium}=await loadPlaywright();
 const browser=await launch(chromium);
 await club('PUT','/settings',{appearance:'light'});
 const only=process.env.ONLY?.split(',');
 try{
  for(const [name,take] of Object.entries(SHOTS)){
   if(only&&!only.includes(name))continue;
   const context=await browser.newContext({viewport:VIEWPORT,deviceScaleFactor:SCALE,colorScheme:'light'});
   const page=await context.newPage();
   page.on('pageerror',error=>log('page error in',name,error.message.slice(0,200)));
   await page.route('**/vision-mask.png*',route=>route.fulfill({path:demo.mask,contentType:'image/png'}));
   await take(page,demo);
   const file=path.join(OUT,`${name}.png`);
   await page.screenshot({path:file});
   for(const width of SITE_SIZES[name]??[])webp(file,path.join(SITE,`${name}-${width}.webp`),width);
   optimisePng(file);
   log('shot',name);
   await context.close();
  }
  if(!only||only.includes('assistant')){
   const context=await browser.newContext({viewport:VIEWPORT,deviceScaleFactor:SCALE,colorScheme:'light'});
   const page=await context.newPage();
   const file=path.join(work,'assistant.png');
   await assistant(page,demo,file);webp(file,path.join(SITE,'assistant.webp'));
   log('shot assistant');
   await context.close();
  }
 }finally{await browser.close();}
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
 const made=makeMedia();
 startApp();
 await waitFor(API+'/ready','The local service');
 log('app running',UI,'data in',work);
 const demo=await seed(made);
 log('seeded video',demo.video.id,'project',demo.projectId);
 if(flags.has('--serve')){log(`Open ${UI}#/video/${demo.video.id}/edit · Ctrl+C to stop`);await new Promise(()=>{});}
 await shoot(demo);
 log('done:',path.relative(root,OUT),'and',path.relative(root,SITE));
 if(flags.has('--keep'))log('demo data kept in',work);
 process.exit(0);
}
