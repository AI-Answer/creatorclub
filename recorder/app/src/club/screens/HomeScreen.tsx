import type {Route} from '../routes';
import {VideosScreen} from './VideosScreen';

/** Home is an alias for the same Video board and its view controls. */
export function HomeScreen({navigate,onNewVideo}:{navigate(route:Route):void;onNewVideo():void}){
 return <VideosScreen route={{name:'videos',view:'board'}} navigate={navigate} onNewVideo={onNewVideo}/>;
}
