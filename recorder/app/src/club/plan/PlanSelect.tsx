import './plan-select.css';
import {Button,Select} from '../ui';

export function PlanSelect({label,value,options,onChange,disabled=false}:{label:string;value:string;options:readonly {value:string;label:string}[];onChange(value:string):void;disabled?:boolean}){
 return <Select label={label} value={value} options={options} onChange={onChange} disabled={disabled} align="start" triggerClass="idea-select" render={<Button disabled={disabled}/>}/>;
}
