import type {BoardChatMessage,Package} from '../../../shared/club';

/*
 * The parts of "Ask Claude about this board" that need no screen: what the conversation sends back as history, which items were used,
 * and how Undo puts a package back after Use as hook or Use as title.
 */

/** The last turns the server is sent with a question. */
export const HISTORY_TURNS=12;
export const historyOf=(messages:readonly BoardChatMessage[])=>messages.slice(-HISTORY_TURNS).map(({role,text})=>({role,text}));

/** The conversation with item `k` of message `index` marked used (once). */
export function markUsed(messages:readonly BoardChatMessage[],index:number,k:number):BoardChatMessage[]{
 return messages.map((message,at)=>at!==index?message:{...message,used:[...new Set([...(message.used??[]),k])]});
}

/** Undo of Use as hook or title: put the package back as it was, or remove it when there was none. */
export function undoRequest(videoId:string,previous:Package|null):{method:'PUT';path:string;body:Package}|{method:'DELETE';path:string}{
 const path=`/videos/${encodeURIComponent(videoId)}/package`;
 return previous?{method:'PUT',path,body:previous}:{method:'DELETE',path};
}

/** The reply as plain text for a note on the Board: the words, then each item on its own line. */
export const noteText=(reply:string,items:readonly {text:string}[])=>[reply.trim(),...items.map(item=>`• ${item.text}`)].filter(Boolean).join('\n');
