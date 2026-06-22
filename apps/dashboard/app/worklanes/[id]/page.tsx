import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getLaneDetail } from '../../lib/worklane-data';
import {
  buildTimeline,
  computeFreshness,
  computeMetricDeltas,
  formatDelta,
  formatCwdLabel,
  formatElapsed,
  laneCwd,
  type TimelineEntry,
} from '../../lib/view-model';

export const dynamic = 'force-dynamic';

const timelineToneClass: Record<TimelineEntry['type'], string> = {
  created: 'tl-created',
  updated: 'tl-updated',
  milestone: 'tl-milestone',
  blocked: 'tl-blocked',
  unblocked: 'tl-unblocked',
  evidence: 'tl-evidence',
  archived: 'tl-archived',
  completed: 'tl-completed',
  note: 'tl-note',
};

const timelineLabel: Record<TimelineEntry['type'], string> = {
  created: 'Created',
  updated: 'Updated',
  milestone: 'Milestone',
  blocked: 'Blocked',
  unblocked: 'Unblocked',
  evidence: 'Evidence',
  archived: 'Archived',
  completed: 'Completed',
  note: 'Note',
};

export default async function WorklaneDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { lane, sourceDir } = await getLaneDetail(id);
    const timeline = buildTimeline(lane);
    const deltas = computeMetricDeltas(lane.baseline, lane.metrics);
    const freshness = computeFreshness(lane);
    const cwd = laneCwd(lane);

    return (
      <main className={`shell detailShell ${lane.stale ? 'isStale' : `is-${lane.status}`}`}>
        <header className="detailHeader">
          <div>
            <Link href="/" className="backLink">Back to dashboard</Link>
            <p className="eyebrow">{lane.scope ?? lane.repo ?? cwd ?? lane.id}</p>
            <h1>{lane.title}</h1>
          </div>
          <span className={`status ${lane.stale ? 'stale' : lane.status}`}>{lane.stale ? 'Stale' : lane.status}</span>
        </header>

        <section className="detailGrid">
          <article className="card">
            <h2>Progress</h2>
            <div className="progressCopy">
              <strong>{Math.round(lane.progressPercent)}%</strong>
              <span>{lane.progress.current} / {lane.progress.total} {lane.progress.unit}</span>
            </div>
            <div className="track"><span style={{ width: `${lane.progressPercent}%` }} /></div>
            <dl className="facts">
              <div><dt>Elapsed</dt><dd>{formatElapsed(lane.startedAt, lane.completedAt)}</dd></div>
              <div><dt>Freshness</dt><dd className={`freshness freshness-${freshness.level}`}>{freshness.label}</dd></div>
              {cwd ? <div><dt>CWD</dt><dd>{formatCwdLabel(cwd)}</dd></div> : null}
              {lane.workspace && lane.workspace !== cwd ? <div><dt>Workspace</dt><dd>{formatCwdLabel(lane.workspace)}</dd></div> : null}
              {lane.repo ? <div><dt>Repo</dt><dd>{lane.repo}</dd></div> : null}
              <div><dt>Source</dt><dd>{sourceDir}</dd></div>
            </dl>
          </article>

          <article className="card">
            <h2>Operator Summary</h2>
            <p className="summary">{lane.summaryText}</p>
            {lane.nextAction ? <p className="callout"><strong>Next:</strong> {lane.nextAction}</p> : null}
            {lane.blocker ? <p className="callout blockedCallout"><strong>Blocked:</strong> {lane.blocker}</p> : null}
          </article>
        </section>

        <section className="card">
          <h2>Metrics &amp; Delta</h2>
          {deltas.length === 0 ? (
            <p className="summary">No metrics captured yet.</p>
          ) : (
            <div className="metrics">
              {deltas.map((delta) => {
                const arrow = delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : delta.direction === 'flat' ? '·' : '';
                const toneClass = delta.direction === 'up' ? 'deltaUp' : delta.direction === 'down' ? 'deltaDown' : 'deltaFlat';
                return (
                  <div className={`metricTile ${toneClass}`} key={delta.label} title={delta.delta !== null ? `${delta.baseline} → ${delta.current}` : String(delta.current)}>
                    <span>{delta.label}</span>
                    <strong>
                      {String(delta.current)}{delta.unit ? ` ${delta.unit}` : ''}
                    </strong>
                    <em className="deltaChip">
                      {delta.delta !== null ? `${arrow} ${formatDelta(delta)}` : `${String(delta.current)}`}
                    </em>
                    {delta.delta !== null ? <code className="deltaBaseline">baseline {String(delta.baseline)}</code> : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="detailGrid">
          <article className="card">
            <h2>Evidence</h2>
            {lane.evidence.length === 0 ? <p className="summary">No evidence attached yet.</p> : null}
            <ul className="linkList">
              {lane.evidence.map((evidence) => (
                <li key={evidence.id}>
                  <a href={evidence.url}>{evidence.label}</a>
                  <span>{evidence.kind}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <h2>Links</h2>
            {lane.links.length === 0 ? <p className="summary">No links recorded.</p> : null}
            <ul className="linkList">
              {lane.links.map((link) => (
                <li key={`${link.label}-${link.url}`}>
                  <a href={link.url}>{link.label}</a>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="card">
          <h2>Timeline</h2>
          {timeline.length === 0 ? <p className="summary">No events recorded.</p> : null}
          <ol className="timeline">
            {timeline.map((event) => (
              <li key={event.id} className={`timelineItem ${timelineToneClass[event.type] ?? 'tl-note'}`}>
                <span className="timelineRail" aria-hidden="true" />
                <div className="timelineBody">
                  <div className="timelineMeta">
                    <time>{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.at))}</time>
                    <span className={`timelineType ${timelineToneClass[event.type] ?? 'tl-note'}`}>{timelineLabel[event.type] ?? event.type}</span>
                    {event.actor ? <span className="timelineActor">{event.actor}</span> : null}
                  </div>
                  <strong>{event.title}</strong>
                  <span>{event.message}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="card">
          <h2>Raw JSON</h2>
          <pre className="rawJson">{JSON.stringify(lane, null, 2)}</pre>
        </section>
      </main>
    );
  } catch {
    notFound();
  }
}
