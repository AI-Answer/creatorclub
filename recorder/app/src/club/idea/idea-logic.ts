import type {Outline,Package,ResearchTile,Video} from '../../../shared/club';
import {chosenIndex,pairThumbs,thumbProblems,titleProblems} from '../../../shared/package-rules';

/*
 * The Idea page's rules that need no screen: the proof an idea has on its board, what each section of "Your video" says while it
 * is closed and whether it is done, which section opens first, the checks under each title and thumbnail pair, and the questions
 * asked before the scenes are drafted.
 */

/** A video beats its channel's usual views by this much or more: the board's proof that people want the idea. */
export const PROOF_TIMES=3;

/** The board's video cards that have a ×-number, the highest first. */
export const proofCards=(tiles:readonly ResearchTile[]|undefined)=>(tiles??[])
 .filter(tile=>tile.kind==='video'&&typeof tile.meta.multiplier==='number'&&Number.isFinite(tile.meta.multiplier)&&tile.meta.multiplier>0)
 .sort((a,b)=>b.meta.multiplier!-a.meta.multiplier!);

const times=(m:number)=>`${m>=10?Math.round(m):Math.round(m*10)/10}×`;

/** One line on the proof, from the board's own cards: how many beat their channel's usual by 3× or more, which are still being read, or what is missing. */
export function proofLine(tiles:readonly ResearchTile[]|undefined):{proven:boolean;text:string}{
 const videos=(tiles??[]).filter(tile=>tile.kind==='video'),cards=proofCards(tiles);
 const strong=cards.filter(tile=>tile.meta.multiplier!>=PROOF_TIMES).length;
 // A video card is read in the background after it is added: until then it has no views and no number.
 const reading=videos.filter(tile=>tile.meta.views===undefined&&tile.meta.multiplier===undefined).length;
 if(strong)return {proven:true,text:`${strong} ${strong===1?'video':'videos'} on your board got ${PROOF_TIMES}× or more their channel's usual views.`};
 if(reading)return {proven:false,text:`${reading===1?'1 video on your board is':`${reading} videos on your board are`} still being read. ${reading===1?'Its number shows':'Their numbers show'} here when it's done.`};
 if(cards.length)return {proven:false,text:`No video on your board got ${PROOF_TIMES}× its channel's usual views yet. The best got ${times(cards[0].meta.multiplier!)}.`};
 if(videos.length)return {proven:false,text:`The ${videos.length===1?'video':'videos'} on your board ${videos.length===1?'has':'have'} no number: ${videos.length===1?'its':'their'} channel's usual views aren't known.`};
 return {proven:false,text:'No proof yet: add a video like this one to the board.'};
}

/** A check under a title and thumbnail pair: the rule it broke, or that it follows them all. */
export type PairCheck={ok:boolean;text:string};

/** The title and thumbnail rules Claude is held to (`shared/package-rules`), for one pair. Nothing for a pair with no title yet. */
export function pairChecks(title:string,thumb:string):PairCheck[]{
 if(!title.trim())return [];
 const problems=[...titleProblems(title).map(problem=>`The title ${problem}.`),...(thumb.trim()?thumbProblems(thumb).map(problem=>`The thumbnail text ${problem}.`):['No thumbnail text yet.'])];
 return problems.length?problems.map(text=>({ok:false,text})):[{ok:true,text:'Follows the title and thumbnail rules.'}];
}

export const SECTIONS=['idea','package','hook','scenes'] as const;
export type SectionKey=typeof SECTIONS[number];
export const SECTION_NAME:Record<SectionKey,string>={idea:'The idea',package:'Title and thumbnail',hook:'Hook',scenes:'Scenes'};

/** What a closed section says, and whether its part of the video is there. */
export type SectionStatus={done:boolean;summary:string};

const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;

export function sectionStatus(key:SectionKey,{video,pkg,outline}:{video:Video;pkg:Package|null;outline:Outline|null}):SectionStatus{
 switch(key){
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
