/** One pointer's lifetime. Disposal is silent; cancellation never drops. Call dispose on owner unmount. */
export function beginGesture(event:{pointerId:number;currentTarget:EventTarget|null},callbacks:{move?:(event:PointerEvent)=>void;drop?:(event:PointerEvent)=>void;cancel:()=>void;valid?:()=>boolean}){
 const target=event.currentTarget as HTMLElement|null,id=event.pointerId;let closed=false;
 const dispose=()=>{if(closed)return;closed=true;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancelPointer);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);target?.removeEventListener('lostpointercapture',cancelPointer);try{if(target?.hasPointerCapture?.(id))target.releasePointerCapture(id);}catch{}};
 const cancel=()=>{if(closed)return;dispose();callbacks.cancel();};
 const move=(e:PointerEvent)=>{if(!closed&&e.pointerId===id)callbacks.move?.(e);};
 const up=(e:PointerEvent)=>{if(closed||e.pointerId!==id)return;const valid=callbacks.valid?.()!==false;dispose();if(valid)callbacks.drop?.(e);else callbacks.cancel();};
 const cancelPointer=(e:Event)=>{if((e as PointerEvent).pointerId===id)cancel();};
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}};
 window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancelPointer);window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);target?.addEventListener('lostpointercapture',cancelPointer);try{target?.setPointerCapture?.(id);}catch{}
 return {dispose,cancel};
}
