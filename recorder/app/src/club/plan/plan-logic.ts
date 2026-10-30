import type {Outline,OutlineScene,Package} from '../../../shared/club';
import type {PackageGroup} from '../../../shared/package-merge';
export {mergePackage,type PackageGroup} from '../../../shared/package-merge';

/*
 * The Plan tab's rules that need no screen: the package's empty shape and what a package run may change, how scenes are
 * reordered, added and removed, scene lengths, and which title is chosen.
 */

/** A package with nothing in it: what the left column shows until the first edit saves a real one. */
export const EMPTY_PACKAGE:Package={angle:'',twist:'',titles:['','',''],thumbnailText:'',hook:{visual:'',spoken:'',text:''}};

export const wordCount=(text:string)=>text.trim().split(/\s+/).filter(Boolean).length;

/** A title is too long past 7 words or 60 characters. */
export const titleTooLong=(title:string)=>wordCount(title)>7||[...title].length>60;

/** The option that is the video's title, or -1. A video's title is its chosen one. */
export const chosenTitle=(titles:readonly string[],videoTitle:string)=>titles.findIndex(title=>!!title.trim()&&title.trim()===videoTitle.trim());

/** Whether the group has an empty place a run could fill. */
export const hasEmptyPlace=(pkg:Package|null,group:PackageGroup)=>!pkg||(group==='titles'?pkg.titles.some(title=>!title.trim()):group==='thumbnail'?!pkg.thumbnailText.trim():Object.values(pkg.hook).some(part=>!part.trim()));

/** A title too long to show whole in a search result says so in words, with its length; a title that fits says nothing. */
export function titleWarning(title:string):string|undefined{
 if(!titleTooLong(title))return undefined;
 const characters=[...title.trim()].length,words=wordCount(title);
 return characters>60?`${characters} characters, too long for a search result`:`${words} words, too long for a search result`;
}

/** True when nothing the package shows first (titles, thumbnail text, hook) is written. Ratings carried over from the idea do not count. */
export const packageFrontIsEmpty=(pkg:Package|null)=>!pkg||(!pkg.thumbnailText.trim()&&pkg.titles.every(title=>!title.trim())&&Object.values(pkg.hook).every(part=>!part.trim())&&!pkg.angle.trim()&&!pkg.twist.trim());

/**
 * What the Package column shows: `empty` (one sentence and one action) until a title, the thumbnail text, the hook, the angle or the
 * twist is written, or the person chose to fill it in themselves; `writing` while the first package run is going; then the package itself.
 */
export type PackageView='empty'|'writing'|'filled';
export function packageView(pkg:Package|null,{running,manual}:{running:boolean;manual:boolean}):PackageView{
 if(!packageFrontIsEmpty(pkg)||manual)return 'filled';
 return running?'writing':'empty';
}

/** The title slots to show: every written title, in order, and the ones being typed in (`keep`), even while empty. Other empty slots stay behind "Add a title". */
export const shownTitles=(titles:readonly string[],keep:readonly number[])=>titles.map((title,index)=>({title,index})).filter(({title,index})=>title.trim()!==''||keep.includes(index));

/** True when nothing in the package was written yet. */
export const packageIsEmpty=(pkg:Package|null)=>!pkg||(!pkg.angle.trim()&&!pkg.twist.trim()&&!pkg.thumbnailText.trim()&&pkg.titles.every(title=>!title.trim())&&Object.values(pkg.hook).every(part=>!part.trim())&&!pkg.demand&&!pkg.gap&&!pkg.show);

/** A new scene's id, made here so the scene keeps it from its first save (the server keeps ids it is given). */
export const newSceneId=()=>`s_${[...crypto.getRandomValues(new Uint8Array(4))].map(byte=>byte.toString(16).padStart(2,'0')).join('')}`;

/**
 * What changed in the package since the server's copy: only those fields (the hook field by field). The server changes nothing else,
 * so a page that is behind cannot put back what it did not edit. Without a server copy it is the whole package.
 */
