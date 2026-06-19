import type { DashboardLane } from './worklane-data';

export type StatusFilter = 'all' | 'open' | 'stale' | 'blocked' | 'complete' | 'archived';
export type SortMode = 'stale' | 'updated' | 'started' | 'progress' | 'title';

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
