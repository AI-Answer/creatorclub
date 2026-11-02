import type {Outline,Package} from '../../../shared/club';
import type {CompanionAction,CompanionMessage,CompanionStep,CompanionTab} from '../../../shared/companion';

/*
 * The parts of the companion that need no screen: what it says it is looking at, the suggestions of each step, the dividers between
 * steps, the summary of a finished reply's steps, what a card would change (Preview), and when the log follows new text.
 */

export const STEP_NAME:Record<CompanionTab,string>={board:'Board',plan:'Plan',record:'Record',edit:'Edit',publish:'Publish',research:'Research'};

/** "Plan · Scene 2" or "Board". */
export function lookingAt(tab:CompanionTab,scene?:{index:number;title:string}):string{
 return scene?`${STEP_NAME[tab]} · Scene ${scene.index+1}`:STEP_NAME[tab];
}

/** What the companion knows about the video when it suggests what to ask. Anything left out is not known, and counts as there. */
export type SuggestionFacts={
 scenes:number;scene?:{index:number};selected?:number;
 /** The package's spoken hook is written. */
 hook?:boolean;
 /** The longest scene's length, in seconds. */
 longest?:number;
 /** Tiles on the board. */
 tiles?:number;
 /** Scenes with at least one take. */
 recorded?:number;
 /** The video has a title (the package's or its own). */
 titled?:boolean;
 /** The package's thumbnail text is written. */
 thumbnail?:boolean;
 /** Edit: how many moments the creator marked as not liked. */
 notes?:number;
};

/**
 * The three best things to ask on each step for the video as it is now. They follow what exists (nothing about the board's tiles
 * on an empty board, nothing that edits before anything is recorded) and never repeat a button the screen shows (Plan's Draft
 * scenes from the board, Write the package): they are what the screen cannot do, such as options to choose from, a tighter scene,
 * or a second opinion. A step can have fewer than three, or none.
 */
export function suggestions(tab:CompanionTab,facts:SuggestionFacts):string[]{
 const scene=facts.scene?`scene ${facts.scene.index+1}`:undefined;
 switch(tab){
  case 'board':return facts.tiles===0
   ?['What should this video cover?','Who is this video for?','Suggest three titles']
   :facts.tiles===1?['Write three hooks from this idea','Suggest three titles','What should this video cover?']
   :['Write three hooks from this board','Suggest three titles','What do these have in common?'];
  case 'plan':{
   // Titles, hooks and scenes are written from the Package and Scenes buttons, so the chips here are for thinking and tightening.
   const ideas=facts.scenes
    ?[scene?`Tighten ${scene}`:'Tighten the first scene',...((facts.longest??0)>90?['Cut the longest scene to 90 seconds']:[]),...(facts.hook?['Make the hook sharper']:[]),'What is missing before I record?','Is the order of the scenes right?']
    :['What should the video open with?','Who is this video for?','What is the one thing a viewer should remember?'];
   return ideas.slice(0,3);
  }
  case 'record':return facts.recorded===0
   ?['What should I say first?','Write a stronger hook','Build the talking points']
   :[scene?`Shorten ${scene} to fit its time`:'Shorten this scene to fit its time','Write a stronger hook','Write the call to action'];
  case 'publish':return ['Write the description',facts.thumbnail?'Is the thumbnail text clear?':'Suggest thumbnail text',...(facts.titled===false?[]:['Is the title ready?'])];
  case 'edit':return facts.recorded===0?[]:[...(facts.notes?['Fix the parts I marked']:[]),facts.selected?'Trim the selected clip to the speech':'Cut the pauses','Add a lower third with my name','Add a title at the start'].slice(0,3);
  case 'research':return facts.tiles===0?['Find videos that are working in my topics','What should my next video be?']:facts.selected?['What do these have in common?','Group these in a frame','Start a video from these']:['What themes do you see here?','Group the cards by theme','Which of these could be a video?'];
 }
}

