import {useCallback,useState} from 'react';

const key=(videoId:string)=>`creatorclub:target:${videoId}`;

/** The length the person is aiming for, in seconds (0 for none). Kept in this browser per video; the app stores no target. */
export function useTarget(videoId:string):[number,(seconds:number)=>void]{
 const [target,setTarget]=useState(()=>{
  try{const saved=Number(window.localStorage.getItem(key(videoId)));return Number.isFinite(saved)&&saved>0?saved:0;}catch{return 0;}
 });
 const set=useCallback((seconds:number)=>{
  setTarget(seconds);
  try{if(seconds>0)window.localStorage.setItem(key(videoId),String(seconds));else window.localStorage.removeItem(key(videoId));}catch{/* private window: the target lasts until the page closes */}
 },[videoId]);
 return [target,set];
}
