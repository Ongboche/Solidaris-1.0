# SOLIDARIS

A research platform for building **solidarity profiles** of global health programmes, policies, portfolios and investments. Nine domains are each rated on their own, with evidence, by independent assessors. They are never combined into a single score.

- **Live site:** https://ongboche.github.io/Solidaris-1.0/
- **Specification:** [docs/SOLIDARIS_REENGINEERING_BRIEF.md](docs/SOLIDARIS_REENGINEERING_BRIEF.md) is the source of truth. The SRS fills gaps where the brief is silent.
- **Plan and decisions:** [docs/PLAN.md](docs/PLAN.md) · **Audit of the old prototype:** [docs/AUDIT.md](docs/AUDIT.md)
- **Guides:** [User guide](docs/USER_GUIDE.md) · [Administrator guide](docs/ADMIN_GUIDE.md)

## Stack

React 18 + TypeScript + Vite + Tailwind on the front end. Supabase provides Postgres, Auth, row-level security and Storage. Methodology rules live in two places:
- `src/domain/`: pure TypeScript, used for instant feedback in the UI.
- The database itself, as constraints, triggers and RPC functions, which is what enforces the rules.

## Getting started

Requires Node 24 LTS.

```bash
npm install
cp .env.example .env      # then fill in the Supabase URL and publishable key
npm run dev               # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests plus the database suite. Migrations run in PGlite (Postgres in Node); no Docker needed |
| `npm run test:db` | Only the database tests: row-level security, invariants, gate rules |
| `npm run e2e` | Playwright end-to-end and axe accessibility checks against a production build |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm run build` | Production build (adds `404.html` for GitHub Pages routing) |
| `npm run db:push` | Applies `supabase/migrations` to the linked Supabase project. Needs `npx supabase login` (or `SUPABASE_ACCESS_TOKEN`) |
| `node scripts/migrate-from-sheet.ts …` | One-off import from the old prototype. A dry run unless `--apply` is given (see the admin guide) |

## Layout

```
src/app/        routing, layout, auth provider and guards
src/features/   one folder per toolkit component: auth, platform, project (T1/T2), evidence (T5), assessment (T3),
                integrity (T4), deliberation (T6), profile + report (T8), uptake (T9), signals (T7), learning (T10),
                gates, admin (M&E, users, institutions, framework, audit)
src/domain/     workflow, gate suggestion, completeness, divergence, no-composite guard
src/ui/         design tokens and accessible components
supabase/       migrations (schema, RLS, workflow RPCs, framework v1 seed) and pgTAP tests
scripts/        postbuild, bundle budget, legacy migration
tests/db/       PGlite database tests
e2e/            Playwright tests
legacy/         the old prototype, kept read-only for reference
```

## Non-negotiable rules

Brief §3 lists them. In short:
- profiles, not scores;
- unrated is NULL, never 0;
- evidence before judgement;
- independent assessment until G3;
- submitted assessments are locked;
- dissent is preserved;
- humans make gate decisions;
- the audit log is append-only;
- the framework is versioned;
- signals are observations, not predictions;
- machine-generated text is labelled honestly.

Each rule has automated tests. Never weaken a rule to make a test pass.
