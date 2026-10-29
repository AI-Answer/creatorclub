import {Empty,type IconName} from '../ui';

/** Stands in for a screen that is not built yet, so every route opens on something. Each task that builds a screen replaces its placeholder. */
export function PlaceholderScreen({title,icon}:{title:string;icon:IconName}){
 return <div className="page"><div className="card"><Empty icon={icon} title={title}>This screen is coming soon.</Empty></div></div>;
}
