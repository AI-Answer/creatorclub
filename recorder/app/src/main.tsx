import React from 'react';
import ReactDOM from 'react-dom/client';
import ClubApp from './club/ClubApp';
import {Button,EmptyState} from './club/ui';
// The editorial look's serif, for graphics drawn in the editor (the export embeds the same file).
import '@fontsource/instrument-serif/400.css';
import './styles.css';
import './original-theme.css';
import './timeline-interactions.css';
import './interaction-theme.css';
import './club/club.css';
import './recording-club.css';
import './editing-club.css';
import './cutroom.css';
import './BrandLogo.css';
import './club/borumi.css';
import './club/polish.css';
import './club/borumi-record.css';
import './club/borumi-edit.css';
import './club/edit-panels/br.css';
import './club/edit-panels/Canvas.css';
import './club/edit-panels/Layout.css';
import './club/edit-panels/Clip.css';
import './club/edit-panels/Zoom.css';
import './club/edit-panels/Elements.css';
import './club/edit-panels/Music.css';
import './club/edit-panels/Captions.css';
import './club/edit-panels/Cursor.css';
import './club/edit-panels/Automate.css';
import {initializeAppearance} from './appearance';
import {reloadForNewBuild} from './stale-build';

// Code from an older build asked for a file a newer build removed: reload onto the new build once (see stale-build.ts).
window.addEventListener('vite:preloadError',event=>{if(reloadForNewBuild())event.preventDefault();});
initializeAppearance();

/** Last-resort error screen: one sentence and `Try again`, never the raw error (that goes to the console). */
class Boundary extends React.Component<React.PropsWithChildren,{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return{failed:true};}componentDidCatch(error:Error){console.error(error);}render(){return this.state.failed?<div className="club-root"><EmptyState className="h-full" title="Couldn't load Creator Compiler." action={<Button variant="primary" onClick={()=>location.reload()}>Try again</Button>}/></div>:this.props.children;}}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><ClubApp/></Boundary></React.StrictMode>);
