import type {OnePager,Outline,Package,ResearchTile,Video} from '../../../shared/club';
import {chosenIndex,pairThumbs,thumbProblems,titleProblems} from '../../../shared/package-rules';

/*
 * The Idea page's rules that need no screen: what each section of "Your video" says while it is closed and whether it is done, which
 * section opens first, the checks under each title and thumbnail pair, and the questions asked before the scenes are drafted.
 */

/** A check under a title and thumbnail pair: the rule it broke, or that it follows them all. */
export type PairCheck={ok:boolean;text:string};

/** The title and thumbnail rules Claude is held to (`shared/package-rules`), for one pair. Nothing for a pair with no title yet. */
export function pairChecks(title:string,thumb:string):PairCheck[]{
 if(!title.trim())return [];
 const problems=[...titleProblems(title).map(problem=>`The title ${problem}.`),...(thumb.trim()?thumbProblems(thumb).map(problem=>`The thumbnail text ${problem}.`):['No thumbnail text yet.'])];
 return problems.length?problems.map(text=>({ok:false,text})):[{ok:true,text:'Follows the title and thumbnail rules.'}];
}

export const SECTIONS=['sketch','idea','package','hook','scenes'] as const;
export type SectionKey=typeof SECTIONS[number];
export const SECTION_NAME:Record<SectionKey,string>={sketch:'Sketch',idea:'The idea',package:'Title and thumbnail',hook:'Hook',scenes:'Scenes'};

/** What a closed section says, and whether its part of the video is there. */
export type SectionStatus={done:boolean;summary:string};

const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;

export function sectionStatus(key:SectionKey,{video,pkg,outline,sketch}:{video:Video;pkg:Package|null;outline:Outline|null;sketch?:OnePager|null}):SectionStatus{
 switch(key){
  case 'sketch':{
   const logline=sketch?.logline.trim()??'';
   return {done:!!logline,summary:logline||'Sketch the video.'};
  }
  case 'idea':{
   const about=pkg?.angle.trim()||video.idea?.why?.trim()||'';
   return {done:!!about,summary:about||'Say what the video is about.'};
  }
  case 'package':{
   if(!pkg||!pkg.titles.some(title=>title.trim()))return {done:false,summary:'No title options yet.'};
   const at=chosenIndex(pkg.titles,video.title);
   return at<0?{done:false,summary:'Pick one of your titles.'}:{done:!!pairThumbs(pkg,video.title)[at].trim(),summary:pkg.titles[at].trim()};
  }
  case 'hook':{
   const spoken=pkg?.hook.spoken.trim()??'';
   return {done:!!spoken,summary:spoken||'Write the first thing you say.'};
  }
  case 'scenes':{
   const scenes=outline?.scenes??[];
   const target=video.targetSeconds?` of ${clock(video.targetSeconds)}`:'';
   return scenes.length?{done:true,summary:`${scenes.length} ${scenes.length===1?'scene':'scenes'} · ${clock(scenes.reduce((sum,scene)=>sum+scene.seconds,0))}${target}`}:{done:false,summary:'Not drafted yet.'};
  }
 }
}

/** What one press of Fill still has to write: the package when any of its parts is empty (a run fills only what is empty), the scenes when there are none. */
export function emptyParts(pkg:Package|null,outline:Outline|null):{package:boolean;scenes:boolean}{
 const packageEmpty=!pkg||!pkg.angle.trim()||pkg.titles.some(title=>!title.trim())||!pkg.hook.spoken.trim()||!(pkg.thumbs??[pkg.thumbnailText]).some(text=>text.trim());
 return {package:packageEmpty,scenes:!outline?.scenes.length};
}

/** The drag of a board card onto a scene carries this type, so nothing else dropped there is taken for a card. */
export const CARD_DRAG='application/x-creator-compiler-card';
/** What a board card adds to a scene, and how the list names it: a note's first line, a video's or a link's title. */
export function cardText(card:ResearchTile):string{
 if(card.kind==='note'||card.kind==='text'){
  const line=(card.text??'').split('\n').map(part=>part.replace(/^#+\s*/,'').trim()).find(Boolean)??'';
  return line.length>160?`${line.slice(0,157)}…`:line;
 }
 return (card.title??card.url??'').trim();
}
