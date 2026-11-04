import type {Outline,Package} from '../../../shared/club';
import {chosenIndex,pairThumbs} from '../../../shared/package-rules';
import type {CompanionAction,CompanionMessage,CompanionStep,CompanionTab} from '../../../shared/companion';

/*
 * The parts of the companion that need no screen: what it says it is looking at, the suggestions of each step, the dividers between
 * steps, the summary of a finished reply's steps, what a card would change (Preview), and when the log follows new text.
 */

export const STEP_NAME:Record<CompanionTab,string>={idea:'Idea',record:'Record',edit:'Edit',publish:'Publish',research:'Channel board'};

/** "Idea · Scene 2" or "Idea". */
export function lookingAt(tab:CompanionTab,scene?:{index:number;title:string}):string{
 return scene?`${STEP_NAME[tab]} · Scene ${scene.index+1}`:STEP_NAME[tab];
}

/** What the companion knows about the video when it suggests what to ask. Anything left out is not known, and counts as there. */
/** The parts of a video's Idea page (`idea-logic` SECTIONS). */
export type IdeaPartKey='idea'|'package'|'hook'|'scenes';

export type SuggestionFacts={
 /** Idea: the part of "Your video" that is open, and how many of its titles are written. */
 part?:IdeaPartKey;titles?:number;
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
 /** Edit: the stretches where nothing changes on screen (the pacing check). */
 stalls?:ReadonlyArray<{start:number;end:number}>;
 /** Edit: a title or keyword in the first seconds. */
 opening?:boolean;
 /** Edit: a lower third names the creator. */
 named?:boolean;
 /** Edit: the whole-video polish has been asked for in this video's chat. */
 polished?:boolean;
};

/**
 * The three best things to ask on each step for the video as it is now. They follow what exists (nothing about the board's tiles
 * on an empty board, nothing that edits before anything is recorded) and never repeat a button the screen shows (Idea's Draft
 * the scenes, Write with Claude): they are what the screen cannot do, such as options to choose from, a tighter scene,
 * or a second opinion. A step can have fewer than three, or none.
 */
const clockOf=(t:number)=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
/** Edit's first suggestion: runs the proof-edit skill on the whole video. */
export const POLISH='/proof-edit Polish the whole video';
export function suggestions(tab:CompanionTab,facts:SuggestionFacts):string[]{
 const scene=facts.scene?`scene ${facts.scene.index+1}`:undefined;
 switch(tab){
  case 'idea':{
   // The open part of "Your video" says what the creator is working on. Its own buttons write it, so the chips think and tighten.
   if(facts.part==='idea')return [facts.tiles?'Fill in the idea from my board':'What should this video be about?','Who is this video for?','What makes this different from what is out there?'];
   if(facts.part==='package')return facts.titles?['Which pair is strongest, and why?','Make the titles more specific','What should the thumbnail show?']:['What would make people click this?','Who is this video for?','What should the thumbnail show?'];
   if(facts.part==='hook')return ['Does the hook confirm the title?','Make the hook shorter','What could I show in the first seconds?'];
   // Titles, hooks and scenes are written from the column's own buttons, so the chips here are for thinking and tightening.
   if(facts.scenes)return [scene?`Tighten ${scene}`:'Tighten the first scene',...((facts.longest??0)>90?['Cut the longest scene to 90 seconds']:[]),...(facts.hook?['Make the hook sharper']:[]),'What is missing before I record?','Is the order of the scenes right?'].slice(0,3);
   return (facts.tiles??0)>1
    ?['What do these have in common?','What should this video cover?','Who is this video for?']
    :['What should this video cover?','Who is this video for?','What is the one thing a viewer should remember?'];
  }
  case 'record':return facts.recorded===0
   ?['What should I say first?','Write a stronger hook','Build the talking points']
   :[scene?`Shorten ${scene} to fit its time`:'Shorten this scene to fit its time','Write a stronger hook','Write the call to action'];
  case 'publish':return ['Write the description',facts.thumbnail?'Is the thumbnail text clear?':'Suggest thumbnail text',...(facts.titled===false?[]:['Is the title ready?'])];
  // The next steps for the edit as it is: the whole proof-first polish until it has been asked for, then what the pacing check and the
  // video still need, the creator's own marks, and at the end whether it is ready to publish.
  case 'edit':{
   if(facts.recorded===0)return [];
   const stall=facts.stalls?.[0];
   const next=[
    ...(facts.polished?[]:[POLISH]),
    ...(stall?[`Add something at ${clockOf(stall.start)}–${clockOf(stall.end)}: nothing changes on screen there`]:[]),
    ...(facts.notes?['Fix the parts I marked']:[]),
    ...(facts.selected?['Trim the selected clip to the speech']:[]),
    // Not known (no editor open yet) counts as missing: the title and the name are what most videos still need.
    ...(facts.opening?[]:['Add a title at the start']),
    ...(facts.named?[]:['Add a lower third with my name']),
    ...(facts.polished&&!stall?['Is this ready to publish?']:[]),
    'Cut the pauses',
   ];
   return [...new Set(next)].slice(0,3);
  }
  case 'research':return facts.tiles===0?['Find videos that are working in my topics','What should my next video be?']:facts.selected?['What do these have in common?','Group these in a frame','Start a video from these']:['What themes do you see here?','Group the cards by theme','Which of these could be a video?'];
 }
}

