import { homedir } from 'node:os';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

export const dynamic = 'force-dynamic';

type Metric = {
  label: string;
  value: string | number | boolean | null;
  unit?: string;
};

type Worklane = {
  schemaVersion: 1;
  id: string;
  title: string;
  summary?: string;
  scope?: string;
  status: 'planned' | 'active' | 'waiting' | 'blocked' | 'complete' | 'cancelled';
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  progress: {
    current: number;
    total: number;
    unit: string;
  };
  baseline?: Metric[];
  metrics?: Metric[];
  nextAction?: string;
  blocker?: string;
  notes?: string[];
};

type WorklaneRead = {
  sourceDir: string;
  lanes: Worklane[];
};

const statusLabels: Record<Worklane['status'], string> = {
  planned: 'Planned',
  active: 'Active',
  waiting: 'Waiting',
  blocked: 'Blocked',
  complete: 'Complete',
  cancelled: 'Cancelled',
};

async function readWorklanes(): Promise<WorklaneRead> {
  const candidates = [
    process.env.ARIADNE_WORKLANES_DIR,
    path.join(homedir(), '.ariadne-worklanes', 'worklanes'),
    path.resolve(process.cwd(), '../../worklanes'),
    path.resolve(process.cwd(), 'worklanes'),
  ].filter(Boolean) as string[];

  for (const sourceDir of candidates) {
    const lanes = await readFromDir(sourceDir);
    if (lanes.length > 0) {
      return { sourceDir, lanes };
    }
  }

  return { sourceDir: candidates[0], lanes: [] };
}

async function readFromDir(sourceDir: string): Promise<Worklane[]> {
  try {
    const files = await readdir(sourceDir);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));
    const reads = await Promise.all(
      jsonFiles.map(async (file) => {
        const raw = await readFile(path.join(sourceDir, file), 'utf8');
        return JSON.parse(raw) as Worklane;
      }),
    );

    return reads.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  } catch {
    return [];
  }
}

function percent(lane: Worklane): number {
  if (!Number.isFinite(lane.progress.total) || lane.progress.total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (lane.progress.current / lane.progress.total) * 100));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatElapsed(from: string, to?: string): string {
  const start = Date.parse(from);
  const end = to ? Date.parse(to) : Date.now();
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatMetricValue(metric: Metric): string {
  const suffix = metric.unit ? ` ${metric.unit}` : '';
  return `${String(metric.value)}${suffix}`;
}

export default async function Page() {
  const { sourceDir, lanes } = await readWorklanes();

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Ariadne Worklanes</p>
          <h1>Agent work, kept visible.</h1>
        </div>
        <div className="source">
          <span>{lanes.length} lanes</span>
          <code>{sourceDir}</code>
        </div>
      </header>

      {lanes.length === 0 ? (
        <section className="empty">
          <h2>No worklanes yet</h2>
          <p>Start the MCP server and ask an agent to create or update a worklane.</p>
        </section>
      ) : (
        <section className="grid" aria-label="Worklanes">
          {lanes.map((lane) => {
            const progress = percent(lane);

            return (
              <article className="card" key={lane.id}>
                <div className="cardHeader">
                  <div>
                    <p className="scope">{lane.scope ?? lane.id}</p>
                    <h2>{lane.title}</h2>
                  </div>
                  <span className={`status ${lane.status}`}>{statusLabels[lane.status]}</span>
                </div>

                {lane.summary ? <p className="summary">{lane.summary}</p> : null}

                <div className="progressRow">
                  <div className="progressCopy">
                    <strong>{Math.round(progress)}%</strong>
                    <span>
                      {lane.progress.current} / {lane.progress.total} {lane.progress.unit}
                    </span>
                  </div>
                  <div className="track" aria-label={`${lane.title} progress`}>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <dl className="facts">
                  <div>
                    <dt>Started</dt>
                    <dd>{formatDate(lane.startedAt)}</dd>
                  </div>
                  <div>
                    <dt>Elapsed</dt>
                    <dd>{formatElapsed(lane.startedAt, lane.completedAt)}</dd>
                  </div>
                  <div>
                    <dt>Last Update</dt>
                    <dd>{formatElapsed(lane.updatedAt)} ago</dd>
                  </div>
                </dl>

                <div className="metrics">
                  {lane.baseline?.slice(0, 3).map((metric) => (
                    <div key={`baseline-${metric.label}`}>
                      <span>{metric.label}</span>
                      <strong>{formatMetricValue(metric)}</strong>
                    </div>
                  ))}
                  {lane.metrics?.slice(0, 3).map((metric) => (
                    <div key={`metric-${metric.label}`}>
                      <span>{metric.label}</span>
                      <strong>{formatMetricValue(metric)}</strong>
                    </div>
                  ))}
                </div>

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

                {lane.notes && lane.notes.length > 0 ? (
                  <ul className="notes">
                    {lane.notes.slice(0, 2).map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
