import {STEPS_SENTENCE,VIDEO_STEPS} from '../steps';
import {Button,Dialog,Icon,type IconName} from '../ui';

/** What you do on the Board. These are moves, not steps: the steps are the tabs (`STEPS_SENTENCE`). */
const MOVES:ReadonlyArray<readonly [IconName,string,string]>=[
 ['note','Gather','Add links, videos, notes and screenshots. Paste a link anywhere on the board.'],
 ['companion','Ask','Ask Claude about what you gathered. Use its hooks and titles, or add an answer to the board.'],
 ['draft','Draft','Draft scenes from the board. You review them in Plan before you record.'],
];

/** How the Board works. Shown once per channel, and again from the ? button. */
export function BoardTip({onClose}:{onClose():void}){
 return <Dialog title="How the board works" onClose={onClose} width={620} footer={<Button variant="primary" onClick={onClose}>Got it</Button>}>
  <div className="help-steps">{MOVES.map(([icon,title,text])=><div key={title} className="hs"><Icon name={icon} size={18}/><b>{title}</b><span>{text}</span></div>)}</div>
  <p className="small muted" style={{margin:'14px 0 0'}}>{VIDEO_STEPS[0].name} is the first of the five steps. {STEPS_SENTENCE}</p>
 </Dialog>;
}