export function packageDiff(server:Package|null,next:Package):Partial<Omit<Package,'titles'>>&{titles?:(string|null)[]}|Package{
 if(!server)return next;
 const out:Record<string,unknown>={};
 for(const key of ['demand','gap','show','angle','twist','thumbnailText','description','tags'] as const)
  if(next[key]!==undefined&&JSON.stringify(server[key])!==JSON.stringify(next[key]))out[key]=next[key];
 // Title slots: only the ones that changed are sent, the others as null.
 if(next.titles.some((title,i)=>title!==server.titles[i]))out.titles=next.titles.map((title,i)=>title!==server.titles[i]?title:null);
 const hook:Partial<Package['hook']>={};
 for(const key of ['visual','spoken','text'] as const)if(server.hook[key]!==next.hook[key])hook[key]=next.hook[key];
 if(Object.keys(hook).length)out.hook=hook;
 return out as Partial<Omit<Package,'titles'>>&{titles?:(string|null)[]};
}

/** The element id of a scene's card, for scrolling to it. */
export const sceneCardId=(sceneId:string)=>`plan-scene-${sceneId}`;

/** A scene that was just added. */
export const blankScene=():OutlineScene=>({id:newSceneId(),title:'New scene',talkingPoints:[''],show:'',seconds:60});

/** Moves the scene at `from` to sit before position `to` (a position in the list as it is now, so `to` may be its length). Nothing changes when it would stay. */
export function moveScene<T>(scenes:readonly T[],from:number,to:number):T[]{
 if(from<0||from>=scenes.length||from===to||from+1===to)return [...scenes];
 const next=[...scenes];
 const [scene]=next.splice(from,1);
 next.splice(to>from?to-1:to,0,scene);
 return next;
}

export const insertScene=<T>(scenes:readonly T[],at:number,scene:T):T[]=>[...scenes.slice(0,at),scene,...scenes.slice(at)];
export const removeScene=<T>(scenes:readonly T[],index:number):T[]=>scenes.filter((_,i)=>i!==index);

/** The scene's talking points after one was edited: an emptied point goes away (the one being edited stays while empty). */
export const editPoint=(points:readonly string[],index:number,text:string)=>points.map((point,i)=>i===index?text:point).filter((point,i)=>point!==''||i===index);

export const totalSeconds=(scenes:readonly Pick<OutlineScene,'seconds'>[])=>scenes.reduce((sum,scene)=>sum+(scene.seconds||0),0);

/** "m:ss" typed by the person ("2:30"), or minutes ("2.5"). Nothing for anything else or for zero. */
export function parseClock(text:string):number|undefined{
 const clock=/^(\d+):(\d{1,2})$/.exec(text.trim());
 const seconds=clock?Number(clock[1])*60+Number(clock[2]):Math.round(Number(text.trim())*60);
 return Number.isFinite(seconds)&&seconds>0&&seconds<=36_000&&text.trim()!==''?seconds:undefined;
}

/** The target lengths to pick from, in seconds. */
export const TARGET_SECONDS=[480,600,720,900,1200] as const;

/**
 * The server's outline with its script words laid onto the outline being edited, matched by scene id. Everything else of the edited
 * outline (titles, points, order, what is typed but not saved) stays; scenes the server does not know keep what they have.
 */
export function withServerScripts(edited:Outline,server:Outline):Outline{
 const byId=new Map(server.scenes.filter(scene=>scene.id).map(scene=>[scene.id,scene.script]));
 const scenes=edited.scenes.map(scene=>{
  if(!scene.id||!byId.has(scene.id))return scene;
  const {script:_old,...rest}=scene;
  const script=byId.get(scene.id);
  return script?{...rest,script}:rest;
 });
 const {fullScript:_full,scriptState:_state,...rest}=edited;
 return {...rest,scenes,...(server.scriptState?{scriptState:server.scriptState}:{}),...(server.fullScript!==undefined?{fullScript:server.fullScript}:{})};
}
