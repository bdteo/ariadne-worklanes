# Ariadne Worklanes Agent Notes

Ariadne Worklanes is an OSS project for local agent-work observability. It combines:

- a Codex plugin manifest and skill guidance
- an MCP server that writes structured worklane JSON files
- a Next.js dashboard that renders those files as progress cards

Use pnpm for all package work. The dashboard lives in `apps/dashboard`; the MCP server lives in `packages/mcp-server`.

When changing the worklane file shape, update `schemas/worklane.v1.json`, the MCP writer, the dashboard reader, and the README together.

Keep the project local-first and file-first. Do not add a database unless the dashboard has outgrown simple JSON files.
