import type { DashboardLane } from './worklane-data';
import type { Metric, WorklaneEvent } from '@ariadne-worklanes/core';

export type StatusFilter = 'all' | 'open' | 'stale' | 'blocked' | 'complete' | 'archived';
export type SortMode = 'stale' | 'updated' | 'started' | 'progress' | 'title';
export type GroupKey = 'none' | 'workspace' | 'owner' | 'status' | 'scope';

export function filterLanes(lanes: DashboardLane[], filter: StatusFilter, query: string): DashboardLane[] {
  const normalizedQuery = query.trim().toLowerCase();
  return lanes.filter((lane) => {
    const statusMatch =
      filter === 'all' ||
      (filter === 'open' && ['planned', 'active', 'waiting', 'blocked'].includes(lane.status)) ||
      (filter === 'stale' && lane.stale) ||
      (filter === 'blocked' && lane.status === 'blocked') ||
      (filter === 'complete' && lane.status === 'complete') ||
      (filter === 'archived' && lane.status === 'archived');

    if (!statusMatch) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [lane.title, lane.summary, lane.scope, lane.repo, lane.owner, lane.nextAction, lane.blocker]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });
}

export function sortLanes(lanes: DashboardLane[], sort: SortMode): DashboardLane[] {
  return [...lanes].sort((a, b) => {
    if (sort === 'stale') {
      return Number(b.stale) - Number(a.stale) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    }
    if (sort === 'started') {
      return Date.parse(b.startedAt) - Date.parse(a.startedAt);
    }
    if (sort === 'progress') {
      return b.progressPercent - a.progressPercent;
    }
    if (sort === 'title') {
      return a.title.localeCompare(b.title);
    }
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

export function copySummary(lane: DashboardLane): string {
  return lane.summaryText;
}

export function formatElapsed(from: string, to?: string, now = new Date()): string {
  const start = Date.parse(from);
  const end = to ? Date.parse(to) : now.getTime();
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

/* ------------------------------------------------------------------ delta */

/**
 * Parse a metric value to a finite number, or null when it isn't numeric.
 * Handles plain numbers, numeric strings, booleans, and null.
 */
export function metricToNumber(value: Metric['value']): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    const parsed = Number(trimmed.replace(/[, ]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return null;
}

export type MetricDelta = {
  label: string;
  baseline: Metric['value'];
  current: Metric['value'];
  unit?: string;
  /** Finite numeric delta (current − baseline) when both values are numeric; null otherwise. */
  delta: number | null;
  /** Absolute delta as a percentage of |baseline| when baseline is non-zero; null otherwise. */
  percent: number | null;
  /** positive = increased, negative = decreased, zero = unchanged, null = not measurable. */
  direction: 'up' | 'down' | 'flat' | null;
};

/**
 * Pair each current metric with a same-labelled baseline metric and compute
 * the delta. Metrics without a baseline are returned with null deltas so the
 * UI can still render the current value.
 */
export function computeMetricDeltas(baseline: Metric[], current: Metric[]): MetricDelta[] {
  const baselineByLabel = new Map<string, Metric>();
  for (const metric of baseline) {
    baselineByLabel.set(metric.label, metric);
  }

  return current.map((metric) => {
    const base = baselineByLabel.get(metric.label);
    const baseNumber = base ? metricToNumber(base.value) : null;
    const currentNumber = metricToNumber(metric.value);

    if (baseNumber === null || currentNumber === null) {
      return {
        label: metric.label,
        baseline: base?.value ?? null,
        current: metric.value,
        unit: metric.unit,
        delta: null,
        percent: null,
        direction: null,
      };
    }

    const delta = currentNumber - baseNumber;
    const percent = baseNumber !== 0 ? (delta / Math.abs(baseNumber)) * 100 : null;
    const direction: MetricDelta['direction'] = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

    return {
      label: metric.label,
      baseline: base!.value,
      current: metric.value,
      unit: metric.unit,
      delta,
      percent,
      direction,
    };
  });
}

export function formatDelta(delta: MetricDelta): string {
  if (delta.delta === null) {
    return String(delta.current);
  }
  const sign = delta.delta > 0 ? '+' : '';
  const value = `${sign}${formatNumber(delta.delta)}`;
  if (delta.percent !== null && Number.isFinite(delta.percent)) {
    const pct = `${delta.percent > 0 ? '+' : ''}${Math.round(delta.percent)}%`;
    return `${value} (${pct})`;
  }
  return value;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString('en');
  }
  return value.toLocaleString('en', { maximumFractionDigits: 2 });
}

/* ------------------------------------------------------------------ freshness */

export type FreshnessLevel = 'fresh' | 'aging' | 'stale' | 'terminal';

export type FreshnessState = {
  level: FreshnessLevel;
  /** Minutes since the lane was last updated. */
  minutesSinceUpdate: number;
  /** 0 (just updated) → 1 (at staleAfterMinutes) → >1 (past threshold). Clamped to [0, 1] for UI ramps. */
  ratio: number;
  label: string;
};

/**
 * Replace the binary isStale() story with a gradient. Terminal statuses
 * (complete / cancelled / archived) are reported separately so the UI doesn't
 * ramp a finished lane toward red.
 */
export function computeFreshness(lane: DashboardLane, now = new Date()): FreshnessState {
  const minutesSinceUpdate = Math.max(0, Math.round((now.getTime() - Date.parse(lane.updatedAt)) / 60000));
  const threshold = lane.staleAfterMinutes > 0 ? lane.staleAfterMinutes : 60;
  const rawRatio = minutesSinceUpdate / threshold;
  const ratio = Math.max(0, Math.min(1, rawRatio));

  if (lane.status === 'complete' || lane.status === 'cancelled' || lane.status === 'archived') {
    return { level: 'terminal', minutesSinceUpdate, ratio: 0, label: lane.status };
  }

  if (lane.stale || rawRatio >= 1) {
    return { level: 'stale', minutesSinceUpdate, ratio: 1, label: `Stale · ${formatMinutes(minutesSinceUpdate)}` };
  }

  if (ratio >= 0.66) {
    return { level: 'aging', minutesSinceUpdate, ratio, label: `Aging · ${formatMinutes(minutesSinceUpdate)}` };
  }

  return { level: 'fresh', minutesSinceUpdate, ratio, label: `Updated ${formatMinutes(minutesSinceUpdate)} ago` };
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) {
    return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/* ------------------------------------------------------------------ grouping */

export type LaneGroup = {
  key: string;
  label: string;
  lanes: DashboardLane[];
};

export function groupLanes(lanes: DashboardLane[], groupBy: GroupKey): LaneGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: '', lanes }];
  }

  const buckets = new Map<string, DashboardLane[]>();
  for (const lane of lanes) {
    const raw = lane[groupBy] ?? lane.scope ?? 'unsorted';
    const key = String(raw || 'unsorted');
    const list = buckets.get(key);
    if (list) {
      list.push(lane);
    } else {
      buckets.set(key, [lane]);
    }
  }

  return [...buckets.entries()]
    .map(([key, groupLanes]) => ({
      key,
      label: groupLabel(groupBy, key),
      lanes: groupLanes,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function groupLabel(key: GroupKey, value: string): string {
  if (value === 'unsorted') {
    return 'Unsorted';
  }
  const prettified = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (key === 'status') {
    return prettified.charAt(0).toUpperCase() + prettified.slice(1);
  }
  return prettified;
}

/* ------------------------------------------------------------------ timeline */

export type TimelineEntry = {
  id: string;
  at: string;
  type: WorklaneEvent['type'] | 'milestone';
  title: string;
  message: string;
  actor?: string;
};

export type TimelineTone = 'created' | 'updated' | 'milestone' | 'blocked' | 'unblocked' | 'evidence' | 'archived' | 'completed' | 'note' | 'neutral';

export function buildTimeline(lane: DashboardLane): TimelineEntry[] {
  const fromEvents: TimelineEntry[] = lane.events.map((event) => ({
    id: event.id,
    at: event.at,
    type: event.type,
    title: event.title ?? event.type,
    message: event.message,
    actor: event.actor,
  }));

  const fromMilestones: TimelineEntry[] = lane.milestones.map((milestone) => ({
    id: milestone.id,
    at: milestone.at,
    type: 'milestone',
    title: milestone.title,
    message: milestone.summary ?? milestone.title,
  }));

  return [...fromEvents, ...fromMilestones].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
