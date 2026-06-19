'use client';

import Link from 'next/link';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  buildTimeline,
  computeFreshness,
  computeMetricDeltas,
  copySummary,
  filterLanes,
  formatDelta,
  formatElapsed,
  groupLanes,
  sortLanes,
  type GroupKey,
  type MetricDelta,
  type SortMode,
  type StatusFilter,
} from '../lib/view-model';
import type { DashboardPayload, DashboardLane } from '../lib/worklane-data';

const statusLabels: Record<DashboardLane['status'], string> = {
  planned: 'Planned',
  active: 'Active',
  waiting: 'Waiting',
  blocked: 'Blocked',
  complete: 'Complete',
  cancelled: 'Cancelled',
  archived: 'Archived',
};

type ThemeMode = 'system' | 'light' | 'dark';

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'stale', label: 'Stale' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

const groupOptions: { value: GroupKey; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'owner', label: 'Owner' },
  { value: 'status', label: 'Status' },
  { value: 'scope', label: 'Scope' },
];

const openStatuses = new Set<DashboardLane['status']>(['planned', 'active', 'waiting', 'blocked']);
const defaultDashboardState: DashboardUrlState = { filter: 'open', sort: 'stale', query: '', compact: false, groupBy: 'none' };
const statusFilters = new Set<StatusFilter>(['all', 'open', 'stale', 'blocked', 'complete', 'archived']);
const sortModes = new Set<SortMode>(['stale', 'updated', 'started', 'progress', 'title']);
const groupKeys = new Set<GroupKey>(['none', 'workspace', 'owner', 'status', 'scope']);

type DashboardUrlState = {
  filter: StatusFilter;
  sort: SortMode;
  query: string;
  compact: boolean;
  groupBy: GroupKey;
};

function readDashboardUrlState(): DashboardUrlState {
  if (typeof window === 'undefined') {
    return defaultDashboardState;
  }

  const params = new URLSearchParams(window.location.search);
  const filterParam = params.get('status') ?? params.get('filter');
  const sortParam = params.get('sort');
  const compactParam = params.get('compact');
  const groupParam = params.get('group');

  return {
    filter: filterParam && statusFilters.has(filterParam as StatusFilter) ? (filterParam as StatusFilter) : defaultDashboardState.filter,
    sort: sortParam && sortModes.has(sortParam as SortMode) ? (sortParam as SortMode) : defaultDashboardState.sort,
    query: params.get('q') ?? params.get('search') ?? defaultDashboardState.query,
    compact: compactParam === '1' || compactParam === 'true',
    groupBy: groupParam && groupKeys.has(groupParam as GroupKey) ? (groupParam as GroupKey) : defaultDashboardState.groupBy,
  };
}

function writeDashboardUrlState(state: DashboardUrlState) {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  params.delete('filter');
  params.delete('search');

  if (state.filter === defaultDashboardState.filter) {
    params.delete('status');
  } else {
    params.set('status', state.filter);
  }

  if (state.sort === defaultDashboardState.sort) {
    params.delete('sort');
  } else {
    params.set('sort', state.sort);
  }

  const trimmedQuery = state.query.trim();
  if (trimmedQuery) {
    params.set('q', trimmedQuery);
  } else {
    params.delete('q');
  }

  if (state.compact) {
    params.set('compact', '1');
  } else {
    params.delete('compact');
  }

  if (state.groupBy === defaultDashboardState.groupBy) {
    params.delete('group');
  } else {
    params.set('group', state.groupBy);
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(null, '', nextUrl);
  }
}

