import type {ReactNode} from 'react';

/** Keep the selector and settings together, even when a device name is long. */
export function RecordingSourceHeader({toggle,label,device,settings}:{toggle:ReactNode;label:string;device?:ReactNode;settings:ReactNode}){
 return <header className="capture-source-header">{toggle}<strong>{label}</strong><div className="capture-source-actions">{device}{settings}</div></header>;
}
