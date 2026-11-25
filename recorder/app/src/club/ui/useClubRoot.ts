import {useCallback,useState} from 'react';

/** A ref for an element inside the club, and the club's root once it is attached: popups render there, outside any card or clipping parent. Null outside a club (a test, another host). */
export function useClubRoot<T extends HTMLElement>(){
 const [root,setRoot]=useState<Element|null>(null);
 const ref=useCallback((node:T|null)=>{if(node)setRoot(node.closest('.club-root'));},[]);
 return [ref,root] as const;
}
