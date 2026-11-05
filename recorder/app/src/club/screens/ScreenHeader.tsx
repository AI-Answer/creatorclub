import type {ReactNode} from 'react';
import {Icon,type IconName} from '../ui';

/** The shared title, description and actions row for every sidebar page. */
export function ScreenHeader({title,description,actions,icon,compact=false}:{title:string;description?:string;actions?:ReactNode;icon?:IconName;compact?:boolean}){
 return <header className={`page-head screen-header club-drag${compact?' compact':''}`}>
  <div className="screen-heading"><h1>{icon&&<Icon name={icon} size={18}/>}{title}</h1>{description&&<p className="lede">{description}</p>}</div>
  {actions&&<div className="actions club-no-drag">{actions}</div>}
 </header>;
}
