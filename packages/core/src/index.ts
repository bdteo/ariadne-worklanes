import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import * as z from 'zod/v4';

export const worklaneStatuses = [
  'planned',
  'active',
  'waiting',
  'blocked',
  'complete',
  'cancelled',
  'archived',
] as const;

export const metricSchema = z
  .object({
    label: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    unit: z.string().optional(),
  })
  .passthrough();

export const linkSchema = z
  .object({
    label: z.string().min(1),
    url: z.string().min(1),
  })
  .passthrough();

export const progressSchema = z
  .object({
    current: z.number().min(0),
    total: z.number().positive(),
    unit: z.string().min(1),
  })
  .passthrough();

export const milestoneSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(['planned', 'active', 'waiting', 'blocked', 'complete', 'cancelled']).default('complete'),
    at: z.string().datetime(),
    summary: z.string().optional(),
  })
  .passthrough();

export const eventSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['created', 'updated', 'milestone', 'blocked', 'unblocked', 'evidence', 'archived', 'completed', 'note']),
    at: z.string().datetime(),
    title: z.string().optional(),
    message: z.string().min(1),
    actor: z.string().optional(),
  })
  .passthrough();

export const evidenceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    url: z.string().min(1),
    kind: z.enum(['link', 'file', 'pr', 'issue', 'runbook', 'log', 'screenshot', 'other']).default('link'),
    at: z.string().datetime(),
  })
  .passthrough();

export const worklaneV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    id: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().optional(),
    scope: z.string().optional(),
    owner: z.string().optional(),
    workspace: z.string().optional(),
    repo: z.string().optional(),
    threadId: z.string().optional(),
    sessionId: z.string().optional(),
    lastActor: z.string().optional(),
    status: z.enum(worklaneStatuses),
    startedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
    archivedAt: z.string().datetime().optional(),
    staleAfterMinutes: z.number().positive().default(60),
    progress: progressSchema,
    baseline: z.array(metricSchema).default([]),
    metrics: z.array(metricSchema).default([]),
    milestones: z.array(milestoneSchema).default([]),
    events: z.array(eventSchema).default([]),
    evidence: z.array(evidenceSchema).default([]),
    warnings: z.array(z.string()).default([]),
    nextAction: z.string().optional(),
    blocker: z.string().optional(),
    links: z.array(linkSchema).default([]),
    notes: z.array(z.string()).default([]),
  })
  .passthrough();

export type Worklane = z.infer<typeof worklaneV2Schema>;
export type WorklaneStatus = (typeof worklaneStatuses)[number];
export type Metric = z.infer<typeof metricSchema>;
export type Link = z.infer<typeof linkSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;
export type WorklaneEvent = z.infer<typeof eventSchema>;
export type EvidenceKind = 'link' | 'file' | 'pr' | 'issue' | 'runbook' | 'log' | 'screenshot' | 'other';
export type EvidenceInput = {
  id?: string;
  label: string;
  url: string;
  kind?: EvidenceKind;
  at?: string;
};

export type MalformedWorklane = {
  fileName: string;
  filePath: string;
  error: string;
  rawPreview: string;
};

export type WorklaneList = {
  sourceDir: string;
  lanes: Worklane[];
  malformed: MalformedWorklane[];
};

export type CreateWorklaneInput = {
  id?: string;
  title: string;
  summary?: string;
  scope?: string;
  owner?: string;
  workspace?: string;
  repo?: string;
  threadId?: string;
  sessionId?: string;
  lastActor?: string;
  total?: number;
  current?: number;
  unit?: string;
  staleAfterMinutes?: number;
  baseline?: Metric[];
  metrics?: Metric[];
  nextAction?: string;
  links?: Link[];
  evidence?: EvidenceInput[];
  notes?: string[];
};

export type UpdateWorklaneInput = {
  status?: WorklaneStatus;
  summary?: string;
  scope?: string;
  owner?: string;
  workspace?: string;
  repo?: string;
  threadId?: string;
  sessionId?: string;
  lastActor?: string;
  current?: number;
  total?: number;
  unit?: string;
  staleAfterMinutes?: number;
  baseline?: Metric[];
  metrics?: Metric[];
  nextAction?: string;
  blocker?: string;
  note?: string;
  warnings?: string[];
};

