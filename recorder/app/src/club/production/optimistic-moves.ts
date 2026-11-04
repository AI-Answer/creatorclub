import type {Video,VideoStage} from '../../../shared/club';
import {applyMove} from '../production';

type Placement={id:string;stage:VideoStage;beforeId:string|null;at:string;stageDates?:Video['stageDates']};
type Pending={placement:Placement;resolve():void;reject(reason:unknown):void};
/** Save in gesture order. A failed move is removed and later gestures are replayed, rather than rolled back with it. */
export class OptimisticMoves {
 private pending:Pending[]=[];
 private saving=false;
 constructor(private confirmed:readonly Video[],private show:(videos:Video[])=>void,private save:(move:Placement)=>Promise<Video>,private reconcile:()=>void=()=>{}){}
 place(id:string,stage:VideoStage,beforeId:string|null,stageDates?:Video['stageDates']):Promise<void>{
  return new Promise((resolve,reject)=>{
   this.pending.push({placement:{id,stage,beforeId,stageDates,at:new Date().toISOString()},resolve,reject});
   this.draw();void this.drain();
  });
 }
 /** Refresh the base without replacing the queue or discarding in-flight gestures. */
 refresh(videos:readonly Video[]){this.confirmed=videos;this.draw();}
 project(videos:readonly Video[]=this.confirmed):Video[]{return this.pending.reduce((next,item)=>this.apply(next,item.placement),[...videos]);}
 private apply(videos:readonly Video[],move:Placement){return applyMove(videos,move.id,move.stage,move.beforeId,move.at,move.stageDates);}
 private draw(){this.show(this.project());}
 private async drain(){
  if(this.saving)return;this.saving=true;
  while(this.pending.length){
   const item=this.pending[0];
   try{
    const saved=await this.save(item.placement);
    this.confirmed=this.apply(this.confirmed,item.placement).map(video=>video.id===saved.id?saved:video);
    this.pending.shift();this.draw();item.resolve();
   }catch(reason){this.pending.shift();this.draw();item.reject(reason);}
  }
  this.saving=false;this.reconcile();
 }
}
