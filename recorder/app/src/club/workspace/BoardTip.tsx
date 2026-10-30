import {Button,Dialog,Icon,type IconName} from '../ui';

const STEPS:ReadonlyArray<readonly [IconName,string,string]>=[
 ['note','1 Gather','Add links, videos, notes and screenshots. Paste a link anywhere on the board.'],
 ['companion','2 Ask','Ask Claude about what you gathered. Use its hooks and titles, or add an answer to the board.'],
 ['draft','3 Draft','Draft scenes from the board. You review them in Plan before you record.'],
];

/** How the Board works. Shown once per channel, and again from the ? button. */
export function BoardTip({onClose}:{onClose():void}){
 return <Dialog title="How the board works" onClose={onClose} width={620} footer={<Button variant="primary" onClick={onClose}>Got it</Button>}>
  <div className="help-steps">{STEPS.map(([icon,title,text])=><div key={title} className="hs"><Icon name={icon} size={18}/><b>{title}</b><span>{text}</span></div>)}</div>
 </Dialog>;
}
