import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {ResearchTile,Video} from '../../../shared/club';
import {HIGGSFIELD_MODELS,thumbnailImageUrl,thumbnailPrompt,type HiggsfieldModel,type ThumbnailSketch,type HiggsfieldStatus,type SoulId,type ThumbnailCandidate,type ThumbnailReference,type ThumbnailRequest} from '../../../shared/higgsfield';
import {clubFetch,clubUpload,errorMessage,notifyVideosChanged} from '../api';
import {youtubeId} from '../board';
import {failureMessage,progressLine,watchJob,type StartedJob} from '../jobs';
import {Button,Input,Spinner} from '../ui';
import './thumbnail-studio.css';

export function ThumbnailStudio({video,thumbnailText,cards,brief,children}:{video:Video;thumbnailText:string;cards?:readonly ResearchTile[];brief?:ThumbnailSketch;children?:ReactNode}){
 const initial=thumbnailPrompt(video.title,thumbnailText,brief);
 const [prompt,setPrompt]=useState(initial),[model,setModel]=useState<HiggsfieldModel>('nano_banana_pro'),[count,setCount]=useState(1);
 const [status,setStatus]=useState<HiggsfieldStatus>(),[souls,setSouls]=useState<SoulId[]>([]),[soul,setSoul]=useState('');
 const [items,setItems]=useState<ThumbnailCandidate[]>([]),[refs,setRefs]=useState<ThumbnailReference[]>([]),[upload,setUpload]=useState<{path:string;name:string}>();
 const [parent,setParent]=useState<ThumbnailCandidate>(),[change,setChange]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[line,setLine]=useState('');
 const [cost,setCost]=useState<{key:string;credits:number}>(),[costError,setCostError]=useState(''),[costRetry,setCostRetry]=useState(0),[chosen,setChosen]=useState(0),[pending,setPending]=useState(count);
 const stopWatch=useRef<()=>void>(()=>{}),jobId=useRef<string|undefined>(undefined),alive=useRef(true),previousPrompt=useRef(initial);
 const base=`/videos/${encodeURIComponent(video.id)}`,storageKey=`cc.higgsfield.${video.id}`;
 const effectivePrompt=parent?`${prompt}\nMake a variation of the reference image. Change: ${change.trim()}`:prompt;
 const request:ThumbnailRequest={prompt:effectivePrompt,model,count,references:refs,...(soul&&model==='text2image_soul_v2'?{soulId:soul}:{}),...(parent?{parentId:parent.id}:{})};
 const key=JSON.stringify(request),limit=HIGGSFIELD_MODELS.find(m=>m.id===model)!.references;
 const refresh=()=>clubFetch<ThumbnailCandidate[]>(`${base}/thumbnails`).then(next=>{if(alive.current)setItems(next);});
 const check=()=>clubFetch<HiggsfieldStatus>('/higgsfield/status').then(next=>{if(!alive.current)return;setStatus(next);if(next.signedIn)void clubFetch<SoulId[]>('/higgsfield/soul-ids').then(next=>{if(alive.current)setSouls(next);},()=>{});},reason=>{if(alive.current)setError(errorMessage(reason));});
 const remember=(id?:string)=>{try{if(id)localStorage.setItem(storageKey,id);else localStorage.removeItem(storageKey);}catch{/* the job still runs */}};
 const follow=(id:string)=>{
  jobId.current=id;setBusy(true);remember(id);stopWatch.current();
  stopWatch.current=watchJob(id,event=>{
   if(!alive.current)return;
   if(event.type==='progress'){
    setLine(progressLine(event.data)??'Making thumbnails…');
    const data=event.data as {candidate?:ThumbnailCandidate;done?:number;total?:number}|null;
    if(data?.total!==undefined)setPending(Math.max(0,data.total-(data.done??0)));
    if(data?.candidate)setItems(now=>now.some(c=>c.id===data.candidate!.id)?now:[...now,data.candidate!]);
    return;
   }
   setBusy(false);setPending(0);jobId.current=undefined;remember();
   if(event.type==='failed')setError(failureMessage(event.data));
   else if(event.type==='cancelled')setLine('Stopped waiting; a submitted image may still finish in Higgsfield.');
   else setLine('Thumbnails saved.');
   void refresh().catch(()=>{});void check();
  });
 };
 useEffect(()=>{
  alive.current=true;void check();void refresh().catch(reason=>{if(alive.current)setError(errorMessage(reason));});
  try{const saved=localStorage.getItem(storageKey);if(saved)follow(saved);}catch{/* no saved job */}
  return()=>{alive.current=false;stopWatch.current();};
 // The component is keyed by video, so a job watcher never migrates to another video.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[video.id]);
 useEffect(()=>{const previous=previousPrompt.current;setPrompt(now=>now===previous?initial:now);previousPrompt.current=initial;},[initial]);
 useEffect(()=>{if(parent)document.getElementById(`ts-change-${video.id}`)?.focus();},[parent?.id,video.id]);
 useEffect(()=>{
  setCostError('');if(!status?.signedIn||!prompt.trim()||(parent&&!change.trim())||refs.length>limit)return;
  const abort=new AbortController();const timer=setTimeout(()=>{
   void clubFetch<{credits:number}>('/higgsfield/cost',{body:JSON.parse(key),signal:abort.signal}).then(result=>{if(!abort.signal.aborted)setCost({key,credits:result.credits});},reason=>{if(!abort.signal.aborted)setCostError(errorMessage(reason));});
  },450);return()=>{clearTimeout(timer);abort.abort();};
 },[key,status?.signedIn,costRetry]);
 const act=async(work:()=>Promise<unknown>)=>{setError('');try{await work();}catch(reason){if(alive.current)setError(errorMessage(reason));}};
 const generate=async()=>{
  if(busy||cost?.key!==key)return;
  setBusy(true);setPending(count);setError('');setLine('Starting Higgsfield…');
  try{const job=await clubFetch<StartedJob>(`${base}/thumbnails/generate`,{body:request});follow(job.id);}
  catch(reason){setBusy(false);setPending(0);setError(errorMessage(reason));}
 };
 const chooseModel=(next:HiggsfieldModel)=>{setModel(next);setRefs(now=>now.slice(0,HIGGSFIELD_MODELS.find(m=>m.id===next)!.references));if(next!=='text2image_soul_v2')setSoul('');};
 const toggle=(ref:ThumbnailReference,selected:boolean)=>setRefs(now=>selected?now.filter(r=>JSON.stringify(r)!==JSON.stringify(ref)):[...now,ref]);
 const referenceChoice=(label:string,ref:ThumbnailReference,image?:string)=>{
  const selected=refs.some(r=>JSON.stringify(r)===JSON.stringify(ref));
  return <label className="ts-reference" key={JSON.stringify(ref)}><input type="checkbox" checked={selected} disabled={busy||(!selected&&refs.length>=limit)} onChange={()=>toggle(ref,selected)}/>{image&&<img src={image} alt=""/>}<span>{label}</span></label>;
 };
 const uploadFile=async(file:File)=>{
  setUploading(true);setError('');
  try{const form=new FormData();form.append('file',file);const saved=await clubUpload<{path:string}>(`${base}/board/images`,form);setUpload({path:saved.path,name:file.name});setRefs(now=>[...now.slice(0,Math.max(0,limit-1)),{kind:'upload',path:saved.path}]);}
  catch(reason){setError(errorMessage(reason));}finally{setUploading(false);}
 };
 const variations=(item:ThumbnailCandidate)=>{chooseModel(item.model);if(item.params.custom_reference_id)setSoul(item.params.custom_reference_id);setParent(item);setRefs([{kind:'candidate',id:item.id}]);setPrompt(item.prompt);setChange('');document.getElementById(`ts-change-${video.id}`)?.focus();};
 return <div className="thumbnail-studio">
  <div key={chosen}>{children}</div>
  <details open={!status?.signedIn||items.length>0||busy}>
   <summary>Thumbnails <span className="small muted">with Higgsfield</span></summary>
   {!status?<p className="small muted">Checking Higgsfield…</p>:!status.signedIn?<p className="small muted">{status.hint} <button className="linkish" type="button" onClick={()=>void check()}>Check again</button></p>:<>
    <label className="ts-field">Prompt<textarea className="input" rows={5} value={prompt} disabled={busy} onChange={event=>setPrompt(event.target.value)}/></label>
    <div className="row ts-controls">
     <label>Model <select className="input" aria-label="Thumbnail model" value={model} disabled={busy} onChange={event=>chooseModel(event.target.value as HiggsfieldModel)}>{HIGGSFIELD_MODELS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
     <label>Images <select className="input" aria-label="Thumbnail count" value={count} disabled={busy} onChange={event=>setCount(Number(event.target.value))}>{[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></label>
     {souls.length>0&&<label className="row"><input type="checkbox" checked={!!soul} disabled={busy} onChange={event=>{if(event.target.checked){chooseModel('text2image_soul_v2');setSoul(souls[0].id);}else{setSoul('');chooseModel('nano_banana_pro');}}}/>Put me in it</label>}
     {soul&&souls.length>1&&<select className="input" aria-label="Your trained face" value={soul} disabled={busy} onChange={event=>setSoul(event.target.value)}>{souls.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}
    </div>
    <details className="ts-references"><summary>Reference images ({refs.length}/{limit})</summary>
     <p className="small muted">Selected images are uploaded to your Higgsfield account when you generate.</p>
     {referenceChoice('Current thumbnail',{kind:'current'})}
     {parent&&referenceChoice('Variation reference',{kind:'candidate',id:parent.id},thumbnailImageUrl(video.id,parent.id))}
     {cards?.filter(c=>c.kind==='image'||c.kind==='video').map(c=>referenceChoice(c.title??'Board image',{kind:'tile',id:c.id},c.file?`/api/club${base}/research/${encodeURIComponent(c.id)}/file`:c.meta.thumbnail??(c.kind==='image'?c.url:youtubeId(c.url)?`https://i.ytimg.com/vi/${youtubeId(c.url)}/maxresdefault.jpg`:undefined)))}
     {upload&&referenceChoice(upload.name,{kind:'upload',path:upload.path})}
     <label className="ts-field small">Upload a reference<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy||uploading} onChange={event=>{if(event.target.files?.[0])void uploadFile(event.target.files[0]);event.target.value='';}}/></label>
    </details>
    {parent&&<div className="ts-field"><label htmlFor={`ts-change-${video.id}`}>What should change?</label><Input id={`ts-change-${video.id}`} value={change} disabled={busy} onChange={event=>setChange(event.target.value)} placeholder="For example: make the background brighter"/><button type="button" className="linkish" disabled={busy} onClick={()=>{setParent(undefined);setRefs([]);setPrompt(initial);}}>Start a new thumbnail</button></div>}
    <div className="row ts-controls"><Button variant="primary" disabled={busy||uploading||!prompt.trim()||!!parent&&!change.trim()||cost?.key!==key||!!costError} onClick={()=>void generate()}>Generate</Button>
     <span className="small muted" role="status">{costError?costError:cost?.key===key?`About ${cost.credits.toLocaleString()} credits`:'Estimating credits…'}</span>
     {costError&&<button className="linkish" type="button" onClick={()=>setCostRetry(n=>n+1)}>Try estimate again</button>}
     {busy&&<Button size="sm" onClick={()=>void act(()=>clubFetch(`/jobs/${jobId.current}`,{method:'DELETE'}))} disabled={!jobId.current}>Stop</Button>}
    </div>
   </>}
   {line&&<p className="small muted" role="status">{busy&&<Spinner size={12} label="Making thumbnails"/>} {line}</p>}
   {error&&<p className="idea-error" role="alert">{error}</p>}
   <div className="ts-results">{items.map(item=><article className="ts-candidate" key={item.id}>
    <img className="ts-image" src={thumbnailImageUrl(video.id,item.id)} alt={item.prompt}/>
    <div className="row ts-actions"><Button size="sm" onClick={()=>void act(async()=>{await clubFetch(`${base}/thumbnails/${item.id}/use`,{body:{}});setChosen(n=>n+1);setLine('Thumbnail selected for this video.');notifyVideosChanged();})}>Use as thumbnail</Button>
     <Button size="sm" disabled={busy} onClick={()=>variations(item)}>Make variations</Button>
     <a className="linkish small" href={thumbnailImageUrl(video.id,item.id)} target="_blank" rel="noopener noreferrer">Open full size</a>
     <Button size="sm" onClick={()=>void act(async()=>{await clubFetch(`${base}/thumbnails/${item.id}/board`,{body:{}});setLine('Image added to the board.');})}>Add to board</Button>
     <Button size="sm" disabled={busy} onClick={()=>void act(async()=>{await clubFetch(`${base}/thumbnails/${item.id}`,{method:'DELETE'});if(parent?.id===item.id){setParent(undefined);setRefs([]);setPrompt(initial);}await refresh();})}>Remove</Button>
    </div>
    <div className="ts-feed" aria-label="YouTube feed preview">{[168,360].map(width=><div key={width} style={{width,maxWidth:'100%'}}><img src={thumbnailImageUrl(video.id,item.id)} alt={`Thumbnail at ${width} pixels wide`} style={{width:'100%',aspectRatio:'16/9',objectFit:'cover',borderRadius:'var(--cc-r-lg)'}}/><div className="ts-feed-title">{video.title}</div><div className="small muted">Your channel · {width} px preview</div></div>)}</div>
   </article>)}{busy&&Array.from({length:pending},(_,i)=><div className="ts-image shimmer" key={`pending-${i}`} role="status" aria-label="Making thumbnail"/>)}</div>
  </details>
 </div>;
}