/** The companion's first words on a step, before anything was asked there: one or two sentences about this step and this video. */
export function greeting(tab:CompanionTab,facts:{scenes:number;tiles?:number;recorded?:number}):string{
 switch(tab){
  case 'board':return facts.tiles===0
   ?'Add a video, link or note to the board, then ask me about it.'
   :'Ask me what the board has in common, or for hooks and titles from it.';
  case 'plan':return facts.scenes
   ?'I can tighten a scene, or write hooks and titles to choose from.'
   :'Plan the scenes first. I can write hooks and titles meanwhile.';
  case 'record':return facts.recorded===0
   ?'Ask me how to open, or for a hook or talking points.'
   :'Ask me to shorten a scene, or for a hook or a call to action.';
  case 'edit':return facts.recorded===0
   ?'Record a scene first, then I can cut its pauses and filler words.'
   :'Tell me what to change. Each change comes as a card you can preview and undo.';
  case 'publish':return 'Ask me for a second opinion on the title, thumbnail or description.';
  case 'research':return 'Ask me what the cards have in common, to group them, or to start a video from them.';
 }
}

export const tabOf=(message:CompanionMessage)=>message.role==='user'?message.context.tab:message.tab;
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

/** What applying a card would change: the field, what it is now and what it becomes. Timeline cards preview on the editor's stage instead. */
export function previewOf(action:CompanionAction,pkg:Package|null,outline:Outline|null):{field:string;now:string[];after:string[]}|undefined{
 const none='(empty)';
 switch(action.type){
  case 'use_hook':return {field:'Spoken hook',now:[pkg?.hook.spoken.trim()||none],after:[action.text]};
  case 'use_title':return {field:'First title',now:[pkg?.titles[0]?.trim()||none],after:[action.text]};
  case 'set_thumbnail_text':return {field:'Thumbnail text',now:[pkg?.thumbnailText.trim()||none],after:[action.text]};
  case 'set_description':return {field:'Description',now:[pkg?.description?.trim()||none],after:[action.text]};
  case 'add_note':return {field:'Board',now:[],after:[action.text]};
  case 'group_tiles':return {field:'Frame',now:[],after:[`“${action.title}” around ${action.tileIds.length} cards`]};
  case 'start_video':return {field:'Videos',now:[],after:[`A new idea, “${action.title}”, with copies of ${action.tileIds.length} ${action.tileIds.length===1?'card':'cards'} on its board`]};
  case 'set_scene':{
   const index=outline?.scenes.findIndex(scene=>scene.id===action.sceneId)??-1;
   const scene=index>=0?outline!.scenes[index]:undefined;
   if(!scene)return {field:'Scene',now:['This scene is no longer in the plan.'],after:[]};
   return {field:`Scene ${index+1}`,now:[scene.title,...scene.talkingPoints.map(point=>`• ${point}`)],after:[action.title??scene.title,...(action.talkingPoints??scene.talkingPoints).map(point=>`• ${point}`)]};
  }
  case 'set_scene_script':{
   const index=outline?.scenes.findIndex(scene=>scene.id===action.sceneId)??-1;
   const scene=index>=0?outline!.scenes[index]:undefined;
   if(!scene)return {field:'Script',now:['This scene is no longer in the plan.'],after:[]};
   return {field:`Script · Scene ${index+1}`,now:[scene.script?.trim()||none],after:[action.script]};
  }
  case 'draft_scenes':{
   let at=0;
   const after=action.scenes.map((scene,index)=>{const line=`${index+1}. ${scene.title} (${clock(at)})`;at+=scene.seconds;return line;});
   return {field:'Scenes',now:outline?.scenes.map((scene,index)=>`${index+1}. ${scene.title}`)??[],after};
  }
  default:return undefined;
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
  case 'edit':return 'The editor: the timeline, its transcript and the stage';
  case 'research':return 'Research, the channel\'s own board';
 }
}
