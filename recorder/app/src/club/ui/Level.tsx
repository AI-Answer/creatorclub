import type {ConceptRating} from '../../../shared/club';

/** Three bars for high, mid or low, with the reason in the tooltip. Nothing without a rating. */
export function Level({label,d}:{label:string;d?:ConceptRating|null}){
 if(!d)return null;
 return <span className={`lvl ${d.level||'mid'}`} title={d.note||''}><span className="bars"><i/><i/><i/></span>{label}</span>;
}
