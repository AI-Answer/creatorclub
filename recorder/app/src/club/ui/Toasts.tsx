import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Icon} from './Icon';

export type ToastOptions={
 /** Adds an Undo button that runs this. */
 undo?():void;
 /** Adds a button with this label, for "Open" or similar. */
 action?:{label:string;fn():void};
};
type Toast={id:number;message:string;options:ToastOptions};
export type ShowToast=(message:string,options?:ToastOptions)=>void;

/** Short messages sit 3.2 seconds, and 6 when they offer a button to press. At most three show at once. */
export const TOAST_MS={plain:3200,withButton:6000};
const MAX_TOASTS=3;

const ToastContext=createContext<ShowToast>(()=>{});
/** The `toast(message, options)` function of the nearest `ToastProvider`. */
export const useToast=()=>useContext(ToastContext);

/** Shows the toasts at the bottom of the window and hands `toast` to everything below. */
export function ToastProvider({children}:{children:ReactNode}){
 const [toasts,setToasts]=useState<Toast[]>([]);
 const next=useRef(0),timers=useRef(new Map<number,ReturnType<typeof setTimeout>>());
 const dismiss=useCallback((id:number)=>{
  const timer=timers.current.get(id);if(timer)clearTimeout(timer);timers.current.delete(id);
  setToasts(current=>current.filter(toast=>toast.id!==id));
 },[]);
 const show=useCallback<ShowToast>((message,options={})=>{
  const id=++next.current;
  setToasts(current=>current.concat({id,message,options}).slice(-MAX_TOASTS));
  timers.current.set(id,setTimeout(()=>dismiss(id),options.undo||options.action?TOAST_MS.withButton:TOAST_MS.plain));
 },[dismiss]);
 useEffect(()=>{const held=timers.current;return()=>{held.forEach(clearTimeout);held.clear();};},[]);
 const value=useMemo(()=>show,[show]);
 return <ToastContext.Provider value={value}>
  {children}
  <div className="cc-toasts" role="status" aria-live="polite">
   {toasts.map(toast=><div key={toast.id} className="cc-toast">
    <Icon name="Check" size={15} className="ok"/>{toast.message}
    {toast.options.undo&&<button type="button" onClick={()=>{toast.options.undo?.();dismiss(toast.id);}}>Undo</button>}
    {toast.options.action&&<button type="button" onClick={()=>{toast.options.action?.fn();dismiss(toast.id);}}>{toast.options.action.label}</button>}
   </div>)}
  </div>
 </ToastContext.Provider>;
}
