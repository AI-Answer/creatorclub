import type {VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';

/** A video's stage: neutral in progress, green when published. */
export function StagePill({stage}:{stage:VideoStage}){
 return <span className={`stage-pill st-${stage}`} style={{borderRadius:'var(--cc-r-pill)',background:stage==='published'?'var(--cc-ok-soft)':'var(--cc-bg-sunk)',color:stage==='published'?'var(--cc-ok)':'var(--cc-text-2)'}}><span className="d" style={{borderRadius:'50%'}}/>{STAGE_LABEL[stage]}</span>;
}
