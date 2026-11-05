import {useCallback,useMemo,useState} from 'react';
import {CHANNEL_BOARD} from '../../../shared/club';
import type {CompanionChanged} from '../../../shared/companion';
import {notifyVideosChanged} from '../api';
import type {Route} from '../routes';
import {ScreenHeader} from './ScreenHeader';
import {Board} from '../workspace/Board';
import {Companion} from '../workspace/Companion';

/**
 * Research: the channel's own Board, a canvas for everything that might become a video (cards from Discover, your ideas and videos, links, notes
 * and Markdown files), with the companion docked beside it. A selection of cards starts a new video.
 */
export function ResearchScreen({navigate}:{navigate(route:Route,options?:{replace?:boolean}):void}){
 const [boardKey,setBoardKey]=useState(0),[selection,setSelection]=useState<readonly string[]>([]);
 const changed=useCallback((what:CompanionChanged[])=>{
  if(what.includes('videos'))notifyVideosChanged();
  if(what.includes('board')||what.includes('videos'))setBoardKey(key=>key+1);
 },[]);
 const screen=useMemo(()=>selection.length?`Channel board, with ${selection.length} ${selection.length===1?'card':'cards'} selected`:'Channel board, the channel\'s own board',[selection.length]);
 return <div className="ws research">
  <ScreenHeader title="Channel board" description="Gather references, connect ideas, and start a video."/>
  <div className="ws-row">
   <div className="ws-col"><div className="ws-body"><Board board={CHANNEL_BOARD} refreshKey={boardKey} navigate={navigate} onSelection={setSelection}/></div></div>
   <Companion videoId={CHANNEL_BOARD} tab="research" screen={screen} selection={selection} pkg={null} outline={null} onChanged={changed}/>
  </div>
 </div>;
}
