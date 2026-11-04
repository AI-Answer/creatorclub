import {useCallback} from 'react';
import type {ResearchTile} from '../../shared/club';
import {clubFetch,errorMessage} from './api';
import type {Route} from './routes';
import {useToast} from './ui';

/** What "Add to Research" puts on the channel's Board: a Discover video (its YouTube id), a Discover post, or one of your ideas or videos. */
export type ResearchSource={source:'trending'|'signal'|'video';id:string};

/** "Add to Research": puts the card on Research and says so, with Open; a card already there is not added twice. */
export function useAddToResearch(navigate:(route:Route)=>void){
 const toast=useToast();
 return useCallback(async(source:ResearchSource)=>{
  try{
   const {created}=await clubFetch<{tile:ResearchTile;created:boolean}>('/channel/research/add',{body:source});
   toast(created?'Added to the channel board':'Already on the channel board',{action:{label:'Open',fn:()=>navigate({name:'research'})}});
  }catch(reason){toast(errorMessage(reason,"Couldn't add that to Research."));}
 },[navigate,toast]);
}
