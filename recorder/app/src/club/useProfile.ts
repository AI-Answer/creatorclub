import {useEffect,useState} from 'react';
import type {Workspace} from '../../shared/club';
import {clubFetch} from './api';

/** The current channel's profile: its name, topics and audience. Undefined while loading, null when there is none or it can't be read. */
export function useProfile():Workspace|null|undefined{
 const [profile,setProfile]=useState<Workspace|null|undefined>(undefined);
 useEffect(()=>{
  let live=true;
  clubFetch<{current:string|null;workspaces:Workspace[]}>('/workspaces').then(list=>{if(live)setProfile(list.workspaces.find(workspace=>workspace.slug===list.current)??null);},()=>{if(live)setProfile(null);});
  return()=>{live=false;};
 },[]);
 return profile;
}
