# Backlog Web UI — Mens Network Fork

You are a coding agent working on the Backlog.md web UI for Mens Network Ltd.
This is a **Pilot Lite** build under the Nexus dev team operating model.

## What You're Building

A custom web UI replacing the bundled backlog.md browser. The UI serves as the primary
task management interface for Paul (CEO) and Shenny (non-technical user). You are
**maintaining and extending the existing design** — not redesigning. KISS.

## Project Context

- **Fork:** github.com/MensNetwork/backlog.md (MIT, upstream: MrLesk/Backlog.md)
- **Stack:** Bun, TypeScript 5, React 19, Tailwind CSS 4, Biome
- **Runtime:** Bun (not Node)
- **Data:** Pure markdown files in `~/mens-network/c-suite-v3/backlog/tasks/`. The binary's HTTP API (port 3333) is the interface.
- **Users:** Paul (psydell localhost:3333, mn-tgs localhost:3333), Shenny (mn-cfo via shenny.mensnetwork.global)

## Operating Envelope

Read the full envelope at the CTO interface (`~/mens-network/c-suite-v3/interfaces/engineering/outbox/`), but the key rules are:

**Can do:** Modify `src/web/` freely, add React devDependencies, create feature branches, write tests.
**Must escalate:** Changes outside `src/web/`, production deps, schema changes, build pipeline changes, CI changes.
**Cannot do:** Push to main without PR, modify CLI behaviour, add auth, access external APIs.

## Commands

```bash
bun i                      # Install dependencies
bun test                   # Run all tests
bun run check .            # Biome format + lint
bunx tsc --noEmit          # Type check
bun run build:css          # Build Tailwind CSS
bun run build              # Full production build
bun run cli                # Run CLI directly (dev mode)
bun run cli browser        # Start web UI server on port 3333
```

## Code Standards

- **TypeScript strict** — no `any` without justification
- **Biome** — tab indentation, double quotes, recommended rules
- **Pre-commit:** Husky + lint-staged runs `biome check --write` on staged files
- **Tests:** Bun's built-in test runner. Co-locate or use `__tests__/` directories.

## Git Workflow

- Branch: `tasks/back-{N}-{slug}` (e.g. `tasks/back-42-subtask-hierarchy`)
- Commits: `BACK-{N} - {description}` (e.g. `BACK-42 - Add subtask tree to task detail`)
- PRs: title format `{taskId} - {taskTitle}`, require review before merge to main

## Web UI Architecture

The existing UI lives in `src/web/`:

```
src/web/
├── App.tsx              # Router and layout
├── main.tsx             # Entry point
├── index.html           # HTML shell
├── components/          # React components (28 files)
├── contexts/            # React context providers
├── hooks/               # Custom hooks
├── lib/                 # Shared utilities
├── styles/              # Tailwind source + compiled CSS
└── utils/               # Helper functions
```

The web UI communicates with the backlog binary's HTTP server via REST API.
API reference: the server source is in `src/server/index.ts`.

## Key Gaps to Fix (from directive)

1. **Subtask hierarchy** — parent tasks must show subtasks; subtasks must show parent
2. **Label filtering** — filter task list by labels
3. **Search** — functional search across tasks
4. **Task CRUD** — create/edit with all fields (description, AC, DoD, plan, notes)
5. **Shenny access** — must work at her URL without CLI interaction

## Existing Design

Maintain the existing visual design. Do not introduce new design systems, colour
palettes, or layout paradigms. The existing UI uses Tailwind with a dark theme.
Enhance and fix — do not redesign.

## GSD Framework

This build uses GSD (Get Shit Done) for structured execution. The GSD framework
should be loaded from `~/dev/mn-platform/.claude/get-shit-done/` or installed locally.

GSD applies because this directive has >3 acceptance criteria and >5 files.

## Decisions Log

Project-level architectural decisions go in `.planning/decisions/` in this repo.
Create the directory when the first decision is needed.

## Deployment

Full deployment reference: `docs/DEPLOYMENT.md`

mn-cfo is ARM64 — cross-compile required, not a standard `bun run build`. Key steps:

1. Build ARM64 binary: `bun build --target=bun-linux-arm64 --outfile=dist/backlog-arm64 ...`
2. `scp dist/backlog-arm64 mn-cfo:/tmp/backlog-new`
3. `ssh mn-cfo 'sudo mv /tmp/backlog-new /usr/local/bin/backlog && systemctl --user restart backlog-browser'`

Production URL: `https://tasks.mensnetwork.global` (Google OAuth, @mensnetwork.global only)

## Session End

At the end of each session, write a SUMMARY.md that includes:
- What was done
- Any deviations from the directive
- Proposed CLAUDE.md amendments (if any — CTO reviews and applies)
- Open items for next session

## Reporting

Status updates, questions, and deliverables → `~/mens-network/c-suite-v3/interfaces/engineering/inbox/`.
Flag anything unclear or broken in the process — this is the first live pilot.

## Task Reference

Active task: **TASK-42** — full details at:
`~/mens-network/c-suite-v3/backlog/tasks/task-42 - Backlog-web-UI-—-custom-build-replacing-bundled-browser.md`

Latest directive amendment (2026-04-05, read this first):
`~/mens-network/c-suite-v3/interfaces/engineering/outbox/2026-04-05-amendment-backlog-web-ui-scope-and-env.md`

Original directive:
`~/mens-network/c-suite-v3/interfaces/engineering/outbox/2026-03-31-directive-backlog-web-ui.md`

Run backlog commands via the wrapper: `~/mens-network/c-suite-v3/system/scripts/csuite-backlog.sh task view TASK-42`

Never `cd` to c-suite-v3 to run backlog — always use the wrapper so your working directory stays in this repo.
