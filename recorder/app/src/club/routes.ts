import {useCallback,useEffect,useState} from 'react';
import type {VideoStage} from '../../shared/club';

/** The four steps of a video's page as the plan screen still shows them. Goes when the new video page replaces it. */
export const videoSteps=['plan','record','edit','publish'] as const;
export type VideoStep=typeof videoSteps[number];

/** The tabs of a video's workspace, in order. */
export const videoTabs=['board','plan','record','edit','publish'] as const;
export type VideoTab=typeof videoTabs[number];

export const productionViews=['board','table','calendar'] as const;
export type ProductionView=typeof productionViews[number];

export const ideaFilters=['later','skipped'] as const;
export type IdeaFilter=typeof ideaFilters[number];

/**
 * Screens of the club shell, mirrored in `location.hash` so a reload keeps your place.
 * An idea's `open` shows its drawer, `new` its drawer right after it was added, `bd` breaks down the YouTube video with that id.
 * A video without a `tab` opens on the tab for its stage.
 */
export type Route=
 |{name:'welcome'}
 |{name:'overview'}
 |{name:'ideas';filter?:IdeaFilter;open?:string;new?:string;bd?:string}
 |{name:'trending'}
 |{name:'signals'}
 |{name:'production';view:ProductionView}
 |{name:'video';id:string;tab?:VideoTab}
 |{name:'settings'};

export type RouteName=Route['name'];

const isTab=(value:string):value is VideoTab=>(videoTabs as readonly string[]).includes(value);
const isView=(value:string):value is ProductionView=>(productionViews as readonly string[]).includes(value);
const isFilter=(value:string|null):value is IdeaFilter=>(ideaFilters as readonly string[]).includes(value??'');

const OVERVIEW:Route={name:'overview'};

/** The tab a video opens on: its stage's step, Board for an idea. */
export const defaultTab=(stage:VideoStage):VideoTab=>({ideas:'board',planning:'plan',recording:'record',editing:'edit',publishing:'publish',published:'publish'} as const)[stage];

/**
 * Reads `#/overview`, `#/ideas?filter=later&open=<id>`, `#/production/table`, `#/video/<id>/<tab>` and the rest.
 * The old `#/board` is Production, `#/onboarding` is `#/welcome`, and `#/video/<id>/<step>` links keep working because
 * the old steps are tabs too. Anything else is the overview.
 */
export function parseRoute(hash:string):Route{
 const [path,query='']=hash.replace(/^#\/?/,'').split('?');
 const segments=path.split('/'),[name,id,tab]=segments;
 if(name==='video'){
  if(!id||segments.length>3)return OVERVIEW;
  let decoded:string;try{decoded=decodeURIComponent(id);}catch{return OVERVIEW;}
  if(segments.length===2)return {name:'video',id:decoded};
  return isTab(tab)?{name:'video',id:decoded,tab}:OVERVIEW;
 }
 if(name==='production'){
  if(segments.length===1)return {name:'production',view:'board'};
  return segments.length===2&&isView(id)?{name:'production',view:id}:OVERVIEW;
 }
 if(segments.length!==1)return OVERVIEW;
 switch(name){
  case 'welcome':case 'onboarding':return {name:'welcome'};
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
  default:return `#/${route.name}`;
 }
}

/** The hash without its query. A screen scrolls to the top and the sidebar forgets a manual toggle only when this changes. */
export const routePath=(route:Route)=>routeHash(route).split('?')[0];

/** The Record and Edit tabs take the whole window, so the sidebar folds to its icon rail on its own there. */
export const autoCollapses=(route:Route)=>route.name==='video'&&(route.tab==='record'||route.tab==='edit');

/** The step of the plan screen that stands in for a tab until the new video page arrives. Board has no step of its own yet. */
export const stepForTab=(tab:VideoTab):VideoStep=>tab==='board'?'plan':tab;

/** Current route plus `navigate`, which pushes a history entry so the browser back button works. `replace` swaps the entry instead. */
export function useHashRoute():[Route,(route:Route,options?:{replace?:boolean})=>void]{
 const [route,setRoute]=useState(()=>parseRoute(window.location.hash));
 useEffect(()=>{
  // An old or unusual hash is rewritten to its canonical form, so `#/board` becomes `#/production`.
  const sync=()=>{
   const next=parseRoute(window.location.hash),canonical=routeHash(next);
   if(window.location.hash!==canonical)window.history.replaceState(window.history.state,'',canonical);
   setRoute(next);
  };
  sync();
  window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);
 },[]);
 const navigate=useCallback((next:Route,options?:{replace?:boolean})=>{
  const hash=routeHash(next);
  if(window.location.hash!==hash){
   if(options?.replace)window.history.replaceState(window.history.state,'',hash);
   else window.location.hash=hash;
  }
  setRoute(next);
 },[]);
 return [route,navigate];
}
