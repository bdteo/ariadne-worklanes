import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getLaneDetail } from '../../lib/worklane-data';
import { formatElapsed } from '../../lib/view-model';

export const dynamic = 'force-dynamic';

export default async function WorklaneDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { lane, sourceDir } = await getLaneDetail(id);
    const timeline = [...lane.events, ...lane.milestones.map((milestone) => ({
      id: milestone.id,
      type: 'milestone',
      at: milestone.at,
      title: milestone.title,
      message: milestone.summary ?? milestone.title,
    }))].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    return (
      <main className="shell detailShell">
        <header className="detailHeader">
          <div>
            <Link href="/" className="backLink">Back to dashboard</Link>
            <p className="eyebrow">{lane.scope ?? lane.repo ?? lane.id}</p>
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
              <div><dt>Last Update</dt><dd>{formatElapsed(lane.updatedAt)} ago</dd></div>
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

        <section className="detailGrid">
          <article className="card">
            <h2>Metrics</h2>
            <div className="metrics">
              {[...lane.baseline, ...lane.metrics].map((metric) => (
                <div key={`${metric.label}-${String(metric.value)}`}>
                  <span>{metric.label}</span>
                  <strong>{String(metric.value)}{metric.unit ? ` ${metric.unit}` : ''}</strong>
                </div>
              ))}
            </div>
          </article>

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
        </section>

        <section className="card">
          <h2>Timeline</h2>
          <ol className="timeline">
            {timeline.map((event) => (
              <li key={event.id}>
                <time>{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.at))}</time>
                <strong>{event.title ?? event.type}</strong>
                <span>{event.message}</span>
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
