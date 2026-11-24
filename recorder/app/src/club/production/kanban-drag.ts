import type {VideoStage} from '../../../shared/club';

/**
 * Pointer-driven card dragging for the Kanban board, kept outside React.
 *
 * The card under the pointer is a fixed-position copy moved with `translate3d` once per animation frame.
 * Card and lane positions are measured once when the drag starts (again only if the board's videos change),
 * so a frame does no layout reads: it moves the copy, scrolls a lane near its edge, and, only when the
 * insertion point changes, slides the other cards with transforms. The move is committed once, on drop,
 * after the copy has settled into its slot.
 */

/** Pixels the pointer travels before a press becomes a drag, so a click still opens the card. */
export const DRAG_THRESHOLD=4;
/** The settle animation, in ms (sibling shifts take 180 ms, in kanban-drag.css). Reduced motion skips both. */
export const DRAG_SETTLE_MS=200;
const EDGE=56,BOARD_EDGE=64,MAX_SCROLL=18;

/**
 * Where a card lands among the other cards of a lane, from their positions with the dragged card taken out
 * (`tops`, `heights`), the slot currently open (`open`, or null when the lane has none) and the slot size.
 * A card counts as passed once the dragged card's middle is below that card's middle as drawn, so the answer
 * is stable: opening a slot never moves the decision back and forth on the next frame.
 */
export function insertionIndex(tops:readonly number[],heights:readonly number[],open:number|null,slot:number,middle:number):number{
 for(let k=0;k<tops.length;k++){
  const drawn=tops[k]+heights[k]/2+(open!==null&&k>=open?slot:0);
  if(middle<drawn)return k;
 }
 return tops.length;
}

/** How fast to scroll (px per frame) when the pointer is `distance` px inside an edge zone of `zone` px. */
export const edgeSpeed=(distance:number,zone:number,max=MAX_SCROLL)=>distance>=zone?0:Math.ceil(max*((zone-Math.max(0,distance))/zone)**2);

export type DragTarget={stage:VideoStage;index:number;beforeId:string|null};
type Item={id:string;el:HTMLElement;top:number;height:number;shift:number};
type Lane={stage:VideoStage;column:HTMLElement;lane:HTMLElement|null;left:number;right:number;areaLeft:number;top:number;bottom:number;padTop:number;scroll:number;maxScroll:number;items:Item[]};
type Options={board:HTMLElement;layer:HTMLElement;card:HTMLElement;id:string;x:number;y:number;reduced:boolean;onSettled(target:DragTarget|null):void};

const reducedMotion=()=>typeof window!=='undefined'&&!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const prefersReducedMotion=reducedMotion;

export class CardDrag {
 readonly id:string;
 private board:HTMLElement;private layer:HTMLElement;
 private lanes:Lane[]=[];private home!:Lane;private homeIndex=0;
 private overlay:HTMLElement;private copy:HTMLElement;private gap:HTMLElement;
 private start:{x:number;y:number};private pointer:{x:number;y:number};private grabY=0;
 private rect!:{left:number;top:number;width:number;height:number};private offsetX=0;private slot=0;private spacing=0;
 private boardRect!:{left:number;right:number;top:number;bottom:number};private boardScroll=0;private measuredScroll=0;private boardMax=0;
 private target:DragTarget|null=null;private frame=0;private dirty=true;private done=false;
 private reduced:boolean;private onSettled:(target:DragTarget|null)=>void;

