import {useState} from 'react';
import type {ConceptLevel,ConceptRating,Package} from '../../../shared/club';
import {Button,DraftThumb,Dialog,Ed,Icon,cn,type IconName} from '../ui';
import {EMPTY_PACKAGE,chosenTitle,hasEmptyPlace,packageIsEmpty,titleTooLong,wordCount,type PackageGroup} from './plan-logic';

const LEVELS:{value:ConceptLevel;label:string}[]=[{value:'high',label:'High'},{value:'mid',label:'Mid'},{value:'low',label:'Low'}];
const WHY:{key:'demand'|'gap'|'show';label:string}[]=[{key:'demand',label:'Demand'},{key:'gap',label:'Gap'},{key:'show',label:'Easy to show'}];
const HOOK:{key:keyof Package['hook'];label:string;icon:IconName;ph:string}[]=[
 {key:'visual',label:'Visual',icon:'Eye',ph:'What they see first'},
 {key:'spoken',label:'Spoken',icon:'Mic',ph:'The first line you say'},
 {key:'text',label:'On-screen',icon:'Type',ph:'Text on screen'},
];

/**
 * The left column of Plan: why this video gets clicked. Everything is editable in place. `Write titles` and `Write hooks` run the
 * package job; its result fills only what is empty, and writing a group that is already full asks first.
 */
export function PackageColumn({videoId,videoTitle,pkg,running,onEdit,onWrite,onPickTitle}:{videoId:string;videoTitle:string;pkg:Package|null;running:boolean;onEdit(next:Package):void;onWrite(replace?:PackageGroup):void;onPickTitle(title:string):void}){
 const value=pkg??EMPTY_PACKAGE;
 const [ask,setAsk]=useState<PackageGroup|null>(null);
 const set=<K extends keyof Package>(key:K,next:Package[K])=>onEdit({...value,[key]:next});
 const chosen=chosenTitle(value.titles,videoTitle);
 const write=(group:PackageGroup)=>{if(hasEmptyPlace(pkg,group)||packageIsEmpty(pkg))onWrite();else setAsk(group);};
 const confirm=()=>{const group=ask;setAsk(null);if(group)onWrite(group);};
 const spin=(group:PackageGroup)=>running&&hasEmptyPlace(pkg,group);
 const setTitle=(index:number,text:string)=>{
  const titles=[...value.titles] as Package['titles'];titles[index]=text;
  onEdit({...value,titles});
  // The chosen title is the video's title, so editing it keeps them the same.
  if(index===chosen&&text.trim())onPickTitle(text.trim());
 };
 const setRating=(key:'demand'|'gap'|'show',next:ConceptRating)=>onEdit({...value,[key]:next});

 return <section className="pkg" aria-label="Package">
  <div className="doc-h"><Icon name="Package" size={18}/><h2>Package</h2></div>
  <div className="doc-sub">Decide why this video gets clicked. Everything here is editable. Click to change it.</div>

  <div className="blk"><div className="blk-h"><h4>Title</h4><span className="faint small">Pick one · 7 words or fewer</span>
   <Button size="sm" className="ai" disabled={running} onClick={()=>write('titles')}>{spin('titles')?<span className="spin" aria-label="Working" role="status"/>:<Icon name="Sparkles" size={14}/>}Write titles</Button></div>
   {value.titles.map((title,i)=><div key={i} className={cn('topt',chosen===i&&'on')} role="radio" aria-checked={chosen===i} tabIndex={0}
     onClick={()=>title.trim()&&onPickTitle(title.trim())} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key===' '||event.key==='Enter')){event.preventDefault();if(title.trim())onPickTitle(title.trim());}}}>
    <span className="radio"/>
    {spin('titles')&&!title?<div className="shimmer grow" style={{height:20}}/>:<Ed value={title} ph="Add another title" onChange={text=>setTitle(i,text)}/>}
    <span className={cn('cnt',titleTooLong(title)&&'bad')}>{wordCount(title)}w · {[...title].length}/60</span>
   </div>)}
  </div>

  <div className="blk"><div className="blk-h"><h4>Thumbnail text</h4><span className="faint small">2 to 5 words</span></div>
   <div className="row" style={{alignItems:'flex-start',gap:16}}>
    <div className="grow"><Ed className="ph-small" value={value.thumbnailText} ph="Empty. Type 2 to 5 words, readable at phone size" onChange={text=>set('thumbnailText',text)} style={{fontSize:18,fontWeight:700,letterSpacing:'-0.02em'}}/>
     <div className="small muted" style={{marginTop:10,lineHeight:1.5}}>The thumbnail should name one real thing viewers recognise, not repeat the title.</div></div>
    <div className="prev-thumb"><div className="thumb"><DraftThumb text={value.thumbnailText} seed={videoId}/></div></div>
   </div></div>

  <div className="blk"><div className="blk-h"><h4>Hook</h4><span className="faint small">The first 10 seconds</span>
   <Button size="sm" className="ai" disabled={running} onClick={()=>write('hook')}>{spin('hook')?<span className="spin" aria-label="Working" role="status"/>:<Icon name="Sparkles" size={14}/>}Write hooks</Button></div>
   {HOOK.map(({key,label,icon,ph})=><div key={key} className="hook-row"><span className="k"><Icon name={icon} size={14}/>{label}</span>
    {spin('hook')&&!value.hook[key]?<div className="shimmer" style={{height:20}}/>:<Ed multiline value={value.hook[key]} ph={ph} onChange={text=>set('hook',{...value.hook,[key]:text})}/>}</div>)}
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

  <Dialog open={ask!==null} onClose={()=>setAsk(null)} title={ask==='hook'?'Write the hook again?':'Write the titles again?'} description={ask==='hook'?'Your hook is written. A new one replaces it, and you can undo that.':'All three titles are written. New ones replace them, and you can undo that.'}
   footer={<><Button onClick={()=>setAsk(null)}>Cancel</Button><Button variant="primary" onClick={confirm}>{ask==='hook'?'Write hooks':'Write titles'}</Button></>}/>
 </section>;
}
