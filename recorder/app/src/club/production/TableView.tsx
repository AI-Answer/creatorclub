import {useMemo,useState} from 'react';
import type {Video} from '../../../shared/club';
import {fmtNum} from '../format';
import {videoThumbId} from '../ideas';
import {TABLE_HEAD,clickSort,isDescending,tableDateText,tableRows,type TableSort} from '../production';
import {recordedCount,type SceneProgress} from '../scene-status';
import {Empty,SceneDots,StagePill,Thumb} from '../ui';

const NONE:readonly SceneProgress[]=[];

/** Every video in a table: stage, scenes recorded, publish date and views. Press a heading to sort; press a row to open the video. */
export function TableView({videos,scenes,onOpen}:{videos:readonly Video[];scenes:Record<string,SceneProgress[]>;onOpen(video:Video):void}){
 const [sort,setSort]=useState<TableSort>({key:'stage',dir:1});
  const rows=useMemo(()=>tableRows(videos,sort,video=>recordedCount(scenes[video.id]??NONE)),[videos,sort,scenes]);
 const descending=isDescending(sort);
 const press=(key:TableSort['key'])=>setSort(current=>clickSort(current,key));
 if(!rows.length)return <div className="card"><Empty icon="table" title="No videos yet">Break down a video to get your first idea.</Empty></div>;
 return <div className="card" style={{overflow:'hidden'}}><table className="table">
  <thead><tr>{TABLE_HEAD.map(([key,label])=>{
   const on=sort.key===key;
   return <th key={key} tabIndex={0} onClick={()=>press(key)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();press(key);}}}
    aria-sort={on?(descending?'descending':'ascending'):'none'}>{label}{on?(descending?' ↓':' ↑'):''}</th>;
  })}</tr></thead>
  <tbody>{rows.map(video=>{
   const dots=scenes[video.id]??NONE,date=tableDateText(video);
   return <tr key={video.id} tabIndex={0} onClick={()=>onOpen(video)} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onOpen(video);}}>
    <td><div className="row" style={{gap:12}}><Thumb videoId={videoThumbId(video)} text={video.title} seed={video.id} style={{width:72,flex:'none',borderRadius:5}}/><span style={{fontWeight:550}}>{video.title}</span></div></td>
    <td><StagePill stage={video.stage}/></td>
    <td>{dots.length?<span className="row"><SceneDots scenes={dots}/><span className="muted tnum">{recordedCount(dots)} of {dots.length}</span></span>:<span className="faint">—</span>}</td>
    <td className="tnum">{date?(date.planned?<span className="muted">{date.text}</span>:date.text):<span className="faint">—</span>}</td>
    <td className="tnum">{video.views?<b>{fmtNum(video.views)}</b>:<span className="faint">—</span>}</td>
   </tr>;
  })}</tbody></table></div>;
}
