# Ariadne Worklanes

Ariadne Worklanes is a local observability cockpit for long-running agent and ops sessions.

Agents update structured worklane JSON files through an MCP server. A Next.js dashboard reads those files and shows concise cards for cwd, progress, elapsed time, stale state, blockers, baseline/current metrics, evidence, and next actions.

The core idea: when work spans multiple agent sessions, terminals, deploys, queues, and side chats, status should not live only in the latest transcript.

## Shape

```text
ariadne-worklanes/
  apps/dashboard/          Next.js dashboard and visual QA fixtures
  packages/core/           Shared schema, validation, migration, summaries, and file store
  packages/mcp-server/     MCP tools that write worklane JSON files
  hooks/                   Optional Codex lifecycle nudges
  schemas/                 Versioned JSON schemas
  skills/                  Codex plugin skill guidance
  worklanes/               Example worklane files for local development
```

## Install

```bash
pnpm install
pnpm build
```

## Run The Dashboard

For development with hot reload:

```bash
pnpm dev
```

For a stable local dashboard after building:

```bash
pnpm build
pnpm start
```

The dashboard starts on [http://localhost:3737](http://localhost:3737). When an agent starts it for a long-running handoff, run it detached with stdout/stderr redirected, for example in tmux, so request logs cannot block on an abandoned Codex terminal pipe.

For a persistent macOS user service, build the dashboard as a Next.js standalone production bundle and install the LaunchAgent:

```bash
pnpm launchd:install
```

The LaunchAgent starts at login after reboot, keeps the dashboard running on [http://127.0.0.1:3737](http://127.0.0.1:3737), and reads `~/.ariadne-worklanes/worklanes`. It uses the boilerplate in `launchd/com.bdteo.ariadne-worklanes.dashboard.plist.example` and writes the installed plist to `~/Library/LaunchAgents/com.bdteo.ariadne-worklanes.dashboard.plist`.

Useful service commands:

```bash
pnpm launchd:status
pnpm launchd:uninstall
tail -f ~/Library/Logs/ariadne-worklanes-dashboard.log
tail -f ~/Library/Logs/ariadne-worklanes-dashboard.error.log
```

This is not `next dev`: the LaunchAgent runs `apps/dashboard/.next/standalone/**/server.js` from the compiled build. The dashboard still needs a local server because it reads and updates worklane JSON files through API routes.

By default it reads worklanes from `~/.ariadne-worklanes/worklanes` when present, then falls back to the repo-local `worklanes/` sample directory. Override the directory with:

```bash
ARIADNE_WORKLANES_DIR=/path/to/worklanes pnpm dev
```

The dashboard includes:

- polling refresh through `/api/worklanes`
- status/search/sort filters
- cwd-first visual grouping, with workspace fallback for older lanes
- stale and blocked state highlighting
- malformed-file repair cards
- compact operator mode
- detail pages at `/worklanes/:id`
- timeline, evidence, metrics, and raw JSON views
- copyable one-line operator summaries
- status changes from each dashboard card, including a one-click complete action

## Run The MCP Server

```bash
pnpm build
ARIADNE_WORKLANES_DIR=~/.ariadne-worklanes/worklanes pnpm mcp
```

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

`list_worklanes` and `summarize_worklanes` return active/open lanes by default. Pass `includeCompleted=true` for completed/cancelled lanes and `includeArchived=true` for archived lanes.

MCP is the main writer for agent sessions. The dashboard can also write explicit operator status changes to the same local JSON files.

## File Model

Worklanes are local JSON files. The current write schema is v2:

- identity: `id`, `title`, `summary`, `scope`, `owner`, `cwd`, `workspace`, `repo`
- session context: `threadId`, `sessionId`, `lastActor`
- state: `status`, `startedAt`, `updatedAt`, `completedAt`, `archivedAt`, `staleAfterMinutes`
- progress: `current`, `total`, `unit`
- context: `baseline`, `metrics`, `nextAction`, `blocker`, `warnings`, `notes`
- history: `milestones`, `events`, `evidence`, `links`

The shared core reads existing v1 files and normalizes them to v2 at read time. See [schemas/worklane.v2.json](schemas/worklane.v2.json), [schemas/worklane.v1.json](schemas/worklane.v1.json), and [worklanes/sample-shop-recovery.json](worklanes/sample-shop-recovery.json).

## Codex Plugin

The repo root is a Codex plugin. It includes:

- `.codex-plugin/plugin.json`
- `.mcp.json`
- `skills/ariadne-worklanes/SKILL.md`
- `skills/ariadne-worklanes/agents/openai.yaml`
- `hooks/hooks.json`

Build before installing or using the plugin locally:

```bash
pnpm build
```

Hooks are opt-in/trust-reviewed by Codex. They are nudge-only: session start summarizes active/stale lanes, user prompts that look status-oriented remind the agent to use Ariadne, and stop hooks return a safe Codex continue response. Hooks never fabricate progress.

## QA

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm --filter @ariadne-worklanes/dashboard test:visual
python3 /Users/boris/DevEnvs/Boris/MacShellUtils/Users/Boris/codex/skills/.system/plugin-creator/scripts/validate_plugin.py /Users/boris/DevEnvs/Boris/Oss/ariadne-worklanes
```

For a live local smoke check:

```bash
pnpm dev
curl -I http://localhost:3737
```

## Product Plan

The production-ready local V1 concept and follow-up ideas are tracked in [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md).