function formatMetricLabel(label: string): string {
  return label.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Stable signature of the operator-meaningful slice of a lane, used to detect
 * real changes for the update-pulse. Deliberately ignores updatedAt/lastActor
 * noise so a no-op save doesn't flash every card.
 */
function laneSignature(lane: DashboardLane): string {
  return JSON.stringify([
    lane.status,
    lane.stale,
    Math.round(lane.progressPercent),
    lane.progress.current,
    lane.progress.total,
    lane.summary ?? '',
    lane.nextAction ?? '',
    lane.blocker ?? '',
    lane.metrics,
    lane.baseline,
    lane.events.length,
    lane.milestones.length,
    lane.evidence.length,
  ]);
}

export function Dashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string>('');
  const [urlState, setUrlState] = useState<DashboardUrlState>(defaultDashboardState);
  const [urlStateReady, setUrlStateReady] = useState(false);
  const [copied, setCopied] = useState<string>('');
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [pinned, setPinned] = useState<string>('');
  const [pinnedReady, setPinnedReady] = useState(false);
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const previousLaneSignature = useRef<Map<string, string>>(new Map());

  const { compact, filter, query, sort, groupBy } = urlState;

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('ariadne-theme');
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
      window.localStorage.removeItem('ariadne-theme');
      return;
    }

    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('ariadne-theme', theme);
  }, [theme]);

  useEffect(() => {
    const storedPinned = window.localStorage.getItem('ariadne-pinned');
    if (storedPinned) {
      setPinned(storedPinned);
    }
    setPinnedReady(true);
  }, []);

  useEffect(() => {
    if (pinnedReady) {
      if (pinned) {
        window.localStorage.setItem('ariadne-pinned', pinned);
      } else {
        window.localStorage.removeItem('ariadne-pinned');
      }
    }
  }, [pinned, pinnedReady]);

  useEffect(() => {
    function syncFromUrl() {
      setUrlState(readDashboardUrlState());
    }

    syncFromUrl();
    setUrlStateReady(true);
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  useEffect(() => {
    if (urlStateReady) {
      writeDashboardUrlState(urlState);
    }
  }, [urlState, urlStateReady]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch('/api/worklanes', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Dashboard API returned ${response.status}`);
        }
        const nextPayload = (await response.json()) as DashboardPayload;
        if (active) {
          const changed = new Set<string>();
          for (const lane of nextPayload.lanes) {
            const signature = laneSignature(lane);
            const previous = previousLaneSignature.current.get(lane.id);
            // Only pulse when we already knew about the lane and it materially changed.
            if (previous !== undefined && previous !== signature) {
              changed.add(lane.id);
            }
            previousLaneSignature.current.set(lane.id, signature);
          }

          setPayload(nextPayload);
          setError('');

          if (changed.size > 0) {
            setPulse(changed);
            window.setTimeout(() => setPulse(new Set()), 2200);
          }
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      }
    }

    void load();
    const interval = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const lanes = useMemo(() => {
    const sorted = sortLanes(filterLanes(payload?.lanes ?? [], filter, query), sort);
    if (!pinned) {
      return sorted;
    }
    // Float the pinned lane to the top of the list, preserving sort order otherwise.
    const pinnedLane = sorted.find((lane) => lane.id === pinned);
    if (!pinnedLane) {
      return sorted;
    }
    return [pinnedLane, ...sorted.filter((lane) => lane.id !== pinned)];
  }, [filter, payload?.lanes, query, sort, pinned]);

  const groups = useMemo(() => groupLanes(lanes, groupBy), [lanes, groupBy]);

  const counts = useMemo(() => {
    const all = payload?.lanes ?? [];
    const open = all.filter((lane) => openStatuses.has(lane.status)).length;
    const active = all.filter((lane) => lane.status === 'active').length;
    const stale = all.filter((lane) => lane.stale).length;
    const blocked = all.filter((lane) => lane.status === 'blocked').length;
    const attention = all.filter((lane) => lane.status === 'blocked' || lane.stale).length;
    const complete = all.filter((lane) => lane.status === 'complete').length;
    const archived = all.filter((lane) => lane.status === 'archived').length;

    return { active, all: all.length, archived, attention, blocked, complete, open, stale };
  }, [payload?.lanes]);

  const mastheadStats = [
    { label: 'Open', value: counts.open, tone: 'open' },
    { label: 'Active', value: counts.active, tone: 'active' },
    { label: 'Needs eyes', value: counts.attention, tone: counts.attention > 0 ? 'attention' : 'quiet' },
    { label: 'Done', value: counts.complete, tone: 'complete' },
  ];

  const lastPoll = payload ? `${formatElapsed(payload.generatedAt)} ago` : 'waiting';

  async function copyLane(lane: DashboardLane) {
    await navigator.clipboard.writeText(copySummary(lane));
    setCopied(lane.id);
    window.setTimeout(() => setCopied(''), 1400);
  }

  function updateUrlState(partial: Partial<DashboardUrlState>) {
    setUrlState((current) => ({ ...current, ...partial }));
  }

  const focusCard = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, cardRefs.current.length - 1));
    setActiveIndex(clamped);
    const node = cardRefs.current[clamped];
    if (node) {
      node.focus();
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, []);

  // Keyboard navigation: / focuses search, 1–6 cycle filter tabs, j/k move between
  // cards, Enter/Return opens the focused card, p pins the focused card.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;

      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (typing) {
        return;
      }

      if (event.key >= '1' && event.key <= '6') {
        const option = filterOptions[Number(event.key) - 1];
        if (option) {
          event.preventDefault();
          updateUrlState({ filter: option.value });
        }
        return;
      }

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        focusCard(activeIndex + 1);
        return;
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusCard(activeIndex - 1);
        return;
      }

      if (event.key === 'p' && lanes[activeIndex]) {
        event.preventDefault();
        const lane = lanes[activeIndex];
        setPinned((current) => (current === lane.id ? '' : lane.id));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, focusCard, lanes]);

  // Keep activeIndex valid as the lane set changes.
  useEffect(() => {
    if (activeIndex > lanes.length - 1) {
      setActiveIndex(Math.max(0, lanes.length - 1));
    }
  }, [activeIndex, lanes.length]);

  return (
    <main className={`shell ${compact ? 'compactShell' : ''}`}>
      <header className="masthead">
        <div className="brandPanel">
          <div className="brandMark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4l3-8 4 16 3-8h4" />
            </svg>
          </div>
          <div className="brandCopy">
            <p className="eyebrow">Ariadne Worklanes</p>
            <h1>Worklanes</h1>
            <div className="heroMeta" aria-label="Dashboard status">
              <span>{payload ? `${payload.lanes.length} lanes` : 'Loading lanes'}</span>
              <span>{payload?.malformed.length ?? 0} malformed</span>
              <span>Polled {lastPoll}</span>
            </div>
          </div>
        </div>

        <aside className="sourcePanel" aria-label="Worklane source">
          <div className="sourceIcon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="sourceBody">
            <span>Source</span>
            <code>{payload?.sourceDir ?? 'Resolving source directory...'}</code>
          </div>
        </aside>
      </header>

      <div className="statRail" aria-label="Worklane totals">
        {mastheadStats.map((item) => (
          <div className={`statChip ${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <section className="controlDeck" aria-label="Dashboard controls">
        <div className="statusTabs" role="group" aria-label="Filter worklanes">
          {filterOptions.map((option) => (
            <button
              aria-pressed={filter === option.value}
              className={filter === option.value ? 'selected' : ''}
              key={option.value}
              onClick={() => updateUrlState({ filter: option.value })}
              type="button"
            >
              <span>{option.label}</span>
              <strong>{counts[option.value]}</strong>
            </button>
          ))}
        </div>

        <div className="toolbar">
          <div className="searchBox">
            <input
              ref={searchInputRef}
              aria-label="Search worklanes"
              placeholder="Search lanes"
              value={query}
              onChange={(event) => updateUrlState({ query: event.target.value })}
            />
          </div>
          <select aria-label="Sort worklanes" value={sort} onChange={(event) => updateUrlState({ sort: event.target.value as SortMode })}>
            <option value="stale">Stale first</option>
            <option value="updated">Recently updated</option>
            <option value="started">Recently started</option>
            <option value="progress">Progress</option>
            <option value="title">Title</option>
          </select>
          <select aria-label="Group worklanes" value={groupBy} onChange={(event) => updateUrlState({ groupBy: event.target.value as GroupKey })}>
            {groupOptions.map((option) => (
              <option key={option.value} value={option.value}>
              Group: {option.label}
              </option>
            ))}
          </select>
          <div className="themeSwitch" role="group" aria-label="Theme mode">
            {themeOptions.map((option) => (
              <button
                aria-pressed={theme === option.value}
                className={theme === option.value ? 'selected' : ''}
                key={option.value}
                onClick={() => setTheme(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="toggle compactToggle">
            <input type="checkbox" checked={compact} onChange={(event) => updateUrlState({ compact: event.target.checked })} />
            Compact
          </label>
        </div>
      </section>

      <p className="kbdHint" aria-hidden="true">
        <kbd>/</kbd> search · <kbd>1</kbd>–<kbd>6</kbd> tabs · <kbd>j</kbd>/<kbd>k</kbd> cards · <kbd>↵</kbd> open · <kbd>p</kbd> pin
      </p>

      {error ? <p className="errorBanner">{error}</p> : null}

      {payload && payload.malformed.length > 0 ? (
        <section className="malformedGrid" aria-label="Malformed worklane files">
          {payload.malformed.map((file) => (
            <article className="card malformedCard" key={file.filePath}>
              <div className="cardHeader">
                <div>
                  <p className="scope">Repair needed</p>
                  <h2>{file.fileName}</h2>
                </div>
                <span className="status blocked">Malformed</span>
              </div>
              <p className="summary">{file.error}</p>
              <code className="rawPreview">{file.rawPreview || 'Empty file'}</code>
            </article>
          ))}
        </section>
      ) : null}

      {payload && lanes.length === 0 ? (
        <section className="empty">
          <h2>No matching worklanes</h2>
          <p>Start the MCP server, create a lane, or loosen the current filter.</p>
        </section>
      ) : (
        <div className="gridRoot">
          {groups.map((group) => (
            <section aria-label={group.label || 'Worklanes'} key={group.key}>
              {group.label ? (
                <h2 className="groupLabel">
                  {group.label}
                  <span className="groupCount">{group.lanes.length}</span>
                </h2>
              ) : null}
              <div className="grid">
                {group.lanes.map((lane) => {
                  const flatIndex = lanes.indexOf(lane);
                  const freshness = computeFreshness(lane);
                  const isPinned = pinned === lane.id;
                  const isPulsing = pulse.has(lane.id);
                  const isActive = flatIndex === activeIndex;
                  const progressStyle = { '--progress': `${Math.max(0, Math.min(100, lane.progressPercent))}%` } as CSSProperties;
                  const freshnessStyle = { '--freshness': freshness.ratio } as CSSProperties;
                  const deltas = !compact ? computeMetricDeltas(lane.baseline, lane.metrics).slice(0, 4) : [];

                  return (
                    <article
                      className={`card statusCard ${lane.stale ? 'isStale' : `is-${lane.status}`} ${isPulsing ? 'isPulsing' : ''} ${isPinned ? 'isPinned' : ''}`}
                      style={freshnessStyle}
                      key={lane.id}
                    >
                      <div className="cardHeader">
                        <div>
                          <p className="scope">
                            {lane.scope ?? lane.repo ?? lane.id}
                            {isPinned ? <span className="pinTag" aria-label="Pinned">📌</span> : null}
                          </p>
                          <h2>{lane.title}</h2>
                        </div>
                        <div className="cardStatus">
                          <span className={`status ${lane.stale ? 'stale' : lane.status}`}>{lane.stale ? 'Stale' : statusLabels[lane.status]}</span>
                          <strong>{Math.round(lane.progressPercent)}%</strong>
                        </div>
                      </div>

                      {lane.summary && !compact ? <p className="summary">{lane.summary}</p> : null}

                      <div className="progressRow" style={progressStyle}>
                        <div className="progressCopy">
                          <span>
                            {lane.progress.current} / {lane.progress.total} {lane.progress.unit}
                          </span>
                        </div>
                        <div className="track" aria-label={`${lane.title} progress`}>
                          <span />
                        </div>
                      </div>

                      <dl className="facts">
                        <div>
                          <dt>Elapsed</dt>
                          <dd>{formatElapsed(lane.startedAt, lane.completedAt)}</dd>
                        </div>
                        <div>
                          <dt>Freshness</dt>
                          <dd className={`freshness freshness-${freshness.level}`}>{freshness.label}</dd>
                        </div>
                        <div>
                          <dt>Events</dt>
                          <dd>{lane.events.length}</dd>
                        </div>
                      </dl>

                      {!compact && deltas.length > 0 ? (
                        <div className="metrics">
                          {deltas.map((delta) => (
                            <MetricTile delta={delta} key={`${lane.id}-${delta.label}`} />
                          ))}
                        </div>
                      ) : null}

                      {lane.blocker ? (
                        <p className="callout blockedCallout">
                          <strong>Blocked:</strong> {lane.blocker}
                        </p>
                      ) : null}

                      {lane.nextAction ? (
                        <p className="callout">
                          <strong>Next:</strong> {lane.nextAction}
                        </p>
                      ) : null}

                      <div className="cardActions">
                        <Link
                          href={`/worklanes/${lane.id}`}
                          ref={(node: HTMLAnchorElement | null) => {
                            cardRefs.current[flatIndex] = node;
                          }}
                          data-flat-index={flatIndex}
                          className={isActive ? 'cardFocusTarget' : ''}
                          aria-label={`${lane.title} — open details`}
                          onFocus={() => setActiveIndex(flatIndex)}
                        >
                          Details
                        </Link>
                        <div className="cardActionsRight">
                          <button type="button" aria-pressed={isPinned} onClick={() => setPinned((current) => (current === lane.id ? '' : lane.id))}>
                            {isPinned ? 'Unpin' : 'Pin'}
                          </button>
                          <button type="button" onClick={() => void copyLane(lane)}>
                            {copied === lane.id ? 'Copied' : 'Copy summary'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function MetricTile({ delta }: { delta: MetricDelta }) {
  const arrow = delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : delta.direction === 'flat' ? '·' : '';
  const toneClass = delta.direction === 'up' ? 'deltaUp' : delta.direction === 'down' ? 'deltaDown' : 'deltaFlat';

  return (
    <div className={`metricTile ${toneClass}`} title={delta.delta !== null ? `${delta.baseline} → ${delta.current}` : String(delta.current)}>
      <span>{formatMetricLabel(delta.label)}</span>
      <strong>
        {String(delta.current)}{delta.unit ? ` ${delta.unit}` : ''}
      </strong>
      {delta.delta !== null ? (
        <em className="deltaChip">
          {arrow} {formatDelta(delta).replace(/^[+-]?[\d.,]+\s*/, '')}
        </em>
      ) : null}
    </div>
  );
}
