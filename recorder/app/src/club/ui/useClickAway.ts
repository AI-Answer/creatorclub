import {useEffect,useRef,type RefObject} from 'react';

/** Calls `onAway` on a press outside `ref` or on Escape, while `active`. The press listener starts after the opening click has finished. */
export function useClickAway(ref:RefObject<HTMLElement|null>|readonly RefObject<HTMLElement|null>[],onAway:()=>void,active:boolean){
 const latest=useRef(onAway);latest.current=onAway;
 useEffect(()=>{
  if(!active)return;
  const inside=(event:MouseEvent)=>(Array.isArray(ref)?ref as readonly RefObject<HTMLElement|null>[]:[ref as RefObject<HTMLElement|null>]).some(one=>one.current?.contains(event.target as Node));
  const press=(event:MouseEvent)=>{if(!inside(event))latest.current();};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')latest.current();};
  const start=setTimeout(()=>document.addEventListener('mousedown',press),0);
  document.addEventListener('keydown',key);
  return()=>{clearTimeout(start);document.removeEventListener('mousedown',press);document.removeEventListener('keydown',key);};
 },[active,ref]);
}
