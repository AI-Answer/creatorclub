import {Children,useEffect,useState,type CSSProperties,type ReactNode} from 'react';

/*
  Borumi's shared Edit-panel primitives, copied from its shared and main bundles (paths and lines in spec-edit-step.md, "Shared
  primitives used in Edit"). Styles are in br.css, named br-*. Every panel in the club's Edit builds from these.
*/

/** Section wrapper `Se` (M:52365): a 10px uppercase semibold title at 60%, then the body (mb-3 under the title when there is one). */
export function BrSection({title,actions,children,className}:{title:string;actions?:ReactNode;children?:ReactNode;className?:string}){
 return <section className={`br-section${className?` ${className}`:''}`}>
  <div className={`br-section-head${children?' has-body':''}`}><p className="br-section-title"><span>{title}</span></p>{actions}</div>
  {children}
 </section>;
}

/** Sub-section `Ae` (M:52259): a 14px medium title (12px when compact) with an optional "(value)" at 70%, a right-side action
 * (Reset), a 12px 50% description and the control under it (mt-2). */
export function BrSub({title,secondary,description,action,compact,hidden,children}:{title:ReactNode;secondary?:ReactNode;description?:ReactNode;action?:ReactNode;compact?:boolean;hidden?:boolean;children?:ReactNode}){
 if(hidden)return null;
 return <div className={`br-sub${compact?' is-compact':''}`}>
  <div className="br-sub-head"><div className="br-sub-title">{title}{secondary!==undefined&&<span className="br-sub-secondary">{secondary}</span>}</div>{action}</div>
  {description&&<BrEmpty text={description} className="br-sub-desc"/>}
  {children&&<div className="br-sub-body">{children}</div>}
 </div>;
}

/** Empty / hint text `Xt` (M:52466): text-xs opacity-50 (10px when compact). */
export function BrEmpty({text,compact,className}:{text:ReactNode;compact?:boolean;className?:string}){return <p className={`br-empty${compact?' is-compact':''}${className?` ${className}`:''}`}>{text}</p>;}

/** Group card `SG` / header `jG` (M:59073-59104): rounded-md border bg-primary-foreground px-4; a 12px medium 70% header row with a
 * 12px glyph and a bottom rule; each control in its own -mx-4 px-4 pb-4 row (pt-4 on the first). */
export function BrGroup({title,icon,id,children}:{title?:string;icon?:ReactNode;id?:string;children:ReactNode}){
 const rows=Children.toArray(children).filter(Boolean);
 if(!rows.length)return null;
 return <div className="br-group" data-clip-control-group={id}>
  {title&&<div className="br-group-head">{icon&&<span className="br-group-icon">{icon}</span>}<span>{title}</span></div>}
  <div className="br-group-rows">{rows.map((row,index)=><div key={index} className={`br-group-row${index===0?' is-first':''}`}>{row}</div>)}</div>
 </div>;
}

/** Separator `$t` with `-mx-4 my-0 w-auto`: a full-width 1px rule inside a group. */
export function BrSeparator(){return <hr className="br-sep"/>;}

/** Switch (shared S:32036): h-5 w-9 rounded-full, bg-primary on, bg-primary/20 off; a 16px bg-background thumb that slides 16px. */
export function BrSwitch({checked,onChange,label,disabled}:{checked:boolean;onChange(checked:boolean):void;label:string;disabled?:boolean}){
 return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="br-switch" data-state={checked?'checked':'unchecked'} onClick={()=>onChange(!checked)}><span className="br-switch-thumb"/></button>;
}

/** Toggle row `Hf` (M:52311): the switch, then a medium label (14px, 12px compact) that also toggles it. */
export function BrToggleRow({label,checked,onChange,compact,disabled}:{label:string;checked:boolean;onChange(checked:boolean):void;compact?:boolean;disabled?:boolean}){
 return <div className={`br-toggle-row${compact?' is-compact':''}`}><BrSwitch checked={checked} onChange={onChange} label={label} disabled={disabled}/><span className="br-toggle-label" onClick={()=>!disabled&&onChange(!checked)}>{label}</span></div>;
}

/** Slider `qt` (S:26399): h-4 root; track h-1.5 rounded-full bg-primary/20 with the range in bg-primary; a 12px thumb with a 50%
 * border, bg-background and a shadow. `onCommit` fires on release (Borumi commits several sliders on release). */
export function BrSlider({value,min,max,step,label,onChange,onCommit,disabled,className}:{value:number;min:number;max:number;step:number;label:string;onChange?(value:number):void;onCommit?(value:number):void;disabled?:boolean;className?:string}){
 const [local,setLocal]=useState(value);
 useEffect(()=>setLocal(value),[value]);
 const shown=Number.isFinite(local)?local:min,progress=max>min?(Math.min(max,Math.max(min,shown))-min)/(max-min)*100:0;
 return <input type="range" className={`br-slider${className?` ${className}`:''}`} aria-label={label} min={min} max={max} step={step} value={shown} disabled={disabled}
  style={{'--br-progress':`${progress}%`} as CSSProperties}
  onChange={event=>{const next=Number(event.target.value);setLocal(next);onChange?.(next);}}
  onPointerUp={event=>onCommit?.(Number((event.target as HTMLInputElement).value))}
  onKeyUp={event=>onCommit?.(Number((event.target as HTMLInputElement).value))}/>;
}

