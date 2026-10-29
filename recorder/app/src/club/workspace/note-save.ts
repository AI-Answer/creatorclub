/*
 * The save rules of the note panel, kept apart from the screen so they can be tested: what to do when the file changes while the note is open.
 */

export interface NoteView{
 /** The text in the editor. */
 text:string;
 /** The hash of the file text the editor started from or last saved. Sent back with a save, so a change made elsewhere is noticed. */
 base:string|undefined;
 /** Hashes of the file text this panel has written, newest last. */
 mine:string[];
 dirty:boolean;
 saving:boolean;
}

export type FromFile={text:string;hash:string|undefined};

/** What to do with the note's file text as the Board listed it. */
export type FileAction='ignore'|'adopt'|'keep';

/**
 * A file text that is the panel's own (an older or the latest save coming back) is ignored. One from outside is taken into the editor when there is nothing
 * unsaved; with unsaved writing it is kept out, and the next save finds the file changed and keeps the other version as a copy.
 */
export function onFileChanged(view:NoteView,file:FromFile):FileAction{
 if(file.hash===undefined||file.hash===view.base||view.mine.includes(file.hash))return 'ignore';
 if(file.text===view.text)return 'ignore';
 return view.dirty||view.saving?'keep':'adopt';
}

export const SAVE_WAIT_MS=700;
export const MINE_KEPT=8;

export const rememberHash=(mine:readonly string[],hash:string)=>[...mine.filter(item=>item!==hash),hash].slice(-MINE_KEPT);

export const savedLine=(status:'saved'|'saving'|'unsaved'|'failed')=>({saved:'Saved',saving:'Saving…',unsaved:'Unsaved',failed:"Couldn't save"})[status];

export const conflictLine=(copy:string)=>`This note changed in its file while you were writing. Your version is saved, and the other one is kept as ${copy}.`;
