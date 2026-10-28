import React from 'react';
import ReactDOM from 'react-dom/client';
import ClubApp from './club/ClubApp';
import {Button,EmptyState} from './club/ui';
import '@fontsource-variable/inter';
import './styles.css';
import './original-theme.css';
import './timeline-interactions.css';
import './interaction-theme.css';
import './club/club.css';
import {initializeAppearance} from './appearance';
initializeAppearance();

/** Last-resort error screen: one sentence and `Try again`, never the raw error (that goes to the console). */
class Boundary extends React.Component<React.PropsWithChildren,{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return{failed:true};}componentDidCatch(error:Error){console.error(error);}render(){return this.state.failed?<div className="club-root"><EmptyState className="h-full" title="Couldn't load CreatorClub." action={<Button variant="primary" onClick={()=>location.reload()}>Try again</Button>}/></div>:this.props.children;}}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><ClubApp/></Boundary></React.StrictMode>);