type LegacyWorklaneV1 = {
  schemaVersion: 1;
  id: string;
  title: string;
  summary?: string;
  scope?: string;
  status: Exclude<WorklaneStatus, 'archived'>;
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
  links?: Link[];
  notes?: string[];
};

export class WorklaneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorklaneError';
  }
}

export function defaultWorklaneDir(): string {
  return process.env.ARIADNE_WORKLANES_DIR ?? path.join(homedir(), '.ariadne-worklanes', 'worklanes');
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'worklane';
}

export function worklaneFileName(id: string): string {
  return `${slugify(id)}.json`;
}

export function worklaneFilePath(dir: string, id: string): string {
  return path.join(dir, worklaneFileName(id));
}

export function createWorklane(input: CreateWorklaneInput, now = new Date()): Worklane {
  const at = now.toISOString();
  const id = slugify(input.id ?? input.title);
  const lane = {
    schemaVersion: 2,
    id,
    title: input.title,
    summary: input.summary,
    scope: input.scope,
    owner: input.owner,
    workspace: input.workspace,
    repo: input.repo,
    threadId: input.threadId,
    sessionId: input.sessionId,
    lastActor: input.lastActor,
    status: 'active',
    startedAt: at,
    updatedAt: at,
    staleAfterMinutes: input.staleAfterMinutes ?? 60,
    progress: {
      current: input.current ?? 0,
      total: input.total ?? 100,
      unit: input.unit ?? 'percent',
    },
    baseline: input.baseline ?? [],
    metrics: input.metrics ?? [],
    milestones: [],
    events: [
      createEvent({
        type: 'created',
        message: `Started worklane ${id}`,
        at,
        actor: input.lastActor,
      }),
    ],
    evidence: normalizeEvidence(input.evidence ?? [], at),
    warnings: [],
    nextAction: input.nextAction,
    links: input.links ?? [],
    notes: input.notes ?? [],
  } satisfies Worklane;

  return validateWorklane(lane);
}

export function updateWorklane(lane: Worklane, input: UpdateWorklaneInput, now = new Date()): Worklane {
  const at = now.toISOString();
  const status = input.status ?? lane.status;
  const updated: Worklane = {
    ...lane,
    status,
    summary: input.summary ?? lane.summary,
    scope: input.scope ?? lane.scope,
    owner: input.owner ?? lane.owner,
    workspace: input.workspace ?? lane.workspace,
    repo: input.repo ?? lane.repo,
    threadId: input.threadId ?? lane.threadId,
    sessionId: input.sessionId ?? lane.sessionId,
    lastActor: input.lastActor ?? lane.lastActor,
    staleAfterMinutes: input.staleAfterMinutes ?? lane.staleAfterMinutes,
    updatedAt: at,
    completedAt: status === 'complete' ? (lane.completedAt ?? at) : lane.completedAt,
    archivedAt: status === 'archived' ? (lane.archivedAt ?? at) : lane.archivedAt,
    progress: {
      current: input.current ?? lane.progress.current,
      total: input.total ?? lane.progress.total,
      unit: input.unit ?? lane.progress.unit,
    },
    baseline: input.baseline ?? lane.baseline,
    metrics: input.metrics ?? lane.metrics,
    nextAction: input.nextAction ?? lane.nextAction,
    blocker: input.blocker ?? lane.blocker,
    warnings: input.warnings ?? lane.warnings,
    notes: input.note ? [...lane.notes, input.note] : lane.notes,
    events: [
      ...lane.events,
      createEvent({
        type: status === 'complete' ? 'completed' : status === 'archived' ? 'archived' : 'updated',
        message: input.note ?? `Updated worklane ${lane.id}`,
        at,
        actor: input.lastActor ?? lane.lastActor,
      }),
    ],
  };

  return validateWorklane(updated);
}

