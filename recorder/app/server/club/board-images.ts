import {randomBytes} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ClubError,notFound} from './errors.js';
import {notesFolder,resolveDoc} from './board-docs.js';
import * as store from './store.js';

export const MAX_IMAGE_BYTES=20*1024*1024;
const OUTSIDE='That image is not in the board’s files.';
const within=(file:string,root:string)=>file.startsWith(root+path.sep);

/** Only raster formats with recognized signatures are served; active SVG/HTML uploads never become card images. */
export function imageExtension(data:Buffer):string|undefined{
 if(data.length>=24&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';
 if(data.length>=4&&data[0]===255&&data[1]===216&&data[2]===255)return '.jpg';
 if(data.length>=13&&/^GIF8[79]a$/.test(data.subarray(0,6).toString()))return '.gif';
 if(data.length>=16&&data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP')return '.webp';
 if(data.length>=16&&data.subarray(4,8).toString()==='ftyp'&&/avif|avis/.test(data.subarray(8,32).toString()))return '.avif';
 return undefined;
}

/** Refuses links in every path component; the returned root is already the board's trusted folder. */
async function safeFile(root:string,full:string,make=false):Promise<string>{
 const base=await fs.realpath(root);if(!within(full,base))throw new ClubError(OUTSIDE);
 const parts=path.relative(base,full).split(path.sep);let current=base;
 for(const [index,part] of parts.entries()){
  if(!part||part.startsWith('.'))throw new ClubError(OUTSIDE);
  current=path.join(current,part);const last=index===parts.length-1;
  let stat=await fs.lstat(current).catch(error=>{if(error.code==='ENOENT')return undefined;throw error;});
  if(!stat&&!last&&make){await fs.mkdir(current).catch(error=>{if(error.code!=='EEXIST')throw error;});stat=await fs.lstat(current);}
  if(stat&&(stat.isSymbolicLink()||(last?!stat.isFile():!stat.isDirectory())))throw new ClubError(OUTSIDE);
  if(!stat&&!make)throw notFound('image');
 }
 return current;
}
async function noteLocation(slug:string,board:string,tileId?:string):Promise<{root:string;file?:string}>{
 const boardRoot=await fs.realpath(store.boardDir(slug,board));if(!tileId)return {root:boardRoot};
 const tile=await store.readTile(slug,board,tileId);if(!tile.doc)throw new ClubError('Choose a note to add the image to.');
 const folder=tile.doc.root==='folder'?await notesFolder(slug):boardRoot;
 if(!folder||(tile.doc.root==='folder'&&tile.doc.folder!==folder))throw new ClubError('Choose this note’s Notes folder first.');
 const root=await fs.realpath(folder),file=await resolveDoc(root,tile.doc.path);return {root,file};
}

/** New images live beside Markdown notes in notes/assets, with collision-free names independent of the supplied filename. */
export async function saveImage(slug:string,board:string,data:Buffer,tileId?:string):Promise<{path:string;markdown:string}>{
 await store.requireBoard(slug,board);
 if(!data.length||data.length>MAX_IMAGE_BYTES)throw new ClubError('Choose an image under 20 MB.',413);
 const ext=imageExtension(data);if(!ext)throw new ClubError('Choose a PNG, JPEG, GIF, WebP or AVIF image.');
 const note=await noteLocation(slug,board,tileId),root=await fs.realpath(store.boardDir(slug,board));
 const rel=`notes/assets/${randomBytes(12).toString('hex')}${ext}`,full=await safeFile(root,path.join(root,rel),true);
 await fs.writeFile(full,data,{flag:'wx'});
 // Without a note yet, the empty-canvas helper creates one in notes/.
 const relative=path.relative(note.file?path.dirname(note.file):path.join(root,'notes'),full).split(path.sep).join('/');
 return {path:rel,markdown:relative.split('/').map(part=>encodeURIComponent(part)).join('/')};
}

const TYPES:Readonly<Record<string,string>>={'.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif'};

/** Resolves an image relative to its Markdown note, confined to the note's folder root or this board's saved assets. */
export async function imageFile(slug:string,board:string,source:string,tileId?:string):Promise<string>{return (await servedImage(slug,board,source,tileId)).file;}

/**
 * The image plus the type its bytes prove, which is what it must be served as: the file's own extension can't be trusted, since a PNG
 * header followed by a script, saved as .html, would otherwise go out as a page.
 */
export async function servedImage(slug:string,board:string,source:string,tileId?:string):Promise<{file:string;type:string}>{
 await store.requireBoard(slug,board);if(!source||source.length>2000||/[\0\\]/.test(source)||/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(source))throw new ClubError(OUTSIDE);
 let decoded:string;try{decoded=decodeURIComponent(source);}catch{throw new ClubError(OUTSIDE);}
 if(/[\0\\]/.test(decoded)||path.isAbsolute(decoded))throw new ClubError(OUTSIDE);
 const note=await noteLocation(slug,board,tileId),boardRoot=await fs.realpath(store.boardDir(slug,board));
 const full=path.resolve(note.file?path.dirname(note.file):path.join(boardRoot,'notes'),decoded),assets=path.join(boardRoot,'notes','assets');
 const allowed=within(full,assets)?boardRoot:within(full,note.root)?note.root:undefined;
 if(!allowed)throw new ClubError(OUTSIDE);
 const file=await safeFile(allowed,full),stat=await fs.stat(file);if(stat.size>MAX_IMAGE_BYTES)throw new ClubError('That image is over 20 MB.',413);
 const handle=await fs.open(file,'r');let buffer:Buffer;try{buffer=Buffer.alloc(32);await handle.read(buffer,0,32,0);}finally{await handle.close();}
 const ext=imageExtension(buffer);if(!ext)throw new ClubError('That file is not a supported image.');return {file,type:TYPES[ext]};
}
