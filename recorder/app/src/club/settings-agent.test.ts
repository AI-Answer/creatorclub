import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from './test-fakes';
import {agentPrompt} from './agent-prompt';
const {SettingsScreen}=await import('./screens/SettingsScreen');
const {ToastProvider}=await import('./ui');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const click=async(element:Element|null)=>{await act(async()=>{(element as HTMLElement).click();});await flush();};
const mcp={command:'/Applications/Creator Compiler.app/Contents/MacOS/sceneforge-mcp',args:[],toolCount:63};

async function withAgentTab(reply:(call:FakeCall)=>FakeReply,run:(ui:Awaited<ReturnType<typeof mountUI>>,calls:FakeCall[])=>Promise<void>){
 FakeEventSource.install();
 const server=installFetch(call=>reply(call)??(call.path==='/settings'?{body:{defaultAi:'claude',appearance:null,geminiKey:null}}:call.path==='/workspaces'?{body:{current:null,workspaces:[]}}:call.path==='/ai/status'?{body:{claude:{installed:true,version:'2',signedIn:true},codex:{installed:false,version:null,signedIn:false}}}:undefined));
 const ui=await mountUI(createElement(ToastProvider,null,createElement(SettingsScreen,{section:'agent',onSetup(){}})));
 try{await flush();await flush();await run(ui,server.calls);}finally{await ui.close();server.restore();}
}

test('Your AI agent: one switch allows agents, Claude Code and Codex are added in one click, other apps get the entry to paste',async()=>{
 let enabled=true;
 await withAgentTab(({method,path,body})=>{
  if(path==='/api/health')return {body:{mcp}};
  if(path==='/api/mcp/settings'){if(method==='PUT')enabled=(body as {enabled:boolean}).enabled;return {body:{enabled,workspaceLocation:'/tmp',workspacePath:'/tmp/ws'}};}
  if(path==='/agent/connect')return {body:{added:true,app:(body as {app:string}).app}};
  return undefined;
 },async(ui,calls)=>{
  const c=ui.container;
  assert.equal(c.querySelector('.settings-nav [aria-current="page"]')!.textContent,'Your AI agent');
  const group=c.querySelector('#set-agent')!;
  assert.ok(group.textContent?.includes('Cut pauses and filler words')||group.textContent?.includes('cut pauses and filler words'));
  await click(button(c,'Add to Claude Code'));
  assert.deepEqual(calls.filter(call=>call.path==='/agent/connect').map(call=>call.body),[{app:'claude'}]);
  assert.ok(group.textContent?.includes('Added. Start a new session to use it.'));
  await click(button(c,'Show'));
  assert.match(c.querySelector('[aria-label="MCP configuration"]')!.textContent!,/"creator-compiler"[\s\S]*sceneforge-mcp/);
  await click(c.querySelector('[role="switch"][aria-label="Allow AI agents"]'));
  assert.deepEqual(calls.filter(call=>call.method==='PUT'&&call.path==='/api/mcp/settings').map(call=>call.body),[{enabled:false}]);
  assert.equal(c.querySelector('[role="switch"][aria-label="Allow AI agents"]')!.getAttribute('aria-checked'),'false');
  assert.equal((button(c,'Add to Codex') as HTMLButtonElement).disabled,true,'nothing to add while agents are not allowed');
 });
});

test('a copy without a launcher says the connector comes with the installed app, and offers nothing to add',async()=>{
 await withAgentTab(({path})=>path==='/api/health'?{body:{}}:path==='/api/mcp/settings'?{body:{enabled:true,workspaceLocation:'/tmp',workspacePath:'/tmp/ws'}}:undefined,async ui=>{
  assert.ok(ui.container.querySelector('#set-agent')!.textContent?.includes('It comes with the installed app.'));
  assert.equal([...ui.container.querySelectorAll('button')].some(each=>each.textContent?.includes('Add to')),false);
 });
});

test('the prompt for an agent names the video, its id and where to start on the step it is on',()=>{
 const text=agentPrompt({id:'v_1',title:'Five skills'},'edit');
 assert.match(text,/"Five skills" \(video_id: v_1\)/);
 assert.match(text,/get_guides and get_channel, then get_video/);
 assert.match(text,/get_project_overview and get_transcript/);
 assert.match(agentPrompt({id:'v_1',title:'x'},'board'),/get_board/);
});
