# Ariadne Worklanes

Ariadne Worklanes is a local observability cockpit for long-running agent and ops sessions.

Agents write structured worklane files through an MCP server. A small Next.js dashboard reads those files and shows concise cards: progress, elapsed time, last update age, baseline-to-current deltas, blockers, and next actions.

The core idea: when work spans multiple agent sessions, terminals, deploys, queues, and side chats, status should not live only in the latest transcript.

## Shape

```text
ariadne-worklanes/
  apps/dashboard/          Next.js dashboard for progress cards
  packages/mcp-server/     MCP tools that write worklane JSON files
  schemas/                 Versioned file schema
  skills/                  Codex plugin skill guidance
  worklanes/               Example worklane files for local development
```

## Worklane Card

Each card is meant to answer:

- What is this work?
- When did it start?
- When did it last move?
- How far along is it?
- What changed from the baseline?
- What remains?
- Is anything blocked?
- What is the next action?

## Install

```bash
pnpm install
pnpm build
```

## Run The Dashboard

```bash
pnpm dev
```

The dashboard starts on [http://localhost:3737](http://localhost:3737).

By default it reads worklanes from `~/.ariadne-worklanes/worklanes` when present, then falls back to the repo-local `worklanes/` sample directory. You can override the directory:

```bash
ARIADNE_WORKLANES_DIR=/path/to/worklanes pnpm dev
```

## Run The MCP Server

```bash
pnpm build
ARIADNE_WORKLANES_DIR=~/.ariadne-worklanes/worklanes pnpm mcp
```

The MCP server exposes these first tools:

- `start_worklane`
- `update_worklane`
- `complete_worklane`
- `list_worklanes`

## File Model

Worklanes are JSON files. The initial schema is intentionally small and boring:

- identity: `id`, `title`, `summary`, `scope`
- state: `status`, `startedAt`, `updatedAt`, `completedAt`
- progress: `current`, `total`, `unit`
- operational context: `baseline`, `metrics`, `nextAction`, `blocker`, `links`, `notes`

See [schemas/worklane.v1.json](schemas/worklane.v1.json) and [worklanes/sample-shop-recovery.json](worklanes/sample-shop-recovery.json).

## Product Plan

The production-ready concept is tracked in [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md).

## Codex Plugin

The repo root is also a Codex plugin. It includes:

- `.codex-plugin/plugin.json`
- `.mcp.json`
- `skills/ariadne-worklanes/SKILL.md`

Build the MCP server before installing or using the plugin locally.