/** Select trigger (shared S:29367): h-9 w-full rounded-md border border-input px-3 text-sm shadow-sm; `compact` is the h-7 11px
 * variant `_d` used in Layout and transition rows. A native select keeps keyboard and screen reader behaviour. */
export function BrSelect<T extends string>({value,options,onChange,label,compact,disabled,className}:{value:T;options:ReadonlyArray<{value:T;label:string}>;onChange(value:T):void;label:string;compact?:boolean;disabled?:boolean;className?:string}){
 return <span className={`br-select${compact?' is-compact':''}${className?` ${className}`:''}`}><select aria-label={label} value={value} disabled={disabled} onChange={event=>onChange(event.target.value as T)}>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>;
}

/** Tabs `el` (M:36986): inline-flex bg-neutral-100 rounded-md p-1; tab px-2 py-1 text-xs font-medium rounded-md; selected
 * bg-primary-foreground text-primary shadow-sm, others text-primary/60. */
export function BrTabs<T extends string>({value,items,onChange,label,full}:{value:T;items:ReadonlyArray<{value:T;label:string;tip?:string}>;onChange(value:T):void;label:string;full?:boolean}){
 return <div className={`br-tabs${full?' is-full':''}`} role="tablist" aria-label={label}>{items.map(item=><button key={item.value} type="button" role="tab" aria-selected={item.value===value} title={item.tip} className="br-tab" onClick={()=>onChange(item.value)}>{item.label}</button>)}</div>;
}

/** Colour field `Rt` (M:52776-52870): a 30px swatch (rounded-l-md, border-input) opening the system picker, and a 74px uppercase hex
 * field (rounded-r-md, bg-input, 11px). A valid #RRGGBB commits on blur; an invalid one reverts; Enter blurs. */
export function BrColorField({value,onChange,label}:{value:string;onChange(value:string):void;label:string}){
 const hex=/^#[0-9a-f]{6}/i.test(value)?value.slice(0,7).toUpperCase():'';
 const [text,setText]=useState(hex),[invalid,setInvalid]=useState(false);
 useEffect(()=>{setText(hex);setInvalid(false);},[hex]);
 const commit=()=>{if(/^#[0-9a-f]{6}$/i.test(text)){if(text.toUpperCase()!==hex)onChange(text.toLowerCase());setInvalid(false);}else{setText(hex);setInvalid(false);}};
 return <span className="br-color" role="group" aria-label={label}>
  <label className="br-color-swatch" style={hex?{background:hex}:undefined}><input type="color" aria-label={`${label} picker`} value={hex?hex.toLowerCase():undefined} onChange={event=>onChange(event.target.value)}/></label>
  <input className={`br-color-hex${invalid?' is-invalid':''}`} aria-label={label} placeholder="#RRGGBB" value={text} maxLength={7}
   onChange={event=>{const next=event.target.value.toUpperCase();setText(next);setInvalid(next.length===7&&!/^#[0-9A-F]{6}$/.test(next));}}
   onBlur={commit} onKeyDown={event=>{if(event.key==='Enter')(event.target as HTMLInputElement).blur();}}/>
 </span>;
}

/** Warning banner `rT` (M:52475): 11px, bg-yellow-100, p-2 px-3, rounded-md, a 12px warning glyph. */
export function BrWarning({children}:{children:ReactNode}){return <div className="br-warning" role="note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg><span>{children}</span></div>;}

/** Ghost small full-width "Show more" / "Show less" (Canvas, Wallpaper). */
export function BrShowMore({open,onToggle}:{open:boolean;onToggle():void}){return <button type="button" className="br-show-more" onClick={onToggle}>{open?'Show less':'Show more'}<svg viewBox="0 0 24 24" aria-hidden="true"><path d={open?'m18 15-6-6-6 6':'m6 9 6 6 6-6'}/></svg></button>;}

/** The "Properties" drawer of Layout, Elements and Captions (`QX` M:54271, `KJ` M:64499): pinned to the panel's bottom, 45px when
 * closed with a top rule, filling the panel when open. */
export function BrDrawer({open,onToggle,closedLabel='Properties',openLabel,children}:{open:boolean;onToggle():void;closedLabel?:string;openLabel:string;children:ReactNode}){
 return <div className={`br-drawer${open?' is-open':''}`}><div className="br-drawer-panel">
  <button type="button" className="br-drawer-toggle" aria-expanded={open} onClick={onToggle}>
   <svg className="br-drawer-gear" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>
   <span>{open?openLabel:closedLabel}</span>
   <svg className="br-drawer-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d={open?'m6 9 6 6 6-6':'m18 15-6-6-6 6'}/></svg>
  </button>
  <div className="br-drawer-body" aria-hidden={!open}>{children}</div>
 </div></div>;
}
