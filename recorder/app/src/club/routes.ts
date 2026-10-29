import {useCallback,useEffect,useRef,useState} from 'react';
import type {VideoStage} from '../../shared/club';

/** The four steps of a video's page after Board. */
export const videoSteps=['plan','record','edit','publish'] as const;
export type VideoStep=typeof videoSteps[number];

/** The tabs of a video's workspace, in order. */
export const videoTabs=['board','plan','record','edit','publish'] as const;
export type VideoTab=typeof videoTabs[number];

export const productionViews=['board','table','calendar'] as const;
export type ProductionView=typeof productionViews[number];

export const ideaFilters=['later','skipped'] as const;
export type IdeaFilter=typeof ideaFilters[number];

/** The parts of Settings a link can open: Connected AI, Channel, the channels you follow and the signal sources (both inside Channel), Appearance. */
export const settingsSections=['ai','channel','followed','sources','publishing'] as const;
export type SettingsSection=typeof settingsSections[number];

/**
 * Screens of the club shell, mirrored in `location.hash` so a reload keeps your place.
 * An idea's `open` shows its drawer, `new` its drawer right after it was added, `bd` breaks down the YouTube video with that id.
 * A video without a `tab` opens on the tab for its stage.
 */
export type Route=
 |{name:'welcome';step?:number}
 |{name:'overview'}
 |{name:'ideas';filter?:IdeaFilter;open?:string;new?:string;bd?:string}
 |{name:'trending'}
 |{name:'signals'}
 |{name:'production';view:ProductionView}
 |{name:'video';id:string;tab?:VideoTab}
 |{name:'settings';section?:SettingsSection};

export type RouteName=Route['name'];

const isTab=(value:string):value is VideoTab=>(videoTabs as readonly string[]).includes(value);
const isView=(value:string):value is ProductionView=>(productionViews as readonly string[]).includes(value);
const isSection=(value:string):value is SettingsSection=>(settingsSections as readonly string[]).includes(value);
const isFilter=(value:string|null):value is IdeaFilter=>(ideaFilters as readonly string[]).includes(value??'');

const OVERVIEW:Route={name:'overview'};

/** The tab a video opens on: its stage's step, Board for an idea. */
export const defaultTab=(stage:VideoStage):VideoTab=>({ideas:'board',planning:'plan',recording:'record',editing:'edit',publishing:'publish',published:'publish'} as const)[stage];

/**
 * Reads `#/overview`, `#/ideas?filter=later&open=<id>`, `#/production/table`, `#/video/<id>/<tab>`, `#/settings/followed`, `#/welcome?step=2` and the rest.
 * The old `#/board` is Production, `#/onboarding` is `#/welcome`, and `#/video/<id>/<step>` links keep working because
 * the old steps are tabs too. A video's unknown tab opens the tab for its stage. Anything else is the overview.
 */
