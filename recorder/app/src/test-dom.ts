import {Window} from 'happy-dom';
import {registerHooks} from 'node:module';
import {act,type ReactNode} from 'react';

registerHooks({resolve:(specifier,context,next)=>specifier.endsWith('.css')?{url:'data:text/javascript,',shortCircuit:true}:next(specifier,context)});
const browser=new Window({url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Element','HTMLInputElement','HTMLTextAreaElement','Node','Event','MouseEvent','KeyboardEvent','CustomEvent','localStorage','CSS','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'] as const){
 const value=browser[key as keyof Window];Object.defineProperty(globalThis,key,{value:typeof value==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'].includes(key)?value.bind(browser):value,configurable:true,writable:true});
}
// ui-sdk reads more of the DOM than the list above (observers, event and element classes); happy-dom has no popover API, so it opens in place.
// IntersectionObserver stays out: happy-dom's never reports, and lazy pictures would never load.
for(const key of Object.getOwnPropertyNames(browser))if(/^[A-Z]/.test(key)&&!(key in globalThis)&&key!=='IntersectionObserver')Object.defineProperty(globalThis,key,{value:browser[key as keyof Window],configurable:true,writable:true});
for(const key of ['getSelection','matchMedia'] as const)Object.defineProperty(globalThis,key,{value:browser[key].bind(browser),configurable:true,writable:true});
const element=browser.HTMLElement.prototype as unknown as Record<string,unknown>;
element.showPopover??=function(){};element.hidePopover??=function(){};element.togglePopover??=function(){return true;};
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
// react-dom decides at load time whether it runs in a browser (it needs this for onChange), so it loads after the globals above exist.
const {createRoot}=await import('react-dom/client');
export async function mountUI(element:ReactNode){
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 await act(async()=>{root.render(element);});
 return {container,render:async(next:ReactNode)=>{await act(async()=>root.render(next));},close:async()=>{await act(async()=>root.unmount());container.remove();}};
}
/** A button by what it says, or by its accessible name when it is an icon. */
export function button(container:Element,text:string){const found=[...container.querySelectorAll('button')].find(button=>button.textContent?.trim()===text||(!button.textContent?.trim()&&button.getAttribute('aria-label')===text));if(!found)throw Error(`Button not found: ${text}`);return found;}
/** Opens a ui-sdk Select by its accessible name and chooses the option that says `text`, the way a person does. */
export async function chooseOption(container:Element,label:string,text:string){
 const trigger=[...container.querySelectorAll<HTMLElement>('[data-slot="select-trigger"]')].find(element=>element.getAttribute('aria-label')===label);
 if(!trigger)throw Error(`Select not found: ${label}`);
 await act(async()=>{trigger.click();});
 const option=[...document.querySelectorAll<HTMLElement>('[role="listbox"]:not([hidden]) [role="option"]')].find(element=>element.textContent?.trim()===text);
 if(!option)throw Error(`Option not found in ${label}: ${text}`);
 await act(async()=>{option.click();});
}
