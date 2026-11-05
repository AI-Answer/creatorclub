export type Appearance='system'|'light'|'dark';
const key='sceneforge.appearance';
/** Starts in light mode; every stored choice, including System default, is kept. */
export function getAppearance():Appearance{const stored=localStorage.getItem(key);return stored==='dark'||stored==='light'||stored==='system'?stored:'light';}
function apply(){const preference=getAppearance(),theme=preference==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):preference;document.documentElement.dataset.theme=theme;window.sceneForge?.setWindowTheme?.(theme);}
export function setAppearance(value:Appearance){localStorage.setItem(key,value);apply();}
export function initializeAppearance(){apply();matchMedia('(prefers-color-scheme: dark)').addEventListener('change',apply);window.addEventListener('storage',event=>{if(event.key===key)apply();});}
