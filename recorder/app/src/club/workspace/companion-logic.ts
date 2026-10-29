import type {Outline,Package} from '../../../shared/club';
import type {CompanionAction,CompanionMessage,CompanionStep,CompanionTab} from '../../../shared/companion';

/*
 * The parts of the companion that need no screen: what it says it is looking at, the suggestions of each step, the dividers between
 * steps, the summary of a finished reply's steps, what a card would change (Preview), and when the log follows new text.
 */

export const STEP_NAME:Record<CompanionTab,string>={board:'Board',plan:'Plan',record:'Record',edit:'Edit',publish:'Publish'};

/** "Plan · Scene 2" or "Board". */
export function lookingAt(tab:CompanionTab,scene?:{index:number;title:string}):string{
 return scene?`${STEP_NAME[tab]} · Scene ${scene.index+1}`:STEP_NAME[tab];
}

/** Three things to ask on each step, depending on what the video has. */
export function suggestions(tab:CompanionTab,facts:{scenes:number;scene?:{index:number}}):string[]{
 const scene=facts.scene?`scene ${facts.scene.index+1}`:undefined;
 switch(tab){
  case 'board':return ['Write three hooks from this board','Suggest three titles','What do these have in common?'];
  case 'plan':return [facts.scenes?scene?`Tighten ${scene}`:'Tighten the first scene':'Draft the scenes','Write three hooks','Suggest three titles'];
  case 'record':return [scene?`Shorten ${scene} to fit its time`:'Shorten this scene to fit its time','Give me a warm-up line','What should I show on screen?'];
  case 'publish':return ['Write the description','Suggest thumbnail text','Is the title ready to publish?'];
  case 'edit':return [];
 }
}

const tabOf=(message:CompanionMessage)=>message.role==='user'?message.context.tab:message.tab;
const day=(at:string|undefined)=>{
 if(!at)return '';
 const date=new Date(at);
 return Number.isNaN(date.getTime())?'':date.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
};

export type LogItem={kind:'divider';key:string;label:string}|{kind:'message';key:string;message:CompanionMessage};

/** The conversation with a divider wherever the step changes ("Plan · Tue 27 Oct"), and "Now on Record" when the screen moved on since. */
export function withDividers(messages:readonly CompanionMessage[],tab:CompanionTab):LogItem[]{
 const items:LogItem[]=[];
 let last:CompanionTab|undefined;
 for(const message of messages){
  const here=tabOf(message);
  if(here!==last){const when=day(message.at);items.push({kind:'divider',key:`d-${message.id}`,label:when?`${STEP_NAME[here]} · ${when}`:STEP_NAME[here]});last=here;}
  items.push({kind:'message',key:message.id,message});
 }
 if(last&&last!==tab)items.push({kind:'divider',key:'now',label:`Now on ${STEP_NAME[tab]}`});
 return items;
}

const PAST:Record<string,string>={Reading:'Read',Writing:'Wrote',Rewriting:'Rewrote',Thinking:'Thought',Drafting:'Drafted',Preparing:'Prepared',Checking:'Checked'};
const pastTense=(label:string)=>{const [first,...rest]=label.split(' ');return [PAST[first]??first,...rest].join(' ');};
/** Steps every reply has; the summary names only the ones that say what this reply did. */
const ROUTINE=new Set(['Thinking it through','Writing the reply','Preparing the changes','Checking the changes']);

/** "12s", "1m 05s". */
export function elapsed(ms:number):string{
 const seconds=Math.max(0,Math.round(ms/1000));
 return seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${String(seconds%60).padStart(2,'0')}s`;
}

/** One line for a finished reply: "Read the board, drafted scenes · 12s". */
export function stepSummary(steps:readonly CompanionStep[]):string{
 const named=steps.filter(step=>!ROUTINE.has(step.label)).map(step=>pastTense(step.label));
 const total=steps.reduce((sum,step)=>sum+step.ms,0);
 const words=named.length?named.map((label,index)=>index?label.charAt(0).toLowerCase()+label.slice(1):label).join(', '):'Answered';
 return `${words} · ${elapsed(total)}`;
}

const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;

/** What applying a card would change: the field, what it is now and what it becomes. */
export function previewOf(action:CompanionAction,pkg:Package|null,outline:Outline|null):{field:string;now:string[];after:string[]}{
 const none='(empty)';
 switch(action.type){
  case 'use_hook':return {field:'Spoken hook',now:[pkg?.hook.spoken.trim()||none],after:[action.text]};
  case 'use_title':return {field:'First title',now:[pkg?.titles[0]?.trim()||none],after:[action.text]};
  case 'set_thumbnail_text':return {field:'Thumbnail text',now:[pkg?.thumbnailText.trim()||none],after:[action.text]};
  case 'set_description':return {field:'Description',now:[pkg?.description?.trim()||none],after:[action.text]};
  case 'add_note':return {field:'Board',now:[],after:[action.text]};
  case 'set_scene':{
   const index=outline?.scenes.findIndex(scene=>scene.id===action.sceneId)??-1;
   const scene=index>=0?outline!.scenes[index]:undefined;
   if(!scene)return {field:'Scene',now:['This scene is no longer in the plan.'],after:[]};
   return {field:`Scene ${index+1}`,now:[scene.title,...scene.talkingPoints.map(point=>`• ${point}`)],after:[action.title??scene.title,...(action.talkingPoints??scene.talkingPoints).map(point=>`• ${point}`)]};
  }
  case 'draft_scenes':{
   let at=0;
   const after=action.scenes.map((scene,index)=>{const line=`${index+1}. ${scene.title} (${clock(at)})`;at+=scene.seconds;return line;});
   return {field:'Scenes',now:outline?.scenes.map((scene,index)=>`${index+1}. ${scene.title}`)??[],after};
  }
 }
}

/** The log keeps following new text only while the reader is at the bottom; scrolling up leaves them where they are. */
export const FOLLOW_SLACK=48;
export const atBottom=(box:{scrollHeight:number;scrollTop:number;clientHeight:number})=>box.scrollHeight-box.scrollTop-box.clientHeight<=FOLLOW_SLACK;

/** A short summary of the screen, sent with every message. */
export function screenSummary(tab:CompanionTab,facts:{pkg:Package|null;outline:Outline|null;recorded?:number}):string{
 const scenes=facts.outline?.scenes.length??0;
 const titles=facts.pkg?.titles.filter(title=>title.trim()).length??0;
 const hook=facts.pkg?.hook.spoken.trim()?'hook written':'no hook yet';
 const sceneLine=scenes?`${scenes} ${scenes===1?'scene':'scenes'}`:'no scenes yet';
 switch(tab){
  case 'board':return `The research board; ${sceneLine}`;
  case 'plan':return `Package with ${titles} of 3 titles and ${hook}; ${sceneLine}`;
  case 'record':return `Recording; ${sceneLine}${facts.recorded!==undefined?`, ${facts.recorded} recorded`:''}`;
  case 'publish':return `Publish form; description ${facts.pkg?.description?.trim()?'written':'not written yet'}`;
  case 'edit':return 'The editor';
 }
}
