import {boardBase} from './board-base';
import type {BoardFiles,ResearchTile} from '../../../shared/club';

/*
 * The Board's files: Markdown notes in the video's folder and the Notes folder. Pure helpers for the screen.
 */

/** The tiles the server listed after a change, with the places still waiting to be saved kept over the server's. */
export function mergeTiles(listed:readonly ResearchTile[],waiting:ReadonlyMap<string,{x:number;y:number}>):ResearchTile[]{
 return listed.map(tile=>{const place=waiting.get(tile.id);return place?{...tile,pos:{...tile.pos,...place}}:tile;});
}

/** The first line of a note's text with the Markdown marks taken off, for a card. */
export const noteTitle=(tile:ResearchTile)=>tile.title||tile.doc?.path.split('/').pop()||'Note';

export const isDocTile=(tile:ResearchTile)=>tile.kind==='note'&&!!tile.doc;

const DOC_NAME=/\.(?:md|markdown|txt)$/i;
/** Whether a dropped or chosen file is a Markdown or text file. */
export const isDocFile=(file:Pick<File,'name'>)=>DOC_NAME.test(file.name);

/** What the Board says after files were dropped: how many came in, and why any did not. */
export function importMessage(added:number,skipped:readonly {name:string;reason:string}[]):string{
 const first=skipped[0];
 if(!added&&first)return skipped.length>1?`${first.reason} (${skipped.length} files)`:`${first.name}: ${first.reason}`;
 const said=added===1?'Added the note to the board':`Added ${added} notes to the board`;
 return first?`${said}. ${skipped.length===1?`${first.name}: ${first.reason}`:`${skipped.length} files were left out.`}`:said;
}

/** The folder the Board shows in its line: the last two parts, so a long path stays readable. The full path is the tooltip and what the copy button copies. */
export function folderLabel(files:Pick<BoardFiles['folder'],'display'>):string{
 const parts=files.display.split('/').filter(Boolean);
 return parts.length>3?`…/${parts.slice(-3).join('/')}`:files.display;
}

/** Remote images stay remote; local Markdown paths are resolved by the server against the note's file. */
export function boardImageSource(board:string|undefined,tile:string|undefined,source:string):string|undefined{
 if(/^https?:\/\//i.test(source))return source;
 if(!board||/^(?:[a-z][a-z\d+.-]*:|\/\/|\/|\\)/i.test(source))return undefined;
 return `/api/club${boardBase(board)}/board/images?${new URLSearchParams({src:source,...(tile?{tile}:{})})}`;
}
