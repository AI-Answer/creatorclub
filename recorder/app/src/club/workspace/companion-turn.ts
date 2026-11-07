export type TurnPhase='idle'|'sending'|'streaming'|'done'|'failed'|'stopped';
export type Turn={phase:TurnPhase;requestId?:string;jobId?:string};
export const turnBusy=(turn:Turn)=>turn.phase==='sending'||turn.phase==='streaming';
export function companionTurn(current:Turn,next:Turn):Turn{
 if(next.phase==='sending')return turnBusy(current)?current:next;
 if(next.requestId!==current.requestId&&turnBusy(current))return current;
 return next;
}
