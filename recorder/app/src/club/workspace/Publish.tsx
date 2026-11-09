import {exportStatus,hasCurrentExport} from '../export-status';
import {visibleInterval} from '../visible-interval';
import {BrandLogo} from '../../BrandLogo';
import {createPortal} from 'react-dom';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {JobSnapshot,Package,PublishProgress,PublishRecord,PublishVisibility,Video,VideoScene} from '../../../shared/club';
import type {ExportRecord} from '../../../shared/export-history';
import type {Project} from '../../../shared/types';
import {api,listSavedExports,projectRevision} from '../../api';
import {clubFetch,clubUpload,errorMessage,notifyVideosChanged} from '../api';
import {ErrorLine} from '../ErrorLine';
import {watchJob,failureMessage} from '../jobs';
import {TITLE_MAX,VISIBILITY_OPTIONS,unrecordedWarning,defaultSchedule,progressOf,publishProblem,scheduleTime,whenText,type ResultInfo} from '../publishing/publish-logic';
import {usePublishing} from '../publishing/usePublishing';
import {latestVideoExport} from '../recorder/edit-steps';
import {clockTime} from '../video-plan';
import {Button,Icon,IconButton,Input,Menu,Spinner,Textarea} from '../ui';
import {PackageSummary,PasteLinkForm,ProgressCard,ResultCard,SELF_UPLOAD_LINE,SelfUpload,TagsField} from './PublishParts';
import {buildDescription} from './record-logic';
import {recordedCount} from '../scene-status';
import {ThumbnailDialog,type ThumbnailDialogProps} from '../idea/SketchThumbnail';

const AUTOMATIC_PUBLISH_LINE='Send your video to YouTube now, or schedule it for later.';
/** What the server keeps of a description. */
export const DESCRIPTION_MAX=5000;
/** While Postiz is still sending a video to YouTube, the page asks it again this often. */
const RECHECK_MS=15000;

type Run={phase:'idle'}|{phase:'running';progress:PublishProgress|null}|{phase:'failed';message:string;progress:PublishProgress|null};

/** What the thumbnail studio needs from the sketch: the same studio opens from the sketch and from Publish. */
export type PublishStudio=Pick<ThumbnailDialogProps,'sketch'|'onThumb'|'onSave'|'onRefresh'>;

/**
 * The Publish step: the form YouTube asks for (title, description, tags, thumbnail, who can watch, made for kids, now or later) beside the
 * exported video as it will look. One button sends it; progress and the result follow.
 */
