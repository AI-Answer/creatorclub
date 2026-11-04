import {useEffect,useState} from 'react';
import {clubFetch} from './api';

/** The AI the person connected in Settings, by the name and logo the app shows for it. */
export type ConnectedAi={name:'Claude'|'ChatGPT';brand:'claude'|'chatgpt'};
const CLAUDE:ConnectedAi={name:'Claude',brand:'claude'},CHATGPT:ConnectedAi={name:'ChatGPT',brand:'chatgpt'};

let known:ConnectedAi|undefined;
let reading:Promise<ConnectedAi>|undefined;
const read=()=>reading??=clubFetch<{defaultAi?:string}>('/settings').then(settings=>known=settings.defaultAi==='codex'?CHATGPT:CLAUDE,()=>CLAUDE).finally(()=>{reading=undefined;});

/** Which AI writes for this person, so every "Write with …" and "…'s rating" names the one they use. Claude until Settings is read. */
export function useAi():ConnectedAi{
 const [ai,setAi]=useState<ConnectedAi>(known??CLAUDE);
 useEffect(()=>{let alive=true;void read().then(found=>{if(alive)setAi(found);});return()=>{alive=false;};},[]);
 return ai;
}
