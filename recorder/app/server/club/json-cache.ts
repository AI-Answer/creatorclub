import {promises as fs} from 'node:fs';
import path from 'node:path';

type Entry={key:string;value:unknown;bytes:number};
/** Metadata-validated JSON cache. No TTL: external edits, replacements and deletions are visible on the next read. */
export class JsonCache {
 private entries=new Map<string,Entry>();
 private bytes=0;
 constructor(private maxEntries=2048,private maxBytes=16*1024*1024){}
 invalidate(file:string){const key=path.resolve(file),old=this.entries.get(key);if(old){this.bytes-=old.bytes;this.entries.delete(key);}}
 async read<T>(file:string):Promise<T|undefined>{
  const name=path.resolve(file);
  try{
   const stat=await fs.stat(name,{bigint:true});
   const key=`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
   const cached=this.entries.get(name);
   if(cached?.key===key){this.entries.delete(name);this.entries.set(name,cached);return structuredClone(cached.value) as T;}
   const text=await fs.readFile(name,'utf8'),value:unknown=JSON.parse(text);
   this.invalidate(name);
   // Bound retained memory; large documents still work without being retained.
   const bytes=Buffer.byteLength(text);
   if(bytes<=this.maxBytes){
    this.entries.set(name,{key,value,bytes});this.bytes+=bytes;
    while(this.entries.size>this.maxEntries||this.bytes>this.maxBytes)this.invalidate(this.entries.keys().next().value!);
   }
   // Callers often mutate tiles and video records. Never expose the cached object.
   return structuredClone(value) as T;
  }catch(error){
   this.invalidate(name);
   if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;
   throw error;
  }
 }
}

export const clubJsonCache=new JsonCache();
