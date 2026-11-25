import type {ReactElement} from 'react';
import {Menu,MenuContent,MenuGroupLabel,MenuItem,MenuRadioGroup,MenuRadioItem,MenuSeparator,MenuTrigger} from '@ui-sdk/react/menu';
import type {Workspace} from '../../../shared/club';
import {Avatar,Icon} from '../ui';
import {useClubRoot} from '../ui/useClubRoot';

/** The channel picker on ui-sdk's Menu, with the same cached picture in its trigger and every row. Choosing the current channel only closes it. */
export function ChannelMenu({channels,current,onChoose,onAdd,trigger}:{channels:{workspaces:Workspace[]}|null;current?:Workspace;onChoose(slug:string):void;onAdd():void;trigger:ReactElement}){
 const [anchor,root]=useClubRoot<HTMLSpanElement>();
 return <span ref={anchor} style={{position:'relative',display:'inline-flex',width:'100%'}}>
  <Menu>
   <MenuTrigger render={trigger}/>
   <MenuContent container={root} aria-label="Channels" className="menu" side="bottom" align="start" sideOffset={6} collisionPadding={8} style={{width:240,maxWidth:'calc(100vw - 16px)',maxHeight:'var(--available-height)',overflowY:'auto'}}>
    <MenuRadioGroup value={current?.slug??null} onValueChange={slug=>onChoose(slug)}>
     <MenuGroupLabel className="hd">Channels</MenuGroupLabel>
     {channels?.workspaces.map(workspace=><MenuRadioItem key={workspace.slug} value={workspace.slug} label={workspace.name} closeOnSelect render={<button type="button"/>}>
      <Avatar name={workspace.name} src={workspace.avatarUrl} size="sm" sq/><span className="grow ellipsis">{workspace.name}</span>{workspace.slug===current?.slug&&<Icon name="check" size={16}/>}
     </MenuRadioItem>)}
    </MenuRadioGroup>
    <MenuSeparator className="sep"/>
    <MenuItem label="Add a channel" onSelect={onAdd} render={<button type="button"/>}><Icon name="add" size={16}/><span>Add a channel</span></MenuItem>
   </MenuContent>
  </Menu>
 </span>;
}
