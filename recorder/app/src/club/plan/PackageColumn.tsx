import {useEffect,useState,type ReactNode} from 'react';
import type {ConceptLevel,ConceptRating,Package} from '../../../shared/club';
import {Button,Dialog,Ed,Icon,Menu,cn,type IconName,type MenuItem} from '../ui';
import {EMPTY_PACKAGE,chosenTitle,hasEmptyPlace,packageIsEmpty,packageView,shownTitles,titleWarning,type PackageGroup} from './plan-logic';

const LEVELS:{value:ConceptLevel;label:string}[]=[{value:'high',label:'High'},{value:'mid',label:'Mid'},{value:'low',label:'Low'}];
const WHY:{key:'demand'|'gap'|'show';label:string}[]=[{key:'demand',label:'Demand'},{key:'gap',label:'Gap'},{key:'show',label:'Easy to show'}];
/** The hook's spoken line is always shown; what they see and the text on screen are under More. */
const HOOK_MORE:{key:'visual'|'text';label:string;icon:IconName;ph:string}[]=[
 {key:'visual',label:'Visual',icon:'preview',ph:'What they see first'},
 {key:'text',label:'On-screen',icon:'text',ph:'Text on screen'},
];

/** The question before a run writes a group again, and its answer. */
const AGAIN:Record<PackageGroup,{title:string;description:string;confirm:string}>={
 titles:{title:'Write the titles again?',description:'All three titles are written. New ones replace them, and you can undo that.',confirm:'Write titles'},
 thumbnail:{title:'Write the thumbnail text again?',description:'Your thumbnail text is written. New text replaces it, and you can undo that.',confirm:'Write thumbnail text'},
 hook:{title:'Write the hook again?',description:'Your hook is written. A new one replaces it, and you can undo that.',confirm:'Write the hook'},
};

/**
 * Asking before a write replaces a full group: `write(group)` runs the package job at once while the group has an empty place,
 * and otherwise opens a question first. `dialog` is the question, to render once.
 */
export function usePackageWrite(pkg:Package|null,onWrite:(replace?:PackageGroup)=>void){
 const [ask,setAsk]=useState<PackageGroup|null>(null);
 const write=(group:PackageGroup)=>{if(hasEmptyPlace(pkg,group)||packageIsEmpty(pkg))onWrite();else setAsk(group);};
 const confirm=()=>{const group=ask;setAsk(null);if(group)onWrite(group);};
 const words=ask?AGAIN[ask]:AGAIN.titles;
 const dialog=<Dialog open={ask!==null} onClose={()=>setAsk(null)} title={words.title} description={words.description}
  footer={<><Button onClick={()=>setAsk(null)}>Cancel</Button><Button variant="primary" onClick={confirm}>{words.confirm}</Button></>}/>;
 return {write,dialog};
}

/** The uploaded thumbnail of the video, when there is one: the only picture the Package shows (never a made-up one). */
function useThumbnail(videoId:string){
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{
  let alive=true;
  const path=`/api/club/videos/${encodeURIComponent(videoId)}/thumbnail`;
  void fetch(path).then(response=>{if(alive&&response.status===200&&response.headers.get('content-type')?.startsWith('image/'))setUrl(`${path}?v=${Date.now()}`);},()=>{});
  return()=>{alive=false;};
 },[videoId]);
 return url;
}

/**
 * The left column of Plan: why this video gets clicked. Empty, it is one sentence and one action (Claude writes it, or you fill it
 * in yourself). Written, it is compact: the titles as a list with the video's title ticked, the thumbnail text (beside the real
 * thumbnail when one was uploaded) and the hook's first line; the rest is one click away under More. Everything is editable in place,
 * and the one "Write with Claude" menu in the heading writes the titles, the thumbnail text or the hook.
 */
