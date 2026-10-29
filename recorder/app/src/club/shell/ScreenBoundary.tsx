import {Component,type ReactNode} from 'react';
import {Button,Empty} from '../ui';

/** Catches a screen that fails to draw, so the sidebar stays usable. Shows one plain sentence and Try again; the error goes to the console. */
export class ScreenBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:Error){console.error(error);}
 render(){
  return this.state.failed
   ?<div className="page"><div className="card"><Empty icon="TriangleAlert" title="This screen couldn't load." action={<Button variant="primary" onClick={()=>this.setState({failed:false})}>Try again</Button>}/></div></div>
   :this.props.children;
 }
}
