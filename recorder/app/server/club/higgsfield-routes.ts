import type {NextFunction,Request,Response,Router} from 'express';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {higgsfieldStatus,soulIds,estimateCost,generateThumbnails,listThumbnails,candidateImage,useThumbnail,removeThumbnail,thumbnailBody,type HiggsfieldOptions} from './higgsfield.js';
import {imageExtension} from './board-images.js';
import {startJobOnce} from './jobs.js';
import {announceBoard} from './board-watch.js';
import * as store from './store.js';

export function higgsfieldRoutes(router:Router,deps:{handler:(fn:(req:Request,res:Response)=>unknown)=>(req:Request,res:Response,next:NextFunction)=>void;requireWorkspace:()=>Promise<string>},options:HiggsfieldOptions={}){
 const {handler,requireWorkspace}=deps;
 const param=(req:Request,key:string)=>String(req.params[key]);
 router.get('/higgsfield/status',handler(async(_req,res)=>res.json(await higgsfieldStatus(options))));
 router.get('/higgsfield/soul-ids',handler(async(_req,res)=>res.json(await soulIds(options))));
 router.post('/higgsfield/cost',handler(async(req,res)=>res.json(await estimateCost(thumbnailBody.parse(req.body),options))));
 router.get('/videos/:id/thumbnails',handler(async(req,res)=>res.json(await listThumbnails(await requireWorkspace(),param(req,'id')))));
 router.post('/videos/:id/thumbnails/generate',handler(async(req,res)=>{
  const slug=await requireWorkspace(),video=param(req,'id'),input=thumbnailBody.parse(req.body);await store.readVideo(slug,video);
  res.status(202).json(startJobOnce(`higgsfield:${slug}:${video}`,'higgsfield',context=>generateThumbnails(slug,video,input,context,options)));
 }));
 router.get('/videos/:id/thumbnails/:candidate/image',handler(async(req,res)=>{
  const file=await candidateImage(await requireWorkspace(),param(req,'id'),param(req,'candidate')),ext=imageExtension(await fs.readFile(file));
  const types:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'};
  res.set({'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}).type(types[ext!]).sendFile(file,{dotfiles:'allow'});
 }));
 router.post('/videos/:id/thumbnails/:candidate/use',handler(async(req,res)=>{await useThumbnail(await requireWorkspace(),param(req,'id'),param(req,'candidate'));res.status(204).end();}));
 router.delete('/videos/:id/thumbnails/:candidate',handler(async(req,res)=>{await removeThumbnail(await requireWorkspace(),param(req,'id'),param(req,'candidate'));res.status(204).end();}));
 router.post('/videos/:id/thumbnails/:candidate/board',handler(async(req,res)=>{
  const slug=await requireWorkspace(),video=param(req,'id'),file=await candidateImage(slug,video,param(req,'candidate'));
  const tile=await store.addTile(slug,video,{kind:'image',title:'Thumbnail',file:{name:path.basename(file),data:await fs.readFile(file)}});
  announceBoard(slug,video);res.status(201).json(tile);
 }));
}
