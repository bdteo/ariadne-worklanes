import { homedir } from 'node:os';
import path from 'node:path';

import {
  archiveWorklane,
  completeWorklane,
  isStale,
  listWorklanes,
  progressPercent,
  readWorklane,
  summarizeWorklane,
  updateWorklane,
  worklaneStatuses,
  writeWorklane,
  WorklaneError,
  type Worklane,
  type MalformedWorklane,
  type WorklaneStatus,
} from '@ariadne-worklanes/core';

export type DashboardLane = Worklane & {
  stale: boolean;
  progressPercent: number;
  summaryText: string;
};

export type DashboardPayload = {
  sourceDir: string;
  generatedAt: string;
  lanes: DashboardLane[];
  malformed: MalformedWorklane[];
};

export type DashboardLaneStatusUpdate = {
  sourceDir: string;
  generatedAt: string;
  lane: DashboardLane;
};

export async function getDashboardData(now = new Date()): Promise<DashboardPayload> {
  const candidates = sourceCandidates();

  for (const sourceDir of candidates) {
    const result = await listWorklanes(sourceDir);
    if (result.lanes.length > 0 || result.malformed.length > 0) {
      return decorate(sourceDir, result.lanes, result.malformed, now);
    }
  }

  return decorate(candidates[0], [], [], now);
}

export async function getLaneDetail(id: string, now = new Date()) {
  const data = await getDashboardData(now);
  const lane = data.lanes.find((candidate) => candidate.id === id);
  if (lane) {
    return { ...data, lane };
  }

  const fallback = await readWorklane(data.sourceDir, id);
  return {
    ...data,
    lane: decorateLane(fallback, now),
  };
}

function decorate(
  sourceDir: string,
  lanes: Worklane[],
  malformed: MalformedWorklane[],
  now: Date,
): DashboardPayload {
  return {
    sourceDir,
    generatedAt: now.toISOString(),
    lanes: lanes.map((lane) => decorateLane(lane, now)),
    malformed,
  };
}

export async function setDashboardLaneStatus(
  id: string,
  status: WorklaneStatus,
  note?: string,
  now = new Date(),
): Promise<DashboardLaneStatusUpdate> {
  if (!isWorklaneStatus(status)) {
    throw new WorklaneError(`Unsupported worklane status: ${status}`);
  }

  const { sourceDir, lane } = await readLaneFromCandidates(id);
  const actor = 'Ariadne dashboard';
  const nextLane =
    status === 'complete'
      ? completeWorklane(lane, note ?? `Completed from dashboard`, actor, now)
      : status === 'archived'
        ? archiveWorklane(lane, note ?? `Archived from dashboard`, actor, now)
        : updateWorklane(
            lane,
            {
              status,
              note: note ?? `Set status to ${status} from dashboard`,
              lastActor: actor,
            },
            now,
          );

  const saved = await writeWorklane(sourceDir, nextLane);
  return {
    sourceDir,
    generatedAt: now.toISOString(),
    lane: decorateLane(saved, now),
  };
}

function decorateLane(lane: Worklane, now: Date): DashboardLane {
  return {
    ...lane,
    stale: isStale(lane, now),
    progressPercent: progressPercent(lane),
    summaryText: summarizeWorklane(lane, now),
  };
}

async function readLaneFromCandidates(id: string): Promise<{ sourceDir: string; lane: Worklane }> {
  let lastMissingError: unknown;

  for (const sourceDir of sourceCandidates()) {
    try {
      return { sourceDir, lane: await readWorklane(sourceDir, id) };
    } catch (error) {
      if (isMissingWorklaneError(error)) {
        lastMissingError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastMissingError instanceof Error) {
    throw lastMissingError;
  }
  throw new WorklaneError(`Worklane not found: ${id}`);
}

function isWorklaneStatus(value: string): value is WorklaneStatus {
  return worklaneStatuses.includes(value as WorklaneStatus);
}

function isMissingWorklaneError(error: unknown): boolean {
  return error instanceof WorklaneError && error.message.startsWith('Worklane not found:');
}

function sourceCandidates(): string[] {
  return [
    process.env.ARIADNE_WORKLANES_DIR,
    path.join(homedir(), '.ariadne-worklanes', 'worklanes'),
    path.resolve(process.cwd(), '../../worklanes'),
    path.resolve(process.cwd(), 'worklanes'),
  ].filter(Boolean) as string[];
}
