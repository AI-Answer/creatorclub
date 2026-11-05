import {BrandLogo} from '../../BrandLogo';
import {useRef,useState} from 'react';
import type {PublishingState,PublishVisibility} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {PostizSetup} from '../publishing/PostizSetup';
import {VISIBILITY_OPTIONS} from '../publishing/publish-logic';
import {Card,Select,Spinner} from '../ui';


/** Where videos go (Postiz and the YouTube channel), who can watch a new video, and light or dark. */
export function PublishingSection({publishing,error,onReload,onPublishing}:{publishing:PublishingState|null;error:string;onReload():void;onPublishing(next:PublishingState):void}){
 const [problem,setProblem]=useState('');
 const retry=useRef<()=>void>(()=>{});
 const chooseVisibility=(next:PublishVisibility)=>{
  setProblem('');
  clubFetch<PublishingState>('/publishing',{method:'PUT',body:{defaultVisibility:next}}).then(onPublishing,reason=>{retry.current=()=>chooseVisibility(next);setProblem(errorMessage(reason,"Couldn't save that choice."));});
 };
 return <section className="set-group" id="set-publishing" aria-labelledby="set-publishing-title"><h2 id="set-publishing-title">Publishing</h2><p>Choose where your videos go and who can watch them.</p>
  <Card>
   <div className="srow2" style={{alignItems:'flex-start'}}>
    <span className="logo logo-postiz"><BrandLogo brand="postiz" size={28}/></span>
    <div className="grow" style={{minWidth:0}}><div className="st">Postiz</div><div className="sd" style={{marginBottom:10}}>Publishes to your connected YouTube channel, now or on a schedule.</div>
     {error?<ErrorLine message={error} onRetry={onReload}/>:publishing?<PostizSetup state={publishing} onState={onPublishing}/>:<div className="row small muted" role="status"><Spinner label="Loading publishing settings"/>Loading publishing settings…</div>}
    </div>
   </div>
   <div className="srow2"><div className="grow"><div className="st"><label htmlFor="set-vis">Who can watch new videos</label></div></div>
    <div className="sv"><Select id="set-vis" label="Who can watch new videos" value={publishing?.defaultVisibility??'public'} disabled={!publishing} onChange={chooseVisibility} options={VISIBILITY_OPTIONS}/></div></div>

  </Card>
  {problem&&<div style={{marginTop:12}}><ErrorLine message={problem} onRetry={()=>retry.current()}/></div>}
 </section>;
}
