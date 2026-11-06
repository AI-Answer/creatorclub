import {Component,type ReactNode} from 'react';
import {Button,Empty} from '../ui';
import {isStaleBuild,reloadForNewBuild} from '../../stale-build';

/**
 * Catches a screen that fails to draw, so the sidebar stays usable. Shows one plain sentence and Try again; the error goes to the console.
 * A screen whose code is from an older build (the app was updated while open) reloads onto the new build instead, and Try again does too.
 */
export class ScreenBoundary extends Component<{children:ReactNode},{failed:boolean;stale?:boolean}>{
 state={failed:false,stale:false};
 static getDerivedStateFromError(error:unknown){return {failed:true,stale:isStaleBuild(error)};}
 componentDidCatch(error:Error){console.error(error);if(isStaleBuild(error))reloadForNewBuild();}
 render(){
  return this.state.failed
   ?<div className="page"><div className="card"><Empty icon="warning" title="This screen couldn't load." action={<Button variant="primary" onClick={()=>this.state.stale?globalThis.location.reload():this.setState({failed:false})}>Try again</Button>}/></div></div>
   :this.props.children;
 }
}
