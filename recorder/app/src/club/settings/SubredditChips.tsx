import {suggestSubreddits} from '../../../shared/club';
import {Icon} from '../ui';

/** One-click chips for well-known subreddits that match the channel's topics. Nothing is added until one is pressed. Nothing shows when there is nothing to suggest. */
export function SubredditChips({topics,have,disabled,onAdd}:{topics:readonly string[];have:readonly string[];disabled?:boolean;onAdd(name:string):void}){
 const names=suggestSubreddits(topics,have);
 if(!names.length)return null;
 return <div style={{marginTop:10}}>
  <div className="small muted" style={{marginBottom:6}}>Suggested for your topics</div>
  <div className="row" style={{flexWrap:'wrap',gap:6}}>{names.map(name=>
   <button key={name} type="button" className="chip" disabled={disabled} aria-label={`Add r/${name}`} onClick={()=>onAdd(name)} style={{cursor:'pointer'}}><Icon name="Plus" size={12}/>r/{name}</button>)}
  </div>
 </div>;
}
