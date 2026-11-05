import {useState} from 'react';
import type {ClubSettings} from '../../../shared/club';
import {getAppearance,setAppearance,type Appearance} from '../../appearance';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {Card} from '../ui';

const THEMES=[['light','Light'],['dark','Dark'],['system','System default']] as const;

export function AppearanceSection({savedTheme}:{savedTheme:ClubSettings['appearance']}){
 const [theme,setTheme]=useState<Appearance>(()=>savedTheme??getAppearance()),[error,setError]=useState('');
 const choose=(next:Appearance)=>{
  setTheme(next);setAppearance(next);setError('');
  clubFetch('/settings',{method:'PUT',body:{appearance:next}}).catch(reason=>setError(errorMessage(reason,"Couldn't save that choice.")));
 };
 return <section className="set-group" id="set-appearance" aria-labelledby="set-appearance-title"><h2 id="set-appearance-title">Appearance</h2><p>Choose how Creator Compiler looks.</p>
  <Card><div className="srow2"><div className="grow"><div className="st">Theme</div><div className="sd">Choose light or dark, or follow your Mac.</div></div><div className="seg" role="group" aria-label="Theme">{THEMES.map(([key,label])=><button key={key} type="button" className={theme===key?'on':''} aria-pressed={theme===key} onClick={()=>choose(key)}>{label}</button>)}</div></div></Card>
  {error&&<ErrorLine message={error} onRetry={()=>choose(theme)}/>}
 </section>;
}
