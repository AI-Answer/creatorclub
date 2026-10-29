import {useEffect,useRef,type RefObject} from 'react';

/** Calls `onAway` on a press outside `ref` or on Escape, while `active`. The press listener starts after the opening click has finished. */
export function useClickAway(ref:RefObject<HTMLElement|null>,onAway:()=>void,active:boolean){
 const latest=useRef(onAway);latest.current=onAway;
 useEffect(()=>{
  if(!active)return;
  const press=(event:MouseEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))latest.current();};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')latest.current();};
  const start=setTimeout(()=>document.addEventListener('mousedown',press),0);
  document.addEventListener('keydown',key);
  return()=>{clearTimeout(start);document.removeEventListener('mousedown',press);document.removeEventListener('keydown',key);};
 },[active,ref]);
}
