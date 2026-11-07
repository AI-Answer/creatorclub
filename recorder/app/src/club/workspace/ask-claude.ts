export const ASK_CLAUDE='club:ask-claude';
export const ASK_CLAUDE_SETTLED='club:ask-claude-settled';
export const ASK_CLAUDE_STARTED='club:ask-claude-started';
let serial=0;
export const newAskId=()=>`ask-${Date.now()}-${++serial}`;
export type AskRequest={text:string;requestId:string;accepted?:boolean};
export type AskIdentity={requestId:string;jobId?:string;parentRequestId?:string};
export type AskSettled=AskIdentity&{ok:boolean;choice:boolean};
const settled=new Set<string>();
export const askStarted=(detail:AskIdentity)=>window.dispatchEvent(new CustomEvent<AskIdentity>(ASK_CLAUDE_STARTED,{detail}));
export const askSettled=(detail:AskSettled)=>{
 if(settled.has(detail.requestId))return;
 settled.add(detail.requestId);window.dispatchEvent(new CustomEvent<AskSettled>(ASK_CLAUDE_SETTLED,{detail}));
};
/** A missing/closed chat rejects the request synchronously, so the caller never waits for a timeout. */
export function askClaude(text:string,requestId=newAskId()):string{
 const detail:AskRequest={text,requestId};
 window.dispatchEvent(new CustomEvent<AskRequest>(ASK_CLAUDE,{detail}));
 if(!detail.accepted)askSettled({requestId,ok:false,choice:false});
 return requestId;
}
export function onAskStarted(listen:(detail:AskIdentity)=>void):()=>void{
 const hear=(event:Event)=>listen((event as CustomEvent<AskIdentity>).detail);
 window.addEventListener(ASK_CLAUDE_STARTED,hear);return()=>window.removeEventListener(ASK_CLAUDE_STARTED,hear);
}
export function onAskSettled(listen:(detail:AskSettled)=>void):()=>void{
 const hear=(event:Event)=>{const detail=(event as CustomEvent<AskSettled>).detail;if(detail)listen(detail);};
 window.addEventListener(ASK_CLAUDE_SETTLED,hear);return()=>window.removeEventListener(ASK_CLAUDE_SETTLED,hear);
}
