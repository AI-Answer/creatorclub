import {useCallback,useEffect,useRef,useState} from 'react';
import type {VideoStage} from '../../shared/club';

/** The four steps of a video's page after Board. */
export const videoSteps=['plan','record','edit','publish'] as const;
export type VideoStep=typeof videoSteps[number];

/** The tabs of a video's workspace, in order. */
export const videoTabs=['board','plan','record','edit','publish'] as const;
export type VideoTab=typeof videoTabs[number];

export const videosViews=['board','table','calendar'] as const;
export type VideosView=typeof videosViews[number];

/** The two groups of ideas you put aside, folded on Videos until you open them. */
export const ideaHeld=['later','skipped'] as const;
export type IdeaHeld=typeof ideaHeld[number];

/** What Discover lists: For you (everything about your topics), the channels you follow, or one source. */
export const discoverShows=['fit','followed','youtube','x','reddit'] as const;
export type DiscoverShow=typeof discoverShows[number];

/** The parts of Settings a link can open: Connected AI, Your AI agent, Channel, the channels you follow and the signal sources (both inside Channel), Appearance. */
export const settingsSections=['ai','agent','channel','followed','sources','skills','publishing'] as const;
export type SettingsSection=typeof settingsSections[number];

/**
 * Screens of the club shell, mirrored in `location.hash` so a reload keeps your place.
 * Videos is the one pipeline, ideas first: `group` opens Later or Skipped, `open` shows an idea's drawer, `new` marks the idea just added,
 * `bd` breaks down a link (or the YouTube video with that id). A video without a `tab` opens on the tab for its stage.
 */
export type Route=
 |{name:'welcome';step?:number}
 |{name:'home'}
 |{name:'discover';show?:DiscoverShow}
 |{name:'videos';view:VideosView;group?:IdeaHeld;open?:string;new?:string;bd?:string}
 |{name:'video';id:string;tab?:VideoTab}
 |{name:'research'}
 |{name:'settings';section?:SettingsSection};

export type RouteName=Route['name'];

const isTab=(value:string):value is VideoTab=>(videoTabs as readonly string[]).includes(value);
const isView=(value:string):value is VideosView=>(videosViews as readonly string[]).includes(value);
const isSection=(value:string):value is SettingsSection=>(settingsSections as readonly string[]).includes(value);
const isHeld=(value:string|null):value is IdeaHeld=>(ideaHeld as readonly string[]).includes(value??'');
const isShow=(value:string|null):value is DiscoverShow=>(discoverShows as readonly string[]).includes(value??'');

const HOME:Route={name:'home'};

/** Videos with the query it understands: `group` (the old Ideas `filter`), `open`, `new` and `bd`. */
function videosRoute(view:VideosView,query:string,heldKey:'group'|'filter'):Route{
 const params=new URLSearchParams(query),group=params.get(heldKey),open=params.get('open'),added=params.get('new'),breakdown=params.get('bd');
 return {name:'videos',view,...(isHeld(group)&&{group}),...(open&&{open}),...(added&&{new:added}),...(breakdown&&{bd:breakdown})};
}

/** The tab a video opens on: its stage's step, Board for an idea. */
export const defaultTab=(stage:VideoStage):VideoTab=>({ideas:'board',planning:'board',recording:'record',editing:'edit',publishing:'publish',published:'publish'} as const)[stage];

/**
 * Reads `#/home`, `#/discover?show=youtube`, `#/videos/table`, `#/research`, `#/videos?group=later&open=<id>`, `#/video/<id>/<tab>`, `#/settings/followed`, `#/welcome?step=2` and the rest.
 * Old links keep working: `#/overview` is Home; `#/trending` and `#/signals` are Discover (on YouTube, and on everything); `#/ideas` with its
 * `filter`, `open`, `new` and `bd`, `#/production/<view>` and `#/board` are Videos; `#/onboarding` is `#/welcome`; `#/video/<id>/<step>` works
 * because the old steps are tabs too. A video's unknown tab opens the tab for its stage. Anything else is Home.
 */
