import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpLauncher } from './mcp-launcher.js';

test('the MCP launcher is the packaged app’s own, none when switched off, else this Node with the built entry', () => {
  const saved = process.env.SCENEFORGE_MCP_COMMAND;
  try {
    process.env.SCENEFORGE_MCP_COMMAND = '/Applications/Creator Compiler.app/Contents/MacOS/sceneforge-mcp';
    assert.deepEqual(mcpLauncher(), { command: '/Applications/Creator Compiler.app/Contents/MacOS/sceneforge-mcp', args: [] });
    process.env.SCENEFORGE_MCP_COMMAND = '';
    assert.equal(mcpLauncher(), undefined);
    delete process.env.SCENEFORGE_MCP_COMMAND;
    const plain = mcpLauncher()!;
    assert.equal(plain.command, process.execPath);
    assert.match(plain.args.at(-1)!, /server-dist[\\/]mcp\.mjs$/);
  } finally {
    if (saved === undefined) delete process.env.SCENEFORGE_MCP_COMMAND;
    else process.env.SCENEFORGE_MCP_COMMAND = saved;
  }
});
