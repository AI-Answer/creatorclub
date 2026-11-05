import {useMemo,useState} from 'react';
import type {Video} from '../../../shared/club';
import {fmtNum} from '../format';
import {videoThumbId} from '../ideas';
import {TABLE_HEAD,clickSort,isDescending,tableDateText,tableRows,type TableSort} from '../production';
import {recordedCount,type SceneProgress} from '../scene-status';
import {Empty,SceneDots,StagePill} from '../ui';

const NONE:readonly SceneProgress[]=[];

function TableCover({video}:{video:Video}){
 const [loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false);
 if(failed)return null;
 const youtube=videoThumbId(video);
 return <img className="video-table-cover" hidden={!loaded} alt="" src={youtube?`https://i.ytimg.com/vi/${youtube}/mqdefault.jpg`:`/api/club/videos/${encodeURIComponent(video.id)}/cover`} onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>;
}

/** Every video in a table: stage, scenes recorded, publish date and views. Press a heading to sort; press a row to open the video. */
export function TableView({videos,scenes,onOpen}:{videos:readonly Video[];scenes:Record<string,SceneProgress[]>;onOpen(video:Video):void}){
 const [sort,setSort]=useState<TableSort>({key:'stage',dir:1});
  const rows=useMemo(()=>tableRows(videos,sort,video=>recordedCount(scenes[video.id]??NONE)),[videos,sort,scenes]);
 const descending=isDescending(sort);
 const press=(key:TableSort['key'])=>setSort(current=>clickSort(current,key));
 if(!rows.length)return <div className="card"><Empty icon="table" title="No videos yet">Use New video to type an idea or start a quick recording.</Empty></div>;
 return <div className="card video-table" style={{overflow:'hidden'}}><table className="table">
  <thead><tr>{TABLE_HEAD.map(([key,label])=>{
   const on=sort.key===key;
   return <th key={key} tabIndex={0} onClick={()=>press(key)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();press(key);}}}
    aria-sort={on?(descending?'descending':'ascending'):'none'}>{label}{on?(descending?' ↓':' ↑'):''}</th>;
  })}</tr></thead>
  <tbody>{rows.map(video=>{
   const dots=scenes[video.id]??NONE,date=tableDateText(video);
   return <tr key={video.id} tabIndex={0} onClick={()=>onOpen(video)} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onOpen(video);}}>
    <td><div className="row" style={{gap:10}}><TableCover video={video}/><span style={{fontWeight:'var(--cc-weight-medium)'}}>{video.title}</span></div></td>
    <td><StagePill stage={video.stage}/></td>
    <td>{recordedCount(dots)>0?<span className="row"><SceneDots scenes={dots}/><span className="muted tnum">{recordedCount(dots)} of {dots.length}</span></span>:<span className="muted">None yet</span>}</td>
    <td className="tnum">{date?(date.planned?<span className="muted">{date.text}</span>:date.text):<span className="muted">Not scheduled</span>}</td>
    <td className="tnum">{video.views?<b>{fmtNum(video.views)}</b>:<span className="faint">—</span>}</td>
   </tr>;
  })}</tbody></table></div>;
}
