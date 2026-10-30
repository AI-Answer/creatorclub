import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {Package,PublishProgress,PublishRecord,PublishVisibility,Video,VideoScene} from '../../../shared/club';
import type {ExportRecord} from '../../../shared/export-history';
import type {Project} from '../../../shared/types';
import {api,listSavedExports,projectRevision} from '../../api';
import {ClubExport} from '../recorder/ClubExport';
import {clubFetch,clubUpload,errorMessage,notifyVideosChanged} from '../api';
import {ErrorLine} from '../ErrorLine';
import {watchJob,failureMessage} from '../jobs';
import {TITLE_MAX,VISIBILITY_OPTIONS,unrecordedWarning,defaultSchedule,progressOf,publishProblem,scheduleTime,whenText,type ResultInfo} from '../publishing/publish-logic';
import {usePublishing} from '../publishing/usePublishing';
import {exportFileName,latestVideoExport} from '../recorder/edit-steps';
import {clockTime} from '../video-plan';
import {Button,Card,EmptyState,Icon,Input,Spinner,Textarea} from '../ui';
import {PackageSummary,PasteLinkForm,ProgressCard,ResultCard,SELF_UPLOAD_LINE,SelfUpload,TagsField} from './PublishParts';
import {buildDescription} from './record-logic';
import {recordedCount} from '../scene-status';

export const PUBLISH_LINE='Postiz uploads it to YouTube at the time you pick, even if your laptop is closed.';
/** What the server keeps of a description. */
export const DESCRIPTION_MAX=5000;
/** While Postiz is still sending a video to YouTube, the page asks it again this often. */
const RECHECK_MS=15000;

type Run={phase:'idle'}|{phase:'running';progress:PublishProgress|null}|{phase:'failed';message:string;progress:PublishProgress|null};

/**
 * The Publish step. The exported video, the package as YouTube will show it, Postiz connected once, and the form YouTube asks for
 * (title, description, tags, thumbnail, who can watch, made for kids, now or later). One button sends it; progress and the result follow.
 */
