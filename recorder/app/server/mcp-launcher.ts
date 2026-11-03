import path from 'node:path';

/**
 * How an AI app starts this Creator Compiler's MCP server: the packaged app's own launcher (SCENEFORGE_MCP_COMMAND), or this Node with the
 * built MCP entry (run as Node when that is Electron). An empty SCENEFORGE_MCP_COMMAND means none is offered.
 */
export function mcpLauncher(): { command: string; args: string[] } | undefined {
  const command = process.env.SCENEFORGE_MCP_COMMAND;
  if (command === '') return undefined;
  if (command) return { command, args: [] };
  const entry = path.resolve(import.meta.dirname, '../server-dist/mcp.mjs');
  // Inside Electron (the app's media service) this binary only runs a script as Node when told to.
  if (process.versions.electron && process.platform !== 'win32') return { command: '/usr/bin/env', args: ['ELECTRON_RUN_AS_NODE=1', process.execPath, entry] };
  return { command: process.execPath, args: [entry] };
}
