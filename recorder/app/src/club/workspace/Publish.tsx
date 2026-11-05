import {visibleInterval} from '../visible-interval';
import {BrandLogo} from '../../BrandLogo';
import {createPortal} from 'react-dom';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {Package,PublishProgress,PublishRecord,PublishVisibility,Video,VideoScene} from '../../../shared/club';
import type {ExportRecord} from '../../../shared/export-history';
import type {Project} from '../../../shared/types';
import {api,listSavedExports,projectRevision} from '../../api';
import {clubFetch,clubUpload,errorMessage,notifyVideosChanged} from '../api';
import {ErrorLine} from '../ErrorLine';
import {watchJob,failureMessage} from '../jobs';
import {TITLE_MAX,VISIBILITY_OPTIONS,unrecordedWarning,defaultSchedule,progressOf,publishProblem,scheduleTime,whenText,type ResultInfo} from '../publishing/publish-logic';
import {usePublishing} from '../publishing/usePublishing';
import {exportFileName,latestVideoExport} from '../recorder/edit-steps';
import {clockTime} from '../video-plan';
import {Button,Icon,Input,Menu,Spinner,Textarea} from '../ui';
import {PackageSummary,PasteLinkForm,ProgressCard,ResultCard,SELF_UPLOAD_LINE,SelfUpload,TagsField} from './PublishParts';
import {buildDescription} from './record-logic';
import {recordedCount} from '../scene-status';

export const PUBLISH_LINE='Upload your exported video to YouTube, then add its link here.';
const AUTOMATIC_PUBLISH_LINE='Send your video to YouTube now, or schedule it for later.';
/** What the server keeps of a description. */
export const DESCRIPTION_MAX=5000;
/** While Postiz is still sending a video to YouTube, the page asks it again this often. */
const RECHECK_MS=15000;

type Run={phase:'idle'}|{phase:'running';progress:PublishProgress|null}|{phase:'failed';message:string;progress:PublishProgress|null};

/**
 * The Publish step. The exported video, the package as YouTube will show it, Postiz connected once, and the form YouTube asks for
 * (title, description, tags, thumbnail, who can watch, made for kids, now or later). One button sends it; progress and the result follow.
 */
