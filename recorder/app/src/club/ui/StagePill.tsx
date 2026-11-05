import type {VideoStage} from '../../../shared/club';
import {StageBadge} from './StageBadge';

/** Compatibility name for the shared stage badge. */
export function StagePill({stage}:{stage:VideoStage}){return <StageBadge stage={stage}/>;}
