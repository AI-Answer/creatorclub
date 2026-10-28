import type {Video} from '../../shared/club';
import {STAGE_LABEL,formatDay,formatViews,inBoardOrder,videoDayKey,type ProjectProgress} from './board';
import {Card} from './ui';

const head='px-4 py-2.5 text-left text-sm font-medium text-muted';
const cell='px-4 py-3 text-base text-ink';

/** One row per video. Views show once they are known and a dash before that. */
export function TableView({videos,progress,onOpen}:{videos:readonly Video[];progress:Record<string,ProjectProgress>;onOpen(id:string):void}){
 return <Card className="overflow-x-auto">
  <table className="w-full min-w-[640px]">
   <thead className="border-b border-line">
    <tr><th scope="col" className={head}>Title</th><th scope="col" className={head}>Stage</th><th scope="col" className={head}>Scenes recorded</th><th scope="col" className={head}>Publish date</th><th scope="col" className={head}>Views</th></tr>
   </thead>
   <tbody>
    {videos.length===0&&<tr><td colSpan={5} className="px-4 py-10 text-center text-base text-muted">No videos yet.</td></tr>}
    {inBoardOrder(videos).map(video=>{
     const project=video.recorderProjectId?progress[video.recorderProjectId]:undefined,day=videoDayKey(video);
     return <tr key={video.id} onClick={()=>onOpen(video.id)} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-subtle">
      <td className={cell}><button type="button" onClick={event=>{event.stopPropagation();onOpen(video.id);}} className="rounded-sm text-left font-medium focus-visible:outline-2 focus-visible:outline-accent">{video.title}</button></td>
      <td className={cell}>{STAGE_LABEL[video.stage]}{video.hidden&&<span className="text-muted"> · {video.hidden==='later'?'Later':'Skipped'}</span>}</td>
      <td className={cell}>{project&&project.scenes>0?`${project.recorded} of ${project.scenes}`:<span className="text-muted">—</span>}</td>
      <td className={cell}>{day?formatDay(day):<span className="text-muted">—</span>}</td>
      <td className={cell}>{video.views===undefined?<span className="text-muted">—</span>:formatViews(video.views)}</td>
     </tr>;
    })}
   </tbody>
  </table>
 </Card>;
}
