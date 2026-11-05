import {useState} from 'react';
import type {OnePager as OnePagerData,PackageUseResult,ResearchTile,Video} from '../../../shared/club';
import {BrandLogo} from '../../BrandLogo';
import {AI_CONNECT_HINT,useAiAvailable} from '../ai-status';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {useAi} from '../useAi';
import type {Plan} from '../usePlan';
import {Button,Ed,Icon,Spinner,useToast} from '../ui';
import {addFromText} from '../workspace/Board';
import {emptyOnePager,onepagerMarkdown} from './onepager';

/** A slide-sized sketch of the idea, kept editable even before an AI is connected. */
export function OnePager({video,plan,onTitle,onBoardChanged}:{video:Video;plan:Plan;onTitle(title:string):void;onBoardChanged():void}){
 const ai=useAi(),available=useAiAvailable(),toast=useToast();
 const [adding,setAdding]=useState(false),[using,setUsing]=useState(false);
 const value=plan.onepager??emptyOnePager(),edit=(next:OnePagerData)=>plan.editOnepager(next);
 const save=plan.flushOnepager,state=plan.onepagerJob,running=state.phase==='running',notice=plan.notices.onepager;
 const hasContent=!![value.title,value.backupTitle,value.logline,...Object.values(value.thumbnail),...value.skeleton.map(beat=>beat.line),...value.whys].some(text=>text?.trim());
 const beatHints=['Show the promise and give viewers a reason to stay.','Explain what started the story.','Show the method in a few clear steps.','Reveal what changes the story.','Give viewers one thing they can try.','Pay off the promise and close the story.'];
 const [editingSketch,setEditingSketch]=useState(false);
 const sketchEmpty=!value.thumbnail.headline.trim()&&!value.thumbnail.visual.trim()&&!value.thumbnail.closer.trim();
 const thumbnail=(key:keyof OnePagerData['thumbnail'],text:string)=>edit({...value,thumbnail:{...value.thumbnail,[key]:text}});
 const copy=async()=>{try{await navigator.clipboard.writeText(onepagerMarkdown(value));toast('Copied the one-pager.');}catch{toast("Couldn't copy the one-pager.");}};
 const add=async()=>{
  setAdding(true);
  try{await addFromText(body=>clubFetch<ResearchTile>(`/videos/${encodeURIComponent(video.id)}/research`,{body}),onepagerMarkdown(value));onBoardChanged();toast('Added to the board.');}
  catch(reason){toast(errorMessage(reason,"Couldn't add the one-pager to the board."));}
  finally{setAdding(false);}
 };
 const useTitle=async(text:string)=>{
  setUsing(true);
  try{await plan.flush();await clubFetch<PackageUseResult>(`/videos/${encodeURIComponent(video.id)}/package/text`,{body:{kind:'title',text}});onTitle(text.trim());await plan.refresh();}
  catch(reason){toast(errorMessage(reason,"Couldn't use that title."));}
  finally{setUsing(false);}
 };
 return <section className="doc-part onepager" aria-label="One-pager">
  <div className="row onepager-heading">
   <h3 className="doc-part-h">One-pager</h3>
   {plan.onepagerSave==='error'?<span className="idea-save bad" role="alert">Couldn't save · <button type="button" className="linkish" onClick={plan.retrySave}>Try again</button></span>:plan.onepagerSave!=='idle'&&<span className="idea-save" role="status">{plan.onepagerSave==='saving'?'Saving…':'Saved'}</span>}
   <span className="grow"/>
   {hasContent&&<><Button size="sm" variant="ghost" disabled={adding} onClick={()=>void add()}><Icon name="add" size={14}/>{adding?'Adding…':'Add to board'}</Button>
   <Button size="sm" variant="ghost" onClick={()=>void copy()}><Icon name="copy" size={14}/>Copy</Button></>}
   <Button size="sm" variant={hasContent?"secondary":"primary"} disabled={!available||running} title={!available?AI_CONNECT_HINT:`Write with ${ai.name}`} onClick={plan.writeOnepager}><BrandLogo brand={ai.brand} size={14}/>{hasContent?'Rewrite':'Write one-pager'}</Button>
  </div>
  {!available&&<p className="idea-hint">{AI_CONNECT_HINT} You can fill in the one-pager yourself.</p>}
  {running&&<div className="idea-line" role="status"><Spinner size={14} label="Writing the one-pager"/><span className="grow">{state.line??`Writing with ${ai.name}…`}</span><Button size="sm" variant="ghost" onClick={()=>plan.stop('onepager')}>Stop</Button></div>}
  {state.phase==='failed'&&<ErrorLine message={state.message} onRetry={plan.writeOnepager}/>}
  {notice&&<p className="idea-line small muted" role="status">{notice.type==='replaced'?'Replaced the one-pager':'New one-pager ready'} · <button type="button" className="linkish" onClick={()=>void plan.resolveNotice('onepager')}>{notice.type==='replaced'?'Undo':'Use it'}</button></p>}
  <div className="onepager-slide">
   <div className="onepager-titles">
    <h4>Title</h4>
    {(['title','backupTitle'] as const).map(key=><div className={`onepager-title-row ${key==='title'?'lead':'backup'}`} key={key}>
     {key==='backupTitle'&&<span className="onepager-backup-label">Backup</span>}
     <Ed live value={value[key]} className="grow" label={key==='title'?'One-pager title':'One-pager backup title'} ph={key==='title'?'Your strongest title':'A second direction to try'} onChange={text=>edit({...value,[key]:text})} onLeave={save}/>
     {value[key].trim()&&(value[key].trim()===video.title.trim()?<span className="onepager-in-use"><Icon name="check" size={13}/>Current title</span>:<Button variant="ghost" size="sm" disabled={using} onClick={()=>void useTitle(value[key])}>Use as video title</Button>)}
    </div>)}
   </div>
   <div className="onepager-left">
   <div className="onepager-sketch" aria-label="Thumbnail sketch">
    <h4>Thumbnail sketch</h4>
    <div className={`onepager-sketch-box${sketchEmpty&&!editingSketch?' empty':''}`}>
    {sketchEmpty&&!editingSketch?<button type="button" className="onepager-sketch-empty" onClick={()=>setEditingSketch(true)}>Add a headline, the picture, and a closing line</button>:<>
    <Ed autoFocus={editingSketch} live value={value.thumbnail.headline} label="Thumbnail headline" ph="A short headline" onChange={text=>thumbnail('headline',text)} onLeave={save}/>
    <Ed multiline live value={value.thumbnail.visual} label="Thumbnail visual" ph="Describe the picture and where everything sits" onChange={text=>thumbnail('visual',text)} onLeave={save}/>
    <Ed live value={value.thumbnail.closer} label="Thumbnail closer" ph="A short closing line" onChange={text=>thumbnail('closer',text)} onLeave={save}/>
    </>}
    </div>
    <Ed live value={value.thumbnail.template} label="Thumbnail layout" ph="Thumbnail reference (optional)" onChange={text=>thumbnail('template',text)} onLeave={save}/>
   </div>
   <div className="onepager-whys"><h4>Three reasons to make it</h4>{value.whys.map((why,index)=><div key={index} className="onepager-why"><b>{index+1}. </b><Ed multiline live value={why} label={`Why ${index+1}`} ph={index===0?'Your own related video and its real numbers':index===1?"Another channel's video and its real numbers":'Who clicks, why the twist matters, and what they can try'} onChange={text=>edit({...value,whys:value.whys.map((one,at)=>at===index?text:one) as OnePagerData['whys']})} onLeave={save}/></div>)}</div>
   </div>
   <div className="onepager-right">
   <div className="onepager-logline"><h4>Logline</h4><Ed multiline live value={value.logline} label="One-pager logline" ph="The whole video in one sentence, including the twist" onChange={logline=>edit({...value,logline})} onLeave={save}/></div>
   <div className="onepager-skeleton">
    <h4>Skeleton</h4>
    {value.skeleton.map((beat,index)=><div className="onepager-beat" key={index}>
     <b><Ed live tag="span" value={beat.label} label={`Beat ${index+1} label`} ph="Label" onChange={label=>edit({...value,skeleton:value.skeleton.map((one,at)=>at===index?{...one,label}:one)})} onLeave={save}/>: </b>
     <Ed multiline live tag="span" value={beat.line} label={`Beat ${index+1} sentence`} ph={beatHints[index]??"Describe this beat in one sentence."} onChange={line=>edit({...value,skeleton:value.skeleton.map((one,at)=>at===index?{...one,line}:one)})} onLeave={save}/>
     {value.skeleton.length>6&&<button type="button" className="linkish small" aria-label={`Remove beat ${index+1}`} onClick={()=>edit({...value,skeleton:value.skeleton.filter((_,at)=>at!==index)})}>Remove</button>}
    </div>)}
    {value.skeleton.length<10&&<button type="button" className="btn ghost sm" onClick={()=>edit({...value,skeleton:[...value.skeleton,{label:'',line:''}]})}><Icon name="add" size={14}/>Add a line</button>}
   </div>
   </div>
   <div className="onepager-flags"><h4>Before recording</h4><Ed multiline live value={value.flags?.join('\n')} label="One-pager flags" ph="Anything to check before making this video (one per line)" onChange={text=>edit({...value,flags:text.split('\n')})} onLeave={save}/></div>
  </div>
 </section>;
}
