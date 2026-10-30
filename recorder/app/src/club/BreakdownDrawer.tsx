import type {BreakdownSummary,Video} from '../../shared/club';
import {BreakdownPanel} from './BreakdownPanel';
import {savedBreakdown} from './useBreakdowns';
import {Drawer,Icon,Spinner} from './ui';

/** Break down a Working now video in a drawer. A breakdown already made for it opens at once; otherwise one runs, and closing the drawer stops it. */
export function BreakdownDrawer({videoId,title,channel,multiplier,saved,videos,onAdded,onClose}:{videoId:string;title:string;channel:string;multiplier:number|null;saved:readonly BreakdownSummary[]|null;videos:readonly Video[];onAdded(videoId:string):void;onClose():void}){
 const found=saved&&savedBreakdown(saved,videoId);
 return <Drawer onClose={onClose} label="Breakdown" header={<div className="row"><Icon name="script" size={16}/><b>Breakdown</b><span className="faint small ellipsis" style={{maxWidth:260}}>· {channel}</span></div>}>
  <div className="bd-narrow" style={{margin:'-20px -22px'}}>
   {saved===null?<div className="bd"><Spinner label="Looking for a saved breakdown" size={18}/></div>:<BreakdownPanel target={found?{kind:'saved',id:found.id}:{kind:'link',url:`https://www.youtube.com/watch?v=${videoId}`}} videoId={videoId} title={title} multiplier={multiplier} videos={videos} onAdded={onAdded}/>}
  </div>
 </Drawer>;
}
