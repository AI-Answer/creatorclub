import type {Media} from '../shared/types';
import {api} from './api';

/**
 * Cutting the person out uses macOS Vision (server/vision.ts), so Remove background and what goes behind it are offered only on a Mac.
 * `platform` is the desktop bridge's (`darwin`, `win32`) or, in a browser, navigator.platform (`MacIntel`).
 */
export function personSegmentationAvailable(platform=typeof window==='undefined'?'darwin':window.sceneForge?.platform??navigator.platform??''):boolean{
 return /^(darwin|mac)/i.test(platform);
}
export const SEGMENTATION_UNAVAILABLE='Removing the background uses macOS Vision, so it is not available on this computer yet. Projects made on a Mac keep their setting and export it there.';

const NOUN={image:'picture',video:'video'} as const;
/** Says what is wrong when the chosen file is not the kind the picker asked for, else nothing. */
export function backdropFileProblem(kind:'image'|'video',media:Pick<Media,'kind'|'name'>|undefined):string|undefined{
 if(!media)return undefined;
 if(media.kind===kind)return undefined;
 return `${media.name} is ${media.kind==='image'?'a picture':media.kind==='video'?'a video':'audio'}. Choose a ${NOUN[kind]} for this background.`;
}

/** Imports one file for a backdrop through the usual media import (a copy; the original stays untouched). Null when nothing was chosen. */
export async function chooseBackdropFile(kind:'image'|'video'):Promise<Media|null>{
 let imported:Media[]=[];
 if(window.sceneForge?.chooseMedia){
  const paths=await window.sceneForge.chooseMedia();
  if(!paths.length)return null;
  imported=await api<Media[]>('/media/import',{paths:paths.slice(0,1)});
 }else{
  const file=await new Promise<File|null>(resolve=>{
   const input=document.createElement('input');input.type='file';input.accept=kind==='image'?'image/*':'video/*';
   input.addEventListener('change',()=>resolve(input.files?.[0]??null),{once:true});input.addEventListener('cancel',()=>resolve(null),{once:true});
   input.click();
  });
  if(!file)return null;
  const data=new FormData();data.append('files',file);
  imported=await api<Media[]>('/media/upload',data);
 }
 const problem=backdropFileProblem(kind,imported[0]);
 if(problem)throw new Error(problem);
 return imported[0]??null;
}
