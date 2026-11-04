import type {Route} from '../routes';
import {VideosScreen} from './VideosScreen';

/** Video board is the pipeline without the alternate-view controls. */
export function HomeScreen({navigate,onNewVideo}:{navigate(route:Route):void;onNewVideo():void}){
 return <VideosScreen route={{name:'videos',view:'board'}} navigate={navigate} onNewVideo={onNewVideo} home/>;
}