export function parseRoute(hash:string):Route{
 const [path,query='']=hash.replace(/^#\/?/,'').split('?');
 const segments=path.split('/'),[name,id,tab]=segments;
 if(name==='video'){
  if(!id||segments.length>3)return OVERVIEW;
  let decoded:string;try{decoded=decodeURIComponent(id);}catch{return OVERVIEW;}
  if(segments.length===2)return {name:'video',id:decoded};
  return isTab(tab)?{name:'video',id:decoded,tab}:{name:'video',id:decoded};
 }
 if(name==='production'){
  if(segments.length===1)return {name:'production',view:'board'};
  return segments.length===2&&isView(id)?{name:'production',view:id}:OVERVIEW;
 }
 if(name==='settings'&&segments.length===2)return isSection(id)?{name:'settings',section:id}:OVERVIEW;
 if(segments.length!==1)return OVERVIEW;
 switch(name){
  case 'welcome':case 'onboarding':{
   const step=Number(new URLSearchParams(query).get('step'));
   return Number.isInteger(step)&&step>=1&&step<=4?{name:'welcome',step}:{name:'welcome'};
  }
  case 'overview':case 'trending':case 'signals':case 'settings':return {name};
  case 'board':return {name:'production',view:'board'};
  case 'ideas':{
   const params=new URLSearchParams(query),filter=params.get('filter'),open=params.get('open'),added=params.get('new'),breakdown=params.get('bd');
   return {name:'ideas',...(isFilter(filter)&&{filter}),...(open&&{open}),...(added&&{new:added}),...(breakdown&&{bd:breakdown})};
  }
 }
 return OVERVIEW;
}

export function routeHash(route:Route):string{
 switch(route.name){
  case 'video':return `#/video/${encodeURIComponent(route.id)}${route.tab?`/${route.tab}`:''}`;
  case 'production':return route.view==='board'?'#/production':`#/production/${route.view}`;
  case 'ideas':{
   const params=new URLSearchParams();
   if(route.filter)params.set('filter',route.filter);
   if(route.open)params.set('open',route.open);
   if(route.new)params.set('new',route.new);
   if(route.bd)params.set('bd',route.bd);
   const query=params.toString();
   return query?`#/ideas?${query}`:'#/ideas';
  }
  case 'welcome':return route.step?`#/welcome?step=${route.step}`:'#/welcome';
  case 'settings':return route.section?`#/settings/${route.section}`:'#/settings';
  default:return `#/${route.name}`;
 }
}

/** The hash without its query. A screen scrolls to the top and the sidebar forgets a manual toggle only when this changes. */
export const routePath=(route:Route)=>routeHash(route).split('?')[0];

/** The Record and Edit tabs take the whole window, so the sidebar folds to its icon rail on its own there. */
export const autoCollapses=(route:Route)=>route.name==='video'&&(route.tab==='record'||route.tab==='edit');

/**
 * The screen a video was opened from: the last screen before the video's page that was not itself a video's page, so moving between tabs
 * or videos does not lose it. Opened from a link (nothing before it), a video has none, and going back leads to Production.
 */
export function videoOrigin(origin:Route|undefined,previous:Route,next:Route):Route|undefined{
 if(next.name!=='video'||previous.name==='video')return origin;
 return previous.name==='welcome'?undefined:previous;
}

const ORIGIN_LABEL:Partial<Record<RouteName,string>>={overview:'Overview',ideas:'Ideas',trending:'Working now',signals:'Signals',production:'Production',settings:'Settings'};
/** The name of a screen in "Back to …". */
export const originLabel=(route:Route|undefined)=>(route&&ORIGIN_LABEL[route.name])||'Production';

let origin:Route|undefined;
/** Where a video's page goes back to: the screen it was opened from, else Production. */
export const videoBackRoute=():Route=>origin??{name:'production',view:'board'};

/** Current route plus `navigate`, which pushes a history entry so the browser back button works. `replace` swaps the entry instead. */
export function useHashRoute():[Route,(route:Route,options?:{replace?:boolean})=>void]{
 const [route,setRoute]=useState(()=>parseRoute(window.location.hash));
 const shown=useRef(route);
 /** Shows a route, remembering where a video was opened from. The same route twice (a push and the hashchange it causes) is one change. */
 const show=useCallback((next:Route)=>{
  if(routeHash(shown.current)!==routeHash(next)){origin=videoOrigin(origin,shown.current,next);shown.current=next;}
  setRoute(next);
 },[]);
 useEffect(()=>{
  // An old or unusual hash is rewritten to its canonical form, so `#/board` becomes `#/production`.
  const sync=()=>{
   const next=parseRoute(window.location.hash),canonical=routeHash(next);
   if(window.location.hash!==canonical)window.history.replaceState(window.history.state,'',canonical);
   show(next);
  };
  sync();
  window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);
 },[show]);
 const navigate=useCallback((next:Route,options?:{replace?:boolean})=>{
  const hash=routeHash(next);
  if(window.location.hash!==hash){
   if(options?.replace)window.history.replaceState(window.history.state,'',hash);
   else window.location.hash=hash;
  }
  show(next);
 },[show]);
 return [route,navigate];
}
