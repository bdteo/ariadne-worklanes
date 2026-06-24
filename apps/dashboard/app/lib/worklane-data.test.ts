import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createWorklane, readWorklane, writeWorklane } from '@ariadne-worklanes/core';
import { describe, expect, it, vi } from 'vitest';

describe('dashboard worklane data', () => {
  it('loads valid, stale, and malformed lane files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ariadne-dashboard-'));
    process.env.ARIADNE_WORKLANES_DIR = dir;
    vi.resetModules();
    const { getDashboardData } = await import('./worklane-data');
    await writeWorklane(dir, createWorklane({ id: 'active', title: 'Active lane' }, new Date('2026-06-19T09:00:00.000Z')));
    await writeFile(path.join(dir, 'broken.json'), '{ bad', 'utf8');

    const data = await getDashboardData(new Date('2026-06-19T11:00:00.000Z'));

    expect(data.sourceDir).toBe(dir);
    expect(data.lanes[0]?.id).toBe('active');
    expect(data.lanes[0]?.stale).toBe(true);
    expect(data.malformed[0]?.fileName).toBe('broken.json');
  });

  it('completes a lane through the dashboard writer', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ariadne-dashboard-'));
    process.env.ARIADNE_WORKLANES_DIR = dir;
    vi.resetModules();
    const { setDashboardLaneStatus } = await import('./worklane-data');
    await writeWorklane(
      dir,
      createWorklane(
        {
          id: 'complete-me',
          title: 'Complete me',
          current: 1,
          total: 3,
          unit: 'steps',
        },
        new Date('2026-06-19T09:00:00.000Z'),
      ),
    );

    const result = await setDashboardLaneStatus('complete-me', 'complete', undefined, new Date('2026-06-19T10:00:00.000Z'));
    const saved = await readWorklane(dir, 'complete-me');

    expect(result.sourceDir).toBe(dir);
    expect(result.lane.status).toBe('complete');
    expect(result.lane.progress.current).toBe(3);
    expect(result.lane.completedAt).toBe('2026-06-19T10:00:00.000Z');
    expect(saved.events.at(-1)?.type).toBe('completed');
  });

  it('writes non-terminal status changes through the dashboard writer', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ariadne-dashboard-'));
    process.env.ARIADNE_WORKLANES_DIR = dir;
    vi.resetModules();
    const { setDashboardLaneStatus } = await import('./worklane-data');
    await writeWorklane(dir, createWorklane({ id: 'wait-for-me', title: 'Wait for me' }, new Date('2026-06-19T09:00:00.000Z')));

    const result = await setDashboardLaneStatus('wait-for-me', 'waiting', 'Waiting on operator review', new Date('2026-06-19T10:00:00.000Z'));
    const saved = await readWorklane(dir, 'wait-for-me');

    expect(result.lane.status).toBe('waiting');
    expect(saved.notes.at(-1)).toBe('Waiting on operator review');
    expect(saved.events.at(-1)?.type).toBe('updated');
    expect(saved.lastActor).toBe('Ariadne dashboard');
  });
});
