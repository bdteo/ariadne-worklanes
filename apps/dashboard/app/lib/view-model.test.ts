import { describe, expect, it } from 'vitest';

import {
  buildTimeline,
  computeFreshness,
  computeMetricDeltas,
  copySummary,
  filterLanes,
  formatDelta,
  formatElapsed,
  groupLanes,
  metricToNumber,
  sortLanes,
} from './view-model';
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

  describe('metric deltas', () => {
    it('parses numeric, string, boolean, and null metric values', () => {
      expect(metricToNumber(42)).toBe(42);
      expect(metricToNumber('1,234')).toBe(1234);
      expect(metricToNumber('  3.5 ')).toBe(3.5);
      expect(metricToNumber(true)).toBe(1);
      expect(metricToNumber(false)).toBe(0);
      expect(metricToNumber(null)).toBeNull();
      expect(metricToNumber('not-a-number')).toBeNull();
      expect(metricToNumber('')).toBeNull();
    });

    it('computes delta, percent, and direction for paired metrics', () => {
      const baseline = [
        { label: 'errors', value: 100 },
        { label: 'p95', value: 200, unit: 'ms' },
        { label: 'unmatched', value: 5 },
      ];
      const current = [
        { label: 'errors', value: 38 },
        { label: 'p95', value: 220, unit: 'ms' },
        { label: 'noBase', value: 7 },
      ];
      const deltas = computeMetricDeltas(baseline, current);

      expect(deltas).toHaveLength(3);

      // errors: 38 - 100 = -62, -62%
      expect(deltas[0]?.delta).toBe(-62);
      expect(deltas[0]?.percent).toBe(-62);
      expect(deltas[0]?.direction).toBe('down');

      // p95: 220 - 200 = +20, +10%
      expect(deltas[1]?.delta).toBe(20);
      expect(deltas[1]?.percent).toBe(10);
      expect(deltas[1]?.direction).toBe('up');

      // noBase: no baseline → null delta
      expect(deltas[2]?.delta).toBeNull();
      expect(deltas[2]?.direction).toBeNull();
    });

    it('reports null percent when baseline is zero', () => {
      const deltas = computeMetricDeltas([{ label: 'x', value: 0 }], [{ label: 'x', value: 5 }]);
      expect(deltas[0]?.delta).toBe(5);
      expect(deltas[0]?.percent).toBeNull();
      expect(deltas[0]?.direction).toBe('up');
    });

    it('formats delta as signed value with optional percent', () => {
      expect(formatDelta(deltaOf('errors', 100, 38))).toBe('-62 (-62%)');
      expect(formatDelta(deltaOf('p95', 200, 220))).toBe('+20 (+10%)');
      // flat direction still renders the delta
      expect(formatDelta(deltaOf('x', 5, 5))).toBe('0 (0%)');
    });
  });

  describe('freshness gradient', () => {
    const now = new Date('2026-06-19T10:00:00.000Z');

    it('reports fresh for a recently updated active lane', () => {
      const lane = laneWithUpdatedAt('2026-06-19T09:50:00.000Z');
      const f = computeFreshness(lane, now);
      expect(f.level).toBe('fresh');
      expect(f.minutesSinceUpdate).toBe(10);
      expect(f.ratio).toBeLessThan(0.66);
      expect(f.label).toContain('Updated');
    });

    it('reports aging as a lane approaches the stale threshold', () => {
      const lane = laneWithUpdatedAt('2026-06-19T09:30:00.000Z'); // 30/60 = 0.5 → still fresh
      expect(computeFreshness(lane, now).level).toBe('fresh');
      const aging = laneWithUpdatedAt('2026-06-19T09:15:00.000Z'); // 45/60 = 0.75 → aging
      expect(computeFreshness(aging, now).level).toBe('aging');
    });

    it('reports stale at and past the threshold', () => {
      const stale = laneWithUpdatedAt('2026-06-19T08:30:00.000Z'); // 90 min, stale=true
      const f = computeFreshness({ ...stale, stale: true }, now);
      expect(f.level).toBe('stale');
      expect(f.label).toContain('Stale');
    });

    it('reports terminal for complete/cancelled/archived regardless of age', () => {
      const old = laneWithUpdatedAt('2025-01-01T00:00:00.000Z');
      expect(computeFreshness({ ...old, status: 'complete' }, now).level).toBe('terminal');
      expect(computeFreshness({ ...old, status: 'archived' }, now).level).toBe('terminal');
      expect(computeFreshness({ ...old, status: 'cancelled' }, now).level).toBe('terminal');
    });
  });

  describe('grouping', () => {
    it('returns a single bucket when grouping by none', () => {
      const groups = groupLanes(fixtureLanes(), 'none');
      expect(groups).toHaveLength(1);
      expect(groups[0]?.lanes).toHaveLength(5);
    });

    it('groups by workspace, falling back to scope then unsorted', () => {
      const lanes = [
        ...fixtureLanes(),
        laneWith({ id: 'ws-a', workspace: 'alpha', scope: 'svc' }),
        laneWith({ id: 'ws-b', workspace: 'beta', scope: 'svc' }),
        laneWith({ id: 'scope-only', scope: 'gamma' }),
      ];
      const groups = groupLanes(lanes, 'workspace');
      const keys = groups.map((g) => g.key);
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
      expect(keys).toContain('unsorted'); // fixture lanes + scope-only have no workspace
    });

    it('groups by status with prettified labels', () => {
      const groups = groupLanes(fixtureLanes(), 'status');
      const byKey = new Map(groups.map((g) => [g.key, g.label]));
      expect(byKey.get('active')).toBe('Active');
      expect(byKey.get('blocked')).toBe('Blocked');
      expect(byKey.get('archived')).toBe('Archived');
    });
  });

  describe('timeline builder', () => {
    it('merges events and milestones, sorted newest-first', () => {
      const lane = laneWith({
        id: 'tl',
        events: [
          { id: 'e1', type: 'created', at: '2026-06-19T09:00:00.000Z', message: 'created' },
          { id: 'e2', type: 'blocked', at: '2026-06-19T10:00:00.000Z', message: 'hit a wall', actor: 'boris' },
        ],
        milestones: [
          { id: 'm1', title: 'Phase 1', status: 'complete', at: '2026-06-19T09:30:00.000Z' },
        ],
      });
      const timeline = buildTimeline(lane);
      expect(timeline.map((t) => t.id)).toEqual(['e2', 'm1', 'e1']);
      expect(timeline[0]?.actor).toBe('boris');
      expect(timeline[1]?.type).toBe('milestone');
    });

    it('handles empty events and milestones', () => {
      expect(buildTimeline(laneWith({ id: 'empty' }))).toEqual([]);
    });
  });
});

function deltaOf(label: string, baseline: number, current: number) {
  const deltas = computeMetricDeltas([{ label, value: baseline }], [{ label, value: current }]);
  return deltas[0]!;
}

function fixtureLanes(): DashboardLane[] {
  return [
    laneWith({ id: 'active' }),
    laneWith({ id: 'stale', stale: true, summaryText: 'Lane: active / stale | 50%' }),
    laneWith({ id: 'blocked', status: 'blocked', blocker: 'Provider cooldown', summaryText: 'Lane: blocked | Blocked: Provider cooldown' }),
    laneWith({ id: 'complete', status: 'complete', summaryText: 'Lane: complete | 100%' }),
    laneWith({ id: 'archived', status: 'archived', summaryText: 'Lane: archived | 50%' }),
  ];
}

function laneWithUpdatedAt(iso: string): DashboardLane {
  return laneWith({ id: 'freshness', updatedAt: iso });
}

function laneWith(overrides: Partial<DashboardLane> & { id: string }): DashboardLane {
  return {
    schemaVersion: 2,
    title: 'Lane',
    status: 'active',
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
    ...overrides,
  };
}
