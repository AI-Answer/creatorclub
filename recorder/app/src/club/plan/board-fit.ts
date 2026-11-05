import {fitView,type View} from '../workspace/board-view';
/** Keep a small board readable. Oversized boards still fit completely. */
export function readableBoardView(rect:{x:number;y:number;w:number;h:number},width:number,height:number,pad=80):View{
 if(rect.w<=width*1.25&&rect.h<=height*1.25)return {x:(width-rect.w)/2-rect.x,y:(height-rect.h)/2-rect.y,z:1};
 return fitView(rect,width,height,pad);
}