export function parseRoute(hash:string):Route{
 const [path,query='']=hash.replace(/^#\/?/,'').split('?');
 const segments=path.split('/'),[name,id,tab]=segments;
 if(name==='video'){
  if(!id||segments.length>3)return HOME;
  let decoded:string;try{decoded=decodeURIComponent(id);}catch{return HOME;}
  if(segments.length===2)return {name:'video',id:decoded};
  return isTab(tab)?{name:'video',id:decoded,tab}:{name:'video',id:decoded};
 }
 if(name==='videos'||name==='production'){
  if(segments.length===1)return videosRoute('board',query,'group');
  return segments.length===2&&isView(id)?videosRoute(id,query,'group'):HOME;
 }
 if(name==='settings'&&segments.length===2)return isSection(id)?{name:'settings',section:id}:HOME;
 if(segments.length!==1)return HOME;
 switch(name){
  case 'welcome':case 'onboarding':{
   const step=Number(new URLSearchParams(query).get('step'));
   return Number.isInteger(step)&&step>=1&&step<=4?{name:'welcome',step}:{name:'welcome'};
  }
  case 'home':case 'overview':return HOME;
  case 'settings':case 'research':return {name};
  case 'discover':{const show=new URLSearchParams(query).get('show');return isShow(show)&&show!=='fit'?{name:'discover',show}:{name:'discover'};}
  case 'trending':return {name:'discover',show:'youtube'};
  case 'signals':return {name:'discover'};
  case 'board':return {name:'videos',view:'board'};
  case 'ideas':return videosRoute('board',query,'filter');
 }
 return HOME;
}

export function routeHash(route:Route):string{
 switch(route.name){
  case 'video':return `#/video/${encodeURIComponent(route.id)}${route.tab?`/${route.tab}`:''}`;
  case 'videos':{
   const params=new URLSearchParams();
   if(route.group)params.set('group',route.group);
   if(route.open)params.set('open',route.open);
   if(route.new)params.set('new',route.new);
   if(route.bd)params.set('bd',route.bd);
   const query=params.toString(),path=route.view==='board'?'#/videos':`#/videos/${route.view}`;
   return query?`${path}?${query}`:path;
  }
  case 'discover':return route.show&&route.show!=='fit'?`#/discover?show=${route.show}`:'#/discover';
  case 'welcome':return route.step?`#/welcome?step=${route.step}`:'#/welcome';
  case 'settings':return route.section?`#/settings/${route.section}`:'#/settings';
  default:return `#/${route.name}`;
 }
}

/** The hash without its query. A screen scrolls to the top and the sidebar forgets a manual toggle only when this changes. */
export const routePath=(route:Route)=>routeHash(route).split('?')[0];

/** A video's page is the one place to work, so the sidebar folds to its icon rail on its own on every step of a video. */
export const autoCollapses=(route:Route)=>route.name==='video';

/**
 * The screen a video was opened from: the last screen before the video's page that was not itself a video's page, so moving between tabs
 * or videos does not lose it. Opened from a link (nothing before it), a video has none, and going back leads to Videos.
 */
export function videoOrigin(origin:Route|undefined,previous:Route,next:Route):Route|undefined{
 if(next.name!=='video'||previous.name==='video')return origin;
 return previous.name==='welcome'?undefined:previous;
}

const ORIGIN_LABEL:Partial<Record<RouteName,string>>={home:'Video board',discover:'Research',videos:'Video board',research:'Channel board',settings:'Settings'};
/** The name of a screen in "Back to …". */
export const originLabel=(route:Route|undefined)=>(route&&ORIGIN_LABEL[route.name])||'Video board';

let origin:Route|undefined;
/** Where a video's page goes back to: the screen it was opened from, else Videos. */
export const videoBackRoute=():Route=>origin??{name:'videos',view:'board'};

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
  // An old or unusual hash is rewritten to its canonical form, so `#/ideas?filter=later` becomes `#/videos?group=later`.
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
