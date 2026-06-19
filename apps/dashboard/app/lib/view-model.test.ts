import { describe, expect, it } from 'vitest';

import { copySummary, filterLanes, formatElapsed, sortLanes } from './view-model';
import type { DashboardLane } from './worklane-data';

describe('dashboard view model', () => {
  it('filters by stale, blocked, archived, and search query', () => {
    const lanes = fixtureLanes();
    expect(filterLanes(lanes, 'open', '').map((lane) => lane.id)).toEqual(['active', 'stale', 'blocked']);
    expect(filterLanes(lanes, 'stale', '')).toHaveLength(1);
    expect(filterLanes(lanes, 'blocked', '')[0]?.id).toBe('blocked');
    expect(filterLanes(lanes, 'archived', '')[0]?.id).toBe('archived');
    expect(filterLanes(lanes, 'all', 'provider')[0]?.id).toBe('blocked');
  });

  it('sorts stale lanes first and produces copy summaries', () => {
    const sorted = sortLanes(fixtureLanes(), 'stale');
    expect(sorted[0]?.id).toBe('stale');
    expect(copySummary(sorted[0]!)).toContain('stale');
  });

  it('formats elapsed time compactly', () => {
    expect(formatElapsed('2026-06-19T09:00:00.000Z', undefined, new Date('2026-06-19T10:05:00.000Z'))).toBe('1h 5m');
  });
});

function fixtureLanes(): DashboardLane[] {
  const base = {
    schemaVersion: 2 as const,
    title: 'Lane',
    status: 'active' as const,
    startedAt: '2026-06-19T09:00:00.000Z',
    updatedAt: '2026-06-19T09:05:00.000Z',
    staleAfterMinutes: 60,
    progress: { current: 1, total: 2, unit: 'steps' },
    baseline: [],
    metrics: [],
    milestones: [],
    events: [],
    evidence: [],
    warnings: [],
    links: [],
    notes: [],
    stale: false,
    progressPercent: 50,
    summaryText: 'Lane: active | 50%',
  };

  return [
    { ...base, id: 'active' },
    { ...base, id: 'stale', stale: true, summaryText: 'Lane: active / stale | 50%' },
    { ...base, id: 'blocked', status: 'blocked', blocker: 'Provider cooldown', summaryText: 'Lane: blocked | Blocked: Provider cooldown' },
    { ...base, id: 'complete', status: 'complete', summaryText: 'Lane: complete | 100%' },
    { ...base, id: 'archived', status: 'archived', summaryText: 'Lane: archived | 50%' },
  ];
}
