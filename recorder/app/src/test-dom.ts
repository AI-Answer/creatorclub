import {Window} from 'happy-dom';
import {registerHooks} from 'node:module';
import {act,type ReactNode} from 'react';

registerHooks({resolve:(specifier,context,next)=>specifier.endsWith('.css')?{url:'data:text/javascript,',shortCircuit:true}:next(specifier,context)});
const browser=new Window({url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Element','HTMLInputElement','HTMLTextAreaElement','Node','Event','MouseEvent','KeyboardEvent','CustomEvent','localStorage','CSS','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'] as const){
 const value=browser[key as keyof Window];Object.defineProperty(globalThis,key,{value:typeof value==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'].includes(key)?value.bind(browser):value,configurable:true,writable:true});
}
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
