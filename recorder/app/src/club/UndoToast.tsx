import {useEffect} from 'react';

export type ToastMessage={id:number;message:string;undo?():void};
export const TOAST_MS=6000;

/** "Moved to Recording · Undo", at the bottom for 6 seconds. A new message replaces the old one. */
export function UndoToast({toast,onDone}:{toast:ToastMessage|null;onDone(id:number):void}){
 const id=toast?.id;
 useEffect(()=>{
  if(id===undefined)return;
  const timer=setTimeout(()=>onDone(id),TOAST_MS);
  return()=>clearTimeout(timer);
 },[id,onDone]);
 return <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
  {toast&&<div key={toast.id} className="pointer-events-auto flex items-center gap-3 rounded-lg bg-primary px-4 py-2.5 text-base text-primary-ink shadow-lg">
   <span>{toast.message}</span>
   {toast.undo&&<>
    {' '}<span aria-hidden className="opacity-60">·</span>{' '}
    <button type="button" onClick={toast.undo} className="rounded-sm font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Undo</button>
   </>}
  </div>}
 </div>;
}
