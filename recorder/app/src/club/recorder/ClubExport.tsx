import {useEffect,useRef,useState} from 'react';
import {Check,LoaderCircle} from 'lucide-react';
import type {ExportRecord} from '../../../shared/export-history';
import type {ExportOptions,Project} from '../../../shared/types';
import {cancelSavedExport,getSavedExport,listSavedExports,projectRevision,startSavedExport} from '../../api';
import {activeExport,ExportSession,exportCurrentVersion} from '../../export-session';
import {Button} from '../ui';
import {latestVideoExport} from './edit-steps';

export const EXPORT_FAILED="Couldn't export the video.";
const POLL_MS=900;

/** The full timeline as an MP4, with SceneForge's everyday settings (its Export dialog's defaults). */
export const videoExportOptions=(project:Project):ExportOptions=>({format:'mp4',width:project.canvas.width,height:project.canvas.height,fps:project.canvas.fps,quality:'balanced',hardware:false,burnCaptions:true});

/**
 * `Export video` in the embedded editor: saves the latest edits, exports the full timeline as MP4 through SceneForge's export
 * history, and follows it. `onExported(true)` once a finished export matches the current timeline, so the bottom bar's
 * `Continue to publishing` becomes the primary; `false` again after the next edit.
 */
export function ClubExport({project,flush,onExported,quiet}:{project:Project;flush():Promise<Project|undefined>;onExported?(exported:boolean):void;/** Not the primary button (another button on the page is). */quiet?:boolean}){
 const [record,setRecord]=useState<ExportRecord|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[revision,setRevision]=useState('');
 const session=useRef(new ExportSession());
 useEffect(()=>{
  session.current.reset(project.id);
  const request=session.current.request();
  // A running export (from before this screen opened) is followed; otherwise the newest finished one says whether this edit is exported.
  void listSavedExports(project.id,request.signal).then(({jobs})=>{if(request.active())setRecord(jobs.find(j=>j.options.format==='mp4'&&activeExport(j))??latestVideoExport(jobs)??null);}).catch(()=>{});
  return()=>session.current.close();
 },[project.id]);
 // The revision of the timeline on screen, to tell an export of an older edit from one of this edit.
 useEffect(()=>{let alive=true;void projectRevision(project).then(value=>{if(alive)setRevision(value.replaceAll('"',''));});return()=>{alive=false;};},[project]);
 const running=Boolean(record&&activeExport(record));
 useEffect(()=>{
  if(!record||!running)return;
  let timer:ReturnType<typeof setTimeout>;const request=session.current.request();
  const poll=()=>void getSavedExport(record.id,request.signal).then(next=>{if(!request.active())return;setRecord(next);if(next.status==='failed'||next.status==='interrupted')setFailed(true);if(activeExport(next))timer=setTimeout(poll,POLL_MS);},()=>{if(request.active())timer=setTimeout(poll,POLL_MS*3);});
  timer=setTimeout(poll,POLL_MS);
  return()=>clearTimeout(timer);
 },[record?.id,running]);

 const done=Boolean(record&&record.status==='complete'&&record.output.status==='available'&&revision&&record.projectRevision.replaceAll('"','')===revision);
 const exportedRef=useRef(onExported);exportedRef.current=onExported;
 useEffect(()=>{exportedRef.current?.(done);},[done]);
 useEffect(()=>()=>exportedRef.current?.(false),[]);

 const start=async()=>{
  setBusy(true);setFailed(false);
  const request=session.current.request();
  try{
   const created=await exportCurrentVersion(request,flush,videoExportOptions(project),{mode:'full',sceneId:'',start:0,end:0},projectRevision,(snapshot,options,rev,signal)=>startSavedExport(snapshot.id,options,rev,signal));
   if(created&&request.active())setRecord(created);
  }catch{if(request.active())setFailed(true);}
  finally{if(request.active())setBusy(false);}
 };
 const cancel=()=>{if(record)void cancelSavedExport(record.id).then(setRecord,()=>{});};

 if(failed)return <div className="club-export" role="alert"><span className="text-danger">{EXPORT_FAILED}</span><Button size="sm" onClick={()=>void start()}>Try again</Button></div>;
 if(running&&record)return <div className="club-export" role="status">
  <LoaderCircle aria-hidden className="spin" size={15}/><span>Exporting {Math.round(record.progress*100)}%</span>
  <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
 </div>;
 return <div className="club-export">
  {done&&<span className="club-export-done" role="status"><Check aria-hidden size={15}/>Video exported</span>}
  <Button size="sm" variant={done||quiet?'secondary':'primary'} disabled={busy||!project.clips.length} onClick={()=>void start()}>{busy&&<LoaderCircle aria-hidden className="spin"/>}Export video</Button>
 </div>;
}