 constructor({board,layer,card,id,x,y,reduced,onSettled}:Options){
  this.board=board;this.layer=layer;this.id=id;this.reduced=reduced;this.onSettled=onSettled;
  this.start={x,y};this.pointer={x,y};
  const box=card.getBoundingClientRect();
  this.rect={left:box.left,top:box.top,width:box.width,height:box.height};this.grabY=y-box.top;
  this.spacing=parseFloat(getComputedStyle(card).marginBottom)||0;
  // The copy keeps the card's look (it sits inside .kanban, so the same rules apply) but none of its identity.
  this.copy=card.cloneNode(true) as HTMLElement;
  for(const name of ['id','data-card','data-card-id','tabindex','role','aria-label','aria-keyshortcuts','title'])this.copy.removeAttribute(name);
  this.copy.classList.add('kanban-drag-copy');
  this.overlay=document.createElement('div');this.overlay.className='kanban-drag-overlay';this.overlay.setAttribute('aria-hidden','true');
  Object.assign(this.overlay.style,{left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`});
  this.overlay.append(this.copy);layer.append(this.overlay);
  this.gap=document.createElement('div');this.gap.className='drop-gap';this.gap.setAttribute('aria-hidden','true');this.gap.dataset.dropLine='';
  board.classList.add('is-dragging');if(reduced)board.classList.add('reduced-motion');
  this.measure();
  window.addEventListener('scroll',this.onScroll,{capture:true,passive:true});window.addEventListener('resize',this.onResize);
  this.update();
  // Lift on the next frame, so the copy's own transition plays from the card's resting look.
  this.frame=requestAnimationFrame(()=>{this.copy.classList.add('lifted');this.loop();});
 }

 /** Reads every lane and card position. Runs at drag start and again only if the board re-renders mid-drag. */
 measure(){
  for(const lane of this.lanes)for(const item of lane.items){item.el.style.transform='';item.shift=0;}
  const board=this.board.getBoundingClientRect();
  this.boardRect={left:board.left,right:board.right,top:board.top,bottom:board.bottom};
  this.boardScroll=this.measuredScroll=this.board.scrollLeft;this.boardMax=Math.max(0,this.board.scrollWidth-this.board.clientWidth);
  this.lanes=[...this.board.querySelectorAll<HTMLElement>('[data-column]')].map(column=>{
   const lane=column.querySelector<HTMLElement>('.lane-cards'),box=column.getBoundingClientRect(),area=lane?.getBoundingClientRect()??box;
   const scroll=lane?.scrollTop??0;
   const items=lane?[...lane.children].filter((el):el is HTMLElement=>el instanceof HTMLElement&&el.dataset.slot!==undefined).map(el=>{
    const r=el.getBoundingClientRect();return {id:el.dataset.slot!,el,top:r.top-area.top+scroll,height:r.height,shift:0};
   }):[];
   return {stage:column.dataset.column as VideoStage,column,lane,left:box.left,right:box.right,areaLeft:area.left,top:area.top,bottom:area.bottom,
    padTop:lane?parseFloat(getComputedStyle(lane).paddingTop)||0:0,scroll,maxScroll:lane?Math.max(0,lane.scrollHeight-lane.clientHeight):0,items};
  });
  const home=this.lanes.find(lane=>lane.items.some(item=>item.id===this.id));
  if(!home)return false;
  this.home=home;this.homeIndex=home.items.findIndex(item=>item.id===this.id);
  // The space between two cards, as laid out (margins collapse, so read it rather than a margin).
  const pair=this.lanes.find(lane=>lane.items.length>1);
  if(pair)this.spacing=Math.max(0,pair.items[1].top-pair.items[0].top-pair.items[0].height);
  const source=home.items[this.homeIndex];
  source.el.classList.add('drag-source');
  this.offsetX=source.el.getBoundingClientRect().left-home.areaLeft;
  this.slot=source.height+this.spacing;
  if(this.target){const lane=this.lanes.find(lane=>lane.stage===this.target!.stage);if(lane)this.show(lane,Math.min(this.target.index,this.others(lane).length),true);}
  return true;
 }

 move(x:number,y:number){this.pointer={x,y};this.dirty=true;}
 /** The other cards of a lane, top to bottom, with where each would sit if the dragged card were gone. */
 private others(lane:Lane){
  const tops:number[]=[],heights:number[]=[],items:Item[]=[];
  lane.items.forEach((item,k)=>{if(item.id===this.id)return;items.push(item);heights.push(item.height);tops.push(item.top-(lane===this.home&&k>this.homeIndex?this.slot:0));});
  return Object.assign(items,{tops,heights});
 }

 private loop=()=>{if(this.done)return;this.update();this.frame=requestAnimationFrame(this.loop);};
 private onScroll=(event:Event)=>{
  if(event.target===this.board){this.boardScroll=this.board.scrollLeft;this.dirty=true;return;}
  const lane=this.lanes.find(lane=>lane.lane===event.target);if(lane){lane.scroll=lane.lane!.scrollTop;this.dirty=true;return;}
  // The page itself scrolled: every measured position moved, so measure again.
  if(event.target===document||(event.target instanceof Node&&event.target.contains(this.board)))this.onResize();
 };
 private onResize=()=>{if(this.done)return;this.measure();this.dirty=true;};
 /** The top of the slot at `index` among `others`, in lane content coordinates. */
 private slotTop(lane:Lane,others:ReturnType<CardDrag['others']>,index:number){
  if(index<others.length)return others.tops[index];
  const last=others.length-1;
  return last>=0?others.tops[last]+others.heights[last]+this.spacing:lane.padTop;
 }

 /** One frame: move the copy, scroll near an edge, and re-place the slot only when it changes. No layout reads. */
 private update(){
  const {x,y}=this.pointer;
  const scrolled=this.autoScroll(x,y);
  if(!this.dirty&&!scrolled)return;
  this.dirty=false;
  this.overlay.style.transform=`translate3d(${x-this.start.x}px,${y-this.start.y}px,0)`;
  const next=this.hit(x,y);
  if(!this.target||next.lane.stage!==this.target.stage||next.index!==this.target.index)this.show(next.lane,next.index);
 }

 private laneX(lane:Lane){const dx=this.boardScroll-this.measuredScroll;return {left:lane.left-dx,right:lane.right-dx};}
 private hit(x:number,y:number):{lane:Lane;index:number}{
  const b=this.boardRect,margin=48;
  // Far outside the board, the card goes home.
  if(x<b.left-margin||x>b.right+margin||y<b.top-margin||y>b.bottom+margin)return {lane:this.home,index:this.homeIndex};
  let lane=this.lanes[0],best=Infinity;
  for(const candidate of this.lanes){
   const {left,right}=this.laneX(candidate),distance=x<left?left-x:x>right?x-right:0;
   if(distance<best){best=distance;lane=candidate;}
  }
  const others=this.others(lane);
  if(!lane.lane)return {lane,index:others.length};
  const open=this.target?.stage===lane.stage?this.target.index:null;
  const middle=y-this.grabY+this.rect.height/2-lane.top+lane.scroll;
  return {lane,index:insertionIndex(others.tops,others.heights,open,this.slot,middle)};
 }

 /** Opens the slot at `index` in `lane`: other cards slide with transforms, the gap marker moves there. */
 private show(lane:Lane,index:number,instant=false){
  if(this.target&&this.target.stage!==lane.stage){
   const old=this.lanes.find(l=>l.stage===this.target!.stage);old?.column.classList.remove('over');old?.lane?.classList.remove('drop-target');
  }
  const others=this.others(lane);
  this.target={stage:lane.stage,index,beforeId:others[index]?.id??null};
  lane.column.classList.add('over');lane.lane?.classList.add('drop-target');
  if(instant)this.board.classList.add('no-shift-motion');
  for(const each of this.lanes){
   const list=this.others(each);
   list.forEach((item,k)=>{
    const shift=list.tops[k]-item.top+(each===lane&&k>=index?this.slot:0);
    if(shift!==item.shift){item.shift=shift;item.el.style.transform=shift?`translate3d(0,${shift}px,0)`:'';}
   });
  }
  if(lane.lane){
   const top=this.slotTop(lane,others,index);
   if(this.gap.parentElement!==lane.lane)lane.lane.append(this.gap);
   Object.assign(this.gap.style,{top:`${top}px`,left:`${this.offsetX}px`,width:`${this.rect.width}px`,height:`${this.rect.height}px`});
   this.gap.dataset.beforeId=this.target.beforeId??'';
  }else this.gap.remove();
  if(instant){void this.board.offsetWidth;this.board.classList.remove('no-shift-motion');}
 }

 private autoScroll(x:number,y:number){
  let moved=false;
  const lane=this.target&&this.lanes.find(l=>l.stage===this.target!.stage);
  if(lane?.lane){
   const {left,right}=this.laneX(lane);
   if(x>=left&&x<=right&&y>=lane.top-EDGE&&y<=lane.bottom+EDGE){
    const v=-edgeSpeed(y-lane.top,EDGE)+edgeSpeed(lane.bottom-y,EDGE);
    const next=Math.min(lane.maxScroll,Math.max(0,lane.scroll+v));
    if(v&&next!==lane.scroll){lane.scroll=next;lane.lane.scrollTop=next;moved=true;}
   }
  }
  const b=this.boardRect,h=-edgeSpeed(x-b.left,BOARD_EDGE)+edgeSpeed(b.right-x,BOARD_EDGE);
  if(h&&y>=b.top&&y<=b.bottom&&x>=b.left-BOARD_EDGE&&x<=b.right+BOARD_EDGE){
   const next=Math.min(this.boardMax,Math.max(0,this.boardScroll+h));
   if(next!==this.boardScroll){this.boardScroll=next;this.board.scrollLeft=next;moved=true;}
  }
  return moved;
 }

 /** Ends the drag: the copy settles into the slot (or back home when `cancel`), then `onSettled` commits. */
 drop(cancel=false){
  if(this.done)return;
  this.done=true;cancelAnimationFrame(this.frame);
  this.dirty=true;
  if(cancel){const home=this.home;this.show(home,this.homeIndex);}
  else{
   // The last pointer position decides, even if no frame ran since it arrived.
   this.overlay.style.transform=`translate3d(${this.pointer.x-this.start.x}px,${this.pointer.y-this.start.y}px,0)`;
   const next=this.hit(this.pointer.x,this.pointer.y);this.show(next.lane,next.index);
  }
  const target=this.target!,lane=this.lanes.find(l=>l.stage===target.stage)!;
  const result=cancel||(lane===this.home&&target.index===this.homeIndex)?null:target;
  this.copy.classList.remove('lifted');
  if(this.reduced||!lane.lane){this.onSettled(result);return;}
  const top=this.slotTop(lane,this.others(lane),target.index);
  const destX=lane.areaLeft-(this.boardScroll-this.measuredScroll)+this.offsetX-this.rect.left;
  const destY=lane.top+top-lane.scroll-this.rect.top;
  this.overlay.style.transition=`transform ${DRAG_SETTLE_MS}ms cubic-bezier(.2,.8,.2,1)`;
  this.overlay.style.transform=`translate3d(${destX}px,${destY}px,0)`;
  let finished=false;
  const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);this.overlay.removeEventListener('transitionend',onEnd);this.onSettled(result);};
  const onEnd=(event:TransitionEvent)=>{if(event.target===this.overlay&&event.propertyName==='transform')finish();};
  this.overlay.addEventListener('transitionend',onEnd);
  const timer=setTimeout(finish,DRAG_SETTLE_MS+60);
 }

 /** Snaps every card to rest with no animation. Call just before the moved order is drawn. */
 release(){
  this.board.classList.add('no-shift-motion');
  for(const lane of this.lanes){
   lane.column.classList.remove('over');lane.lane?.classList.remove('drop-target');
   for(const item of lane.items){item.el.style.transform='';item.shift=0;}
  }
  this.gap.remove();
 }
 /** Removes the copy and every class the drag added. */
 dispose(){
  this.done=true;cancelAnimationFrame(this.frame);
  this.release();
  window.removeEventListener('scroll',this.onScroll,{capture:true});window.removeEventListener('resize',this.onResize);
  for(const el of this.board.querySelectorAll('.drag-source'))el.classList.remove('drag-source');
  this.overlay.remove();
  this.board.classList.remove('is-dragging','reduced-motion');
  void this.board.offsetWidth;this.board.classList.remove('no-shift-motion');
 }
}
