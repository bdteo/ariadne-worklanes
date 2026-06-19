'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

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

export function Dashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string>('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortMode>('stale');
  const [query, setQuery] = useState('');
  const [compact, setCompact] = useState(false);
  const [copied, setCopied] = useState<string>('');

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

  async function copyLane(lane: DashboardLane) {
    await navigator.clipboard.writeText(copySummary(lane));
    setCopied(lane.id);
    window.setTimeout(() => setCopied(''), 1400);
  }

  return (
    <main className={`shell ${compact ? 'compactShell' : ''}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Ariadne Worklanes</p>
          <h1>Agent work, kept visible.</h1>
        </div>
        <div className="source">
          <span>{payload ? `${payload.lanes.length} lanes` : 'Loading lanes'}</span>
          <code>{payload?.sourceDir ?? 'Resolving source directory...'}</code>
        </div>
      </header>

      <section className="toolbar" aria-label="Dashboard controls">
        <input
          aria-label="Search worklanes"
          placeholder="Search lanes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select aria-label="Filter worklanes" value={filter} onChange={(event) => setFilter(event.target.value as StatusFilter)}>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="stale">Stale</option>
          <option value="blocked">Blocked</option>
          <option value="complete">Complete</option>
          <option value="archived">Archived</option>
        </select>
        <select aria-label="Sort worklanes" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
          <option value="stale">Stale first</option>
          <option value="updated">Recently updated</option>
          <option value="started">Recently started</option>
          <option value="progress">Progress</option>
          <option value="title">Title</option>
        </select>
        <label className="toggle">
          <input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} />
          Compact
        </label>
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
          {lanes.map((lane) => (
            <article className={`card ${lane.stale ? 'staleCard' : ''}`} key={lane.id}>
              <div className="cardHeader">
                <div>
                  <p className="scope">{lane.scope ?? lane.repo ?? lane.id}</p>
                  <h2>{lane.title}</h2>
                </div>
                <span className={`status ${lane.stale ? 'stale' : lane.status}`}>{lane.stale ? 'Stale' : statusLabels[lane.status]}</span>
              </div>

              {lane.summary && !compact ? <p className="summary">{lane.summary}</p> : null}

              <div className="progressRow">
                <div className="progressCopy">
                  <strong>{Math.round(lane.progressPercent)}%</strong>
                  <span>
                    {lane.progress.current} / {lane.progress.total} {lane.progress.unit}
                  </span>
                </div>
                <div className="track" aria-label={`${lane.title} progress`}>
                  <span style={{ width: `${lane.progressPercent}%` }} />
                </div>
              </div>

              <dl className="facts">
                <div>
                  <dt>Elapsed</dt>
                  <dd>{formatElapsed(lane.startedAt, lane.completedAt)}</dd>
                </div>
                <div>
                  <dt>Last Update</dt>
                  <dd>{formatElapsed(lane.updatedAt)} ago</dd>
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
                      <span>{metric.label}</span>
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
          ))}
        </section>
      )}
    </main>
  );
}
