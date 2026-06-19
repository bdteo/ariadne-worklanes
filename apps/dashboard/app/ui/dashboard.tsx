'use client';

import Link from 'next/link';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';

import { copySummary, filterLanes, formatElapsed, sortLanes, type SortMode, type StatusFilter } from '../lib/view-model';
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

const openStatuses = new Set<DashboardLane['status']>(['planned', 'active', 'waiting', 'blocked']);
const defaultDashboardState: DashboardUrlState = { filter: 'open', sort: 'stale', query: '', compact: false };
const statusFilters = new Set<StatusFilter>(['all', 'open', 'stale', 'blocked', 'complete', 'archived']);
const sortModes = new Set<SortMode>(['stale', 'updated', 'started', 'progress', 'title']);

type DashboardUrlState = {
  filter: StatusFilter;
  sort: SortMode;
  query: string;
  compact: boolean;
};

function readDashboardUrlState(): DashboardUrlState {
  if (typeof window === 'undefined') {
    return defaultDashboardState;
  }

  const params = new URLSearchParams(window.location.search);
  const filterParam = params.get('status') ?? params.get('filter');
  const sortParam = params.get('sort');
  const compactParam = params.get('compact');

  return {
    filter: filterParam && statusFilters.has(filterParam as StatusFilter) ? (filterParam as StatusFilter) : defaultDashboardState.filter,
    sort: sortParam && sortModes.has(sortParam as SortMode) ? (sortParam as SortMode) : defaultDashboardState.sort,
    query: params.get('q') ?? params.get('search') ?? defaultDashboardState.query,
    compact: compactParam === '1' || compactParam === 'true',
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

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(null, '', nextUrl);
  }
}

function formatMetricLabel(label: string): string {
  return label.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function Dashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string>('');
  const [urlState, setUrlState] = useState<DashboardUrlState>(defaultDashboardState);
  const [urlStateReady, setUrlStateReady] = useState(false);
  const [copied, setCopied] = useState<string>('');
  const [theme, setTheme] = useState<ThemeMode>('system');

  const { compact, filter, query, sort } = urlState;

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
          setPayload(nextPayload);
          setError('');
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
    return sortLanes(filterLanes(payload?.lanes ?? [], filter, query), sort);
  }, [filter, payload?.lanes, query, sort]);

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
        <section className="grid" aria-label="Worklanes">
          {lanes.map((lane) => {
            const progressStyle = { '--progress': `${Math.max(0, Math.min(100, lane.progressPercent))}%` } as CSSProperties;
            const freshness = lane.stale ? 'Needs update' : `Updated ${formatElapsed(lane.updatedAt)} ago`;

            return (
              <article className={`card statusCard ${lane.stale ? 'isStale' : `is-${lane.status}`}`} key={lane.id}>
                <div className="cardHeader">
                  <div>
                    <p className="scope">{lane.scope ?? lane.repo ?? lane.id}</p>
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
                    <dd>{freshness}</dd>
                  </div>
                  <div>
                    <dt>Events</dt>
                    <dd>{lane.events.length}</dd>
                  </div>
                </dl>

                {!compact ? (
                  <div className="metrics">
                    {[...lane.baseline.slice(0, 2), ...lane.metrics.slice(0, 4)].slice(0, 4).map((metric) => (
                      <div key={`${lane.id}-${metric.label}`}>
                        <span>{formatMetricLabel(metric.label)}</span>
                        <strong>{String(metric.value)}{metric.unit ? ` ${metric.unit}` : ''}</strong>
                      </div>
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
                  <Link href={`/worklanes/${lane.id}`}>Details</Link>
                  <button type="button" onClick={() => void copyLane(lane)}>
                    {copied === lane.id ? 'Copied' : 'Copy summary'}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