export function Publish({video,pkg,scenes,onVideo,onDescription,onTags,onGoTo,onSettings,saveError,onRetry}:{video:Video;pkg:Package|null;scenes:readonly VideoScene[]|undefined;onVideo(video:Video):void;onDescription(text:string):void;/** Saves the tags on the package at once, like the description. */onTags(tags:string[]):void;onGoTo(tab:'plan'|'record'|'edit'):void;/** Opens Settings at Publishing, where the Postiz key is entered once. */onSettings():void;saveError?:string;onRetry():void}){
 const publishing=usePublishing();
 const published=video.stage==='published'&&Boolean(video.youtubeUrl);

 // ---- the exported video
 const [file,setFile]=useState<ExportRecord|null|undefined>(undefined),[reread,setReread]=useState(0);
 useEffect(()=>{
  if(!video.recorderProjectId){setFile(null);return;}
  const request=new AbortController();
  void listSavedExports(video.recorderProjectId,request.signal).then(({jobs})=>setFile(latestVideoExport(jobs)??null)).catch(()=>{if(!request.signal.aborted)setFile(null);});
  return()=>request.abort();
 },[video.recorderProjectId,reread]);
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
 useEffect(()=>{if(!waiting)return;const timer=setInterval(()=>void loadRecord().catch(()=>{}),RECHECK_MS);return()=>clearInterval(timer);},[waiting,loadRecord]);

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

 if(!published&&scenes&&!scenes.some(scene=>scene.takes.length))return <div className="page"><div className="card"><EmptyState icon={<Icon name="upload"/>} title="Nothing to publish yet"
  description={scenes.length?`Publishing starts once the scenes are recorded and edited. This video has ${scenes.length} ${scenes.length===1?'scene':'scenes'} waiting to be recorded.`:'Publishing starts once the scenes are recorded and edited. Draft the scenes first.'}
  action={<Button variant="primary" size="md" onClick={()=>onGoTo(scenes.length?'record':'plan')}><Icon name={scenes.length?'microphone':'scenes'} size={15}/>{scenes.length?'Open record':'Open plan'}</Button>}/></div></div>;

 const scheduledDate=schedule&&'date' in schedule?schedule.date:null;
 // Scenes without a kept take are not on the timeline, so not in the exported video: said before it goes out.
 const unrecorded=scenes?unrecordedWarning(scenes.length,recordedCount(scenes)):null;
 const summary=<PackageSummary video={video} thumbnailText={pkg?.thumbnailText} thumbnailUrl={thumbnail} channel={publishing.state?.postiz.channel?.name} visibility={visibility} when={scheduledDate} title={title} description={description} tags={tags}/>;
 // Green "on YouTube" only when the video really is Published. Postiz saying so is not enough until it has moved.
 const result:{info:ResultInfo}|null=published?{info:{state:'published',visibility:record?.visibility??'public',url:video.youtubeUrl,postizUrl:record?.postizUrl}}
  :record&&record.state!=='failed'?{info:{...record,state:record.state==='published'?'queued':record.state}}:null;
 const head=<><div className="doc-h"><h2>Publish</h2></div><div className="doc-sub">{PUBLISH_LINE}</div></>;

 if(run.phase!=='idle')return <div className="pubx">{head}<div className="pubx-grid"><div>
  <ProgressCard progress={run.progress} failure={run.phase==='failed'?run.message:undefined} scheduled={Boolean(schedule&&'iso' in schedule)} onRetry={()=>void submit()}/>
  {run.phase==='failed'&&<p className="small"><button type="button" className="linkish" onClick={()=>setRun({phase:'idle'})}>Edit details</button></p>}
 </div>{summary}</div></div>;

 if(result)return <div className="pubx">{head}<div className="pubx-grid"><div>
  <ResultCard record={result.info} video={video} onCheck={record&&waiting?()=>loadRecord().catch(()=>{}):undefined}
   onForget={record?.state==='queued'?async()=>{setRecord(await clubFetch<PublishRecord>(`/videos/${encodeURIComponent(video.id)}/postiz/forget`,{body:{}}));}:undefined}>
   {published?<PasteLinkForm video={video} published onVideo={onVideo}/>
    // Postiz says it is published but no usable YouTube link came back: the way out is open and says so plainly.
    :record?.state==='published'?<SelfUpload open video={video} onVideo={onVideo} line={`Postiz says it's published, but the YouTube link didn't come back. ${SELF_UPLOAD_LINE}`}/>
    :record?.unconfirmed?<SelfUpload video={video} onVideo={onVideo}/>:null}
  </ResultCard></div>{summary}</div></div>;

 const exportLine=file===undefined?<Spinner label="Looking for the exported video"/>:file
  ?<div className="row"><span className="club-export-done"><Icon name="check" size={15}/>Video exported</span><span className="faint small">{exportFileName(file)}</span>
   {stale&&project&&<><span className="small pubx-warn">You edited it after this export.</span><ClubExport quiet project={project} flush={async()=>project} onExported={now=>{if(now)setReread(n=>n+1);}}/></>}
   {!stale&&file.outputPath&&window.sceneForge?.reveal&&<button type="button" className="linkish" onClick={()=>void window.sceneForge!.reveal(file.outputPath!).catch(()=>{})}>Show in Finder</button>}</div>
  :project?<div className="row"><ClubExport project={project} flush={async()=>project} onExported={now=>{if(now)setReread(n=>n+1);}}/><span className="small muted">Publishing sends the exported video.</span></div>
   :<span className="small muted">No exported video yet. <button type="button" className="linkish" onClick={()=>onGoTo('edit')}>Export it in Edit</button></span>;

 return <div className="pubx">{head}
  <div className="pubx-grid"><div>
   <div className="pubx-export">{exportLine}</div>
   {unrecorded&&<p className="small pubx-warn" role="status">{unrecorded}</p>}
   <Card className="pubx-route">
    {publishing.error?<ErrorLine message={publishing.error} onRetry={publishing.reload}/>:!publishing.state?<Spinner label="Loading"/>
     :publishing.state.postiz.connected
      ?<div className="rh"><span className="logo logo-postiz">P</span><div><div className="rt"><b>Postiz connected.</b>{publishing.state.postiz.channel&&<> Posts to {publishing.state.postiz.channel.name} on YouTube.</>}</div><div className="rd">Uploads it for you, now or at the time you pick.</div></div><button type="button" className="linkish" style={{marginLeft:'auto'}} onClick={onSettings}>Change in Settings</button></div>
      :<div className="rh"><span className="logo logo-postiz">P</span><div><div className="rt">Publishing isn't set up yet</div><div className="rd">Connect Postiz once in Settings. Your video and details are kept, and you can finish them first.</div></div><Button size="sm" style={{marginLeft:'auto'}} onClick={onSettings}>Set up publishing</Button></div>}
   </Card>
   <Card className="pubx-form">
    <div className="full"><label className="field" htmlFor="pub-title">Title</label><Input id="pub-title" maxLength={TITLE_MAX} value={title} onChange={event=>setTitle(event.target.value)}/></div>
    <div className="full"><label className="field" htmlFor="pub-desc">Description</label><Textarea id="pub-desc" rows={5} maxLength={DESCRIPTION_MAX} placeholder="What the viewer gets, then chapters." value={description}
     onChange={event=>setEdited(event.target.value)} onBlur={()=>{if(edited!==undefined&&edited!==pkg?.description)onDescription(edited);}}/>
     {saveError&&<ErrorLine message="Couldn't save the description." onRetry={onRetry}/>}</div>
    <div className="full"><label className="field" htmlFor="pub-tags">Tags</label><TagsField tags={tags} onChange={onTags}/></div>
    <div className="full"><div className="field">Thumbnail</div><div className="small muted">{thumbnail?'Your own image. ':'YouTube picks a frame unless you add one. '}
     <label className="linkish" style={{cursor:'pointer'}}>{thumbnail?'Use another image':'Upload an image'}<input type="file" className="sr-only" accept="image/png,image/jpeg" onChange={event=>{void pick(event.target.files?.[0]);event.target.value='';}}/></label>
     {thumbnail&&<> <button type="button" className="linkish" onClick={dropThumbnail}>Remove image</button></>}</div>
     {thumbError&&<p role="alert" className="small pz-err">{thumbError}</p>}</div>
    <div className="pub-pair"><label className="field" htmlFor="pub-vis">Who can watch</label><select id="pub-vis" className="select" value={visibility} onChange={event=>setChosen(event.target.value as PublishVisibility)}>{VISIBILITY_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    <div className={`pub-pair ${tried&&!kids?'has-err':''}`}><div className="field" id="pub-kids-l">Made for kids?</div><div className="field-hint" id="pub-kids-h">Required by YouTube</div>
     <div className="radios" role="radiogroup" aria-labelledby="pub-kids-l" aria-describedby="pub-kids-h" ref={kidsField}>{(['no','yes'] as const).map(value=><label key={value} className="rad"><input type="radio" name="kids" value={value} checked={kids===value} onChange={()=>setKids(value)}/>{value==='no'?'No':'Yes'}</label>)}</div>
     {tried&&!kids&&<p role="alert" className="small pz-err">Choose one, because YouTube won't accept the video without it.</p>}</div>
    <div><label className="field" htmlFor="pub-when">When</label><select id="pub-when" className="select" value={when} onChange={event=>setWhen(event.target.value as 'now'|'schedule')}><option value="now">Publish now</option><option value="schedule">Schedule for later</option></select></div>
    {when==='schedule'&&<div><label className="field" htmlFor="pub-at">Date and time</label><Input id="pub-at" type="datetime-local" value={at} aria-invalid={schedule&&'message' in schedule?true:undefined} onChange={event=>setAt(event.target.value)}/></div>}
   </Card>
   <div className="pubx-foot">
    <div className="fi">{problem?<span className="pubx-warn" id="pub-why" role="status">{problem}</span>:<span>The exported video goes to Postiz, then to YouTube.</span>}</div>
    {/* One primary per view: until there is an export, Export video is the primary and this waits. It cannot be pressed while something stands in the way, and the reason sits beside it. */}
    <Button variant={exported?'primary':'secondary'} size="md" disabled={Boolean(problem)} aria-describedby={problem?'pub-why':undefined} onClick={()=>void submit()}><Icon name={when==='now'?'upload':'calendar'} size={15}/>{when==='now'?'Publish now':`Schedule for ${scheduledDate?whenText(scheduledDate):'later'}`}</Button>
   </div>
   {publishing.state&&!postizReady&&<div className="pubx-alt"><SelfUpload video={video} onVideo={onVideo}/></div>}
  </div>{summary}</div>
 </div>;
}
