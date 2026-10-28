import {Settings} from 'lucide-react';
import {EmptyState} from '../ui';
import {ScreenHeader} from './ScreenHeader';

/** Placeholder until the settings task. */
export function SettingsScreen(){
 return <>
  <ScreenHeader title="Settings"/>
  <EmptyState icon={<Settings/>} title="Settings" description="Your AI connection, channel and Google live here."/>
 </>;
}
