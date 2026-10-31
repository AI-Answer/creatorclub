/** Anything on the page can ask the chat on the right a question for the creator: the chat opens, sends it, and answers with cards to use. */
export const ASK_CLAUDE='club:ask-claude';
export const askClaude=(text:string)=>window.dispatchEvent(new CustomEvent<{text:string}>(ASK_CLAUDE,{detail:{text}}));
