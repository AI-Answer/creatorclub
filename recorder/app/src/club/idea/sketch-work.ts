/*
 * A quick change Claude makes to one part of the sketch (a rewrite, a shorter line, other titles), shown on that part from the click
 * until it lands: working while Claude writes, a choice to make in the chat when Claude offers options, changed when the new words
 * arrive, or a line that it did not work. One at a time, as the chat answers one message at a time.
 */

export type WorkPhase='working'|'settling'|'choose'|'changed'|'failed';
export interface SketchWork{part:string;tool:ToolKind;phase:WorkPhase;before:string}
/** What a quick change does, which says what the part shows while it happens and once it is done. */
export type ToolKind='rewrite'|'shorter'|'titles'|'words'|'thumbnail';

export const WORK_TEXT:Record<ToolKind,{working:string;changed:string}>={
 rewrite:{working:'Rewriting…',changed:'Rewritten'},
 shorter:{working:'Making it shorter…',changed:'Shorter now'},
 titles:{working:'Finding other titles…',changed:'New title'},
 words:{working:'Finding other words…',changed:'New words'},
 thumbnail:{working:'Finding thumbnail ideas…',changed:'New thumbnail idea'},
};

/** How long "changed" or a failure stays on the part. */
export const SHOWN_MS=2600;
/** After the reply, how long the new words may take to land (the chat applies the change, then the sketch reloads). */
export const SETTLE_MS=6000;
/** Nothing heard back at all (the chat could not take the message): the part stops waiting. */
export const GIVE_UP_MS=180_000;

export function startWork(current:SketchWork|null,part:string,tool:ToolKind,before:string):SketchWork|null{
 if(current&&(current.phase==='working'||current.phase==='settling'))return current;
 return {part,tool,phase:'working',before};
}

/** The part's words now: once they differ from before, the change has landed. */
export function seeValue(work:SketchWork|null,value:string):SketchWork|null{
 if(!work||work.phase==='changed'||work.phase==='failed')return work;
 return value.trim()!==work.before.trim()?{...work,phase:'changed'}:work;
}

/** The chat's reply is over. */
export function seeSettled(work:SketchWork|null,settled:{ok:boolean;choice:boolean}):SketchWork|null{
 if(!work||(work.phase!=='working'&&work.phase!=='settling'&&work.phase!=='choose'))return work;
 if(!settled.ok)return work.phase==='choose'?null:{...work,phase:'failed'};
 if(settled.choice)return {...work,phase:'choose'};
 // A pick in the chat was answered: its change lands like any other.
 return {...work,phase:'settling'};
}

/** The chat started a reply: after a pick in the chat, the part is being changed again. */
export function seeStarted(work:SketchWork|null):SketchWork|null{
 return work?.phase==='choose'?{...work,phase:'working'}:work;
}
