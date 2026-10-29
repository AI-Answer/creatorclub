import {useState} from 'react';
import type {ClubSettings,PublishingState,PublishVisibility} from '../../../shared/club';
import {getAppearance,setAppearance} from '../../appearance';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {PostizSetup} from '../publishing/PostizSetup';
import {VISIBILITY_OPTIONS} from '../publishing/publish-logic';
import {Card,Spinner} from '../ui';

const THEMES=[['light','Light'],['dark','Dark']] as const;
type Theme=typeof THEMES[number][0];

/** Where videos go (Postiz and the YouTube channel), who can watch a new video, and light or dark. */
export function PublishingSection({publishing,error,onReload,onPublishing,savedTheme}:{publishing:PublishingState|null;error:string;onReload():void;onPublishing(next:PublishingState):void;savedTheme:ClubSettings['appearance']}){
 const [theme,setTheme]=useState<Theme>(()=>savedTheme??(getAppearance()==='dark'?'dark':'light'));
 const [problem,setProblem]=useState('');
 const chooseTheme=(next:Theme)=>{
  setTheme(next);setAppearance(next);setProblem('');
  clubFetch('/settings',{method:'PUT',body:{appearance:next}}).catch(reason=>setProblem(errorMessage(reason,"Couldn't save that choice.")));
 };
 const chooseVisibility=(next:PublishVisibility)=>{
  setProblem('');
  clubFetch<PublishingState>('/publishing',{method:'PUT',body:{defaultVisibility:next}}).then(onPublishing,reason=>setProblem(errorMessage(reason,"Couldn't save that choice.")));
 };
 return <section className="set-group" id="set-publishing" aria-labelledby="set-publishing-title"><h2 id="set-publishing-title">Publishing and look</h2><p>Where videos go, and how CreatorClub looks. You can still change who can watch on each video.</p>
  <Card>
   <div className="srow2" style={{alignItems:'flex-start'}}>
    <span className="logo" style={{background:'#612bd3'}}>P</span>
    <div className="grow" style={{minWidth:0}}><div className="st">Postiz</div><div className="sd" style={{marginBottom:10}}>Uploads your videos to YouTube, now or at a time you pick. A paid service, from $29 a month.</div>
     {error?<ErrorLine message={error} onRetry={onReload}/>:publishing?<PostizSetup state={publishing} onState={onPublishing}/>:<Spinner label="Loading"/>}
    </div>
   </div>
   <div className="srow2"><div className="grow"><div className="st"><label htmlFor="set-vis">Who can watch new videos</label></div></div>
    <div className="sv"><select id="set-vis" className="select" value={publishing?.defaultVisibility??'public'} disabled={!publishing} onChange={event=>chooseVisibility(event.target.value as PublishVisibility)}>{VISIBILITY_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div></div>
   <div className="srow2"><div className="grow"><div className="st" id="set-theme-l">Theme</div><div className="sd">Light is the default. Dark is easier at night.</div></div>
    <div className="sv"><div className="seg" role="group" aria-label="Theme">{THEMES.map(([key,label])=><button key={key} type="button" className={theme===key?'on':''} aria-pressed={theme===key} onClick={()=>chooseTheme(key)}>{label}</button>)}</div></div></div>
  </Card>
  {problem&&<div style={{marginTop:12}}><ErrorLine message={problem} onRetry={()=>setProblem('')}/></div>}
 </section>;
}
