import type {VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';

/** A video's stage as a coloured pill. */
export function StagePill({stage}:{stage:VideoStage}){
 return <span className={`stage-pill st-${stage}`}><span className="d"/>{STAGE_LABEL[stage]}</span>;
}
