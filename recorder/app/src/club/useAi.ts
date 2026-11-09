import {useEffect} from 'react';
import {refreshChosenAi,useAiStore} from './ai-status';
export type ConnectedAi={name:'Claude'|'ChatGPT';brand:'claude'|'chatgpt'};
const CLAUDE:ConnectedAi={name:'Claude',brand:'claude'},CHATGPT:ConnectedAi={name:'ChatGPT',brand:'chatgpt'};
export function useAi():ConnectedAi{
 const {chosen}=useAiStore();
 useEffect(()=>{void refreshChosenAi();},[]);
 return chosen==='codex'?CHATGPT:CLAUDE;
}
