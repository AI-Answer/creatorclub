import {randomBytes} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {z} from 'zod';
import {childEnv,findExecutable,parseJSONLoose,type Lookup} from './ai.js';
import {runTool,type RunResult} from './tools.js';
import {ClubError,notFound} from './errors.js';
import {imageExtension,imageFile,MAX_IMAGE_BYTES} from './board-images.js';
import {setThumbnail} from './publisher-routes.js';
import type {JobContext} from './jobs.js';
import * as store from './store.js';
import {HIGGSFIELD_MODELS,type HiggsfieldStatus,type SoulId,type ThumbnailCandidate,type ThumbnailRequest,type ThumbnailReference} from '../../shared/higgsfield.js';

export interface HiggsfieldOptions extends Lookup{
 find?:()=>Promise<string|undefined>;
 run?:(file:string,args:string[],options:{env:NodeJS.ProcessEnv;signal?:AbortSignal;timeoutMs:number})=>Promise<RunResult>;
 fetch?:typeof fetch;
 resolve?:(host:string)=>Promise<{address:string;family:number}[]>;
 timeoutMs?:number;
}
const id=z.string().regex(/^[\w-]{1,100}$/);
const reference=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('tile'),id}).strict(),z.object({kind:z.literal('candidate'),id}).strict(),
 z.object({kind:z.literal('upload'),path:z.string().max(250)}).strict(),z.object({kind:z.literal('current')}).strict(),
]);
export const thumbnailBody=z.object({prompt:z.string().trim().min(1).max(12000),model:z.enum(['nano_banana_pro','gpt_image_2_6','text2image_soul_v2','seedream_v5_pro']),count:z.number().int().min(1).max(4).default(1),references:z.array(reference).max(14).optional(),soulId:id.optional(),parentId:id.optional()}).strict().superRefine((body,ctx)=>{
 if((body.references?.length??0)>HIGGSFIELD_MODELS.find(m=>m.id===body.model)!.references)ctx.addIssue({code:'custom',message:'Too many reference images for this model.'});
 if(body.soulId&&body.model!=='text2image_soul_v2')ctx.addIssue({code:'custom',message:'Choose Soul 2 to use your face.'});
});
const INSTALL='Install the Higgsfield CLI, then run higgsfield auth login in Terminal.';
const LOGIN='Run higgsfield auth login in Terminal.';
const find=async(o:HiggsfieldOptions)=>o.find?o.find():await findExecutable('higgsfield',o)??await findExecutable('hf',o);
function cliError(result:RunResult):never{
 const text=result.stderr+'\n'+result.stdout;
 if(/credits?|balance|payment|quota/i.test(text)&&/insufficient|not enough|exhaust|limit|payment|required/i.test(text))throw new ClubError('Your Higgsfield account is out of credits.',402);
 if(/unauthori|not.*(?:signed|logged)|auth|log.?in|token.*expir/i.test(text))throw new ClubError(LOGIN,401);
 if(result.code===null)throw new ClubError('Higgsfield took too long or could not start; check the job in Higgsfield before trying again.',504);
 throw new ClubError('Higgsfield could not finish that; check the job in Higgsfield before trying again.',502);
}
async function call(args:string[],o:HiggsfieldOptions,signal?:AbortSignal):Promise<unknown>{
 const file=await find(o);if(!file)throw new ClubError(INSTALL,503);
 if(signal?.aborted)throw new ClubError('That was stopped.');
 const result=await (o.run??runTool)(file,[...args,'--json'],{env:childEnv(o),signal,timeoutMs:o.timeoutMs??(args[1]==='create'?15*60_000:20_000)});
 if(signal?.aborted&&!(args[1]==='create'&&result.code===0))throw new ClubError('That was stopped.');
 if(result.code!==0)cliError(result);
 const parsed=parseJSONLoose(result.stdout);
 if(parsed!==undefined)return parsed;
 // --wait may emit progress lines followed by several JSON values.
 const values=result.stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 if(values.length)return values;
 throw new ClubError('Higgsfield returned an answer we could not read.',502);
}
type Json=Record<string,unknown>;
const object=(v:unknown):Json=>v&&typeof v==='object'&&!Array.isArray(v)?v as Json:{};
export async function higgsfieldStatus(o:HiggsfieldOptions={}):Promise<HiggsfieldStatus>{
 if(!await find(o))return {installed:false,signedIn:false,hint:INSTALL};
 try{
  const raw=object(await call(['account','status'],o)),data=object(raw.data??raw);
  const email=typeof data.email==='string'?data.email:undefined;
  if(!email)return {installed:true,signedIn:false,hint:LOGIN};
  return {installed:true,signedIn:true,email,plan:typeof data.subscription_plan_type==='string'?data.subscription_plan_type:undefined,credits:typeof data.credits==='number'?data.credits:undefined};
 }catch(error){return {installed:true,signedIn:false,hint:error instanceof ClubError?error.message:'Could not check Higgsfield.'};}
}
export async function soulIds(o:HiggsfieldOptions={}):Promise<SoulId[]>{
 const raw=await call(['soul-id','list'],o),data=object(raw),items=Array.isArray(raw)?raw:data.data??data.items??data.soul_ids;
 return Array.isArray(items)?items.flatMap(item=>{const row=object(item);return typeof row.id==='string'&&typeof row.name==='string'&&(!row.status||row.status==='completed')?[{id:row.id,name:row.name}]:[];}):[];
}
export function generationParams(input:ThumbnailRequest):Record<string,string>{return {aspect_ratio:'16:9',...(input.model==='text2image_soul_v2'?{quality:'1.5k'}:{resolution:'1k'}),...(input.model==='gpt_image_2_6'?{quality:'low',output_format:'png'}:{}),...(input.soulId?{custom_reference_id:input.soulId}:{})};}
function args(input:ThumbnailRequest,command:'cost'|'create',refs:string[]=[]){
 return ['generate',command,input.model,'--prompt',input.prompt,...Object.entries(generationParams(input)).flatMap(([key,value])=>[`--${key}`,value]),...refs.flatMap(file=>['--image-references',file]),...(command==='create'?['--wait']:[])];
}
export async function estimateCost(input:ThumbnailRequest,o:HiggsfieldOptions={}):Promise<{credits:number}>{
 const raw=object(await call(args(input,'cost'),o)),data=object(raw.data??raw),credits=data.credits;
 if(typeof credits!=='number'||!Number.isFinite(credits)||credits<0)throw new ClubError('Higgsfield could not estimate the credits for that image.',502);
 return {credits:credits*input.count};
}
/** Read only result fields, so input reference URLs echoed by the CLI never become candidates. */
export function resultUrls(value:unknown):string[]{
 const urls:string[]=[];
 const walk=(v:unknown,inside=false)=>{
  if(typeof v==='string'){if(inside&&/^https:\/\//i.test(v))urls.push(v);return;}
  if(Array.isArray(v)){for(const entry of v)walk(entry,inside);return;}
  for(const [key,entry] of Object.entries(object(v))){
   if(/^(image_references|input|params|request|thumbnail|thumbnail_url)$/i.test(key))continue;
   walk(entry,inside||/^(url|image_url|result_url|output_url|images|outputs?|results?|files|generations)$/i.test(key));
  }
 };
 walk(value,Array.isArray(value));return [...new Set(urls)];
}
const blocked=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['100.64.0.0',10],['224.0.0.0',4]] as const)blocked.addSubnet(ip,bits,'ipv4');
for(const [ip,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]] as const)blocked.addSubnet(ip,bits,'ipv6');
async function downloadImage(url:string,o:HiggsfieldOptions,signal?:AbortSignal):Promise<Buffer>{
 const timeout=AbortSignal.timeout(60_000),abort=signal?AbortSignal.any([signal,timeout]):timeout;
 for(let redirects=0;redirects<4;redirects++){
  const parsed=new URL(url),host=parsed.hostname.replace(/^\[|\]$/g,'');
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||(parsed.port&&parsed.port!=='443'))throw new ClubError('That image needs a public HTTPS address.');
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await (o.resolve??(host=>lookup(host,{all:true})))(host);
  if(!addresses.length||addresses.some(a=>a.address.toLowerCase().startsWith('::ffff:')||blocked.check(a.address,a.family===6?'ipv6':'ipv4')))throw new ClubError('That image needs a public HTTPS address.');
  const response=await (o.fetch??fetch)(url,{signal:abort,redirect:'manual'});
  if(response.status>=300&&response.status<400){await response.body?.cancel();const location=response.headers.get('location');if(!location)break;url=new URL(location,url).href;continue;}
  if(!response.ok||!response.body)throw new ClubError('Could not download the Higgsfield image.',502);
  if(Number(response.headers.get('content-length'))>MAX_IMAGE_BYTES){await response.body.cancel();throw new ClubError('That image is over 20 MB.',413);}
  const reader=response.body.getReader(),chunks:Buffer[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_IMAGE_BYTES)throw new ClubError('That image is over 20 MB.',413);chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  const bytes=Buffer.concat(chunks);if(!imageExtension(bytes))throw new ClubError('Higgsfield returned an unsupported image.',502);return bytes;
 }
 throw new ClubError('Could not follow the image download link.',502);
}
async function download(url:string,o:HiggsfieldOptions,signal?:AbortSignal):Promise<Buffer>{
 try{return await downloadImage(url,o,signal);}catch(error){
  if(error instanceof ClubError)throw error;
  if(signal?.aborted)throw new ClubError('That was stopped.');
  throw new ClubError('Could not download that image; check your connection and the job in Higgsfield.',502);
 }
}
async function root(slug:string,video:string){
 await store.readVideo(slug,video);const dir=path.join(await fs.realpath(store.videoDir(slug,video)),'thumbnails');
 await fs.mkdir(dir).catch(e=>{if(e.code!=='EEXIST')throw e;});
 if(!(await fs.lstat(dir)).isDirectory()||(await fs.lstat(dir)).isSymbolicLink())throw new ClubError('The thumbnails folder is not a safe folder.');return dir;
}
async function checkedFile(dir:string,name:string):Promise<string>{
 if(!/^(?:h_[a-f0-9]{24}\.(?:png|jpg|webp|gif|avif)|thumbnail\.(?:png|jpg))$/.test(name))throw new ClubError('That image is not in the video’s files.');
 const file=path.join(dir,name),stat=await fs.lstat(file).catch(()=>undefined);
 if(!stat)throw notFound('image');if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_IMAGE_BYTES)throw new ClubError('That image is not a safe image.');
 if(!imageExtension(await fs.readFile(file)))throw new ClubError('That file is not a supported image.');return file;
}
const historyFile=(dir:string)=>path.join(dir,'thumbnails.json');
async function history(dir:string):Promise<ThumbnailCandidate[]>{
 const file=historyFile(dir),stat=await fs.lstat(file).catch(()=>undefined);if(!stat)return [];
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)throw new ClubError('The thumbnail history could not be read.');
 return JSON.parse(await fs.readFile(file,'utf8')) as ThumbnailCandidate[];
}
export async function listThumbnails(slug:string,video:string){return (await history(await root(slug,video))).filter(c=>!c.removedAt);}
export async function candidateImage(slug:string,video:string,id:string){
 const dir=await root(slug,video),candidate=(await history(dir)).find(c=>c.id===id&&!c.removedAt);if(!candidate)throw notFound('thumbnail');
 return checkedFile(dir,candidate.file);
}
async function localReference(slug:string,video:string,ref:ThumbnailReference,o:HiggsfieldOptions,signal:AbortSignal):Promise<{file?:string;bytes?:Buffer}>{
 if(ref.kind==='candidate')return {file:await candidateImage(slug,video,ref.id)};
 if(ref.kind==='upload'){
  if(!/^notes\/assets\/[a-f0-9]{24}\.(png|jpg|webp|gif|avif)$/.test(ref.path))throw new ClubError('Choose an uploaded image from this video.');
  return {file:await imageFile(slug,video,ref.path.slice(6))};
 }
 if(ref.kind==='current'){
  const dir=await fs.realpath(store.videoDir(slug,video));
  for(const ext of ['png','jpg']){try{return {file:await checkedFile(dir,`thumbnail.${ext}`)};}catch(e){if(!(e instanceof ClubError&&e.status===404))throw e;}}
  throw new ClubError('Add a thumbnail image first.');
 }
 const tile=await store.readTile(slug,video,ref.id);
 if(tile.kind==='image'&&tile.file){
  const dir=await fs.realpath(store.researchDir(slug,video)),name=tile.file;
  if(path.basename(name)!==name)throw new ClubError('That board image is not safe.');
  const file=path.join(dir,name),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_IMAGE_BYTES)throw new ClubError('That board image is not safe.');
  const bytes=await fs.readFile(file);if(!imageExtension(bytes))throw new ClubError('Choose a supported board image.');return {file};
 }
 let url=tile.kind==='image'?tile.url??tile.meta.thumbnail:undefined;
 if(tile.kind==='video'&&tile.url){const {youtubeId}=await import('./publish.js');url=`https://i.ytimg.com/vi/${youtubeId(tile.url)}/maxresdefault.jpg`;}
 if(!url)throw new ClubError('Choose a video or image card.');return {bytes:await download(url,o,signal)};
}
export async function generateThumbnails(slug:string,video:string,input:ThumbnailRequest,context:JobContext,o:HiggsfieldOptions={}):Promise<ThumbnailCandidate[]>{
 input=thumbnailBody.parse(input);const dir=await root(slug,video);
 if(input.parentId)await candidateImage(slug,video,input.parentId);
 const scratch=await fs.mkdtemp(path.join(dir,'.references-'));
 const saved:ThumbnailCandidate[]=[];
 try{
  context.emit({message:'Preparing reference images…'});const refs:string[]=[];
  for(const [index,ref] of (input.references??[]).entries()){
   const source=await localReference(slug,video,ref,o,context.signal);
   if(source.file)refs.push(source.file);
   else if(source.bytes){const file=path.join(scratch,`${index}${imageExtension(source.bytes)}`);await fs.writeFile(file,source.bytes,{flag:'wx'});refs.push(file);}
  }
  for(let index=0;index<input.count;index++){
   if(context.signal.aborted)throw new ClubError('That was stopped.');
   context.emit({message:`Making thumbnail ${index+1} of ${input.count}…`,done:index,total:input.count});
   const result=await call(args(input,'create',refs),o,context.signal),urls=resultUrls(result);
   if(!urls.length)throw new ClubError('Higgsfield finished without an image; check the job in Higgsfield.',502);
   // A create call is one paid candidate; never mistake an echoed reference or preview for another result.
   // The paid result must be archived even when cancellation arrives after create.
   const bytes=await download(urls[0],o,AbortSignal.timeout(60_000));
   const id=`h_${randomBytes(12).toString('hex')}`,file=id+imageExtension(bytes);
   const candidate:ThumbnailCandidate={id,prompt:input.prompt,model:input.model,params:generationParams(input),file,createdAt:new Date().toISOString(),...(input.parentId?{parentId:input.parentId}:{})};
   await store.withLock(dir,async()=>{const items=await history(dir);await fs.writeFile(path.join(dir,file),bytes,{flag:'wx'});await store.writeJSON(historyFile(dir),[...items,candidate]);});
   saved.push(candidate);context.emit({message:`Saved thumbnail ${index+1} of ${input.count}.`,candidate,done:index+1,total:input.count});
  }
  return saved;
 }finally{await fs.rm(scratch,{recursive:true,force:true});}
}
export async function useThumbnail(slug:string,video:string,id:string){
 const file=await candidateImage(slug,video,id),bytes=await fs.readFile(file);
 await setThumbnail(slug,video,bytes);
}
export async function removeThumbnail(slug:string,video:string,id:string){
 const dir=await root(slug,video);
 await store.withLock(dir,async()=>{
  const file=await candidateImage(slug,video,id),items=await history(dir),removed=path.join(dir,'.removed');
  await fs.mkdir(removed).catch(e=>{if(e.code!=='EEXIST')throw e;});
  const stat=await fs.lstat(removed);if(!stat.isDirectory()||stat.isSymbolicLink())throw new ClubError('The removed images folder is not safe.');
  await fs.rename(file,path.join(removed,path.basename(file)));await store.writeJSON(historyFile(dir),items.map(c=>c.id===id?{...c,removedAt:new Date().toISOString()}:c));
 });
}
