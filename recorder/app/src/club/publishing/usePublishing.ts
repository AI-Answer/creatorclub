import {useCallback,useEffect,useState} from 'react';
import type {PublishingState} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';

/** Where videos are published: Postiz connected or not, the YouTube channel, and who can watch new videos. The API key itself is never sent to the screen. */
export function usePublishing(){
 const [state,setState]=useState<PublishingState|null>(null),[error,setError]=useState('');
 const load=useCallback(()=>{
  setError('');
  clubFetch<PublishingState>('/publishing').then(setState,reason=>setError(errorMessage(reason,"Couldn't load the publishing settings.")));
 },[]);
 useEffect(load,[load]);
 return {state,error,reload:load,setState};
}
