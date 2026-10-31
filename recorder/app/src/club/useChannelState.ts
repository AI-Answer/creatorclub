import {useEffect,useState} from 'react';
import type {Workspace} from '../../shared/club';
import {clubFetch} from './api';

/** Whether a channel exists yet: `loading` until the server says, `none` when there is no channel (Skip setup), `ready` otherwise. */
export type ChannelState='loading'|'none'|'ready';

/**
 * Asks the server once, and again when `refreshKey` changes (a channel was switched or added). A channel that was known stays `ready` while it asks again.
 * A server that cannot be reached counts as `ready`, so the screens show their own error instead of a false "no channel".
 */
export function useChannelState(refreshKey:string):ChannelState{
 const [state,setState]=useState<ChannelState>('loading');
 useEffect(()=>{
  let live=true;
  setState(current=>current==='ready'?current:'loading');
  clubFetch<{current:string|null;workspaces:Workspace[]}>('/workspaces').then(list=>{if(live)setState(list.current?'ready':'none');},()=>{if(live)setState('ready');});
  return()=>{live=false;};
 },[refreshKey]);
 return state;
}
