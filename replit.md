# Student Insight Workspace

A personal study command center with a Pomodoro focus dashboard, local progress analytics, and a browser-only quiz studio.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/student-insight-workspace/src/App.tsx` — the complete local-first React workspace, including productivity, calendar, corkboard notes, calculator, quiz parser, preferences, sidekick chat, XP progression, persistence, and break overlay.
- `artifacts/student-insight-workspace/src/index.css` — the dark instrument-panel theme, responsive shell, motion, answer feedback, sticky-note, and preference states.
- `artifacts/student-insight-workspace/vite.config.ts` — Vite entry configured for the artifact workflow's `PORT` and `BASE_PATH`.

## Architecture decisions

- The first release is local-first: all user progress, notes, quiz state, timer state, and settings use browser localStorage, so the app works without accounts or server costs.
- The timer records one study minute at a time, updating both the weekly chart and profile XP in real time.
- Quiz creation is deterministic from the user's notes structure: sentence parsing finds a subject and predicate, then builds recall prompts and distractors from the same source material.
- The global break prompt tracks elapsed time from app open and resets only when the user dismisses it.
- The local sidekick is intentionally offline and reads only the current browser workspace context; no external AI or integration is required.

## Product

Students can switch between Productivity, Calendar, Notes/Corkboard, Scientific Calculator, Quiz Studio, and Preferences; run 25/5/15-minute timer modes; mix a local focus soundscape; manage assignments and editable sticky notes; set a weekly study goal; review daily minutes; earn XP and faith-compliant level titles; generate quizzes from notes; receive instant answer feedback; chat with the local sidekick; and keep all progress across reloads.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
