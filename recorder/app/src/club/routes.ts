import {useCallback,useEffect,useState} from 'react';

/** The four steps of a video's page, in order. */
export const videoSteps=['plan','record','edit','publish'] as const;
export type VideoStep=typeof videoSteps[number];

/** Screens of the club shell. Kept as plain state and mirrored in `location.hash` so a reload keeps your place. */
export type Route=
 |{name:'board'}
 |{name:'settings'}
 |{name:'onboarding'}
 |{name:'video';id:string;step:VideoStep};

const isStep=(value:string):value is VideoStep=>(videoSteps as readonly string[]).includes(value);

/** Reads `#/board`, `#/settings`, `#/onboarding` or `#/video/<id>/<step>`. Anything else is the board. */
export function parseRoute(hash:string):Route{
 const [name,id,step,...rest]=hash.replace(/^#\/?/,'').split('/');
 if(rest.length===0&&step===undefined&&id===undefined&&(name==='board'||name==='settings'||name==='onboarding'))return {name};
 if(name==='video'&&id&&rest.length===0){
  let decoded:string;try{decoded=decodeURIComponent(id);}catch{return {name:'board'};}
  if(step===undefined)return {name:'video',id:decoded,step:'plan'};
  if(isStep(step))return {name:'video',id:decoded,step};
 }
 return {name:'board'};
}

export function routeHash(route:Route):string{
 return route.name==='video'?`#/video/${encodeURIComponent(route.id)}/${route.step}`:`#/${route.name}`;
}

/** Current route plus `navigate`, which pushes a history entry so the browser back button works. */
export function useHashRoute():[Route,(route:Route)=>void]{
 const [route,setRoute]=useState(()=>parseRoute(window.location.hash));
 useEffect(()=>{
  const canonical=routeHash(parseRoute(window.location.hash));
  if(window.location.hash!==canonical)window.history.replaceState(window.history.state,'',canonical);
  const sync=()=>setRoute(parseRoute(window.location.hash));
  window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);
 },[]);
 const navigate=useCallback((next:Route)=>{
  const hash=routeHash(next);
  if(window.location.hash!==hash)window.location.hash=hash;
  setRoute(next);
 },[]);
 return [route,navigate];
}
