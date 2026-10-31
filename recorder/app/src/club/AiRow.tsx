import type {AiProviderStatus,ConnectProvider,ConnectResult} from '../../shared/club';
import {ConnectStatus} from './ConnectStatus';
import {connectLabel,useConnect} from './useConnect';
import {Button,Icon} from './ui';
import {BrandLogo} from '../BrandLogo';

const LOGO:Record<ConnectProvider,string>={claude:'logo-claude',codex:'logo-codex'};

/** What a connected row says. ChatGPT's sign-in has no address to show, so it says what it is. */
export const accountLine=(provider:ConnectProvider,account?:string)=>!account?'Connected':provider==='codex'&&account==='ChatGPT'?'Connected with your ChatGPT account':`Connected as ${account}`;

/**
 * One AI account: its logo, what it is for, whether it is connected, and the button that signs in (the browser opens the tool's own sign-in page).
 * On Welcome a connected account shows a chip. In Settings it offers `Reconnect`.
 */
export function AiRow({provider,status,description,primary=false,settings=false,onChanged}:{provider:ConnectProvider;status:AiProviderStatus;description:string;primary?:boolean;settings?:boolean;onChanged(result?:ConnectResult):void}){
 const {state,start,cancel}=useConnect(onChanged);
 const name=connectLabel[provider],logo=LOGO[provider];
 const busy=state.phase==='installing'||state.phase==='signing-in';
 const connected=status.signedIn;
 const reconnect=connected&&settings;
 return <div className="srow" style={{flexWrap:'wrap'}}>
  <span className={`logo ${logo}`}><BrandLogo brand={provider} size={26}/></span>
  <div className="grow" style={{minWidth:0}}>
   <div style={{fontWeight:600}}>{name}</div>
   <div className="small muted">{connected
    ?<span className="row"><span className="dotok"/>{accountLine(provider,status.account)}</span>
    :description}</div>
  </div>
  {!busy&&(connected&&!settings
   ?<span className="chip b-green"><Icon name="check" size={12}/>Connected</span>
   :<Button size={settings?'sm':'md'} variant={primary&&!connected?'primary':'secondary'} aria-label={`${reconnect?'Reconnect':'Connect'} ${name}`} onClick={()=>start(provider,reconnect)}>{settings?(reconnect?'Reconnect':'Connect'):`Connect ${name}`}</Button>)}
  {state.phase!=='idle'&&state.phase!=='connected'&&<div style={{flexBasis:'100%'}}><ConnectStatus state={state} provider={provider} onRetry={()=>start(provider,reconnect)} onCancel={cancel}/></div>}
 </div>;
}
