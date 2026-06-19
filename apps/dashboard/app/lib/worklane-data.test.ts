import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createWorklane, writeWorklane } from '@ariadne-worklanes/core';
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
});
