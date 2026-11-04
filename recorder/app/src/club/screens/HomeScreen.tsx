import type {Route} from '../routes';
import {VideosScreen} from './VideosScreen';

/** Home is the same board as Videos, without the alternate-view controls. */
export function HomeScreen({navigate,onNewVideo}:{navigate(route:Route):void;onNewVideo():void}){
 return <VideosScreen route={{name:'videos',view:'board'}} navigate={navigate} onNewVideo={onNewVideo} home/>;
}
