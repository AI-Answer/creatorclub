import {act} from 'react';

/** Test-only geometry: happy-dom has no layout, so give the board one. Lanes are 280 px wide, 300 px apart; cards are 90 px tall, 100 px apart. */
export const LANE={width:280,step:300,top:40,bottom:1000},CARD={height:90,step:100};
const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){}}) as DOMRect;

export function layoutBoard(container:Element){
 const board=container.querySelector<HTMLElement>('.kanban');if(!board)throw Error('No board');
 const columns=[...board.querySelectorAll<HTMLElement>('[data-column]')];
 board.getBoundingClientRect=()=>rect(0,0,columns.length*LANE.step,LANE.bottom);
 columns.forEach((column,i)=>{
  const left=i*LANE.step;
  column.getBoundingClientRect=()=>rect(left,0,LANE.width,LANE.bottom);
  const lane=column.querySelector<HTMLElement>('.lane-cards');if(!lane)return;
  lane.getBoundingClientRect=()=>rect(left,LANE.top,LANE.width,LANE.bottom-LANE.top);
  [...lane.querySelectorAll<HTMLElement>(':scope > [data-slot]')].forEach((slot,k)=>{
   const box=()=>rect(left,LANE.top+k*CARD.step-lane.scrollTop,LANE.width,CARD.height);
   slot.getBoundingClientRect=box;const card=slot.querySelector<HTMLElement>('[data-card]');if(card)card.getBoundingClientRect=box;
  });
 });
}

/** The middle of a lane, for a pointer x. */
export const laneX=(container:Element,stage:string)=>{
 const columns=[...container.querySelectorAll('[data-column]')].map(el=>el.getAttribute('data-column'));
 return columns.indexOf(stage)*LANE.step+LANE.width/2;
};
/** A y that drops before the card at `index` of a lane (with the dragged card taken out), when the card was grabbed by its middle. */
export const slotY=(index:number)=>LANE.top+index*CARD.step+CARD.height/2-1;
export const END_Y=LANE.bottom-80;

const pointer=(type:string,x:number,y:number)=>new window.PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1,pointerId:1});
export const pause=(ms:number)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});

/** Presses a card by its middle and moves the pointer in steps to (x, y). Leaves the pointer down. */
export async function pickUp(container:Element,card:HTMLElement,x:number,y:number,steps=4){
 layoutBoard(container);
 const box=card.getBoundingClientRect(),startX=box.left+box.width/2,startY=box.top+box.height/2;
 await act(async()=>{card.dispatchEvent(pointer('pointerdown',startX,startY));});
 for(let i=1;i<=steps;i++)await act(async()=>{document.dispatchEvent(pointer('pointermove',startX+(x-startX)*i/steps,startY+(y-startY)*i/steps));});
}
/** Lets go, then waits for the settle animation (its timer fallback: happy-dom fires no transitionend). */
export async function letGo(x:number,y:number){
 await act(async()=>{document.dispatchEvent(pointer('pointerup',x,y));});
 await pause(320);
}
export async function dragCard(container:Element,card:HTMLElement,stage:string,y=END_Y){
 const x=laneX(container,stage);await pickUp(container,card,x,y);await letGo(x,y);
}
