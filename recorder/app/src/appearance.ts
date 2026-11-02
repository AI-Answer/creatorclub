export type Appearance='system'|'light'|'dark';
const key='sceneforge.appearance';
/** Follows the system (Borumi's "System default") until the person picks `light` or `dark` in Settings; a stored choice is always kept. */
export function getAppearance():Appearance{const stored=localStorage.getItem(key);return stored==='dark'||stored==='light'?stored:'system';}
function apply(){const preference=getAppearance();document.documentElement.dataset.theme=preference==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):preference;}
export function setAppearance(value:Appearance){localStorage.setItem(key,value);apply();}
export function initializeAppearance(){apply();matchMedia('(prefers-color-scheme: dark)').addEventListener('change',apply);window.addEventListener('storage',event=>{if(event.key===key)apply();});}