export function addMilestone(
  lane: Worklane,
  input: { title: string; summary?: string; status?: Milestone['status']; at?: string; actor?: string },
  now = new Date(),
): Worklane {
  const at = input.at ?? now.toISOString();
  const milestone: Milestone = milestoneSchema.parse({
    id: eventId('milestone', lane.milestones.length + 1, at),
    title: input.title,
    summary: input.summary,
    status: input.status ?? 'complete',
    at,
  });

  return validateWorklane({
    ...lane,
    updatedAt: at,
    milestones: [...lane.milestones, milestone],
    events: [
      ...lane.events,
      createEvent({
        type: 'milestone',
        title: input.title,
        message: input.summary ?? input.title,
        at,
        actor: input.actor ?? lane.lastActor,
      }),
    ],
  });
}

export function setBlocker(lane: Worklane, blocker: string, actor?: string, now = new Date()): Worklane {
  const at = now.toISOString();
  return validateWorklane({
    ...lane,
    status: 'blocked',
    blocker,
    updatedAt: at,
    events: [...lane.events, createEvent({ type: 'blocked', message: blocker, at, actor: actor ?? lane.lastActor })],
  });
}

export function clearBlocker(lane: Worklane, nextAction?: string, actor?: string, now = new Date()): Worklane {
  const at = now.toISOString();
  return validateWorklane({
    ...lane,
    status: lane.status === 'blocked' ? 'active' : lane.status,
    blocker: '',
    nextAction: nextAction ?? lane.nextAction,
    updatedAt: at,
    events: [
      ...lane.events,
      createEvent({ type: 'unblocked', message: nextAction ?? `Cleared blocker for ${lane.id}`, at, actor: actor ?? lane.lastActor }),
    ],
  });
}

export function attachEvidence(
  lane: Worklane,
  input: EvidenceInput & { actor?: string },
  now = new Date(),
): Worklane {
  const at = input.at ?? now.toISOString();
  const evidence = evidenceSchema.parse({
    id: input.id ?? eventId('evidence', lane.evidence.length + 1, at),
    label: input.label,
    url: input.url,
    kind: input.kind ?? 'link',
    at,
  });

  return validateWorklane({
    ...lane,
    updatedAt: at,
    evidence: [...lane.evidence, evidence],
    events: [
      ...lane.events,
      createEvent({
        type: 'evidence',
        title: input.label,
        message: input.url,
        at,
        actor: input.actor ?? lane.lastActor,
      }),
    ],
  });
}

export function archiveWorklane(lane: Worklane, note?: string, actor?: string, now = new Date()): Worklane {
  return updateWorklane(lane, { status: 'archived', note: note ?? `Archived worklane ${lane.id}`, lastActor: actor }, now);
}

export function completeWorklane(lane: Worklane, note?: string, actor?: string, now = new Date()): Worklane {
  return updateWorklane(
    lane,
    {
      status: 'complete',
      current: lane.progress.total,
      note: note ?? `Completed worklane ${lane.id}`,
      lastActor: actor,
    },
    now,
  );
}

export function validateWorklane(value: unknown): Worklane {
  const result = worklaneV2Schema.safeParse(value);
  if (!result.success) {
    throw new WorklaneError(z.prettifyError(result.error));
  }

  return result.data;
}

export function normalizeWorklane(value: unknown): Worklane {
  if (!isRecord(value)) {
    throw new WorklaneError('Worklane file must contain a JSON object.');
  }

  if (value.schemaVersion === 2) {
    return validateWorklane(value);
  }

  if (value.schemaVersion === 1) {
    return migrateV1ToV2(value as LegacyWorklaneV1);
  }

  throw new WorklaneError(`Unsupported worklane schemaVersion: ${String(value.schemaVersion)}`);
}

export function migrateV1ToV2(value: LegacyWorklaneV1): Worklane {
  const migrated = {
    ...value,
    schemaVersion: 2,
    staleAfterMinutes: 60,
    milestones: [],
    events: [
      createEvent({
        type: 'created',
        at: value.startedAt,
        message: `Migrated v1 worklane ${value.id}`,
      }),
    ],
    evidence: normalizeEvidence(
      (value.links ?? []).map((link) => ({ label: link.label, url: link.url, kind: 'link' as const })),
      value.updatedAt,
    ),
    warnings: [],
    baseline: value.baseline ?? [],
    metrics: value.metrics ?? [],
    links: value.links ?? [],
    notes: value.notes ?? [],
  };

  return validateWorklane(migrated);
}

