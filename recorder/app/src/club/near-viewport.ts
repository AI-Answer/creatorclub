import {useEffect,useRef,useState} from 'react';

// One observer for all covers, including covers hidden until their first successful load.
let observer:IntersectionObserver|undefined;
const waiting=new Map<Element,()=>void>();
export function useNearViewport(){
 const ref=useRef<HTMLSpanElement>(null),[near,setNear]=useState(typeof IntersectionObserver==='undefined');
 useEffect(()=>{
  const card=ref.current?.parentElement;if(near||!card)return;
  observer??=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){waiting.get(entry.target)?.();waiting.delete(entry.target);observer!.unobserve(entry.target);}},{rootMargin:'400px'});
  waiting.set(card,()=>setNear(true));observer.observe(card);
  return()=>{waiting.delete(card);observer?.unobserve(card);};
 },[near]);
 return {ref,near};
}
