import {useCallback,useEffect,useRef,useState} from 'react';
import type {Video} from '../../shared/club';
import {captureWorkspace,clubFetch,errorMessage,notifyVideosChanged} from './api';
import type {Route} from './routes';
import {useToast} from './ui';

/** The idea already made from this source (a video or post link) and still on the lists, as the server finds it. */
export const ideaFromSource=(videos:readonly Video[],url:string)=>videos.find(video=>video.hidden!=='skipped'&&video.idea?.sources?.some(source=>source.url===url));

export const trendingUrl=(videoId:string)=>`https://www.youtube.com/watch?v=${videoId}`;

export type IdeaSource={kind:'trending';videoId:string}|{kind:'signal';id:string;url:string};
const urlOf=(source:IdeaSource)=>source.kind==='trending'?trendingUrl(source.videoId):source.url;

/**
 * "Turn into idea" for a video or a post on Discover. The button flips to "In ideas" at once (`adding` holds the links on their way),
 * the lists of videos load again as soon as the server has it, and the toast offers Undo (which deletes the new idea) and Open.
 * A source that already is an idea only says so.
 */
export function useIdeaFrom(videos:readonly Video[],navigate:(route:Route)=>void):{make(source:IdeaSource):Promise<void>;adding:ReadonlySet<string>}{
 const toast=useToast();
 const [adding,setAdding]=useState<ReadonlySet<string>>(new Set());
 const mark=useCallback((url:string,on:boolean)=>setAdding(current=>{const next=new Set(current);if(on)next.add(url);else next.delete(url);return next;}),[]);
 const busy=useRef(adding);busy.current=adding;
 // Once the videos read back have the idea, they say "In ideas" themselves.
 useEffect(()=>{setAdding(current=>{const left=[...current].filter(url=>!ideaFromSource(videos,url));return left.length===current.size?current:new Set(left);});},[videos]);
 const make=useCallback(async(source:IdeaSource)=>{
  const open=(id:string)=>({label:'Open',fn:()=>navigate({name:'videos',view:'board',new:id})});
  const url=urlOf(source);
  const existing=ideaFromSource(videos,url);
  if(existing){toast('Already in your ideas',{action:open(existing.id)});return;}
  if(busy.current.has(url))return;
  mark(url,true);const workspace=captureWorkspace();
  try{
   const idea=await clubFetch<Video>(source.kind==='trending'?'/trending/idea':'/signals/idea',{body:source.kind==='trending'?{videoId:source.videoId}:{id:source.id},workspace:await workspace});
   // The lists (this screen's "In ideas", the ideas count, the sidebar) read the videos again now, not after the next refresh.
   notifyVideosChanged();
   toast('Added to your ideas',{action:open(idea.id),undo:()=>{
    mark(url,false);
    workspace.then(scope=>clubFetch(`/videos/${encodeURIComponent(idea.id)}`,{method:'DELETE',workspace:scope})).catch(reason=>{toast(errorMessage(reason,"Couldn't take that idea out."));});
   }});
  }catch(reason){mark(url,false);toast(errorMessage(reason,"Couldn't add that idea."));}
 },[videos,navigate,toast,mark]);
 return {make,adding};
}