export function Publish({video,pkg,scenes,onVideo,onDescription,onTags,onGoTo,onSettings,saveError,onRetry,onExported}:{video:Video;pkg:Package|null;scenes:readonly VideoScene[]|undefined;onVideo(video:Video):void;onDescription(text:string):void;/** Saves the tags on the package at once, like the description. */onTags(tags:string[]):void;onGoTo(tab:'idea'|'record'|'edit'):void;/** Opens Settings at Publishing, where the Postiz key is entered once. */onSettings():void;saveError?:string;onRetry():void;onExported?(done:boolean):void}){
 const publishing=usePublishing();
 const [footer,setFooter]=useState<HTMLElement|null>(null);
 useLayoutEffect(()=>{setFooter(document.getElementById('ws-publish-action'));},[]);
 const published=video.stage==='published'&&Boolean(video.youtubeUrl);

 // ---- the exported video
 const [file,setFile]=useState<ExportRecord|null|undefined>(undefined);
 useEffect(()=>{
  if(!video.recorderProjectId){setFile(null);return;}
  const request=new AbortController();
  void listSavedExports(video.recorderProjectId,request.signal).then(({jobs})=>setFile(latestVideoExport(jobs)??null)).catch(()=>{if(!request.signal.aborted)setFile(null);});
  return()=>request.abort();
 },[video.recorderProjectId]);
 // The export runs from the saved recording project, so the editor need not be open. Its last autosave is what is exported.
 const [project,setProject]=useState<Project|null>(null),[revision,setRevision]=useState('');
 useEffect(()=>{
  if(!video.recorderProjectId)return;
  const request=new AbortController();
  void api<Project>(`/projects/${encodeURIComponent(video.recorderProjectId)}`,undefined,undefined,request.signal).then(setProject,()=>{});
  return()=>request.abort();
 },[video.recorderProjectId]);
 useEffect(()=>{if(!project)return;let alive=true;void projectRevision(project).then(value=>{if(alive)setRevision(value.replaceAll('"',''));},()=>{});return()=>{alive=false;};},[project]);
 const stale=Boolean(file&&revision&&file.projectRevision.replaceAll('"','')!==revision);
 const exported=Boolean(file)&&!stale;
 useEffect(()=>{onExported?.(exported);},[exported,onExported]);

 // ---- what is already sent
 const [record,setRecord]=useState<PublishRecord|null|undefined>(undefined);
 const loadRecord=useCallback(async()=>{
  const next=await clubFetch<PublishRecord|null>(`/videos/${encodeURIComponent(video.id)}/postiz`);
  setRecord(next);
  if(next?.state==='published'&&!published)void clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}`).then(onVideo,()=>{});
 },[video.id,published,onVideo]);
 useEffect(()=>{void loadRecord().catch(()=>setRecord(null));},[video.id]);// eslint-disable-line react-hooks/exhaustive-deps
 // A video scheduled for later is not asked about until its time has come.
 const waiting=record?.state==='queued'&&(Boolean(record.unconfirmed)||!(record.scheduledFor&&new Date(record.scheduledFor).getTime()>Date.now()));
 useEffect(()=>{if(!waiting)return;return visibleInterval(()=>void loadRecord().catch(()=>{}),RECHECK_MS);},[waiting,loadRecord]);

 // ---- the form
 const [title,setTitle]=useState(video.title);
 // Chapters come from the timeline as it is cut, once the recording project is read.
 const built=useMemo(()=>buildDescription(pkg,scenes,clockTime,project?.clips),[pkg,scenes,project]);
 const [edited,setEdited]=useState<string|undefined>(undefined);
 const description=edited??pkg?.description??built;
 useEffect(()=>{if(edited!==undefined&&edited===pkg?.description)setEdited(undefined);},[pkg?.description,edited]);
 // The tags live on the package, so they are there after switching step or reopening the app.
 const tags=pkg?.tags??[];
 const [chosen,setChosen]=useState<PublishVisibility|null>(null);
 const visibility=chosen??publishing.state?.defaultVisibility??'public';
 const [kids,setKids]=useState<'yes'|'no'|null>(null),[tried,setTried]=useState(false);
 const kidsField=useRef<HTMLDivElement>(null);
 const [when,setWhen]=useState<'now'|'schedule'>('now'),[at,setAt]=useState(()=>defaultSchedule(new Date()));
 const [thumbnail,setThumbnail]=useState<string|null>(null),[thumbError,setThumbError]=useState('');
 useEffect(()=>{
  let alive=true;
  void fetch(`/api/club/videos/${encodeURIComponent(video.id)}/thumbnail`).then(response=>{if(alive&&response.status===200)setThumbnail(`/api/club/videos/${encodeURIComponent(video.id)}/thumbnail?v=${Date.now()}`);},()=>{});
  return()=>{alive=false;};
 },[video.id]);
 const pick=async(chosenFile:File|undefined)=>{
  if(!chosenFile)return;
  setThumbError('');
  const form=new FormData();form.append('file',chosenFile);
  try{await clubUpload(`/videos/${encodeURIComponent(video.id)}/thumbnail`,form);setThumbnail(`/api/club/videos/${encodeURIComponent(video.id)}/thumbnail?v=${Date.now()}`);}
  catch(reason){setThumbError(errorMessage(reason,"Couldn't use that image."));}
 };
 const dropThumbnail=()=>void clubFetch(`/videos/${encodeURIComponent(video.id)}/thumbnail`,{method:'DELETE'}).then(()=>setThumbnail(null),()=>setThumbError("Couldn't remove that image."));

 // ---- publishing
 const [run,setRun]=useState<Run>({phase:'idle'});
 // Postiz is set up and posts to a channel: then adding a link by hand is never offered on the form.
 const postizReady=Boolean(publishing.state?.postiz.connected&&publishing.state?.postiz.channel);
 const [copyStatus,setCopyStatus]=useState(''),[selfUpload,setSelfUpload]=useState(false),[linkReady,setLinkReady]=useState(false),uploadSection=useRef<HTMLDivElement>(null);
 const copyDetails=async()=>{try{await navigator.clipboard.writeText(`${title.trim()}\n\n${description}`);setCopyStatus('Details copied');}catch{setCopyStatus("Couldn't copy the details. Try again.");}};
 const linkFormId=`ws-publish-link-${video.id}`;
 const stop=useRef<()=>void>(()=>{});
 useEffect(()=>()=>stop.current(),[]);
 const schedule=when==='schedule'?scheduleTime(at,new Date()):null;
 const problem=publishProblem({connected:Boolean(publishing.state?.postiz.connected),channel:Boolean(publishing.state?.postiz.channel),exported,stale,kids,title})??(schedule&&'message' in schedule?schedule.message:null);
 const submit=async()=>{
  if(run.phase==='running')return;
  setTried(true);
  if(problem||!file||!kids){if(!kids){kidsField.current?.scrollIntoView?.({block:'center'});kidsField.current?.querySelector('input')?.focus();}return;}
  setRun({phase:'running',progress:null});
  try{
   const started=await clubFetch<{id:string}>(`/videos/${encodeURIComponent(video.id)}/postiz`,{body:{exportId:file.id,title:title.trim(),description,tags,visibility,madeForKids:kids==='yes',...(schedule&&'iso' in schedule?{scheduledFor:schedule.iso}:{})}});
   stop.current();
   stop.current=watchJob(started.id,event=>{
    if(event.type==='progress'){const progress=progressOf(event.data);if(progress)setRun({phase:'running',progress});}
    else if(event.type==='done'){
     const done=event.data as PublishRecord;
     setRun({phase:'idle'});setRecord(done);
     void clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}`).then(next=>{onVideo(next);notifyVideosChanged();},()=>{});
    }
    else{
     const message=event.type==='failed'?failureMessage(event.data):'That was stopped.';
     // Postiz may have the post after all. Then the screen says so and offers Check again, never a second send.
     const failed=()=>setRun(was=>({phase:'failed',message,progress:was.phase==='idle'?null:was.progress}));
     void clubFetch<PublishRecord|null>(`/videos/${encodeURIComponent(video.id)}/postiz`).then(now=>{if(now&&now.state!=='failed'){setRecord(now);setRun({phase:'idle'});}else failed();},failed);
    }
   });
  }catch(reason){setRun({phase:'failed',message:errorMessage(reason),progress:null});}
 };

 const scheduledDate=schedule&&'date' in schedule?schedule.date:null;
 // Scenes without a kept take are not on the timeline, so not in the exported video: said before it goes out.
 const unrecorded=scenes?unrecordedWarning(scenes.length,recordedCount(scenes)):null;
 const summary=<PackageSummary video={video} thumbnailText={pkg?.thumbnailText} thumbnailUrl={thumbnail} channel={publishing.state?.postiz.channel?.name} visibility={visibility} when={scheduledDate} title={title} description={description} tags={tags}/>;
 // Green "on YouTube" only when the video really is Published. Postiz saying so is not enough until it has moved.
 const result:{info:ResultInfo}|null=published?{info:{state:'published',visibility:record?.visibility??'public',url:video.youtubeUrl,postizUrl:record?.postizUrl}}
  :record&&record.state!=='failed'?{info:{...record,state:record.state==='published'?'queued':record.state}}:null;
 const footerReason=!exported?(stale?'Export the latest edit first':'Export the video first'):problem;
 const publishAction=run.phase==='idle'&&!result?(postizReady?<>
  {footerReason&&<span id="ws-publish-why" className="ws-why" role="status">{footerReason}</span>}
  <Button variant={footerReason?'secondary':'primary'} disabled={Boolean(footerReason)} aria-describedby={footerReason?'ws-publish-why':undefined} onClick={()=>void submit()}><Icon name={when==='now'?'upload':'calendar'} size={15}/>{when==='now'?'Publish now':'Schedule'}</Button>
 </>:selfUpload?<Button variant="primary" type="submit" form={linkFormId} disabled={!linkReady}>Done</Button>:!exported?<Button variant="primary" onClick={()=>onGoTo('edit')}>Export in Edit</Button>:<><Button onClick={()=>void copyDetails()}>Copy details</Button><a className="btn primary" href="https://www.youtube.com/upload" target="_blank" rel="noreferrer" onClick={()=>setSelfUpload(true)}><Icon name="open-external" size={15}/>Open YouTube</a></>):null;
 const footerAction=publishAction?(footer?createPortal(publishAction,footer):<div className="ws-publish-action">{publishAction}</div>):null;
 const head=<><div className="doc-h"><h2>Publish</h2></div><div className="doc-sub">{postizReady?AUTOMATIC_PUBLISH_LINE:'Prepare your details and finish on YouTube.'}</div></>;

 if(run.phase!=='idle')return <div className="pubx ws-publish">{head}<div className="pubx-grid"><div>
  <ProgressCard progress={run.progress} failure={run.phase==='failed'?run.message:undefined} scheduled={Boolean(schedule&&'iso' in schedule)} onRetry={()=>void submit()}/>
  {run.phase==='failed'&&<p className="small"><button type="button" className="linkish" onClick={()=>setRun({phase:'idle'})}>Edit details</button></p>}
 </div>{summary}</div></div>;

 if(result)return <div className="pubx ws-publish">{head}<div className="pubx-grid"><div>
  <ResultCard record={result.info} video={video} onCheck={record&&waiting?()=>loadRecord().catch(()=>{}):undefined}
   onForget={record?.state==='queued'?async()=>{setRecord(await clubFetch<PublishRecord>(`/videos/${encodeURIComponent(video.id)}/postiz/forget`,{body:{}}));}:undefined}>
   {published?<PasteLinkForm video={video} published onVideo={onVideo}/>
    // Postiz says it is published but no usable YouTube link came back: the way out is open and says so plainly.
    :record?.state==='published'?<SelfUpload open video={video} onVideo={onVideo} line={`Postiz says it's published, but the YouTube link didn't come back. ${SELF_UPLOAD_LINE}`}/>
    :record?.unconfirmed?<SelfUpload video={video} onVideo={onVideo}/>:null}
  </ResultCard></div>{summary}</div></div>;

 const exportLine=file===undefined?<span className="row small muted" role="status"><Spinner label="Looking for the exported video"/>Looking for the exported video…</span>:file
  ?<div className="row ws-export-file"><span className="club-export-done"><Icon name="check" size={15}/>Exported</span><ExportName name={exportFileName(file)} fallback={video.title}/>
   {stale&&<Button size="sm" onClick={()=>onGoTo('edit')}>Export in Edit</Button>}
   {!stale&&file.outputPath&&window.sceneForge?.reveal&&<button type="button" className="linkish" onClick={()=>void window.sceneForge!.reveal(file.outputPath!).catch(()=>{})}>Show in Finder</button>}</div>
  :<span className="small muted">No exported video yet. <button type="button" className="linkish" onClick={()=>onGoTo('edit')}>Export it in Edit</button></span>;
 const connected=Boolean(publishing.state?.postiz.connected),channelName=publishing.state?.postiz.channel?.name;
 const detailsDone=Boolean(title.trim()&&kids);

 return <div className="pubx ws-publish">{head}{footerAction}
  <div className="pubx-grid"><div className="pub-steps">
   <PubStep n={1} title="Export the video" done={exported}
    line={exported?'The latest edit is exported. This file is what goes to YouTube.':stale?'You edited it after the last export, so export it again.':'The exported file is what goes to YouTube.'}>
    <div className="pubx-export">{exportLine}</div>
    {unrecorded&&<p className="small pubx-warn" role="status">{unrecorded}</p>}
   </PubStep>
   <PubStep n={2} title="Check the details" done={detailsDone} line="Write and check the details viewers see on YouTube.">
    <div className="pubx-form">
     <div className="full"><label className="field" htmlFor="pub-title">Title</label><Input id="pub-title" maxLength={TITLE_MAX} value={title} onChange={event=>setTitle(event.target.value)}/></div>
     <div className="full"><label className="field" htmlFor="pub-desc">Description</label><Textarea id="pub-desc" rows={5} maxLength={DESCRIPTION_MAX} placeholder="What the viewer gets, then chapters." value={description}
      onChange={event=>setEdited(event.target.value)} onBlur={()=>{if(edited!==undefined&&edited!==pkg?.description)onDescription(edited);}}/>
      {saveError&&<ErrorLine message="Couldn't save the description." onRetry={onRetry}/>}</div>
     <div className="full"><label className="field" htmlFor="pub-tags">Tags</label><TagsField tags={tags} onChange={onTags}/></div>
     <div className="full"><div className="field">Thumbnail</div><div className="small muted">{thumbnail?'Your own image. ':pkg?.thumbnailText?.trim()?'Your thumbnail text is only a preview: YouTube picks a frame unless you add one. ':'YouTube picks a frame unless you add one. '}
      <label className="linkish" style={{cursor:'pointer'}}>{thumbnail?'Use another image':'Upload an image'}<input type="file" className="sr-only" accept="image/png,image/jpeg" onChange={event=>{void pick(event.target.files?.[0]);event.target.value='';}}/></label>
      {thumbnail&&<> <button type="button" className="linkish" onClick={dropThumbnail}>Remove image</button></>}</div>
      {thumbError&&<p role="alert" className="small pz-err">{thumbError}</p>}</div>
     <div className="pub-pair"><label className="field" htmlFor="pub-vis">Who can watch</label><Menu label="Who can watch" restoreFocus below items={VISIBILITY_OPTIONS.map(option=>({label:option.label,check:visibility===option.value,fn:()=>setChosen(option.value)}))} button={(toggle,open)=><button id="pub-vis" type="button" className="select ws-visibility" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>{VISIBILITY_OPTIONS.find(option=>option.value===visibility)?.label}<Icon name="expand" size={14}/></button>}/></div>
     <div className={`pub-pair ${tried&&!kids?'has-err':''}`}><div className="field" id="pub-kids-l">Made for kids?</div>
      <div className="radios ws-kids-segment" role="radiogroup" aria-labelledby="pub-kids-l" aria-describedby="pub-kids-h" ref={kidsField}>{(['no','yes'] as const).map(value=><label key={value} className={`rad ${kids===value?'is-selected':''}`}><input type="radio" name="kids" value={value} checked={kids===value} onChange={()=>setKids(value)}/>{kids===value&&<Icon name="check" size={13}/>}{value==='no'?'No':'Yes'}</label>)}</div>
      <div className="field-hint" id="pub-kids-h">Required by YouTube</div>
      {tried&&!kids&&<p role="alert" className="small pz-err">Choose one, because YouTube won't accept the video without it.</p>}</div>
    </div>
   </PubStep>
   <PubStep n={3} title="Upload to YouTube" done={false}
    line={postizReady?`Uploads to ${channelName??'your channel'} on YouTube, now or at the time you pick.`:PUBLISH_LINE}>
    {!postizReady&&<p className="small muted ws-paste-note" role="status">{copyStatus||'These details are saved here for you to paste into YouTube.'}</p>}
    <div ref={uploadSection} className="ws-manual-upload"><SelfUpload video={video} onVideo={onVideo} open={selfUpload} onOpen={()=>setSelfUpload(true)} formId={linkFormId} onSubmitReady={setLinkReady}/></div>
    {publishing.error?<ErrorLine message={publishing.error} onRetry={publishing.reload}/>:!publishing.state?<span className="row small muted" role="status"><Spinner label="Loading publishing settings"/>Loading publishing settings…</span>
     :!postizReady?<div className="ws-publish-setup"><button type="button" className="linkish ws-automatic-link" onClick={onSettings}>Or publish automatically</button><details><summary>How automatic publishing works</summary><p className="small muted">Connect Postiz and choose your YouTube channel in Settings to publish or schedule from here.</p></details></div>
     :<>
      <div className="pub-when">
       <div><label className="field" htmlFor="pub-when">When</label><select id="pub-when" className="select" value={when} onChange={event=>setWhen(event.target.value as 'now'|'schedule')}><option value="now">Publish now</option><option value="schedule">Schedule for later</option></select></div>
       {when==='schedule'&&<div><label className="field" htmlFor="pub-at">Date and time</label><Input id="pub-at" type="datetime-local" value={at} aria-invalid={schedule&&'message' in schedule?true:undefined} onChange={event=>setAt(event.target.value)}/></div>}
      </div>
      <button type="button" className="linkish quiet small" onClick={onSettings}>Change in Settings</button>
     </>}
   </PubStep>
  </div>{summary}</div>
 </div>;
}

/** One numbered step of Publish: its number (a tick once done), what it is, one line on where it stands, then its controls. */
function PubStep({n,title,line,done,children}:{n:number;title:string;line?:string;done:boolean;children:ReactNode}){
 return <section className={`pub-step${done?' done':''}`} aria-label={title}>
  <header><span className="pub-step-n" aria-hidden>{done?<Icon name="check" size={13} stroke={1.75}/>:n}</span><div><h3>{title}</h3>{line&&<p>{line}</p>}</div></header>
  <div className="pub-step-body">{children}</div>
 </section>;
}

/** Retain the useful filename and extension while hiding the export job's machine suffix. */
export function readableExportName(name:string,fallback:string){
 const readable=name.replace(/-?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?=\.[^.]+$)/i,'');
 return readable.replace(/\.[^.]+$/,'').trim()?readable:`${fallback}.mp4`;
}
function ExportName({name,fallback}:{name:string;fallback:string}){
 const readable=readableExportName(name,fallback),split=Math.max(1,Math.ceil(readable.length*.65));
 return <span className="ws-export-name" title={name}><span>{readable.slice(0,split)}</span><span>{readable.slice(split)}</span></span>;
}
