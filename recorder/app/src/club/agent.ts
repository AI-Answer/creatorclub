import type {AgentAction,createAgent} from '@ui-sdk/react/agent';

type Agent=ReturnType<typeof createAgent>;
import {SEARCH_INPUT_LABEL} from './shell/labels';

type Rule={what:string;component:string;label:string;actions:readonly string[];buttons?:readonly string[]};

/**
 * The UI actions an agent driving this window may take, through ui-sdk's bridge (and WebMCP in a browser that has it).
 * Everything else on the page stays readable in `snapshot()`, but a step on it is refused, and so is any step on a `data-agent-confirm` control.
 * Data changes (scenes, scripts, publishing) belong to the app's MCP server (`npm run mcp`), which works without a window.
 */
export const AGENT_RULES:readonly Rule[]=[
 {what:'Open the search palette from the app menu',component:'menu',label:'Creator Compiler menu',actions:['setOpen','press'],buttons:['Search']},
 {what:'Open a video, a step or a page: type in the palette and run a result',component:'command',label:SEARCH_INPUT_LABEL,actions:['setQuery','setValue','run']},
 {what:'Switch the video board between Board, Table and Calendar',component:'tabs',label:'View',actions:['setValue']},
 {what:'Open the Export menu in Edit',component:'menu',label:'Open export options',actions:['setOpen']},
 {what:'Pick a layout for the selected stretch in Edit',component:'radio',label:'Layouts',actions:['setValue']},
];

export function allowed(step:Pick<AgentAction,'component'|'label'|'action'|'args'|'confirm'>):boolean{
 if(step.confirm)return false;
 return AGENT_RULES.some(rule=>rule.component===step.component&&rule.label===step.label&&rule.actions.includes(step.action)
  &&(step.action!=='press'||!step.args?.length||!!rule.buttons?.includes(String(step.args[0]))));
}

let agent:Promise<Agent>|undefined;

/** Starts the bridge once, in the browser and in its own chunk: `window.creatorCompilerAgent` for scripts and devtools, and WebMCP tools where the browser offers them. */
export function connectAgent(){
 if(typeof window==='undefined')return undefined;
 agent??=import('@ui-sdk/react/agent').then(({createAgent,registerTools})=>{
  const bridge=createAgent({allow:step=>allowed(step)});
  registerTools(bridge,{allow:()=>true});
  Object.defineProperty(window,'creatorCompilerAgent',{value:bridge,configurable:true});
  return bridge;
 });
 return agent;
}