export function PackageColumn({videoId,videoTitle,pkg,running,onEdit,onPickTitle,onWrite}:{videoId:string;videoTitle:string;pkg:Package|null;running:boolean;onEdit(next:Package):void;onPickTitle(title:string):void;
 /** Runs the package job; with a group, that group is written again whole. Without it the column offers no writing. */
 onWrite?(replace?:PackageGroup):void;
}){
 const value=pkg??EMPTY_PACKAGE;
 const [more,setMore]=useState(false),[manual,setManual]=useState(false),[adding,setAdding]=useState<number|null>(null);
 const writer=usePackageWrite(pkg,replace=>onWrite?.(replace));
 const thumbnail=useThumbnail(videoId);
 const view=packageView(pkg,{running,manual});
 const set=<K extends keyof Package>(key:K,next:Package[K])=>onEdit({...value,[key]:next});
 const chosen=chosenTitle(value.titles,videoTitle);
 const spin=(group:PackageGroup)=>running&&hasEmptyPlace(pkg,group);
 const setTitle=(index:number,text:string)=>{
  const titles=[...value.titles] as Package['titles'];titles[index]=text.trim();
  onEdit({...value,titles});
  // The chosen title is the video's title, so editing it keeps them the same.
  if(index===chosen&&text.trim())onPickTitle(text.trim());
 };
 const setRating=(key:'demand'|'gap'|'show',next:ConceptRating)=>onEdit({...value,[key]:next});
 const hookField=(key:keyof Package['hook'],ph:string)=>spin('hook')&&!value.hook[key]?<div className="shimmer" style={{height:20}}/>
  :<Ed multiline value={value.hook[key]} ph={ph} onChange={text=>set('hook',{...value.hook,[key]:text})}/>;

 const heading=(tools?:ReactNode)=><div className="doc-h"><Icon name="package" size={18}/><h2>Package</h2><span className="grow"/>{tools}</div>;

 if(view==='empty')return <section className="pkg" aria-label="Package">
  {heading()}
  <div className="pkg-empty">
   <p>The title, thumbnail text and hook decide whether people click. Claude writes them from the board, and you can change every word.</p>
   <div className="row" style={{gap:14,flexWrap:'wrap'}}>
    {onWrite&&<Button onClick={()=>onWrite()}><Icon name="ai" size={15}/>Write the package with Claude</Button>}
    <button type="button" className="linkish quiet" onClick={()=>{setManual(true);setAdding(0);}}>or fill it in yourself</button>
   </div>
  </div>
 </section>;

 if(view==='writing')return <section className="pkg" aria-label="Package" aria-busy="true">
  {heading()}
  <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:18}} role="status" aria-label="Writing the package">
   {[0,1,2].map(i=><div key={i} className="shimmer" style={{height:22,width:`${90-i*12}%`}}/>)}
   <div className="shimmer" style={{height:20,width:'50%',marginTop:14}}/><div className="shimmer" style={{height:20,width:'80%',marginTop:14}}/>
  </div>
 </section>;

 const writes:MenuItem[]=running?[]:[
  {label:hasEmptyPlace(pkg,'titles')?'Write titles':'Write titles again',icon:'ai',fn:()=>writer.write('titles')},
  {label:hasEmptyPlace(pkg,'thumbnail')?'Write thumbnail text':'Write thumbnail text again',icon:'ai',fn:()=>writer.write('thumbnail')},
  {label:hasEmptyPlace(pkg,'hook')?'Write the hook':'Write the hook again',icon:'ai',fn:()=>writer.write('hook')},
 ];
 const menu=onWrite&&<Menu align="right" label="Write with Claude" items={writes} button={(toggle,open)=><Button size="sm" aria-expanded={open} aria-haspopup="menu" disabled={!writes.length} onClick={toggle}>
  {running?<span className="spin" role="status" aria-label="Writing"/>:<Icon name="ai" size={14}/>}Write with Claude<Icon name="expand" size={13}/></Button>}/>;
 const titles=shownTitles(value.titles,adding);
 const emptySlot=value.titles.findIndex(title=>!title.trim());

 return <section className="pkg" aria-label="Package">
  {heading(menu)}
  <div className="doc-sub">Why this video gets clicked. Click any line to change it.</div>

  <div className="blk"><div className="blk-h"><h4>Title</h4></div>
   <p className="pkg-hint">{chosen>=0||!titles.length?'The ticked one is the video’s title. Keep each to seven words or fewer.':'Use one of these as the video’s title. Keep each to seven words or fewer.'}</p>
   <ul className="tlist" aria-label="Title options">
    {titles.map(({title,index})=>{
     const warning=titleWarning(title),on=chosen===index;
     return <li key={index} className={cn('tline',on&&'on')}>
      <span className="tmark" aria-hidden>{on&&<Icon name="check" size={14} stroke={2.6}/>}</span>
      <div className="grow" style={{minWidth:0}}>
       <Ed value={title} ph="Write a title" autoFocus={index===adding} onChange={text=>{setTitle(index,text);if(index===adding)setAdding(null);}}/>
       {warning&&<div className="small warn-text">{warning}</div>}
      </div>
      {on?<span className="sr-only">This is the video’s title</span>
       :title.trim()&&<Button variant="quiet" size="sm" className="tuse" onClick={()=>onPickTitle(title.trim())}>Use this title</Button>}
     </li>;
    })}
    {spin('titles')&&value.titles.filter(title=>!title.trim()).map((_,i)=><li key={`s${i}`} className="tline"><span className="tmark"/><div className="shimmer grow" style={{height:20}}/></li>)}
   </ul>
   {!spin('titles')&&emptySlot>=0&&adding===null&&<button type="button" className="linkish quiet pkg-add" onClick={()=>setAdding(emptySlot)}><Icon name="add" size={13}/>Add a title</button>}
  </div>

  <div className="blk"><div className="blk-h"><h4>Thumbnail text</h4></div>
   <p className="pkg-hint">Two to five words about one real thing, readable on a phone.</p>
   <div className="row" style={{alignItems:'flex-start',gap:16}}>
    <div className="grow">{spin('thumbnail')&&!value.thumbnailText?<div className="shimmer" style={{height:22}}/>
     :<Ed className="pkg-thumb-text" value={value.thumbnailText} ph="A few words for the picture" onChange={text=>set('thumbnailText',text)}/>}</div>
    {thumbnail&&<div className="prev-thumb sm"><div className="thumb"><img src={thumbnail} alt="The video's thumbnail"/></div></div>}
   </div></div>

  <div className="blk"><div className="blk-h"><h4>Hook</h4></div>
   <p className="pkg-hint">The first line you say. The first ten seconds decide whether people stay.</p>
   {hookField('spoken','The first line you say')}
  </div>

  <button type="button" className="pkg-more" aria-expanded={more} aria-controls="pkg-more-body" onClick={()=>setMore(open=>!open)}>
   <Icon name={more?'collapse':'expand'} size={14}/>More: what the hook shows, why it gets watched, angle, twist
  </button>
  {more&&<div className="pkg-more-body" id="pkg-more-body">
   <div className="blk"><div className="blk-h"><h4>What the hook shows</h4></div>
    {HOOK_MORE.map(({key,label,icon,ph})=><div key={key} className="hook-row"><span className="k"><Icon name={icon} size={14}/>{label}</span>{hookField(key,ph)}</div>)}
   </div>
   <div className="blk"><div className="blk-h"><h4>Why it gets watched</h4></div>
    <div className="dgs">{WHY.map(({key,label})=>{
     const rating=value[key];
     return <div key={key} className="dgs-row"><span className="k muted" style={{fontSize:13,paddingTop:3}}>{label}</span>
      <span className="lvl-pick" role="radiogroup" aria-label={label}>{LEVELS.map(level=><button key={level.value} type="button" role="radio" aria-checked={rating?.level===level.value} className={cn(rating?.level===level.value&&'on',level.value)}
       onClick={()=>setRating(key,{note:'',...rating,level:level.value})}>{level.label}</button>)}</span>
      {rating?<Ed multiline value={rating.note} ph="Why you think so" onChange={text=>setRating(key,{...rating,note:text})} style={{fontSize:13.5,color:'var(--cc-text-2)'}}/>:<span className="faint small" style={{paddingTop:3}}>Not rated</span>}
     </div>;})}</div></div>
   <div className="blk"><div className="blk-h"><h4>Angle</h4></div><Ed multiline value={value.angle} ph="What this video does that others don't" onChange={text=>set('angle',text)} style={{lineHeight:1.55}}/></div>
   <div className="blk"><div className="blk-h"><h4>Twist</h4></div><Ed multiline value={value.twist} ph="The unexpected part" onChange={text=>set('twist',text)} style={{lineHeight:1.55}}/></div>
  </div>}
  {writer.dialog}
 </section>;
}
