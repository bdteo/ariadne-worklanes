import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
    const defaultList = await client.callTool({ name: 'list_worklanes', arguments: {} });
    const defaultSummaries = await client.callTool({ name: 'summarize_worklanes', arguments: {} });
    const completedList = await client.callTool({ name: 'list_worklanes', arguments: { includeCompleted: true } });
    const completedSummaries = await client.callTool({ name: 'summarize_worklanes', arguments: { includeCompleted: true } });
    await client.close();

    const lane = JSON.parse(await readFile(path.join(dir, 'smoke.json'), 'utf8')) as {
      schemaVersion: number;
      status: string;
      cwd?: string;
      milestones: unknown[];
      evidence: unknown[];
    };

    expect(lane.schemaVersion).toBe(2);
    expect(lane.status).toBe('complete');
    expect(lane.cwd).toBeTruthy();
    expect(lane.milestones).toHaveLength(1);
    expect(lane.evidence).toHaveLength(1);
    expect(JSON.stringify(defaultList)).not.toContain('Smoke test');
    expect(JSON.stringify(defaultSummaries)).not.toContain('Smoke test');
    expect(JSON.stringify(completedList)).toContain('Smoke test');
    expect(JSON.stringify(completedSummaries)).toContain('Smoke test');
  });

  it('completes stale worklanes and leaves fresh ones alone', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ariadne-mcp-'));
    const stale = {
      schemaVersion: 2,
      id: 'stale-lane',
      title: 'Stale lane',
      status: 'active',
      startedAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      staleAfterMinutes: 1,
      progress: { current: 2, total: 5, unit: 'steps' },
      baseline: [],
      metrics: [],
      milestones: [],
      events: [],
      evidence: [],
      warnings: [],
      links: [],
      notes: [],
    };
    await writeFile(path.join(dir, 'stale-lane.json'), JSON.stringify(stale));

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve('dist/index.js')],
      env: { ...process.env, ARIADNE_WORKLANES_DIR: dir },
    });
    const client = new Client({ name: 'ariadne-test-client', version: '0.1.0' });
    await client.connect(transport);

    // Fresh lane started now should not be completed.
    await client.callTool({
      name: 'start_worklane',
      arguments: { id: 'fresh-lane', title: 'Fresh lane', current: 0, total: 3, unit: 'steps', staleAfterMinutes: 60 },
    });

    const dryRun = await client.callTool({
      name: 'complete_stale_worklanes',
      arguments: { dryRun: true },
    });
    const before = JSON.parse(await readFile(path.join(dir, 'stale-lane.json'), 'utf8')) as { status: string };
    expect(before.status).toBe('active');
    expect(JSON.stringify(dryRun)).toContain('would be completed');

    const applied = await client.callTool({
      name: 'complete_stale_worklanes',
      arguments: { note: 'Bulk cleanup', actor: 'test' },
    });
    await client.close();

    const after = JSON.parse(await readFile(path.join(dir, 'stale-lane.json'), 'utf8')) as {
      status: string;
      progress: { current: number; total: number };
    };
    const freshAfter = JSON.parse(await readFile(path.join(dir, 'fresh-lane.json'), 'utf8')) as { status: string };

    expect(after.status).toBe('complete');
    expect(after.progress.current).toBe(after.progress.total);
    expect(freshAfter.status).toBe('active');
    expect(JSON.stringify(applied)).toContain('stale-lane');
    expect(JSON.stringify(applied)).not.toContain('fresh-lane');
  });
});
