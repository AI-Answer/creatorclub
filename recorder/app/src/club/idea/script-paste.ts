/**
 * Borumi's paste rule for the Script step (main bundle `_b`/`v1`): a pasted script splits into scenes at Markdown headings (`#` to
 * `######`, the heading becomes the scene's name) and at separator lines of three or more `-`, `*` or `_`. Text before the first boundary
 * is a scene without a name. Empty scenes are dropped. Plain text with no boundary stays one scene.
 */
export type PastedScene={title?:string;script:string};

const HEADING=/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const SEPARATOR=/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;

export function splitScript(text:string):PastedScene[]{
 const scenes:PastedScene[]=[];
 let current:PastedScene={script:''},lines:string[]=[];
 const flush=()=>{const script=lines.join('\n').replace(/^\n+|\n+$/g,'').trim();if(current.title||script)scenes.push({...current,script});lines=[];current={script:''};};
 for(const line of text.replace(/\r\n?/g,'\n').split('\n')){
  const heading=HEADING.exec(line);
  if(heading){flush();current={title:heading[1].trim(),script:''};continue;}
  if(SEPARATOR.test(line)){flush();continue;}
  lines.push(line);
 }
 flush();
 return scenes;
}

/** Whether a paste has a scene boundary (a heading or a separator), so it should become several scenes rather than plain text. */
export const hasSceneBoundary=(text:string)=>text.replace(/\r\n?/g,'\n').split('\n').some(line=>HEADING.test(line)||SEPARATOR.test(line));