export function isStale(lane: Worklane, now = new Date()): boolean {
  if (lane.status === 'complete' || lane.status === 'cancelled' || lane.status === 'archived') {
    return false;
  }

  const updatedAt = Date.parse(lane.updatedAt);
  if (!Number.isFinite(updatedAt)) {
    return true;
  }

  return now.getTime() - updatedAt > lane.staleAfterMinutes * 60_000;
}

export function progressPercent(lane: Worklane): number {
  if (!Number.isFinite(lane.progress.total) || lane.progress.total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (lane.progress.current / lane.progress.total) * 100));
}

export function summarizeWorklane(lane: Worklane, now = new Date()): string {
  const status = isStale(lane, now) ? `${lane.status} / stale` : lane.status;
  const progress = `${Math.round(progressPercent(lane))}% (${lane.progress.current}/${lane.progress.total} ${lane.progress.unit})`;
  const parts = [`${lane.title}: ${status}`, progress];

  if (lane.blocker) {
    parts.push(`Blocked: ${lane.blocker}`);
  }
  if (lane.nextAction) {
    parts.push(`Next: ${lane.nextAction}`);
  }

  return parts.join(' | ');
}

export async function ensureWorklaneDir(dir = defaultWorklaneDir()): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function readWorklane(dir: string, id: string): Promise<Worklane> {
  const file = worklaneFilePath(dir, id);
  try {
    const raw = await readFile(file, 'utf8');
    return normalizeWorklane(JSON.parse(raw));
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new WorklaneError(`Worklane not found: ${slugify(id)} in ${dir}`);
    }
    if (error instanceof SyntaxError) {
      throw new WorklaneError(`Worklane ${slugify(id)} contains invalid JSON.`);
    }
    throw error;
  }
}

export async function writeWorklane(dir: string, lane: Worklane): Promise<Worklane> {
  const validated = validateWorklane(lane);
  await ensureWorklaneDir(dir);
  const finalPath = worklaneFilePath(dir, validated.id);
  const tmpPath = path.join(dir, `.${validated.id}.${process.pid}.${Date.now().toString(36)}.tmp`);
  await writeFile(tmpPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  await rename(tmpPath, finalPath);
  return validated;
}

export async function listWorklanes(dir = defaultWorklaneDir()): Promise<WorklaneList> {
  await ensureWorklaneDir(dir);
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  const lanes: Worklane[] = [];
  const malformed: MalformedWorklane[] = [];

  await Promise.all(
    files.map(async (fileName) => {
      const filePath = path.join(dir, fileName);
      const raw = await readFile(filePath, 'utf8');
      try {
        lanes.push(normalizeWorklane(JSON.parse(raw)));
      } catch (error) {
        malformed.push({
          fileName,
          filePath,
          error: error instanceof Error ? error.message : String(error),
          rawPreview: raw.replace(/\s+/g, ' ').trim().slice(0, 240),
        });
      }
    }),
  );

  lanes.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return { sourceDir: dir, lanes, malformed };
}

export async function deleteWorklane(dir: string, id: string): Promise<void> {
  await rm(worklaneFilePath(dir, id));
}

function createEvent(input: {
  type: WorklaneEvent['type'];
  message: string;
  at: string;
  title?: string;
  actor?: string;
}): WorklaneEvent {
  return eventSchema.parse({
    id: eventId(input.type, 0, input.at, input.message),
    type: input.type,
    at: input.at,
    title: input.title,
    message: input.message,
    actor: input.actor,
  });
}

function normalizeEvidence(
  entries: EvidenceInput[],
  at: string,
): Evidence[] {
  return entries.map((entry, index) =>
    evidenceSchema.parse({
      id: entry.id ?? eventId('evidence', index + 1, at, entry.url),
      label: entry.label,
      url: entry.url,
      kind: entry.kind ?? 'link',
      at: entry.at ?? at,
    }),
  );
}

function eventId(prefix: string, index: number, at: string, seed = ''): string {
  return slugify(`${prefix}-${index}-${at}-${seed}`).slice(0, 96);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
