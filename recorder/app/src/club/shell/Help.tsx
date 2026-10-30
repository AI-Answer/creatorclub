import {Button,Dialog,Icon,type IconName} from '../ui';

const STEPS:ReadonlyArray<readonly [IconName,string,string]>=[
 ['idea','1 Find the idea',"Break down what's working. Keep the concept you'd make."],
 ['scenes','2 Plan it','Gather references on its board, package it, draft the scenes.'],
 ['microphone','3 Record, edit, publish','Talk through each scene, remove pauses, then publish with Postiz.'],
];

/** The first-visit dialog; it opens again from How it works in the sidebar. */
export function Help({onClose}:{onClose():void}){
 return <Dialog title="How CreatorClub works" onClose={onClose} width={620} footer={<Button variant="primary" onClick={onClose}>Start</Button>}>
  <p className="muted" style={{margin:0,lineHeight:1.55}}>Every video is one card. Plan it, record the scenes, edit, publish, all in one place.</p>
  <div className="help-steps">{STEPS.map(([icon,title,text])=><div key={title} className="hs"><Icon name={icon} size={18}/><b>{title}</b><span>{text}</span></div>)}</div>
  <p className="small faint" style={{margin:'14px 0 0'}}>Open this again with How it works in the sidebar.</p>
 </Dialog>;
}
