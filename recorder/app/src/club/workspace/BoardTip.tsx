import {useAi} from '../useAi';
import {Button,Dialog,Icon,type IconName} from '../ui';

/** What you do on the Board. These are moves, not steps: the steps are the tabs (`STEP_NAMES`). */
const MOVES:ReadonlyArray<readonly [IconName,string,string]>=[
 ['download','Gather','Add links, videos, notes and screenshots. Paste a link anywhere on the board.'],
 ['companion','Ask','Ask {name} about what you gathered. Use what to say first and title ideas, or add an answer to the board.'],
 ['list','Plan','Switch to Plan to write your idea, title, opening and scenes.'],
];

/** How the Board works. Shown once per channel, and again from the ? button. */
export function BoardTip({onClose}:{onClose():void}){
 const ai=useAi();
 return <Dialog title="How the board works" onClose={onClose} width={620} className="board-help" footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
  <div className="board-help-moves">{MOVES.map(([icon,title,text])=><div key={title} className="board-help-move"><Icon name={icon} size={18}/><b>{title}</b><span>{text.replace("{name}",ai.name)}</span></div>)}</div>
  <dl className="board-help-keys" aria-label="Board shortcuts">{[
   ['Drag on empty space','Select cards'],['Space + drag','Pan the board'],['N','Add a note'],['S','Draw a section'],['Shift + 1','Fit the board'],['⌘A','Select all'],['Delete','Remove selection'],['Esc','Clear selection'],
  ].map(([key,label])=><div key={key}><dt><kbd style={{fontFamily:"system-ui, sans-serif"}}>{key}</kbd></dt><dd>{label}</dd></div>)}</dl>
  <p className="board-help-hint">Shift-click to select more cards. Scroll to pan; pinch to zoom.</p>
 </Dialog>;
}
