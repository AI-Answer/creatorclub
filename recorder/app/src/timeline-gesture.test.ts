import test from 'node:test';import assert from 'node:assert/strict';
import {beginGesture} from './timeline-gesture';
class Target extends EventTarget{captured=false;setPointerCapture(){this.captured=true;}hasPointerCapture(){return this.captured;}releasePointerCapture(){this.captured=false;}}
function pointer(type:string,id=1){const event=new Event(type);Object.assign(event,{pointerId:id});return event;}
test('shared gesture captures one pointer and cancels exactly once on blur, Escape, cancellation, loss or owner disposal',()=>{
 const original=globalThis.window,host=new EventTarget();Object.defineProperty(globalThis,'window',{configurable:true,value:host});
 try{for(const reason of ['blur','Escape','pointercancel','lostpointercapture','unmount']){const target=new Target();let moved=0,dropped=0,cancelled=0;const gesture=beginGesture({pointerId:1,currentTarget:target},{move:()=>moved++,drop:()=>dropped++,cancel:()=>cancelled++});assert.ok(target.captured);
  host.dispatchEvent(pointer('pointermove',2));host.dispatchEvent(pointer('pointermove'));assert.equal(moved,1);
  if(reason==='unmount')gesture.cancel();else if(reason==='Escape'){const event=new Event('keydown');Object.assign(event,{key:'Escape'});host.dispatchEvent(event);}else if(reason==='lostpointercapture')target.dispatchEvent(pointer(reason));else host.dispatchEvent(reason==='blur'?new Event(reason):pointer(reason));
  host.dispatchEvent(pointer('pointermove'));host.dispatchEvent(pointer('pointerup'));gesture.cancel();assert.equal(moved,1);assert.equal(dropped,0);assert.equal(cancelled,1);assert.equal(target.captured,false);
 }}finally{Object.defineProperty(globalThis,'window',{configurable:true,value:original});}
});
test('drop rechecks staleness and always releases listeners and capture',()=>{
 const original=globalThis.window,host=new EventTarget();Object.defineProperty(globalThis,'window',{configurable:true,value:host});
 try{for(const valid of [true,false]){const target=new Target();let drops=0,cancels=0;beginGesture({pointerId:1,currentTarget:target},{drop:()=>drops++,cancel:()=>cancels++,valid:()=>valid});host.dispatchEvent(pointer('pointerup'));host.dispatchEvent(pointer('pointerup'));assert.equal(drops,valid?1:0);assert.equal(cancels,valid?0:1);assert.equal(target.captured,false);}}
 finally{Object.defineProperty(globalThis,'window',{configurable:true,value:original});}
});
