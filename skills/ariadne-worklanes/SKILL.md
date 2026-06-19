---
name: ariadne-worklanes
description: Track long-running agent, ops, DevOps, production, staging, recovery, deploy, QA, current-stats, delta-from-start, blocker, and handoff sessions in Ariadne Worklanes by creating and updating visible progress cards through the MCP tools.
---

# Ariadne Worklanes

Use Ariadne Worklanes when work is likely to span more than one agent turn, terminal, deploy, queue run, browser QA pass, or side session.

Good triggers:

- Boris asks to track progress, current stats, delta from start, or observability.
- A production/staging operation will run for many minutes.
- Multiple agents or terminals may work in parallel.
- There is a meaningful baseline, target, gap, blocker, or next action worth preserving outside chat history.

When starting such work, call `start_worklane` with a concise title, scope, total/current progress if known, baseline metrics if useful, and the next action.

During the work, call `update_worklane` whenever progress materially changes, a job moves state, or you have a clearer next action. Use `add_milestone` for meaningful phase boundaries, `set_blocker` / `clear_blocker` for blocked state, and `attach_evidence` for PRs, logs, runbooks, screenshots, or proof links.

Before handing off or ending the session, call `update_worklane`, `complete_worklane`, or `archive_worklane` so the dashboard remains truthful.

Keep cards concise. Put detailed logs, screenshots, runbooks, PRs, or notes behind links instead of dumping them into the card.
