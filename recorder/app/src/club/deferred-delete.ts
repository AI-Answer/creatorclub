import {CANT_REACH,errorMessage} from './api';
/** Shared lifecycle for a deferred destructive request. Undo always reports when it is too late. */
export function deferDelete({send,onUndo,onFailed,onSettled,delay,undoAfterSend,fallback="Couldn't delete that. Try again."}:{send():Promise<unknown>;onUndo():void;onFailed(message:string):void;onSettled?(deleted:boolean):void;delay:number;undoAfterSend?():void;fallback?:string}):()=>void{
 let phase:'waiting'|'sending'|'done'|'failed'|'undone'='waiting';
 const timer=setTimeout(()=>{
  phase='sending';
  void send().then(()=>{phase='done';onSettled?.(true);},reason=>{phase='failed';const message=errorMessage(reason,fallback);onFailed(message===CANT_REACH?fallback:message);onSettled?.(false);});
 },delay);
 return()=>{
  if(phase==='undone')return;
  if(phase==='waiting'){clearTimeout(timer);phase='undone';onUndo();onSettled?.(false);return;}
  if(phase==='done'&&undoAfterSend){phase='undone';undoAfterSend();return;}
  onFailed("Couldn't undo that; the delete was already sent.");
 };
}
