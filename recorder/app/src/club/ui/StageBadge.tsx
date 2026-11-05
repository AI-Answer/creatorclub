import type {VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';

/** One stage vocabulary and color treatment across board, table and calendar. */
export function StageBadge({stage,dotOnly=false,decorative=false}:{stage:VideoStage;dotOnly?:boolean;decorative?:boolean}){
 const dot=<span className={`col-dot st-${stage}`} role={decorative?undefined:'img'} aria-label={decorative?undefined:STAGE_LABEL[stage]} aria-hidden={decorative||undefined}/>;
 return dotOnly?dot:<span className="stage-badge stage-pill"><StageBadge stage={stage} dotOnly decorative/>{STAGE_LABEL[stage]}</span>;
}