export function Publish({video,pkg,scenes,onVideo,onDescription,onTags,onGoTo,onSettings,saveError,onRetry,onExported,writingPackage=false,studio}:{video:Video;pkg:Package|null;scenes:readonly VideoScene[]|undefined;onVideo(video:Video):void;onDescription(text:string):void;/** Saves the tags on the package at once, like the description. */onTags(tags:string[]):void;onGoTo(tab:'idea'|'record'|'edit'):void;/** Opens Settings at Publishing, where the Postiz key is entered once. */onSettings():void;saveError?:string;/** Ask Claude is writing the package: the form waits. */writingPackage?:boolean;onRetry():void;onExported?(done:boolean):void;studio?:PublishStudio}){
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
 const stale=exportStatus(file,revision)==='stale';
 const exported=hasCurrentExport(file,revision);
 useEffect(()=>{if(file!==undefined)onExported?.(exported);},[file,exported,onExported]);

 // ---- what is already sent
 const [record,setRecord]=useState<PublishRecord|null|undefined>(undefined);
 const alive=useRef(true),submitting=useRef(false),following=useRef<string|null>(null);
 const followRef=useRef<(id:string)=>void>(()=>{});
 const jobKey=`cc.publish.${video.id}`;
 const rememberJob=(id?:string)=>{try{if(id)window.sessionStorage.setItem(jobKey,id);else window.sessionStorage.removeItem(jobKey);}catch{/* the server record still prevents a duplicate post */}};
 const savedJob=()=>{try{return window.sessionStorage.getItem(jobKey);}catch{return null;}};
 const loadRecord=useCallback(async()=>{
  const next=await clubFetch<(PublishRecord&{runningJobId?:string})|null>(`/videos/${encodeURIComponent(video.id)}/postiz`);
  if(!alive.current)return;
  setRecord(current=>next??current??null);if(next?.runningJobId)followRef.current(next.runningJobId);
  if(next?.state==='published'&&!published)void clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}`).then(onVideo,()=>{});
 },[video.id,published,onVideo]);
 useEffect(()=>{
  alive.current=true;
  void (async()=>{
   try{
    await loadRecord();
    const id=savedJob();if(!id||!alive.current||following.current)return;
    const job=await clubFetch<JobSnapshot>(`/jobs/${encodeURIComponent(id)}`).catch(()=>undefined);
    if(!alive.current)return;
    if(!job){rememberJob();return;}
    if(job.status==='running')followRef.current(id);else{rememberJob();if(job.status==='done')await loadRecord();}
   }catch{if(alive.current){setRecord(null);setRun({phase:'failed',message:"Couldn't check whether this video is already being sent. Try again to check.",progress:null});}}
  })();
  return()=>{alive.current=false;};
 },[video.id]);// eslint-disable-line react-hooks/exhaustive-deps
 // A video scheduled for later is not asked about until its time has come.
 const waiting=(record?.state==='uploading'||record?.state==='posting'||record?.state==='queued')&&(Boolean(record.unconfirmed)||!(record.scheduledFor&&new Date(record.scheduledFor).getTime()>Date.now()));
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
 const [thumbnail,setThumbnail]=useState<string|null>(null),[thumbError,setThumbError]=useState(''),[making,setMaking]=useState(false);
 const showThumbnail=useCallback(()=>setThumbnail(`/api/club/videos/${encodeURIComponent(video.id)}/thumbnail?v=${Date.now()}`),[video.id]);
 useEffect(()=>{
  let alive=true;
  void fetch(`/api/club/videos/${encodeURIComponent(video.id)}/thumbnail`).then(response=>{if(alive&&response.status===200)showThumbnail();},()=>{});
  return()=>{alive=false;};
 },[video.id,showThumbnail]);
 // Without the studio (no sketch to hand it), the thumbnail is still your own picture.
 const pick=async(chosenFile:File|undefined)=>{
  if(!chosenFile)return;
  setThumbError('');
  const form=new FormData();form.append('file',chosenFile);
  try{await clubUpload(`/videos/${encodeURIComponent(video.id)}/thumbnail`,form);showThumbnail();}
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
 useEffect(()=>{if(selfUpload)uploadSection.current?.scrollIntoView?.({block:'nearest',behavior:'smooth'});},[selfUpload]);
 const stop=useRef<()=>void>(()=>{});
 useEffect(()=>()=>{alive.current=false;stop.current();},[]);
 const schedule=when==='schedule'?scheduleTime(at,new Date()):null;
 const problem=publishProblem({connected:Boolean(publishing.state?.postiz.connected),channel:Boolean(publishing.state?.postiz.channel),exported,stale,kids,title})??(schedule&&'message' in schedule?schedule.message:null);
 const follow=(id:string)=>{
  if(!alive.current||following.current===id)return;
  following.current=id;rememberJob(id);submitting.current=true;setRun({phase:'running',progress:null});stop.current();
  stop.current=watchJob(id,event=>{
   if(!alive.current||following.current!==id)return;
   if(event.type==='progress'){if(event.reset){setRun({phase:'running',progress:null});return;}const progress=progressOf(event.data);if(progress)setRun({phase:'running',progress});return;}
   following.current=null;submitting.current=false;rememberJob();
   if(event.type==='done'){
    setRun({phase:'idle'});setRecord(event.data as PublishRecord);
    void loadRecord().catch(()=>{});
    void clubFetch<Video>(`/videos/${encodeURIComponent(video.id)}`).then(next=>{if(alive.current){onVideo(next);notifyVideosChanged();}},()=>{});
   }else{
    const message=event.type==='failed'?failureMessage(event.data):'That was stopped.';
    void clubFetch<PublishRecord|null>(`/videos/${encodeURIComponent(video.id)}/postiz`).then(now=>{
     if(!alive.current)return;
     if(now&&now.state!=='failed'){setRecord(now);setRun({phase:'idle'});}
     else setRun(was=>({phase:'failed',message,progress:was.phase==='idle'?null:was.progress}));
    },()=>{if(alive.current)setRun({phase:'failed',message,progress:null});});
   }
  });
 };
 followRef.current=follow;
 const submit=async()=>{
  if(submitting.current||run.phase==='running'||record===undefined)return;
  // Retry an uncertain read before offering another irreversible request.
  if(run.phase==='failed'&&run.message.startsWith("Couldn't check")){setRecord(undefined);try{await loadRecord();if(!following.current)setRun({phase:'idle'});}catch{setRecord(null);}return;}
  setTried(true);
  if(problem||!file||!kids){if(!kids){kidsField.current?.scrollIntoView?.({block:'center'});kidsField.current?.querySelector('input')?.focus();}return;}
  submitting.current=true;setRun({phase:'running',progress:null});
  try{
   const started=await clubFetch<{id:string}>(`/videos/${encodeURIComponent(video.id)}/postiz`,{body:{exportId:file.id,title:title.trim(),description,tags,visibility,madeForKids:kids==='yes',...(schedule&&'iso' in schedule?{scheduledFor:schedule.iso}:{})}});
   rememberJob(started.id);if(alive.current)follow(started.id);
  }catch(reason){submitting.current=false;if(alive.current)setRun({phase:'failed',message:errorMessage(reason),progress:null});}
 };

 const scheduledDate=schedule&&'date' in schedule?schedule.date:null;
 // Scenes without a kept take are not on the timeline, so not in the exported video: said before it goes out.
 const unrecorded=scenes?unrecordedWarning(scenes.length,recordedCount(scenes)):null;
 const reveal=file?.outputPath&&window.sceneForge?.reveal?()=>void window.sceneForge!.reveal(file.outputPath!).catch(()=>{}):undefined;
 const player=<ExportedVideo file={file} stale={stale} poster={thumbnail} note={unrecorded} onEdit={()=>onGoTo('edit')}/>;
 const summary=<PackageSummary video={video} thumbnailText={pkg?.thumbnailText} thumbnailUrl={thumbnail} player={player} channel={publishing.state?.postiz.channel?.name} visibility={visibility} when={scheduledDate} title={title} description={description} tags={tags}
  menu={reveal&&<Menu label="More" restoreFocus align="right" items={[{label:'Show the video file in Finder',fn:reveal}]}
   button={(toggle,open)=><IconButton icon="more" label="More" aria-haspopup="menu" aria-expanded={open} onClick={toggle}/>}/>}/>;
 // Green "on YouTube" only when the video really is Published. Postiz saying so is not enough until it has moved.
 const result:{info:ResultInfo}|null=published?{info:{state:'published',visibility:record?.visibility??'public',url:video.youtubeUrl,postizUrl:record?.postizUrl}}
  :record&&record.state!=='failed'?{info:{...record,state:record.state==='published'?'queued':record.state}}:null;
 const footerReason=!exported?(stale?'Export the latest edit first':'Export the video first'):problem;
 const publishAction=record!==undefined&&run.phase==='idle'&&!result?(postizReady?<>
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

 const thumbField=<div className="full"><div className="field">Thumbnail</div>
  <div className="pub-thumb-row">
   {studio?<button type="button" className="pub-thumb" onClick={()=>setMaking(true)} aria-label={thumbnail?'Change the thumbnail':'Make the thumbnail'}>
    {thumbnail?<img src={thumbnail} alt=""/>:<span><Icon name="image" size={18}/>Add a thumbnail</span>}</button>
    :<label className="pub-thumb">{thumbnail?<img src={thumbnail} alt=""/>:<span><Icon name="image" size={18}/>Add a thumbnail</span>}
     <input type="file" className="sr-only" accept="image/png,image/jpeg" onChange={event=>{void pick(event.target.files?.[0]);event.target.value='';}}/></label>}
   <p className="pub-line pub-note">{thumbnail?<>Shown before the video plays. <button type="button" className="linkish" onClick={dropThumbnail}>Remove</button></>:'Without one, YouTube picks a frame.'}</p>
  </div>
  {thumbError&&<p role="alert" className="small pz-err">{thumbError}</p>}
  {studio&&making&&<ThumbnailDialog video={video} {...studio} picture={thumbnail} onPicture={showThumbnail} onClose={()=>setMaking(false)}/>}</div>;

 return <div className="pubx ws-publish">{head}{footerAction}
  <div className="pubx-grid"><div className="pub-sections">
   <div className="pubx-form" inert={writingPackage}>
    <div className="full"><label className="field" htmlFor="pub-title">Title</label><Input id="pub-title" maxLength={TITLE_MAX} value={title} onChange={event=>setTitle(event.target.value)}/></div>
    <div className="full"><label className="field" htmlFor="pub-desc">Description</label><Textarea id="pub-desc" rows={5} maxLength={DESCRIPTION_MAX} placeholder="What the viewer gets, then chapters." value={description}
     onChange={event=>setEdited(event.target.value)} onBlur={()=>{if(edited!==undefined&&edited!==pkg?.description)onDescription(edited);}}/>
     {saveError&&<ErrorLine message="Couldn't save the description." onRetry={onRetry}/>}</div>
    <div className="full"><label className="field" htmlFor="pub-tags">Tags</label><TagsField tags={tags} onChange={onTags}/></div>
    {thumbField}
    <div className="pub-pair"><label className="field" htmlFor="pub-vis">Who can watch</label><Menu label="Who can watch" restoreFocus below items={VISIBILITY_OPTIONS.map(option=>({label:option.label,check:visibility===option.value,fn:()=>setChosen(option.value)}))} button={(toggle,open)=><button id="pub-vis" type="button" className="select ws-visibility" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>{VISIBILITY_OPTIONS.find(option=>option.value===visibility)?.label}<Icon name="expand" size={14}/></button>}/></div>
    <div className={`pub-pair ${tried&&!kids?'has-err':''}`}><div className="field" id="pub-kids-l">Made for kids?</div>
     <div className="radios ws-kids-segment" role="radiogroup" aria-labelledby="pub-kids-l" aria-describedby="pub-kids-h" ref={kidsField}>{(['no','yes'] as const).map(value=><label key={value} className={`rad ${kids===value?'is-selected':''}`}><input type="radio" name="kids" value={value} checked={kids===value} onChange={()=>setKids(value)}/>{kids===value&&<Icon name="check" size={13}/>}{value==='no'?'No':'Yes'}</label>)}</div>
     <div className="field-hint" id="pub-kids-h">Required by YouTube</div>
     {tried&&!kids&&<p role="alert" className="small pz-err">Choose one, because YouTube won't accept the video without it.</p>}</div>
    {postizReady&&<>
     <div className="pub-pair"><label className="field" htmlFor="pub-when">When</label><select id="pub-when" className="select" value={when} onChange={event=>setWhen(event.target.value as 'now'|'schedule')}><option value="now">Publish now</option><option value="schedule">Schedule for later</option></select></div>
     {when==='schedule'&&<div className="pub-pair"><label className="field" htmlFor="pub-at">Date and time</label><Input id="pub-at" type="datetime-local" value={at} aria-invalid={schedule&&'message' in schedule?true:undefined} onChange={event=>setAt(event.target.value)}/></div>}
    </>}
   </div>
   {/* How it gets to YouTube: one quiet line under the form, the link field once you upload it yourself. */}
   <div className="pub-way" ref={uploadSection}>
    {publishing.error?<ErrorLine message={publishing.error} onRetry={publishing.reload}/>:!publishing.state?<p className="pub-line" role="status"><Spinner label="Loading publishing settings"/>Loading publishing settings…</p>
     :<p className="pub-line pub-note">{postizReady?<>Goes to {publishing.state.postiz.channel?.name} with Postiz. <button type="button" className="linkish" onClick={onSettings}>Change</button></>
      :<>{copyStatus||'Copy the details, upload on YouTube, then add the link here.'} <button type="button" className="linkish" onClick={onSettings}>Publish from here instead</button></>}
      {!selfUpload&&<> · <button type="button" className="linkish" onClick={()=>setSelfUpload(true)}>Add the YouTube link</button></>}</p>}
    {selfUpload&&<SelfUpload video={video} onVideo={onVideo} open formId={linkFormId} onSubmitReady={setLinkReady}/>}
   </div>
  </div>{summary}</div>
 </div>;
}

/** The exported video as viewers will watch it, with the thumbnail before it plays; or where it will be once it is exported. */
function ExportedVideo({file,stale,poster,note,onEdit}:{file:ExportRecord|null|undefined;stale:boolean;poster:string|null;note:string|null;onEdit():void}){
 return <>
  {file===undefined?<div className="pub-player is-empty" role="status"><Spinner label="Looking for the exported video"/></div>
   :file?<video className="pub-player" src={`/api/exports/${encodeURIComponent(file.id)}/video`} poster={poster??undefined} controls preload="metadata" aria-label="The exported video"/>
   :<div className="pub-player is-empty"><Icon name="film" size={20}/><span>Your video shows here once it's exported.</span><button type="button" className="linkish" onClick={onEdit}>Export it in Edit</button></div>}
  {file&&stale&&<p className="pub-line pub-note" role="status">You changed the edit after this export. <button type="button" className="linkish" onClick={onEdit}>Export it again</button></p>}
  {note&&<p className="pub-line pub-note" role="status">{note}</p>}
 </>;
}
