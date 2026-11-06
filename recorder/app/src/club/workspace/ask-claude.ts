/** Anything on the page can ask the chat on the right a question for the creator: the chat opens, sends it, and answers with cards to use. */
export const ASK_CLAUDE='club:ask-claude';
export const askClaude=(text:string)=>window.dispatchEvent(new CustomEvent<{text:string}>(ASK_CLAUDE,{detail:{text}}));

/**
 * The chat's reply is over: it arrived (`ok`), with a choice for the creator to make in the chat (`choice`), or it failed or was stopped.
 * The page that asked can show what came of it where it asked.
 */
export const ASK_CLAUDE_SETTLED='club:ask-claude-settled';
/** The chat started writing a reply (to a page's ask, or to a pick the creator made in it). */
export const ASK_CLAUDE_STARTED='club:ask-claude-started';
export const askStarted=()=>window.dispatchEvent(new Event(ASK_CLAUDE_STARTED));
export function onAskStarted(listen:()=>void):()=>void{window.addEventListener(ASK_CLAUDE_STARTED,listen);return()=>window.removeEventListener(ASK_CLAUDE_STARTED,listen);}
export type AskSettled={ok:boolean;choice:boolean};
export const askSettled=(detail:AskSettled)=>window.dispatchEvent(new CustomEvent<AskSettled>(ASK_CLAUDE_SETTLED,{detail}));
export function onAskSettled(listen:(detail:AskSettled)=>void):()=>void{
 const hear=(event:Event)=>{const detail=(event as CustomEvent<AskSettled>).detail;if(detail)listen(detail);};
 window.addEventListener(ASK_CLAUDE_SETTLED,hear);return()=>window.removeEventListener(ASK_CLAUDE_SETTLED,hear);
}
