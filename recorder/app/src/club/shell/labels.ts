import type {Video} from '../../../shared/club';
import {fixedOptions,scoreOption,videoOption,type SearchOption} from '../search';
import {FIND_IDEA as idea,GLOSSARY as glossary,PLACES as places,SHORTCUTS as BASE_SHORTCUTS,STEPS_SENTENCE,VIDEO_STEPS} from '../steps';

export {STEPS_SENTENCE,VIDEO_STEPS};
export const SEARCH_PLACEHOLDER='Search videos, steps, settings and help';
export const SHORTCUTS=[
 {keys:'N',what:'New video'},
 {keys:'⌘⇧] / ⌘⇧[',what:'Next / previous open video tab'},
 {keys:'⌘W',what:'Close the current video tab'},
 {keys:'?',what:'Keyboard shortcuts'},
 ...BASE_SHORTCUTS.filter(item=>item.keys!=='?').map(item=>({...item,keys:item.keys==='Shift Enter'?'⇧↵':item.keys,what:item.keys==='Esc'?'Close a window or search':item.keys==='⌘K'?SEARCH_PLACEHOLDER:item.what})),
];
export const FIND_IDEA={...idea,name:'Research'};
/** Shell copy while the legacy channel canvas keeps its route and code. */
export const shellCopy=(text:string)=>text.replace(/Discover/g,'Research').replace(/\bVideos\b|\bHome\b/g,'Video board');
export const GLOSSARY=glossary.map(item=>({...item,means:shellCopy(item.means)}));
export const PLACES=[
 ...places.filter(place=>!['Home tab','Home','Discover','Videos','Research'].includes(place.name)).map(place=>({...place,where:shellCopy(place.where)})),
 {name:'Video board',where:'Your channel and its menu, Search (⌘K), then Video board and Research down the left. Every video moves from idea to published on the board.'},
 {name:'Research',where:'YouTube videos beating their usual and posts from X and Reddit. Turn any of them into an idea.'},
];

/** Search the current shell labels before ranking, keeping old place names as searchable aliases. */
export function shellOptions(videos:readonly Video[],query:string,openId?:string|null):SearchOption[]{
 const fixed=fixedOptions(videos,openId).filter(option=>option.id!=='page:videos'&&(!option.id.startsWith('step:')||!!openId&&videos.some(video=>video.id===openId))).map(option=>({...option,label:option.id==='page:research'?'Channel board':option.id==='settings:publishing'?'Publishing':option.id==='page:home'?'Video board':option.id==='page:table'?'Video board as a table':option.id==='page:calendar'?'Video board as a calendar':shellCopy(option.label),hint:option.id==='action:shortcuts'?'Keys for navigation and editing':option.id==='page:home'?'Every video from idea to published':option.id==='help:Research'?GLOSSARY.find(item=>item.term==='Research')?.means:option.hint?shellCopy(option.hint):undefined,icon:option.id==='settings:channel'?'channel' as const:option.id==='page:home'?'production' as const:option.id==='page:discover'?'research' as const:option.icon,words:`${option.words??''} ${option.label}`}));
 const appearance:SearchOption={id:'settings:appearance',label:'Appearance',kind:'Settings',icon:'theme',hint:'Choose light, dark or your Mac’s setting',words:'theme dark light look',target:{route:{name:'settings',section:'appearance'}}};
 const all=[...fixed,appearance,...videos.map(video=>({...videoOption(video),icon:'video' as const}))];
 if(!query.trim())return all.filter(option=>!option.id.startsWith('help:'));
 return all.flatMap((option,order)=>{const score=scoreOption(option,query);return score===null?[]:[{option,score,order}];}).sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,40).map(item=>item.option);
}
