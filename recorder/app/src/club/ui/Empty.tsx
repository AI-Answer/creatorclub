import type {ReactNode} from 'react';
import {Icon,type IconName} from './icons';

/** Centred icon, title, one help line and an optional action. For places with nothing to show yet. */
export function Empty({icon='idea',title,children,action}:{icon?:IconName;title:string;children?:ReactNode;action?:ReactNode}){
 return <div className="empty"><div className="ic"><Icon name={icon} size={20}/></div><h3>{title}</h3>{children&&<p>{children}</p>}{action}</div>;
}
