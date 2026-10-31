import {useEffect,useRef,useState} from 'react';
import type {InstalledSkill} from '../../../shared/skills';
import {Icon} from '../ui';

/** The page size a skill's HTML preview is drawn at until the page says its own (many are vertical), and the tallest the box may be. */
const FIRST_W=1280,FIRST_H=720,MAX_BOX_H=200;
const label=(file:string)=>(file.split('/').pop()??file).replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ');

/**
 * What one of the person's skills makes, from files inside that skill: a page plays in a sandbox (it cannot reach the app or its data),
 * a GIF or image shows as it is, a short video loops muted. Nothing is made up: a skill with no such file shows no preview.
 */
export function SkillPreview({skill}:{skill:InstalledSkill}){
 const [at,setAt]=useState(0),[room,setRoom]=useState(300),[page,setPage]=useState<[number,number]>([FIRST_W,FIRST_H]),box=useRef<HTMLDivElement>(null),frame=useRef<HTMLIFrameElement>(null);
 useEffect(()=>{setAt(0);},[skill.name]);
 useEffect(()=>{setPage([FIRST_W,FIRST_H]);},[skill.name,at]);
 useEffect(()=>{const el=box.current;if(!el)return;const fit=()=>setRoom(el.clientWidth);fit();const watch=new ResizeObserver(fit);watch.observe(el);return()=>watch.disconnect();},[]);
 // The page reports its own size once it has loaded.
 useEffect(()=>{const hear=(event:MessageEvent)=>{const size=event.data?.skillPreviewSize;if(event.source===frame.current?.contentWindow&&Array.isArray(size)&&size[0]>0&&size[1]>0)setPage([size[0],size[1]]);};window.addEventListener('message',hear);return()=>window.removeEventListener('message',hear);},[]);
 const scale=Math.min(room/page[0],MAX_BOX_H/page[1]);
 // A page is fetched and shown as inline content of a sandboxed frame: it has no address of its own and no access to the app.
 const [html,setHtml]=useState<{url:string;text:string}|null>(null);
 const file=skill.previews[Math.min(at,skill.previews.length-1)],count=skill.previews.length;
 const url=`/api/club/skills/${encodeURIComponent(skill.name)}/preview?file=${encodeURIComponent(file)}`;
 const isPage=/\.html?$/i.test(file),video=/\.(mp4|webm)$/i.test(file);
 useEffect(()=>{if(!isPage)return;const controller=new AbortController();fetch(url,{signal:controller.signal}).then(r=>r.ok?r.text():Promise.reject()).then(text=>setHtml({url,text}),()=>{});return()=>controller.abort();},[url,isPage]);
 const step=(by:number)=>setAt(i=>(i+by+count)%count);
 return <div className="cmp-prev" aria-label={`Preview of ${skill.name}`}>
  <div className="cmp-prev-box" ref={box} style={{height:Math.round(page[1]*scale)}}>
   {isPage?(html?.url===url&&<iframe key={url} ref={frame} title={`${skill.name}: ${label(file)}`} srcDoc={html.text} sandbox="allow-scripts" tabIndex={-1} style={{width:page[0],height:page[1],left:Math.round((room-page[0]*scale)/2),transform:`scale(${scale})`}}/>)
    :video?<video key={url} src={url} muted loop autoPlay playsInline/>
    :<img key={url} src={url} alt={`${skill.name}: ${label(file)}`}/>}
  </div>
  <div className="cmp-prev-bar">
   <span className="cmp-prev-name">{label(file)}</span>
   {count>1&&<span className="cmp-prev-nav"><button type="button" aria-label="Previous example" onMouseDown={e=>e.preventDefault()} onClick={()=>step(-1)}><Icon name="back" size={13}/></button><span>{Math.min(at,count-1)+1} of {count}</span><button type="button" aria-label="Next example" onMouseDown={e=>e.preventDefault()} onClick={()=>step(1)}><Icon name="forward" size={13}/></button></span>}
  </div>
 </div>;
}
