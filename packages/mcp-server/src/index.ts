import {
  addMilestone,
  archiveWorklane,
  attachEvidence,
  clearBlocker,
  completeWorklane,
  createWorklane,
  defaultWorklaneDir,
  listWorklanes,
  metricSchema,
  readWorklane,
  setBlocker,
  summarizeWorklane,
  updateWorklane,
  worklaneStatuses,
  writeWorklane,
} from "../../core/dist/index.js";
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

const worklaneDir = defaultWorklaneDir();

const linkSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
});

const evidenceInputSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
  kind: z.enum(['link', 'file', 'pr', 'issue', 'runbook', 'log', 'screenshot', 'other']).default('link'),
});

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
      owner: z.string().optional(),
      workspace: z.string().optional(),
      repo: z.string().optional(),
      threadId: z.string().optional(),
      sessionId: z.string().optional(),
      lastActor: z.string().optional(),
      total: z.number().positive().default(100),
      current: z.number().min(0).default(0),
      unit: z.string().min(1).default('percent'),
      staleAfterMinutes: z.number().positive().default(60),
      baseline: z.array(metricSchema).default([]),
      metrics: z.array(metricSchema).default([]),
      nextAction: z.string().optional(),
      links: z.array(linkSchema).default([]),
      evidence: z.array(evidenceInputSchema).default([]),
      notes: z.array(z.string()).default([]),
    }),
  },
  async (input) => {
    const lane = createWorklane(input);
    await writeWorklane(worklaneDir, lane);
    return jsonResult({ message: `Started worklane ${lane.id}`, worklaneDir, lane });
  },
);

server.registerTool(
  'update_worklane',
  {
    description: 'Update progress, metrics, blocker, next action, or notes for an existing worklane.',
    inputSchema: z.object({
      id: z.string().min(1),
      status: z.enum(worklaneStatuses).optional(),
      summary: z.string().optional(),
      scope: z.string().optional(),
      owner: z.string().optional(),
      workspace: z.string().optional(),
      repo: z.string().optional(),
      threadId: z.string().optional(),
      sessionId: z.string().optional(),
      lastActor: z.string().optional(),
      current: z.number().min(0).optional(),
      total: z.number().positive().optional(),
      unit: z.string().min(1).optional(),
      staleAfterMinutes: z.number().positive().optional(),
      baseline: z.array(metricSchema).optional(),
      metrics: z.array(metricSchema).optional(),
      nextAction: z.string().optional(),
      blocker: z.string().optional(),
      note: z.string().optional(),
      warnings: z.array(z.string()).optional(),
    }),
  },
  async ({ id, ...input }) => {
    const lane = await readWorklane(worklaneDir, id);
    const updated = updateWorklane(lane, input);
    await writeWorklane(worklaneDir, updated);
    return jsonResult({ message: `Updated worklane ${updated.id}`, worklaneDir, lane: updated });
  },
);

server.registerTool(
  'add_milestone',
  {
    description: 'Append a milestone to a worklane timeline.',
    inputSchema: z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      summary: z.string().optional(),
      status: z.enum(['planned', 'active', 'waiting', 'blocked', 'complete', 'cancelled']).default('complete'),
      actor: z.string().optional(),
    }),
  },
  async ({ id, ...input }) => {
    const lane = await readWorklane(worklaneDir, id);
    const updated = addMilestone(lane, input);
    await writeWorklane(worklaneDir, updated);
    return jsonResult({ message: `Added milestone to ${updated.id}`, worklaneDir, lane: updated });
  },
);

server.registerTool(
  'set_blocker',
  {
    description: 'Mark a worklane blocked and record the blocker in its timeline.',
    inputSchema: z.object({
      id: z.string().min(1),
      blocker: z.string().min(1),
      actor: z.string().optional(),
    }),
  },
  async ({ id, blocker, actor }) => {
    const lane = await readWorklane(worklaneDir, id);
    const updated = setBlocker(lane, blocker, actor);
    await writeWorklane(worklaneDir, updated);
    return jsonResult({ message: `Blocked worklane ${updated.id}`, worklaneDir, lane: updated });
  },
);

server.registerTool(
  'clear_blocker',
  {
    description: 'Clear a worklane blocker and optionally update the next action.',
    inputSchema: z.object({
      id: z.string().min(1),
      nextAction: z.string().optional(),
      actor: z.string().optional(),
    }),
  },
  async ({ id, nextAction, actor }) => {
    const lane = await readWorklane(worklaneDir, id);
    const updated = clearBlocker(lane, nextAction, actor);
    await writeWorklane(worklaneDir, updated);
    return jsonResult({ message: `Cleared blocker for ${updated.id}`, worklaneDir, lane: updated });
  },
);

server.registerTool(
  'attach_evidence',
  {
    description: 'Attach a file, URL, PR, issue, log, screenshot, or runbook reference to a worklane.',
    inputSchema: z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      url: z.string().min(1),
      kind: z.enum(['link', 'file', 'pr', 'issue', 'runbook', 'log', 'screenshot', 'other']).default('link'),
      actor: z.string().optional(),
    }),
  },
  async ({ id, ...input }) => {
    const lane = await readWorklane(worklaneDir, id);
    const updated = attachEvidence(lane, input);
    await writeWorklane(worklaneDir, updated);
    return jsonResult({ message: `Attached evidence to ${updated.id}`, worklaneDir, lane: updated });
  },
);

server.registerTool(
  'complete_worklane',
  {
    description: 'Mark a worklane complete and optionally attach a final note.',
    inputSchema: z.object({
      id: z.string().min(1),
      note: z.string().optional(),
      actor: z.string().optional(),
    }),
  },
  async ({ id, note, actor }) => {
    const lane = await readWorklane(worklaneDir, id);
    const completed = completeWorklane(lane, note, actor);
    await writeWorklane(worklaneDir, completed);
    return jsonResult({ message: `Completed worklane ${completed.id}`, worklaneDir, lane: completed });
  },
);

server.registerTool(
  'archive_worklane',
  {
    description: 'Mark a worklane archived while preserving its JSON file and history.',
    inputSchema: z.object({
      id: z.string().min(1),
      note: z.string().optional(),
      actor: z.string().optional(),
    }),
  },
  async ({ id, note, actor }) => {
    const lane = await readWorklane(worklaneDir, id);
    const archived = archiveWorklane(lane, note, actor);
    await writeWorklane(worklaneDir, archived);
    return jsonResult({ message: `Archived worklane ${archived.id}`, worklaneDir, lane: archived });
  },
);

server.registerTool(
  'list_worklanes',
  {
    description: 'List known worklanes and malformed files from the configured worklane directory.',
    inputSchema: z.object({}),
  },
  async () => {
    const result = await listWorklanes(worklaneDir);
    return jsonResult(result);
  },
);

server.registerTool(
  'summarize_worklanes',
  {
    description: 'Return concise one-line summaries for all known worklanes.',
    inputSchema: z.object({
      includeArchived: z.boolean().default(false),
    }),
  },
  async ({ includeArchived }) => {
    const result = await listWorklanes(worklaneDir);
    const summaries = result.lanes
      .filter((lane) => includeArchived || lane.status !== 'archived')
      .map((lane) => summarizeWorklane(lane));
    return jsonResult({ worklaneDir, summaries, malformed: result.malformed });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function jsonResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
