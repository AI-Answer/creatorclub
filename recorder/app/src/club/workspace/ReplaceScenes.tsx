import type {VideoScene} from '../../../shared/club';
import {recordedCount} from '../scene-status';
import {toProgress} from '../scenes';
import {Button,Dialog} from '../ui';

/** "Replace the scenes?": asked before new scenes replace ones that exist (the Board's Draft scenes) or have takes (a companion card). */
export function ReplaceScenes({scenes,action,undoLine,onKeep,onReplace}:{scenes:readonly VideoScene[];action:string;undoLine:string;onKeep():void;onReplace():void}){
 const recorded=recordedCount(toProgress(scenes));
 return <Dialog title="Replace the scenes?" onClose={onKeep} footer={<><Button variant="ghost" onClick={onKeep}>Keep my scenes</Button><Button variant="primary" onClick={onReplace}>Replace {scenes.length} scenes</Button></>}>
  <p className="muted" style={{margin:0,lineHeight:1.55}}>This video already has {scenes.length} scenes{recorded?`, and ${recorded} are recorded`:''}. {action} replaces them. {undoLine}</p>
 </Dialog>;
}
