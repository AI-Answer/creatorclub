import {STEP_NAMES} from '../steps';
import {Button,Dialog,Icon,type IconName} from '../ui';

/** What you do on the Board. These are moves, not steps: the steps are the tabs (`STEP_NAMES`). */
const MOVES:ReadonlyArray<readonly [IconName,string,string]>=[
 ['note','Gather','Add links, videos, notes and screenshots. Paste a link anywhere on the board.'],
 ['companion','Ask','Ask Claude about what you gathered. Use its hooks and titles, or add an answer to the board.'],
 ['draft','Draft','Draft scenes from the board. You review them in Plan before you record.'],
];

/** How the Board works. Shown once per channel, and again from the ? button. */
export function BoardTip({onClose}:{onClose():void}){
 return <Dialog title="How the board works" onClose={onClose} width={620} footer={<Button variant="primary" onClick={onClose}>Got it</Button>}>
  <div className="help-steps">{MOVES.map(([icon,title,text])=><div key={title} className="hs"><Icon name={icon} size={18}/><b>{title}</b><span>{text}</span></div>)}</div>
  <p className="small muted">Drag empty canvas to select cards; Shift-click adds to the selection. Scroll to pan, pinch to zoom, or hold Space and drag. Arrows move cards; Delete removes them; ⌘A selects all; Escape clears. Press S to draw a section, and Shift+1 to fit the board.</p>
  <p className="small muted" style={{margin:'14px 0 0'}}>This is the first of the five steps: {STEP_NAMES}.</p>
 </Dialog>;
}
