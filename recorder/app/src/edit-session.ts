/** Edit's view of one video for this session: zoom, playhead and selection come back when you leave Edit and return. Kept in memory only. */
export interface EditView {zoom:number;playhead:number;selectedIds:string[];selected:string|null}
const views=new Map<string,EditView>();
export function rememberEditView(projectId:string,view:EditView){views.set(projectId,{...view,selectedIds:[...view.selectedIds]});}
export function recallEditView(projectId:string):EditView|undefined{const view=views.get(projectId);return view&&{...view,selectedIds:[...view.selectedIds]};}
