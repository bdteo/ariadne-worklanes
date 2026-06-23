#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const input = readStdinJson();
const eventName = process.env.ARIADNE_HOOK_EVENT || input.hook_event_name || input.event || 'unknown';
const worklaneDir = process.env.ARIADNE_WORKLANES_DIR || path.join(homedir(), '.ariadne-worklanes', 'worklanes');
const lanes = readLanes(worklaneDir);
const active = lanes.filter((lane) => ['planned', 'active', 'waiting', 'blocked'].includes(lane.status));
const stale = active.filter((lane) => isStale(lane));
const prompt = promptText(input).toLowerCase();

if (eventName === 'SessionStart' && active.length > 0) {
  emitContext(
    eventName,
    `Ariadne: ${active.length} active worklane(s), ${stale.length} stale. Use summarize_worklanes before starting adjacent long-running work.`,
  );
}

if (eventName === 'UserPromptSubmit' && shouldNudge(prompt)) {
  emitContext(
    eventName,
    'Ariadne: this prompt looks status/progress oriented. Use Ariadne worklane tools for baseline, delta, blocker, and next-action updates.',
  );
}

if (eventName === 'Stop') {
  emitContinue();
}

function readStdinJson() {
  try {
    const raw = readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function readLanes(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      try {
        const lane = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
        return lane && typeof lane === 'object' ? [normalizeLane(lane)] : [];
      } catch {
        return [];
      }
    });
}

function normalizeLane(lane) {
  return {
    ...lane,
    staleAfterMinutes: typeof lane.staleAfterMinutes === 'number' ? lane.staleAfterMinutes : 60,
  };
}

function isStale(lane) {
  if (['complete', 'cancelled', 'archived'].includes(lane.status)) {
    return false;
  }

  const updatedAt = Date.parse(lane.updatedAt);
  return !Number.isFinite(updatedAt) || Date.now() - updatedAt > lane.staleAfterMinutes * 60 * 1000;
}

function shouldNudge(prompt) {
  return [
    'current stats',
    'delta from start',
    'how far',
    'progress',
    'still running',
    'status',
    'handoff',
    'blocked',
    'blocker',
  ].some((needle) => prompt.includes(needle));
}

function promptText(value) {
  return [
    value.prompt,
    value.user_prompt,
    value.userPrompt,
    value.message,
    value.text,
    value.input,
    value.tool_input?.prompt,
    value.toolInput?.prompt,
  ].find((candidate) => typeof candidate === 'string' && candidate.trim()) || '';
}

function emitContext(hookEventName, additionalContext) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName,
      additionalContext,
    },
  })}\n`);
}

function emitContinue() {
  process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
}