/** The companion's first words on a step, before anything was asked there: one or two sentences about this step and this video. */
export function greeting(tab:CompanionTab,facts:{scenes:number;tiles?:number;recorded?:number;part?:IdeaPartKey}):string{
 switch(tab){
  case 'idea':
   // The open part of "Your video" is what the creator is working on, so the first words are about it.
   if(facts.part==='idea')return facts.tiles?'Tell me what the video is about, or ask me to fill it in from your board.':'Tell me what the video is about, and I can write it up for you.';
   if(facts.part==='package')return 'Ask me which pair is strongest, or for titles and thumbnail words to choose from.';
   if(facts.part==='hook')return 'Ask me to check the hook against your title, or to make it shorter.';
   return facts.scenes
   ?'I can tighten a scene, or write hooks and titles to choose from.'
   :facts.tiles===0
   ?'Add a video, link or note to the board, then ask me about it.'
   :'Ask me what the board has in common, or what the video should cover.';
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

/** The conversation with a divider wherever the step changes ("Idea · Tue 27 Oct"), and "Now on Record" when the screen moved on since. */
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
export function previewOf(action:CompanionAction,pkg:Package|null,outline:Outline|null,video:{title:string;why?:string}={title:''}):{field:string;now:string[];after:string[]}|undefined{
 const none='(empty)';
 switch(action.type){
  case 'set_idea':{
   const parts=([['What it\'s about','angle',pkg?.angle],['Your twist','twist',pkg?.twist],['Why it could work','why',video.why]] as const).filter(([,key])=>action[key]!==undefined);
   return {field:'The idea',now:parts.map(([label,,now])=>`${label}: ${now?.trim()||none}`),after:parts.map(([label,key])=>`${label}: ${action[key]}`)};
  }
  case 'set_pairs':{
   const thumbs=pkg?pairThumbs(pkg,video.title):['','',''];
   const line=(title:string,thumb:string,index:number,used:boolean)=>`${index+1}. ${title.trim()||none} · ${thumb.trim()||'no thumbnail words'}${used?' (in use)':''}`;
   const now=[0,1,2].filter(index=>pkg?.titles[index]?.trim()).map(index=>line(pkg!.titles[index],thumbs[index],index,chosenIndex(pkg!.titles,video.title)===index));
   const titles=[0,1,2].map(index=>action.pairs[index]?.title??pkg?.titles[index]??''),after=[0,1,2].map(index=>action.pairs[index]?.thumb??thumbs[index]);
   const using=action.use?action.use-1:chosenIndex(titles,video.title);
   return {field:'Titles and thumbnails',now:now.length?now:[none],after:[0,1,2].filter(index=>titles[index].trim()).map(index=>line(titles[index],after[index],index,index===using))};
  }
  case 'set_hook':{
   const parts=([['Say','spoken'],['They see','visual'],['On screen','text']] as const).filter(([,key])=>action[key]!==undefined);
   return {field:'Hook',now:parts.map(([label,key])=>`${label}: ${pkg?.hook[key].trim()||none}`),after:parts.map(([label,key])=>`${label}: ${action[key]}`)};
  }
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
export function screenSummary(tab:CompanionTab,facts:{pkg:Package|null;outline:Outline|null;recorded?:number;part?:string}):string{
 const scenes=facts.outline?.scenes.length??0;
 const titles=facts.pkg?.titles.filter(title=>title.trim()).length??0;
 const hook=facts.pkg?.hook.spoken.trim()?'hook written':'no hook yet';
 const sceneLine=scenes?`${scenes} ${scenes===1?'scene':'scenes'}`:'no scenes yet';
 switch(tab){
  case 'idea':return `The idea page: the board, and a package with ${titles} of 3 titles and ${hook}; ${sceneLine}${facts.part?`; open now: ${facts.part}`:''}`;
  case 'record':return `Recording; ${sceneLine}${facts.recorded!==undefined?`, ${facts.recorded} recorded`:''}`;
  case 'publish':return `Publish form; description ${facts.pkg?.description?.trim()?'written':'not written yet'}`;
  case 'edit':return 'The editor: the timeline, its transcript and the stage';
  case 'research':return 'Research, the channel\'s own board';
 }
}
