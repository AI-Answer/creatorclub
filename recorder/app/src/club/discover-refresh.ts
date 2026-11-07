export type FeedKind='videos'|'posts';
export type DiscoverRefresh={generation:number;phase:'idle'|'running'|'done';left:ReadonlySet<FeedKind>;videos:number;posts:number;news:boolean};
export const EMPTY_REFRESH:DiscoverRefresh={generation:0,phase:'idle',left:new Set(),videos:0,posts:0,news:false};
export type RefreshEvent={type:'start';generation:number;kinds:FeedKind[]}|{type:'join';generation:number;kinds:FeedKind[]}|{type:'settle';generation:number;kind:FeedKind;found?:number};
/** A refresh owns its wait list and counts; a late reply cannot settle the next refresh. */
export function discoverRefresh(state:DiscoverRefresh,event:RefreshEvent):DiscoverRefresh{
 if(event.type==='join')return event.generation!==state.generation||state.phase!=='running'?state:{...state,left:new Set([...state.left,...event.kinds])};
 if(event.type==='start')return {generation:event.generation,phase:'running',left:new Set(event.kinds),videos:0,posts:0,news:false};
 if(state.phase!=='running'||event.generation!==state.generation||!state.left.has(event.kind))return state;
 const left=new Set(state.left);left.delete(event.kind);
 return {...state,left,phase:left.size?'running':'done',[event.kind]:state[event.kind]+(event.found??0),news:state.news||event.found!==undefined};
}
