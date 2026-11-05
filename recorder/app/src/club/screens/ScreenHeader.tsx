import type {ReactNode} from 'react';

/** The shared title, description and actions row for every sidebar page. */
export function ScreenHeader({title,description,actions}:{title:string;description?:string;actions?:ReactNode}){
 return <header className="page-head screen-header club-drag">
  <div className="screen-heading"><h1>{title}</h1>{description&&<p className="lede">{description}</p>}</div>
  {actions&&<div className="actions club-no-drag">{actions}</div>}
 </header>;
}
