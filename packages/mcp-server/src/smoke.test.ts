import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

describe('ariadne MCP server', () => {
  it('writes and updates worklanes through stdio tools', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ariadne-mcp-'));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve('dist/index.js')],
      env: { ...process.env, ARIADNE_WORKLANES_DIR: dir },
    });
    const client = new Client({ name: 'ariadne-test-client', version: '0.1.0' });

    await client.connect(transport);
    await client.callTool({
      name: 'start_worklane',
      arguments: { id: 'smoke', title: 'Smoke test', current: 1, total: 3, unit: 'steps' },
    });
    await client.callTool({ name: 'add_milestone', arguments: { id: 'smoke', title: 'Started server' } });
    await client.callTool({ name: 'attach_evidence', arguments: { id: 'smoke', label: 'Log', url: 'file:///tmp/log.txt', kind: 'log' } });
    await client.callTool({ name: 'set_blocker', arguments: { id: 'smoke', blocker: 'Intentional test blocker' } });
    await client.callTool({ name: 'clear_blocker', arguments: { id: 'smoke', nextAction: 'Continue smoke test' } });
    await client.callTool({ name: 'complete_worklane', arguments: { id: 'smoke', note: 'Finished' } });
    const listed = await client.callTool({ name: 'summarize_worklanes', arguments: {} });
    await client.close();

    const lane = JSON.parse(await readFile(path.join(dir, 'smoke.json'), 'utf8')) as {
      schemaVersion: number;
      status: string;
      milestones: unknown[];
      evidence: unknown[];
    };

    expect(lane.schemaVersion).toBe(2);
    expect(lane.status).toBe('complete');
    expect(lane.milestones).toHaveLength(1);
    expect(lane.evidence).toHaveLength(1);
    expect(JSON.stringify(listed)).toContain('Smoke test');
  });
});
