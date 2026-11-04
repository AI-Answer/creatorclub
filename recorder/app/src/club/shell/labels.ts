import type {Video} from '../../../shared/club';
import {fixedOptions,scoreOption,videoOption,type SearchOption} from '../search';
import {FIND_IDEA as idea,GLOSSARY as glossary,PLACES as places,SHORTCUTS,STEPS_SENTENCE,VIDEO_STEPS} from '../steps';

export {SHORTCUTS,STEPS_SENTENCE,VIDEO_STEPS};
export const FIND_IDEA={...idea,name:'Research'};
/** Shell copy while the legacy channel canvas keeps its route and code. */
export const shellCopy=(text:string)=>text.replace(/Discover/g,'Research').replace(/\bVideos\b|\bHome\b/g,'Video board');
export const GLOSSARY=glossary.map(item=>({...item,means:item.term==='Research'?'Videos and posts from outside your channel, ranked for your topics. Keep the concepts you would make.':shellCopy(item.means)}));
export const PLACES=[
 ...places.filter(place=>!['Home tab','Home','Discover','Videos','Research'].includes(place.name)).map(place=>({...place,where:shellCopy(place.where)})),
 {name:'Video board',where:'Your channel and its menu, Search (⌘K), then Video board and Research down the left. Every video moves from idea to published on the board.'},
 {name:'Research',where:'YouTube videos beating their usual and posts from X and Reddit. Turn any of them into an idea.'},
];

/** Search the current shell labels before ranking, keeping old place names as searchable aliases. */
export function shellOptions(videos:readonly Video[],query:string,openId?:string|null):SearchOption[]{
 const fixed=fixedOptions(videos,openId).filter(option=>!['page:videos','page:research'].includes(option.id)).map(option=>({...option,label:option.id==='page:home'?'Video board':shellCopy(option.label),hint:option.id==='page:home'?'Every video from idea to published':option.id==='help:Research'?GLOSSARY.find(item=>item.term==='Research')?.means:option.hint?shellCopy(option.hint):undefined,icon:option.id==='page:home'?'production' as const:option.id==='page:discover'?'research' as const:option.icon,words:`${option.words??''} ${option.label}`}));
 const all=[...fixed,...videos.map(videoOption)];
 if(!query.trim())return all.filter(option=>!option.id.startsWith('help:')).slice(0,40);
 return all.flatMap((option,order)=>{const score=scoreOption(option,query);return score===null?[]:[{option,score,order}];}).sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,40).map(item=>item.option);
}
