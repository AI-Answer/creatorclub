import {useState} from 'react';
import type {ClubSettings} from '../../../shared/club';
import {getAppearance,setAppearance} from '../../appearance';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {Icon} from '../ui';

const THEMES=[['light','Light','#f8f7f4','#fff','#efece7','#e9e6e1'],['dark','Dark','#161615','#1e1e1d','#232322','#2f2e2c']] as const;
type Theme=typeof THEMES[number][0];

/** Light or dark. Applied at once and saved in settings, so it stays when the app is opened again. */
export function AppearanceSection({saved}:{saved:ClubSettings['appearance']}){
 const [theme,setTheme]=useState<Theme>(()=>saved??(getAppearance()==='dark'?'dark':'light'));
 const [error,setError]=useState('');
 const choose=(next:Theme)=>{
  setTheme(next);setAppearance(next);setError('');
  clubFetch('/settings',{method:'PUT',body:{appearance:next}}).catch(reason=>setError(errorMessage(reason,"Couldn't save that choice.")));
 };
 return <section className="set-sec" id="set-appearance" aria-labelledby="set-appearance-title"><h2 id="set-appearance-title">Appearance</h2><p>Light is the default. Dark is easier at night.</p>
  <div className="theme-pick" role="group" aria-label="Theme">{THEMES.map(([key,label,page,card,rail,line])=><button key={key} type="button" className={theme===key?'on':''} aria-pressed={theme===key} onClick={()=>choose(key)}>
   <div className="sw" style={{background:page,display:'flex',gap:6,padding:8}}><div style={{width:30,borderRadius:4,background:rail}}/><div style={{flex:1,borderRadius:6,background:card,border:`1px solid ${line}`}}/></div>
   <span className="row">{theme===key&&<Icon name="Check" size={14}/>}{label}</span>
  </button>)}</div>
  {error&&<div style={{marginTop:12}}><ErrorLine message={error} onRetry={()=>choose(theme)}/></div>}
 </section>;
}
