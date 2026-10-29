import {ErrorLine} from '../ErrorLine';
import {CalendarView} from '../production/CalendarView';
import {Kanban} from '../production/Kanban';
import {TableView} from '../production/TableView';
import {openRoute} from '../production';
import type {ProductionView,Route} from '../routes';
import {useSceneProgress} from '../scenes';
import {Icon,Spinner,Tabs,type Tab} from '../ui';
import {useProduction} from '../useProduction';

const VIEWS:readonly Tab<ProductionView>[]=[{id:'board',label:'Board',icon:'SquareKanban'},{id:'table',label:'Table',icon:'Table'},{id:'calendar',label:'Calendar',icon:'Calendar'}];
const NONE: never[]=[];

/** Production: every video from idea to published, as a board you drag cards across, a table or a calendar. */
export function ProductionScreen({view,navigate,onNewVideo}:{view:ProductionView;navigate(route:Route):void;onNewVideo():void}){
 const {state,videos,reload,move,schedule}=useProduction();
 const scenes=useSceneProgress(videos??NONE);

 if(state.status==='error')return <div className="page"><ErrorLine message={state.message} onRetry={reload} primary/></div>;
 if(!videos)return <div className="page"><Spinner label="Loading your board" size={20}/></div>;

 const wide=view==='board';
 return <div className={`page${wide?' wide':''}`} style={wide?{maxWidth:'none',paddingLeft:24,paddingRight:24}:undefined}>
  <div className="page-head"><div><h1>Production</h1><div className="lede">Every video from idea to published. Drag a card to move it.</div></div>
   <div className="actions">
    <Tabs label="View" tabs={VIEWS} value={view} onChange={next=>navigate({name:'production',view:next})}/>
    <button type="button" className="btn primary" onClick={onNewVideo}><Icon name="Plus" size={15}/>New video</button>
   </div></div>
  {view==='board'&&<Kanban videos={videos} scenes={scenes} onOpen={video=>navigate(openRoute(video))} onMove={(id,stage,beforeId)=>void move(id,stage,beforeId)} onAllIdeas={()=>navigate({name:'ideas'})}/>}
  {view==='table'&&<TableView videos={videos} scenes={scenes} onOpen={video=>navigate(openRoute(video))}/>}
  {view==='calendar'&&<CalendarView videos={videos} onOpen={video=>navigate(openRoute(video))} onOpenPublish={video=>navigate(openRoute(video,'publish'))} onSchedule={(id,day)=>void schedule(id,day)}/>}
 </div>;
}
