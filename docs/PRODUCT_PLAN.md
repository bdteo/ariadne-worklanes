# Ariadne Worklanes Product Plan

## Current Local V1

Ariadne Worklanes is local observability for agent-operated work. Agents write structured worklane files through MCP, the dashboard visualizes those files, and the Codex plugin nudges agents to update status at meaningful milestones.

Local V1 is intentionally file-first:

- MCP owns writes.
- Dashboard owns visualization.
- JSON files own persistence.
- Hooks are opt-in and nudge-only.
- No database, hosted service, npm publishing, or external storage is required.

## Implemented Surface

### Shared Core

- `@ariadne-worklanes/core` owns schema v2, v1 migration, validation, stale detection, summaries, atomic writes, malformed-file reporting, and file-store reads.
- Unknown fields are preserved through passthrough validation for forward compatibility.
- Current persisted schema is [schemas/worklane.v2.json](../schemas/worklane.v2.json); v1 remains readable for migration.

### MCP Server

Tools:

- `start_worklane`
- `update_worklane`
- `add_milestone`
- `set_blocker`
- `clear_blocker`
- `attach_evidence`
- `complete_worklane`
- `archive_worklane`
- `list_worklanes`
- `summarize_worklanes`

The server writes atomically, validates before write, records events/milestones/evidence, and returns clear missing/invalid lane errors.

### Dashboard

- API-backed polling through `/api/worklanes`.
- Status/search/sort filters.
- Stale, blocked, archived, and malformed-file states.
- Compact operator mode.
- Detail pages with timeline, metrics, evidence, operator summary, and raw JSON.
- Copyable one-line summaries.

### Agent Nudging

- Skill metadata front-loads long-running ops, DevOps, deploy, recovery, investigation, current stats, delta, blocker, and handoff triggers.
- MCP server instructions reinforce start/update/complete behavior.
- `hooks/hooks.json` provides trust-reviewed optional hooks for `SessionStart`, `UserPromptSubmit`, and `Stop`.
- Hooks read local lane files and print nudges only; they never create or update worklanes.

## Worklane Model

Required:

- `schemaVersion: 2`
- `id`
- `title`
- `status`
- `startedAt`
- `updatedAt`
- `staleAfterMinutes`
- `progress.current`
- `progress.total`
- `progress.unit`

Optional:

- identity/context: `summary`, `scope`, `owner`, `workspace`, `repo`, `threadId`, `sessionId`, `lastActor`
- state: `completedAt`, `archivedAt`, `nextAction`, `blocker`, `warnings`, `notes`
- operational data: `baseline`, `metrics`, `milestones`, `events`, `evidence`, `links`

Statuses:

- `planned`
- `active`
- `waiting`
- `blocked`
- `complete`
- `cancelled`
- `archived`

## QA Contract

Local V1 is considered healthy when these pass:

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm --filter @ariadne-worklanes/dashboard test:visual
python3 /Users/boris/DevEnvs/Boris/MacShellUtils/Users/Boris/codex/skills/.system/plugin-creator/scripts/validate_plugin.py /Users/boris/DevEnvs/Boris/Oss/ariadne-worklanes
curl -I http://localhost:3737
```

Coverage expectations:

- Core: schema validation, v1 migration, atomic writes, missing lanes, archive behavior, stale detection, summaries, malformed JSON.
- MCP: stdio smoke test calling the write/update/timeline/evidence/blocker/complete path.
- Dashboard: fixture loading, filtering, sorting, stale/malformed behavior, summary text.
- Visual: desktop and mobile Playwright screenshots for dashboard and detail pages.

## Follow-Up Ideas

- Real-time file watcher/SSE instead of polling.
- Repo/team marketplace example for easy plugin installation.
- Logo/screenshot assets for the plugin directory.
- Optional static export for read-only incident evidence.
- Team/shared-folder mode.
- Lightweight desktop wrapper if a browser tab is not enough.
