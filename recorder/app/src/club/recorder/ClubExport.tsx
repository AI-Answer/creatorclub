import {useEffect,useRef,useState} from 'react';

import type {ExportRecord} from '../../../shared/export-history';
import type {ExportOptions,Project} from '../../../shared/types';
import {cancelSavedExport,getSavedExport,listSavedExports,projectRevision,startSavedExport} from '../../api';
import {activeExport,ExportSession,exportCurrentVersion} from '../../export-session';
import {Button,Icon} from '../ui';
import {latestVideoExport} from './edit-steps';

/** Borumi's export menu rows, limited to what this app exports. Video is the one-click MP4; audio and the transcript open the export
 * window on that format (it offers TXT, Markdown and SRT). */
export const EXPORT_ITEMS:ReadonlyArray<{title:string;sub:string;icon:'video'|'music'|'text';format:'mp4'|'wav'|'srt'}>=[
 {title:'Export Video',sub:'MP4 • Balanced quality',icon:'video',format:'mp4'},
 {title:'Export Audio',sub:'WAV',icon:'music',format:'wav'},
 {title:'Export Transcript',sub:'TXT, MD or SRT',icon:'text',format:'srt'},
];

/** The window event that asks the embedded editor to open its export window on a format. */
export const EXPORT_FORMAT_EVENT='creatorclub:export-format';

export const EXPORT_FAILED="Couldn't export the video.";
const POLL_MS=900;

/**
 * The full timeline as an MP4 at balanced quality, encoded on the Mac's hardware H.264 encoder (VideoToolbox): about 2.5× faster than
 * software x264 for nearly the same picture (SSIM 0.995 on a 19 s 1080p video), with files about 3× larger. A Mac without a hardware
 * encoder falls back to x264 on the server.
 */
export const videoExportOptions=(project:Project):ExportOptions=>({format:'mp4',width:project.canvas.width,height:project.canvas.height,fps:project.canvas.fps,quality:'balanced',hardware:true,burnCaptions:true});

/**
 * `Export video` in the embedded editor: saves the latest edits, exports the full timeline as MP4 through SceneForge's export
 * history, and follows it. `onExported(true)` once a finished export matches the current timeline, so the bottom bar's
 * `Continue to publishing` becomes the primary; `false` again after the next edit.
 */
export function ClubExport({project,flush,onExported,quiet,dirty=false,onOtherFormat}:{project:Project;flush():Promise<Project|undefined>;onExported?(exported:boolean):void;/** Not the primary button (another button on the page is). */quiet?:boolean;dirty?:boolean;/** Opens the export window on audio or the transcript. */onOtherFormat?(format:'wav'|'srt'):void}){
 const [menu,setMenu]=useState(false),menuRoot=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!menu)return;const close=(event:PointerEvent)=>{if(!menuRoot.current?.contains(event.target as Node))setMenu(false);};const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(false);};window.addEventListener('pointerdown',close);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key);};},[menu]);
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

 const done=!dirty&&Boolean(record&&record.status==='complete'&&record.output.status==='available'&&revision&&record.projectRevision.replaceAll('"','')===revision);
 const exportedRef=useRef(onExported);exportedRef.current=onExported;
 useEffect(()=>{exportedRef.current?.(done);},[done]);

 const start=async()=>{
  setBusy(true);setFailed(false);
  const request=session.current.request();
  try{
   const snapshot=await flush();
   if(!snapshot||snapshot.id!==project.id||!request.active())return;
   const created=await exportCurrentVersion(request,async()=>snapshot,videoExportOptions(snapshot),{mode:'full',sceneId:'',start:0,end:0},projectRevision,(snapshot,options,rev,signal)=>startSavedExport(snapshot.id,options,rev,signal));
   if(created&&request.active())setRecord(created);
  }catch{if(request.active())setFailed(true);}
  finally{if(request.active())setBusy(false);}
 };
 const cancel=()=>{if(record)void cancelSavedExport(record.id).then(setRecord,()=>{});};

 if(failed)return <div className="club-export" role="alert"><span className="text-warn">{EXPORT_FAILED}</span><Button size="sm" onClick={()=>void start()}>Try again</Button></div>;
 if(running&&record)return <div className="club-export" role="status">
  <Icon name="loading" className="spin" size={15}/><span>Exporting video · {Math.round(record.progress*100)}%</span>
  <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
 </div>;
 if(busy)return <div className="club-export" role="status"><Icon name="loading" className="spin" size={15}/><span>Preparing export · Step 1 of 2</span></div>;
 const empty=!project.clips.length;
 const pick=(run:()=>void)=>{setMenu(false);run();};
 return <div className="club-export">
  {done&&<span className="club-export-done" role="status"><Icon name="check" size={15}/>Video exported</span>}
  {/* Borumi's split Export button (main bundle M:4843-4999): Export, and a chevron with the formats this app exports. */}
  <div className={`cex-split${quiet||done?' is-quiet':''}`} ref={menuRoot}>
   <button type="button" className={`cex-main${quiet||done?'':' is-primary'}`} disabled={empty} onClick={()=>void start()}><Icon name="upload" size={16}/>Export</button>
   <button type="button" className="cex-more" aria-label="Open export options" aria-haspopup="menu" aria-expanded={menu} disabled={empty} onClick={()=>setMenu(open=>!open)}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
   {menu&&<div className="cex-menu" role="menu">
    {EXPORT_ITEMS.map(item=><button key={item.title} type="button" role="menuitem" className="cex-item" onClick={()=>pick(()=>item.format==='mp4'?void start():onOtherFormat?.(item.format))}>
     <span className="cex-well"><Icon name={item.icon} size={18}/></span>
     <span className="cex-text"><span className="cex-title">{item.title}</span><span className="cex-sub">{item.sub}</span></span>
    </button>)}
   </div>}
  </div>
 </div>;
}
