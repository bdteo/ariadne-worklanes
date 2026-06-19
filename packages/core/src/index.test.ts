import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  archiveWorklane,
  createWorklane,
  isStale,
  listWorklanes,
  normalizeWorklane,
  readWorklane,
  summarizeWorklane,
  updateWorklane,
  writeWorklane,
  WorklaneError,
} from './index';

describe('worklane core', () => {
  it('creates valid schema v2 lanes', () => {
    const lane = createWorklane({ title: 'Deploy staging', current: 1, total: 4, unit: 'steps' }, fixedDate());
    expect(lane.schemaVersion).toBe(2);
    expect(lane.id).toBe('deploy-staging');
    expect(lane.events[0]?.type).toBe('created');
  });

  it('migrates v1 lanes to v2', () => {
    const lane = normalizeWorklane({
      schemaVersion: 1,
      id: 'legacy',
      title: 'Legacy',
      status: 'active',
      startedAt: '2026-06-19T09:00:00.000Z',
      updatedAt: '2026-06-19T09:10:00.000Z',
      progress: { current: 1, total: 2, unit: 'steps' },
      links: [{ label: 'Runbook', url: 'file:///tmp/runbook.md' }],
    });

    expect(lane.schemaVersion).toBe(2);
    expect(lane.evidence[0]?.label).toBe('Runbook');
    expect(lane.staleAfterMinutes).toBe(60);
  });

  it('writes atomically and reads normalized lanes', async () => {
    const dir = await tempDir();
    const lane = createWorklane({ id: 'atomic', title: 'Atomic write' }, fixedDate());
    await writeWorklane(dir, lane);

    const files = await readdir(dir);
    expect(files).toEqual(['atomic.json']);
    await expect(readWorklane(dir, 'atomic')).resolves.toMatchObject({ id: 'atomic' });
  });

  it('returns a clear missing-lane error', async () => {
    const dir = await tempDir();
    await expect(readWorklane(dir, 'missing')).rejects.toThrow(WorklaneError);
    await expect(readWorklane(dir, 'missing')).rejects.toThrow('Worklane not found');
  });

  it('detects stale lanes and summarizes blockers', () => {
    const lane = updateWorklane(
      createWorklane({ title: 'Slow job', staleAfterMinutes: 10 }, new Date('2026-06-19T09:00:00.000Z')),
      { blocker: 'Provider cooldown', status: 'blocked', current: 3, total: 10, unit: 'shops' },
      new Date('2026-06-19T09:05:00.000Z'),
    );

    expect(isStale(lane, new Date('2026-06-19T09:20:01.000Z'))).toBe(true);
    expect(summarizeWorklane(lane, new Date('2026-06-19T09:20:01.000Z'))).toContain('Provider cooldown');
  });

  it('archives without deleting the file', async () => {
    const dir = await tempDir();
    const archived = archiveWorklane(createWorklane({ id: 'done', title: 'Done' }, fixedDate()), 'Shipped');
    await writeWorklane(dir, archived);

    const raw = JSON.parse(await readFile(path.join(dir, 'done.json'), 'utf8')) as { status: string };
    expect(raw.status).toBe('archived');
  });

  it('keeps malformed files visible in list results', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'broken.json'), '{ nope', 'utf8');
    const result = await listWorklanes(dir);

    expect(result.lanes).toHaveLength(0);
    expect(result.malformed[0]?.fileName).toBe('broken.json');
  });
});

function fixedDate() {
  return new Date('2026-06-19T09:00:00.000Z');
}

async function tempDir() {
  return mkdtemp(path.join(tmpdir(), 'ariadne-core-'));
}
