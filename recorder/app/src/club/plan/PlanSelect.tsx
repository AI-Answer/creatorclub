import './plan-select.css';
import {Button,Icon,Menu} from '../ui';
/** Use the shared menu so selection controls match the rest of the app. */
export function PlanSelect({label,value,options,onChange,disabled=false}:{label:string;value:string;options:readonly {value:string;label:string}[];onChange(value:string):void;disabled?:boolean}){
 return <Menu label={label} restoreFocus items={options.map(option=>({label:option.label,check:option.value===value,fn:()=>onChange(option.value)}))} button={(toggle,open)=><Button className="idea-select" aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={toggle}>{options.find(option=>option.value===value)?.label??value}<Icon name="expand" size={14}/></Button>}/>;
}
