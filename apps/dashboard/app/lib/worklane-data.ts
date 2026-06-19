import { homedir } from 'node:os';
import path from 'node:path';

import {
  isStale,
  listWorklanes,
  progressPercent,
  readWorklane,
  summarizeWorklane,
  type Worklane,
  type MalformedWorklane,
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

function decorateLane(lane: Worklane, now: Date): DashboardLane {
  return {
    ...lane,
    stale: isStale(lane, now),
    progressPercent: progressPercent(lane),
    summaryText: summarizeWorklane(lane, now),
  };
}

function sourceCandidates(): string[] {
  return [
    process.env.ARIADNE_WORKLANES_DIR,
    path.join(homedir(), '.ariadne-worklanes', 'worklanes'),
    path.resolve(process.cwd(), '../../worklanes'),
    path.resolve(process.cwd(), 'worklanes'),
  ].filter(Boolean) as string[];
}
