import {useCallback} from 'react';
import type {Video} from '../../shared/club';
import {clubFetch,errorMessage} from './api';
import type {Route} from './routes';
import {useToast} from './ui';

/** The idea already made from this source (a video or post link) and still on the lists, as the server finds it. */
export const ideaFromSource=(videos:readonly Video[],url:string)=>videos.find(video=>video.hidden!=='skipped'&&video.idea?.sources?.some(source=>source.url===url));

export const trendingUrl=(videoId:string)=>`https://www.youtube.com/watch?v=${videoId}`;

/**
 * "Turn into idea" for a video or a post on Discover. Says it was added, with a button that opens the idea;
 * a source that already is an idea only says so.
 */
export function useIdeaFrom(videos:readonly Video[],navigate:(route:Route)=>void){
 const toast=useToast();
 return useCallback(async(source:{kind:'trending';videoId:string}|{kind:'signal';id:string;url:string})=>{
  const open=(id:string)=>({label:'Open',fn:()=>navigate({name:'videos',view:'board',new:id})});
  const url=source.kind==='trending'?trendingUrl(source.videoId):source.url;
  const existing=ideaFromSource(videos,url);
  if(existing){toast('Already in your ideas',{action:open(existing.id)});return;}
  try{
   const idea=await clubFetch<Video>(source.kind==='trending'?'/trending/idea':'/signals/idea',{body:source.kind==='trending'?{videoId:source.videoId}:{id:source.id}});
   toast('Added to your ideas',{action:open(idea.id)});
  }catch(reason){toast(errorMessage(reason,"Couldn't add that idea."));}
 },[videos,navigate,toast]);
}
