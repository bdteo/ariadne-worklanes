import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

type WorklaneStatus = 'planned' | 'active' | 'waiting' | 'blocked' | 'complete' | 'cancelled';

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
  status: WorklaneStatus;
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
  links?: Array<{ label: string; url: string }>;
  notes?: string[];
};

const metricSchema = z.object({
  label: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  unit: z.string().optional(),
});

const linkSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
});

const worklaneDir =
  process.env.ARIADNE_WORKLANES_DIR ?? path.join(homedir(), '.ariadne-worklanes', 'worklanes');

const server = new McpServer(
  {
    name: 'ariadne-worklanes',
    version: '0.1.0',
  },
  {
    instructions:
      'Use Ariadne Worklanes for long-running agent, ops, DevOps, deploy, recovery, and investigation work. Start a worklane when the task has a baseline, target, queue, rollout, or multi-step process. Update it at major milestones, blockers, handoffs, and before ending the session. Keep cards concise: progress, current status, next action, blocker, and decision-relevant metrics only.',
  },
);

server.registerTool(
  'start_worklane',
  {
    description: 'Create or replace a worklane status file for a long-running agent or ops task.',
    inputSchema: z.object({
      id: z.string().min(1).optional(),
      title: z.string().min(1),
      summary: z.string().optional(),
      scope: z.string().optional(),
      total: z.number().positive().default(100),
      current: z.number().min(0).default(0),
      unit: z.string().min(1).default('percent'),
      baseline: z.array(metricSchema).default([]),
      metrics: z.array(metricSchema).default([]),
      nextAction: z.string().optional(),
      links: z.array(linkSchema).default([]),
      notes: z.array(z.string()).default([]),
    }),
  },
  async (input) => {
    const now = new Date().toISOString();
    const id = slugify(input.id ?? input.title);
    const lane: Worklane = {
      schemaVersion: 1,
      id,
      title: input.title,
      summary: input.summary,
      scope: input.scope,
      status: 'active',
      startedAt: now,
      updatedAt: now,
      progress: {
        current: input.current,
        total: input.total,
        unit: input.unit,
      },
      baseline: input.baseline,
      metrics: input.metrics,
      nextAction: input.nextAction,
      links: input.links,
      notes: input.notes,
    };

    await writeWorklane(lane);
    return textResult(`Started worklane ${id} in ${worklaneDir}`);
  },
);

server.registerTool(
  'update_worklane',
  {
    description: 'Update progress, metrics, blocker, next action, or notes for an existing worklane.',
    inputSchema: z.object({
      id: z.string().min(1),
      status: z.enum(['planned', 'active', 'waiting', 'blocked', 'complete', 'cancelled']).optional(),
      summary: z.string().optional(),
      scope: z.string().optional(),
      current: z.number().min(0).optional(),
      total: z.number().positive().optional(),
      unit: z.string().min(1).optional(),
      metrics: z.array(metricSchema).optional(),
      nextAction: z.string().optional(),
      blocker: z.string().optional(),
      note: z.string().optional(),
    }),
  },
  async (input) => {
    const lane = await readWorklane(input.id);
    const nextStatus = input.status ?? lane.status;

    const updated: Worklane = {
      ...lane,
      status: nextStatus,
      summary: input.summary ?? lane.summary,
      scope: input.scope ?? lane.scope,
      updatedAt: new Date().toISOString(),
      completedAt: nextStatus === 'complete' ? (lane.completedAt ?? new Date().toISOString()) : lane.completedAt,
      progress: {
        current: input.current ?? lane.progress.current,
        total: input.total ?? lane.progress.total,
        unit: input.unit ?? lane.progress.unit,
      },
      metrics: input.metrics ?? lane.metrics,
      nextAction: input.nextAction ?? lane.nextAction,
      blocker: input.blocker ?? lane.blocker,
      notes: input.note ? [...(lane.notes ?? []), input.note] : lane.notes,
    };

    await writeWorklane(updated);
    return textResult(`Updated worklane ${input.id}`);
  },
);

server.registerTool(
  'complete_worklane',
  {
    description: 'Mark a worklane complete and optionally attach a final note.',
    inputSchema: z.object({
      id: z.string().min(1),
      note: z.string().optional(),
    }),
  },
  async ({ id, note }) => {
    const lane = await readWorklane(id);
    const now = new Date().toISOString();
    const completed: Worklane = {
      ...lane,
      status: 'complete',
      updatedAt: now,
      completedAt: now,
      progress: {
        ...lane.progress,
        current: lane.progress.total,
      },
      notes: note ? [...(lane.notes ?? []), note] : lane.notes,
    };

    await writeWorklane(completed);
    return textResult(`Completed worklane ${id}`);
  },
);

server.registerTool(
  'list_worklanes',
  {
    description: 'List known worklanes and their current progress.',
    inputSchema: z.object({}),
  },
  async () => {
    await ensureDir();
    const files = (await readdir(worklaneDir)).filter((file) => file.endsWith('.json'));
    const lanes = await Promise.all(
      files.map(async (file) => {
        const raw = await readFile(path.join(worklaneDir, file), 'utf8');
        return JSON.parse(raw) as Worklane;
      }),
    );

    return textResult(JSON.stringify({ worklaneDir, lanes }, null, 2));
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function ensureDir() {
  await mkdir(worklaneDir, { recursive: true });
}

async function readWorklane(id: string): Promise<Worklane> {
  const file = path.join(worklaneDir, `${slugify(id)}.json`);
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw) as Worklane;
}

async function writeWorklane(lane: Worklane) {
  await ensureDir();
  await writeFile(path.join(worklaneDir, `${lane.id}.json`), `${JSON.stringify(lane, null, 2)}\n`);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function textResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
