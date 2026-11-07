import {useMemo} from 'react';
import type {Video} from '../../shared/club';
import {clubFetch,errorMessage} from './api';
import {deleteLater} from './pending-delete';
import type {Route} from './routes';
import {useToast} from './ui';

/** The changes an idea offers: start planning, Later, Skip with a reason, Restore, Delete, and editing its notes in place. Each says what happened in a toast, with Undo where it can be taken back. */
export type IdeaNotesPatch=Partial<Record<'why'|'angle'|'twist'|'hook'|'note',string|null>>&Partial<Record<'demand'|'gap'|'show',{level:'high'|'mid'|'low';note:string}>>;

export function useIdeaActions(navigate:(route:Route)=>void){
 const toast=useToast();
 return useMemo(()=>{
  const put=(id:string,body:unknown)=>clubFetch<Video>(`/videos/${encodeURIComponent(id)}`,{method:'PUT',body});
  const fail=(reason:unknown,fallback:string)=>toast(errorMessage(reason,fallback));
  /** Runs a change that Undo can take back. */
  const change=(id:string,body:unknown,message:string,undo:unknown)=>put(id,body).then(()=>toast(message,{undo:()=>void put(id,undo).catch(reason=>fail(reason,"Couldn't undo that."))}),reason=>fail(reason,"Couldn't save that change."));
  return {
   async startPlanning(video:Video){
    try{
     await clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}/move`,{body:{stage:'planning'}});
     navigate({name:'video',id:video.id,tab:'idea'});
    }catch(reason){fail(reason,"Couldn't start planning.");}
   },
   later:(video:Video)=>change(video.id,{hidden:'later'},'Saved for later',{hidden:null}),
   skip:(video:Video,reason:string)=>change(video.id,{hidden:'skipped',idea:{dropReason:reason}},`Skipped · ${reason}`,{hidden:null,idea:{dropReason:null}}),
   restore:(video:Video)=>put(video.id,{hidden:null,idea:{dropReason:null}}).then(()=>toast('Restored to New'),reason=>fail(reason,"Couldn't restore that idea.")),
   rename:(video:Video,title:string)=>{const next=title.trim();if(next&&next!==video.title)put(video.id,{title:next}).catch(reason=>fail(reason,"Couldn't save that change."));},
   /** Saves notes; an empty text removes the note. */
   edit:(video:Video,notes:IdeaNotesPatch)=>put(video.id,{idea:notes}).catch(reason=>fail(reason,"Couldn't save that change.")),
   remove(video:Video){
    const undo=deleteLater(video.id,message=>toast(message));
    toast('Idea deleted',{undo});
   },
  };
 },[toast,navigate]);
}

export type IdeaActionSet=ReturnType<typeof useIdeaActions>;
