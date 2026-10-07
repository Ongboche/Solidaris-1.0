# SOLIDARIS — Re-engineering Plan

**Status:** Phases 1–5 built and tested; Phases 2–5 awaiting push and merge (see §9) · **Source of truth:** `docs/SOLIDARIS_REENGINEERING_BRIEF.md`, then the SRS (`research/SOLIDARIS.docx`) where the brief is silent · **Findings:** `docs/AUDIT.md`

This plan is updated at the start and end of each phase. In this document:
- "§n" refers to a section of the brief.
- "Q-n" refers to a question in §8 of this plan.

---

## 1. Target folder tree

```
.
├── docs/                         brief, AUDIT, PLAN, USER_GUIDE (Phase 7), ADMIN_GUIDE (Phase 7)
├── legacy/                       old app, read-only reference (moved in Phase 1)
│   ├── app/                      src/App.jsx, src/lib/db.js, src/lib/sheetApi.js, index.css
│   ├── prototypes/               solidaris_chrome.html, solidaris_demo.jsx, test-sheet-api.html
│   └── docs/                     GOOGLE_SHEETS_SETUP.md, APPS_SCRIPT_FIX.md
├── research/                     papers, protocol, Excel tools: kept on disk, NOT tracked in git (D-2)
├── scripts/
│   └── migrate-from-sheet.ts     Phase 7
├── supabase/
│   ├── config.toml
│   ├── migrations/               0001_enums … 00xx_policies (one concern per file)
│   ├── seed/                     framework_v1.sql (Appendix A + B), demo_sample_project.sql
│   └── tests/                    pgTAP: rls_*.sql, fn_decide_gate.sql, invariants_*.sql
├── e2e/                          Playwright journeys + axe checks
├── src/
│   ├── app/                      router.tsx, layout/, providers/ (QueryClient, Auth, i18n)
│   ├── features/
│   │   ├── platform/             home, "What to do next", subject router, onboarding
│   │   ├── scoping/              T1 + G0
│   │   ├── context/              T2 + G1, actor map
│   │   ├── evidence/             T5 + G2
│   │   ├── assessment/           T3 + G3
│   │   ├── integrity/            T4 + G4
│   │   ├── deliberation/         T6 + G5
│   │   ├── profile/              T8 + G6, report, exports
│   │   ├── uptake/               T9 + G7          (behind feature flag)
│   │   ├── signals/              T7               (behind feature flag)
│   │   ├── learning/             T10 + G8         (behind feature flag)
│   │   ├── gates/                shared gate review screen + journey bar
│   │   ├── me-dashboard/
│   │   └── admin/
│   ├── domain/                   pure TS, 100% unit tested, no React and no I/O
│   │   ├── workflow.ts           status machine (§6.1)
│   │   ├── gates.ts              suggestDecision(), criterion types (§6.2)
│   │   ├── completeness.ts       isRatingComplete() (invariant 3)
│   │   ├── divergence.ts         per-domain max−min, NULLs ignored (§6.4)
│   │   ├── autoChecks.ts         auto-check evaluators per gate (§6.3)
│   │   ├── noComposite.ts        guard used by exports and tests (invariant 1)
│   │   └── config.ts             open-decision defaults (§16)
│   ├── lib/                      supabase.ts, api/ (TanStack Query hooks), autosave queue, flags.ts
│   ├── ui/                       tokens.css, Button, RatingButtons, Field, Stepper, Chip, EmptyState …
│   └── i18n/                     en.json (fr.json scaffold)
├── .github/workflows/            ci.yml (lint, typecheck, unit, pgTAP, e2e) + deploy.yml
└── package.json, tsconfig.json, vite.config.ts, eslint.config.js, .prettierrc
```

---

## 2. Files: keep, move to `legacy/`, delete

| File | Action | Notes |
|---|---|---|
| `package.json`, `index.html`, `tailwind.config.js`, `postcss.config.js` | **Keep, update** | Add dependencies and convert configs to TypeScript where supported |
| `vite.config.js` | **Keep, update** → `vite.config.ts` | `base: '/Solidaris-1.0/'`, and the build copies `index.html` to `404.html` (D-10) |
| `.github/workflows/deploy.yml` | **Keep, update** | Add Supabase URL and anon key as repo variables; drop `VITE_SHEET_API_URL` once migrated |
| `.env.example` | **Keep, update** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, feature flags |
| `.gitignore`, `.vscode/launch.json` | Keep | |
| `README.md` | **Rewrite** in Phase 1 | Setup, scripts, architecture pointer |
| `src/main.jsx`, `src/index.css` | Replace | New `main.tsx`; tokens move to `src/ui/tokens.css` |
| `src/App.jsx`, `src/lib/db.js`, `src/lib/sheetApi.js` | **Move** → `legacy/app/` | Not imported by the new build |
| `prototypes/*` | **Move** → `legacy/prototypes/` | Reference only |
| `GOOGLE_SHEETS_SETUP.md`, `APPS_SCRIPT_FIX.md` | **Move** → `legacy/docs/` | Needed for migration and decommissioning |
| `research/*` | **Untracked** (stays on disk, gitignored) | D-2. The repo is public |
| Nothing | **Delete** | §16: "Do not delete the old prototype files" |

**"Remove localStorage and Sheet persistence behind a feature flag" (Phase 1).** The new app never reads or writes the old store. One flag, `legacyExport` (default off), shows a small "Download my old local data" page. It exports `localStorage['solidaris:db:v1']` as JSON for the migration script (§13), without passwords.

---

## 3. Database schema (outline)

Conventions:
- Every table has `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, `created_by uuid references auth.users default auth.uid()` and `updated_at`, maintained by trigger.
- RLS is enabled on every table with no default grants (§12).
- Writes that change workflow state go only through `security definer` RPC functions.

### 3.1 Enums
```
subject_type        project | programme | portfolio | investment | policy
assessment_type     baseline | midline | endline | rapid | reassessment
project_status      draft | scoping | context | evidence | assessment | integrity
                    | deliberation | validation | uptake | learning | closed
project_role        pi | assessor | reviewer | observer | external_expert | kt_lead | community_participant
platform_role       platform_admin | institution_admin | member
assessment_status   draft | submitted | reopened | withdrawn                          (withdrawn: D-22)
confidence_level    low | medium | high
risk_level          low | medium | high
risk_flag           washing | power | sustainability | inclusion
solidarity_type     symbolic | instrumental | substantive | transformative
evidence_type       document | interview | fgd | observation | admin_data | literature | financial | media | other
evidence_origin     community | government | funder | implementer | independent
evidence_source     primary | secondary | grey_literature | peer_reviewed | government_document
                    | internal_document | media | website                           (SRS §9.7, optional)
confidentiality     public | restricted | confidential | highly_confidential          (SRS §9.7)
consensus_category  full | substantial | with_reservations | no_consensus | deferred_pending_evidence  (SRS §10.15)
gate_code           G0 … G8
criterion_answer    yes | partial | no | na
gate_decision       go | conditional_go | hold | stop_redirect
suggested_decision  not_started | hold | conditional_go | go
use_type            instrumental | conceptual | symbolic
signal_level        watch | act
```

### 3.2 Tables

#### Configuration (versioned; invariant 9)

**`framework_versions`**
- `label` (for example "v1")
- `status` (`draft | published | retired`)
- `published_at`
- Read-only once any project references it: a trigger blocks edits.

**`dimensions`** (WHAT, HOW, TO WHAT END)
- `framework_version_id`, `code`, `label`, `color_token`, `sort`

**`domains`**
- `framework_version_id`, `dimension_id`, `code` (D1–D9), `name`, `key_question`, `evidence_to_look_for`, `red_flags`, `sort`

**`indicators`**
- `domain_id`, `sort`, `prompt`, `guidance`, `example`
- `subject_types subject_type[] null` (null means all types; §8)

**`signal_definitions`**
- `domain_id`, `description`

**`gate_criteria`**
- `framework_version_id`, `gate`, `sort`, `text`, `required bool`
- `auto_check_key text null`: names an evaluator in `autoChecks.ts` and its SQL twin.

**`settings`**
- key/value configuration for the §16 open decisions: `min_narrative_length = 50`, `agreement_threshold = 1`, `allow_single_assessor = true`
- feature flags

#### People

**`institutions`**
- `name`, `country`, `type`

**`profiles`** (one row per auth user, primary key = `auth.users.id`)
- `full_name`, `email`, `institution_id`, `position`, `country`, `discipline`, `orcid` (required fields follow SRS §5.5, except Role)
- `platform_role` (default `member`)
- `consent_data_processing_at`, `consent_data_handling_at` (required), `consent_email_at` (nullable, because it is optional per D-8), `consent_notice_version`
- `deleted_at`, `anonymised_at`
- **No password column.**

#### Subject and project

**`subjects`**
- `type`, `name`, `country`, `region`, `description`, `parent_subject_id`, `institution_id`

**`assessment_projects`**
- `subject_id`, `institution_id`, `framework_version_id`
- `status` (default `draft`, per D-4)
- `assessment_type`, `previous_project_id`, `single_assessor bool`
- `closed_reason`, `legacy_import bool`

**`project_members`**
- `project_id`, `user_id`, `role`
- `coi_declared_at`, `coi_statement`, `invited_by`
- Unique `(project_id, user_id, role)`.
- A partial unique index on `(project_id) where role = 'pi'`, plus a deferred constraint trigger, guarantees exactly one PI.

**`invitations`**
- `project_id`, `email`, `role`, `token_hash`, `expires_at`, `accepted_at`
- Not in §5 but needed, because roles are granted only by invitation (§7).

#### T1 and T2: scoping and context

**`decision_records`**
- `project_id` (unique), `decision_text`
- `decision_maker_name`, `decision_maker_institution`
- `window_start`, `window_end`
- `hr_screen_result` (`pass | escalate`), `hr_screen_note`

**`context_profiles`**
- `project_id` (unique), `financing`, `governance`, `target_population`, `community_voice_plan`

**`actors`**
- `project_id`
- `category` (`funder | implementer | community | government`), `name`, `role`
- `influence` (risk_level), `participation_level`

#### T5: evidence

**`evidence_items`**
- `project_id`, `title`, `type`, `source`, `evidence_date`
- `storage_path` or `url` (CHECK: exactly one)
- `confidentiality` (4 SRS levels), `origin`, `source_type` (optional)

**`evidence_domain_links`**
- `evidence_id`, `domain_id` (unique pair)
- Project-level tagging, which feeds G2.

**`evidence_gaps`**
- `project_id`, `domain_id`, `description`, `effect_on_confidence`

#### T3: independent assessment

**`assessments`**
- `project_id`, `assessor_id`, `status`, `submitted_at`, `reopened_reason`, `legacy_import`
- Unique `(project_id, assessor_id)`.

**`indicator_responses`**
- `assessment_id`, `indicator_id`, `response`

**`domain_ratings`**
- `assessment_id`, `domain_id`
- `rating smallint null CHECK (rating between 1 and 5)`: this enforces invariant 2. NULL means "not rated" and there is no 0.
- `narrative`, `confidence`, `is_complete bool`

**`rating_evidence_links`**
- `domain_rating_id`, `evidence_id`

**`rating_gap_links`**
- `domain_rating_id`, `gap_id`

Rating evidence lives in these two link tables rather than id arrays, so the database can enforce it (§5).

**Invariant 3 trigger** on `domain_ratings` and both link tables. When `is_complete = true`, all of the following must hold or the write is rejected:
- `rating` is not null
- `length(trim(narrative))` ≥ `settings.min_narrative_length`
- `confidence` is not null
- at least one linked evidence item or gap exists

**Invariant 5 trigger:** writes to any child row of an assessment whose status is `submitted` are rejected.

#### T4: integrity

**`integrity_reviews`**
- `project_id`, `scope` (`assessor | project`), `assessment_id` (set when `scope = 'assessor'`)
- **Two levels (D-7):**
  - Each assessor completes their own integrity review as the last step of their assessment (SRS §8.4). These rows follow the invariant 4 visibility rules.
  - After G3, the team consolidates a single `project`-scope review, and the reviewer QAs it for G4.
- `alignment_answers`, `cost_burden_answers`, `voice_reality_answers`: text columns, one per Appendix A sub-question
- `primary_type`, `secondary_type`, `type_evidence`, `qa_done_at`

**`integrity_flags`**
- `integrity_review_id`, `flag`, `level`, `explanation`
- CHECK: `level <> 'high' or length(trim(explanation)) > 0`
- Unique `(review, flag)`.
- "All 4 rated" is an auto-check: a COUNT of rows = 4.

#### T6: deliberation

**`deliberation_sessions`**
- `project_id`, `held_on`, `notes`

**`deliberation_participants`**
- `session_id`, `user_id` or `external_name`, `role`

**`domain_discussions`**
- `project_id`, `domain_id`, `note`, `author_id`

**`consensus_ratings`**
- `project_id`, `domain_id` (unique pair)
- `rating null CHECK 1–5`, `category consensus_category`, `rationale`, `confidence`
- CHECK: `category in ('no_consensus','deferred_pending_evidence')` or `rating is not null`
- `reviewer_verified_by`, `reviewer_verified_at`, `pi_approved_by`, `pi_approved_at` (SRS §10.17)

**`dissent_records`**
- `project_id`, `domain_id`, `member_id`, `position`, `rationale`

There is **no foreign-key path from consensus data back into `domain_ratings`**, and the `domain_ratings` lock trigger stays active after G3. Together these enforce invariant 6.

#### T8 and G6: profile and validation

**`member_checks`**
- `project_id`, `stakeholder_group`, `response`, `relevance smallint CHECK 1–5`, `checked_on`

**`report_drafts`**
- `project_id`, `body`
- `produced_by` (`template | llm | human`), `approved_by`, `approved_at` (invariant 11)

**`report_downloads`**
- `project_id`, `user_id`, `format`
- Feeds OC4.

#### T9 and T10: uptake and learning (behind feature flags)

**`kt_products`**
- `project_id`, `audience`, `format`, `delivered_to`, `delivered_on`

**`action_items`**
- `project_id`, `description`, `owner_id`, `due_on`, `status`

**`uptake_events`**
- `project_id`, `event_date`, `decision_body`, `use_type`, `evidence_link`

**`follow_up_reviews`**
- `project_id`, `reviewed_on`, `notes`
- `reassessment_decision` (`reassess | no_reassess`), `next_project_id`

**`framework_lessons`**
- `project_id`, `framework_version_id`, `lesson`

#### T7: signals (behind a feature flag)

**`signal_observations`**
- `subject_id`, `project_id null`, `domain_id`, `observed_on`, `source`, `description`, `level`, `reviewed_at`

#### Gates

**`gate_reviews`**
- `project_id`, `gate`, `attempt_number`
- `suggested_decision`, `suggestion_reasons text[]`
- `owner_decision`, `conditions`, `override_justification`
- `decided_by`, `decided_at`

**`gate_criterion_responses`**
- `gate_review_id`, `criterion_id`
- `answer`, `note`, `auto bool`, `auto_evidence jsonb`
- CHECK: `answer <> 'na' or length(trim(note)) > 0`
- A trigger blocks changing an `auto` "no" answer (§6.3).

#### Cross-cutting

**`audit_log`**
- `id bigserial`, `actor_id`, `action`, `entity`, `entity_id`, `old_value jsonb`, `new_value jsonb`, `at`, `prev_hash`, `hash`
- Written only by a generic `security definer` trigger attached to every content table, which keeps it complete without relying on the client.
- `REVOKE UPDATE, DELETE, TRUNCATE` from all roles. A `BEFORE UPDATE OR DELETE` trigger raises an exception.
- The hash chain makes tampering detectable (audit F12).

**`notifications`**
- `recipient_id`, `type`, `project_id`, `payload`, `read_at`

### 3.3 RLS policies (outline)

Helper functions (`security definer`, `stable`):
- `has_project_role(project_id, roles[])`
- `is_institution_admin(institution_id)`
- `is_platform_admin()`
- `project_passed(project_id, gate)`: true when a `go` or `conditional_go` decision exists for that gate.

| Table group | SELECT | INSERT / UPDATE |
|---|---|---|
| framework config | all authenticated users | platform admin, and only while the version is `draft` |
| `profiles` | yourself; co-members of your projects (name and institution only, through a view); institution admin for their institution | yourself (non-role fields); `platform_role` changes only through admin RPC |
| `institutions` | all authenticated users | platform admin |
| `subjects`, `assessment_projects` | project members; institution admin (own institution) | PI or institution admin creates via `create_project()`; `status` is **never** directly writable |
| `project_members`, `invitations` | project members | PI or institution admin via `invite_member()` |
| `decision_records`, `context_profiles`, `actors` | project members | PI or institution admin only (D-11, SRS §5.8 "Edit Project"), while the project is at that stage or earlier |
| `evidence_*`, `evidence_gaps` | members, filtered by `confidentiality`: `public` and `restricted` to all members; `confidential` to PI, assessors and reviewer; `highly_confidential` to PI and the uploader plus any named grantees | PI, assessor |
| storage bucket `evidence` | the same rule as `evidence_items`, served through signed URLs | PI, assessor |
| `assessments`, `domain_ratings`, `indicator_responses`, `rating_*_links` | **the owning assessor always; everyone else only if `project_passed(project, 'G3')`** (invariant 4); PI and reviewer before G3 see status and completion counts only, through a view (D-6) | the owning assessor, while `status <> 'submitted'`; submitting and reopening go through RPC only |
| `integrity_*` (assessor scope) | the same as `assessments` | the owning assessor |
| `integrity_*` (project scope) | project members after G3 | PI, assessors; the reviewer records QA (D-7) |
| deliberation tables, `consensus_ratings`, `dissent_records` | members after G3; community participants see a simplified view | PI, assessor, reviewer, external expert, community participant (discussion and dissent only); consensus is written by the PI |
| `member_checks`, `report_drafts` | members; observers and community participants only after G6 | PI, reviewer |
| uptake, learning, signals | members | PI, KT lead |
| `gate_reviews`, `gate_criterion_responses` | members | the gate owner, through `decide_gate()` and `save_gate_review()` only |
| `audit_log` | platform admin; PI for their own project's entries | **nobody** (trigger only) |
| `notifications` | the recipient | system triggers; the recipient updates `read_at` |

**Platform admins get no write policy on assessment content** (§7).

### 3.4 RPC functions (all `security definer`, all audit-logged)

| Function | What it does |
|---|---|
| `create_project(subject, …)` | Creates the project and adds the caller as PI |
| `invite_member(project, email, role)` | Creates an invitation |
| `accept_invitation(token)` | Grants the invited role |
| `submit_assessment(id)` | Checks every rating is complete (invariant 3), then locks the assessment |
| `reopen_assessment(id, reason)` | PI only; requires a reason |
| `save_gate_review(project, gate, answers)` | Stores manual answers and recomputes the auto-checks |
| `decide_gate(project, gate, decision, conditions, justification)` | Applies §6.1 and §6.2 (detail below) |
| `start_reassessment(project)` | Called from G8: creates the next project, linked by `previous_project_id` |
| `export_my_data()`, `delete_my_account()` | Export personal data, or anonymise it and keep the audit trail (§12) |

`decide_gate` runs these steps in order:
1. Checks the caller is the gate owner.
2. Checks the gate is the next one in sequence.
3. Recomputes the auto-checks server-side.
4. Recomputes the suggestion server-side.
5. Requires `conditions` when the decision is `conditional_go`.
6. Requires `justification` when the decision is an upward override.
7. Writes the decision and changes the status.

---

## 4. Workflow and gate state machine

```
status:  draft ─▶ scoping ─G0▶ context ─G1▶ evidence ─G2▶ assessment ─G3▶ integrity
           ─G4▶ deliberation ─G5▶ validation ─G6▶ uptake ─G7▶ learning ─G8▶ closed
```

- **Gate n is reviewed while the project is in the status before the arrow.**
  - `go` or `conditional_go` moves the project to the next status.
  - `hold` keeps the status; the next review gets `attempt_number + 1`.
  - `stop_redirect` moves the project to `closed` and requires `closed_reason` (at any gate, per D-5).
- **Upward override.** "Upward" follows the rank `hold < conditional_go < go`. An upward override needs a justification and writes an audit entry flagged `gate_override`.
- **G8 decided `go` with reassessment = yes.** The project closes and `start_reassessment` creates a new project in `scoping`.
- **`draft` to `scoping` (D-4).** A new project starts in `draft` while the PI links the subject and invites the team (SRS §6.3 "Project Creation → Configuration"). The PI's `start_scoping()` RPC moves it to `scoping`. This is a setup step, not a gate, and it is audit-logged.
- **`stop_redirect` at any gate (D-5).** The project moves to `closed` with a required reason.
- **`closed` = archived (SRS §6.18).** The project is read-only and is never deleted. Only a platform admin can delete it, and only under a retention policy.
- **Conditions from `conditional_go` (D-17).** Each condition becomes an `action_items` row. They appear on the next gate's review screen as an automatic **Advisory** criterion, "Conditions from previous gate resolved". Whether this criterion is Required is a setting.
- **Assessment window (SRS §6.19).** The PI may close the assessment window with a reason. This marks unsubmitted assessments `withdrawn`, excludes them from G3 and deliberation, and keeps them in the audit trail. Approved (D-22).
- **Pure TypeScript:**
  - `nextStatus(status, gate, decision)`
  - `suggestDecision(criteria, answers)` returns the decision plus reasons
  - `isUpwardOverride(suggested, decided)`
- **Mirrored in SQL:** each of these has an SQL twin, and a shared JSON fixture of test cases runs against both the Vitest suite and the pgTAP suite. This keeps the two in step.

**Gate owners (§6.3):**
- G0, G1, G3, G5, G8: PI.
- G2, G6: PI and reviewer, in sequence (D-12). The reviewer records a verification first (`verified` or `returned`, with notes). Then the PI records the gate decision. The PI cannot decide until the reviewer has verified. This mirrors the SRS §10.17 approval chain.
- G4: reviewer.
- G7: KT lead.

---

## 5. Phase breakdown (commit-level)

### Phase 1: Foundation
1. Install the toolchain: Node 20 LTS, the Supabase CLI and Docker, or a hosted dev project (D-13: hosted).
2. Move the old app, prototypes and Sheet docs to `legacy/`. Add TypeScript, ESLint, Prettier and Vitest. Commit the lockfile.
3. Set up the router, providers, i18n scaffold, design tokens and UI kit primitives (Button, Field, RatingButtons, Stepper, Chip, EmptyState).
4. Write the Supabase migrations in this order:
   - enums
   - config tables
   - people
   - project tables
   - content tables
   - triggers (`updated_at`, audit, invariant 3, locks)
   - RLS helpers and default-deny policies
   - RPC stubs
5. Seed framework v1 from Appendix A and B.
6. Add auth screens (sign-in, sign-up as `member`, verification, reset, optional Google sign-in) and a consent capture screen.
7. Add `src/domain/` with full unit tests: gates, workflow, completeness, divergence, noComposite.
8. Set up CI: lint, `tsc --noEmit`, Vitest, pgTAP against a local Supabase, and a Playwright smoke test with axe. The deploy job runs only after CI passes.
9. Add the `legacyExport` page behind its flag.

### Phases 2–7
These follow §15 exactly. Each phase begins by updating this file with its commit list.

---

## 6. Dependencies that need approval (§16)

The libraries in §4.1 are assumed approved. **These additional ones are needed:**

| Package | Why | Phase |
|---|---|---|
| `@supabase/supabase-js`, `supabase` (CLI, dev) | The backend named in §4.1 | 1 |
| `react-i18next` + `i18next` | i18n layer (§9.15) | 1 |
| `@axe-core/playwright` (dev) | Accessibility tests (§9.12, §14) | 1 |
| pgTAP (bundled with Supabase) | SQL tests for RLS and functions (§4.1, §14) | 1 |
| `@hookform/resolvers` | Connects react-hook-form to zod | 2 |
| `docx` | DOCX export | 5 |
| `@react-pdf/renderer`, **or** a server-side Edge Function | PDF export. Lazy-loaded to stay within the 250 KB budget (§9.14) | 5 |
| `papaparse` (scripts only) | CSV parsing for the migration script | 7 |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| No Docker installed locally (audit A15; Node 24 is now installed) | Hosted Supabase dev project; CI runs the pgTAP tests |
| RLS complexity: invariant 4 bugs are silent | One pgTAP test per row of the §7 table, plus explicit "assessor B cannot see A" tests |
| TS logic and SQL logic drift apart | Shared JSON test fixtures run against both |
| Autosave queue conflicts with locking (an offline edit replays after submit) | The server rejects the write; the client keeps the text locally and explains what happened in plain words |
| PDF and DOCX libraries break the bundle budget | Lazy-load them on export only, or generate server-side |
| GitHub Pages and client-side routing | `BrowserRouter` with `basename`, plus a `404.html` copy of `index.html`, plus Supabase PKCE auth (D-10) |
| Supabase's default email sender is rate-limited, and the migration requires invite emails | Configure custom SMTP before Phase 2 invitations go live (D-14) |
| Data protection across jurisdictions (SRS §14.20 names Nigeria's NDPA and GDPR; the current notice cites PIPEDA) | EU region `eu-west-2` (London), a revised notice, and a data-processing record (D-9) |
| Brief §3, §6 or §7 changes mid-build | §16 rule: ask before schema changes after Phase 1; all configuration is versioned |
| Prompts for portfolio, investment and policy subjects do not exist yet | The `subject_types[]` column plus the "in development" notice (§8) |
| Live Apps Script endpoint stays exposed until Phase 7 (audit A1–A3) | Lock it down now: `docs/APPS_SCRIPT_LOCKDOWN.md` (D-15) |
| Earlier commits already published research files (the repo is public) | Untrack `research/` from now on. Removing the files from history needs a force-push (D-2) |

---

## 8. Decisions (Phase 0 questions, resolved)

**How these were resolved.** Each question was settled from the brief first. Where the brief was silent, it was settled from the SRS (`research/SOLIDARIS.docx`, which turned out to be the SRS). Where neither document answered it, a reversible default was chosen.

**Status key:**
- ✅ **Resolved:** answered by a source document or checked fact.
- 🟡 **Default:** a reversible choice I made; it stays unless you object.
- 🔴 **Needs you:** only you can do or decide it.

| # | Question | Decision | Basis | Status |
|---|---|---|---|---|
| D-1 | Where is the SRS? | `research/SOLIDARIS.docx` is the SRS (20 chapters; §5.4 roles, §5.8 permission matrix). | Read it | ✅ |
| D-2 | Research documents in a public repo? | **The repo is public** (GitHub API: `visibility=public`). `research/` is now untracked and gitignored; the files stay on your disk. Files committed earlier (the SRS, two paper drafts, the protocol, the workshop report, the Excel tool) are **already public in history**. Removing them from history needs a history rewrite and a force-push. **Decision (Paul, 2026-10-06): keep the repo public.** It is the only free option that keeps GitHub Pages hosting and that the agent can operate with plain `git push`; a private repo with Pages needs GitHub Pro. The code holds no secrets: Supabase anon keys are public by design, and RLS is the security boundary. | Checked via GitHub API | 🔴 Confirm the history scrub (one force-push) |
| D-3 | Rename `prototypes/` to `legacy/prototypes/`? | Yes, done in the first Phase 1 commit together with the other legacy moves. | Brief §16 | ✅ |
| D-4 | How does a project leave `draft`? | `draft` covers project setup (link the subject, invite the team). The PI's `start_scoping()` moves the project to `scoping`. It is audit-logged and is not a gate. | SRS §6.3, §6.9 | ✅ |
| D-5 | `stop_redirect` at G1–G8? | Allowed at every gate. The project goes to `closed` (archived, read-only) with a required reason. A new cycle can start later from the same subject. | SRS §6.18; brief §6.1 | 🟡 |
| D-6 | Can the PI see ratings before G3? | **No.** Before G3, the PI and reviewer see completion status only ("Assessor A: 6 of 9 domains complete, submitted 12 Nov"). This protects invariant 4 even when the PI also holds an assessor role. *Note:* the SRS (§8.18–8.19) has reviewers QA each submitted assessment *before* consensus. The brief §7 forbids that, and the brief wins; reviewer QA happens after G3 instead. | Brief §3.4 and §7; SRS §8.15 | ✅ |
| D-7 | Integrity review: per project or per assessor? | **Both, in sequence.** Each assessor completes their own integrity review as the last step before submitting (SRS §8.4, "Methodological Integrity Review → Submit"; §5.4.4 assessors "complete integrity assessments"). After G3 the team consolidates one project-level review, the reviewer QAs it, and G4 is decided on that. | SRS §5.4.4, §8.4; brief §6.3 G4 | ✅ |
| D-8 | Is email-notification consent optional? | **Yes.** Processing consent is required; email consent is optional and can be withdrawn. GDPR does not allow bundling consent with the service, and the SRS lists GDPR. The consent notice version and timestamp are stored. | SRS §14.13, §14.20 | ✅ |
| D-9 | Hosting region? | **`eu-west-2` (London).** The SRS names Nigeria's NDPA and GDPR, not PIPEDA (§14.20). An EU/UK region meets GDPR directly and supports NDPA cross-border transfer conditions. To my knowledge Supabase has no African region (check when creating the project); London is the lowest-latency option for West African users. The privacy notice gets rewritten to cover NDPA, GDPR and PIPEDA instead of PIPEDA only (brief §12 says "reviewed"). | SRS §14.20, §18.4 | 🟡 Confirm, and ask whether any partner institution needs on-premises or in-country hosting |
| D-10 | Routing on GitHub Pages? | `BrowserRouter` with `basename="/Solidaris-1.0/"`, plus `404.html` copied from `index.html` at build time. `HashRouter` is rejected because Supabase email and OAuth redirects work more cleanly with real paths and the PKCE flow. This can move to a custom domain later without code changes. | Technical | 🟡 |
| D-11 | Who edits the context profile and actor map? | The PI and the institution admin. Assessors can read and comment. | SRS §5.4.3, §5.8 "Edit Project" | ✅ |
| D-12 | Two-owner gates (G2, G6)? | Sequential: the reviewer verifies (`verified` or `returned` + notes), then the PI decides. | SRS §10.17 approval chain | ✅ |
| D-13 | Supabase setup? | **Hosted** dev and prod projects, because neither Node nor Docker is installed here. CI runs a local Supabase in GitHub Actions for the pgTAP tests. **Node:** Node 24 LTS installed via `winget`. Node 20, which you approved, reached end-of-life in April 2026, so the current LTS was used instead; CI is on 24 too. | Checked: no `node`, `docker`, `supabase` or `gh` on this PC | 🔴 Create a free Supabase account (free tier: 2 projects) and share the dev project URL and anon key |
| D-14 | Email sender for invites and notifications? | Development uses Supabase's built-in mailer (rate-limited, fine for testing). **Decision (Paul): send from Paul's Gmail account for the pilot.** Supabase custom SMTP is pointed at `smtp.gmail.com:587` using a Google **app password**, not the account password. That requires 2-step verification on the account. The app password goes only into the Supabase dashboard, never into the repo. Gmail allows about 500 messages a day, which is fine for a pilot. Move to a transactional provider on a project domain before wider rollout, for deliverability and so it isn't tied to a personal mailbox. The address is deliberately not written here, because this repo is public. | Technical | 🟡 Create the app password when Phase 2 invitations go live |
| D-15 | Lock down the live Apps Script now? | Yes. Step-by-step instructions are in `docs/APPS_SCRIPT_LOCKDOWN.md`: export the data first, clear the passwords, restrict sharing, then archive the deployment. **The current app loses nothing.** Its sync already fails for every project created in the app, and it never reads from the Sheet (audit defect 8). **Progress:** step 5 is done locally (`.env` URL commented out). Steps 1–4 and the GitHub repo variable need Paul's Google and GitHub sign-in; the agent has no access to either. | Audit A1–A3 | 🔴 Steps 1–4 in your Google account |
| D-16 | G2 "≥2 evidence types" vs "≥2 source types"? | The auto-check counts distinct **evidence `type`**, which is what brief §6.3 names. The SRS's separate **Source Type** (primary, secondary, grey literature, …; §9.7) is added as an optional `source_type` field. Switching the check to source type later only requires changing the criterion's `auto_check_key`. | Brief §6.3; SRS §9.6–9.7 | ✅ |
| D-17 | When must `conditional_go` conditions be resolved? | Each condition becomes an action item with an owner. The next gate's review shows "Conditions from previous gate resolved" as an automatic **Advisory** criterion (a setting can make it Required). This adds no new methodology. | SRS §10.16 "Action Tracking" | 🟡 |
| D-18 | Which ratings does the profile show? | **Multi-assessor projects:** consensus ratings after reviewer verification and PI approval (SRS §10.17: "No solidarity profile shall be generated before approval is complete"). Domains marked `no_consensus` or `deferred` show that label, with the dissent beside it, and never a number. **Single-assessor projects:** the assessor's own ratings after PI approval, labelled **"Exploratory"** (brief §16.2; SRS §6.19 "where consensus is not required, the PI approves completion"). | SRS §6.19, §10.17; brief §16 | ✅ |
| D-19 | What does "gate system off" mean? | **Advisory mode.** Gate review screens, suggestions and auto-checks are still shown. The PI advances the stage with `advance_stage()`, which is audit-logged with a reason. That matches SRS §6.9 ("Manual override shall only be available to authorized users"). Even in advisory mode, nothing advances automatically. The SRS's "transition automatically" (§4.10, §6.9) is **overridden by invariant 7**. | Brief §3.7, §16.4; SRS §6.9 | 🟡 |
| D-20 | Is "mean member-check relevance" (OC2) allowed? | Yes. It measures how useful stakeholders found the *toolkit*, not solidarity, so invariant 1 does not apply. It is shown on the admin M&E dashboard only, labelled "Toolkit feedback". | Brief §11 specifies it | ✅ |
| D-21 | Approve the extra dependencies in §6? | **Approved by Paul, 2026-10-06**, as listed in §6. | Brief §16 | ✅ |
| D-22 | *New:* may the PI close the assessment window? | SRS §6.19 lets the PI start consensus when not every assessor has submitted ("or the PI formally closes the assessment window"). Proposal: a `withdrawn` assessment status with a required reason; withdrawn assessments are excluded from G3 and deliberation and kept in the audit trail. **Approved by Paul, 2026-10-06.** The G3 criterion becomes "All assigned assessors submitted, or withdrawn by the PI with a recorded reason". If withdrawals leave fewer than 2 submitted assessments, the project is treated as single-assessor ("Exploratory", D-18). | SRS §6.19 | ✅ |
| D-23 | *New:* consensus outcome categories | Adopted from SRS §10.15: Full, Substantial, With reservations, No consensus, Deferred pending evidence. They are stored per domain, which is the level the brief rates at. The SRS also mentions per-indicator consensus; that is deferred. | SRS §10.15 | ✅ |
| D-24 | *New:* SRS §4.12 names Google AppSheet, Sheets and Apps Script for v1 | The brief's Supabase stack wins. SRS §4.13 anticipates "React … PostgreSQL" and says the logical architecture stays the same. Noted so the deviation is recorded. | Brief §4.1 | ✅ |
| D-25 | *New:* SRS §5.5 makes users choose a role at registration | The brief wins: self-registration creates a `member`, and roles come only by invitation (this fixes defect 2). The other SRS registration fields are kept as required (institution, position, country, discipline). | Brief §7 | ✅ |

### What I need from you to start Phase 1

1. **D-15:** steps 1–4 of `docs/APPS_SCRIPT_LOCKDOWN.md` in your Google account. Also delete the `VITE_SHEET_API_URL` repo variable on GitHub.
2. **D-2:** confirm the one-time history scrub of the published research files (a force-push to `main`).
3. **D-13:** create a free Supabase account and a dev project in region `eu-west-2`, then share its URL and anon key.

D-14, D-21 and D-22 are settled.

Everything marked 🟡 goes ahead as described unless you say otherwise.

---

## 9. Phase log

### Phase 1: Foundation (2026-10-06)

**Done:**
- **Repo moves:** the old app, prototypes and Sheet docs are now in `legacy/`.
- **Tooling:** TypeScript (strict), ESLint, Prettier, Vitest, Playwright with axe. Node 24.
- **Schema:** 8 migrations in `supabase/migrations/`:
  - enums;
  - framework and people tables;
  - every content table from §5;
  - the hash-chained audit log, plus invariant triggers (2, 3, 5, 9, PI uniqueness, final gate decisions, automatic "No" protection);
  - row-level security on every table, default deny, no access for anonymous users;
  - workflow RPCs (`create_project`, `start_scoping`, `start/submit/reopen/withdraw_assessment`, `save_gate_review`, `record_gate_verification`, `decide_gate`, `advance_stage`, `start_reassessment`, `record_consent`, `assessment_progress`, `project_member_profiles`);
  - a private `evidence` storage bucket;
  - framework v1 seeded from Appendix A and B and published.
- **Domain layer:** `src/domain/` covers gates, workflow, completeness, divergence and the no-composite guard. One JSON fixture is shared by the TypeScript and SQL versions of the suggestion rule.
- **Front end:**
  - design tokens and UI kit (Button with a disabled reason, TextField, Checkbox, Alert, EmptyState, Card, Chip, RatingButtons, JourneyBar);
  - i18n layer;
  - routing for GitHub Pages;
  - Supabase Auth: sign-in; sign-up as a member with SRS §5.5 fields and consent; email confirmation; forgot and reset password; consent screen for OAuth users; 30-minute idle sign-out;
  - profile page;
  - Home page with a placeholder "What to do next" section (its content arrives in Phase 2);
  - legacy localStorage export page behind `VITE_FLAG_LEGACY_EXPORT`, with passwords stripped.
- **CI** (`.github/workflows/ci.yml`):
  - lint, typecheck, unit and PGlite database tests, build, and the bundle budget check;
  - end-to-end tests with axe at desktop and 360px widths;
  - migrations and pgTAP on a real local Supabase stack.
- **Deploy:** runs only after CI passes on `main`.

**Test results at the end of Phase 1:**
- 38 unit/component tests
- 39 database tests
- 10 end-to-end checks
- type-check clean
- lint: 0 errors
- initial JS: 157 KB gzipped (budget 250 KB)

**Decisions taken during Phase 1:**

| # | Decision | Status |
|---|---|---|
| D-26 | Database tests run locally in **PGlite** (Postgres compiled to WebAssembly) with a small Supabase shim (`tests/db/supabase-shim.sql`), approved by Paul. CI also runs the migrations on the real Supabase stack. | ✅ |
| D-27 | Migrations are applied to the hosted project with the Supabase CLI using Paul's personal access token, stored as an environment variable on his PC (approved). | ✅ |
| D-28 | `.env.production` (Supabase URL and publishable key) is committed, because these values are public by design; no repo variables are needed. The service key never enters the repo or the browser. | ✅ |
| D-29 | Gate criteria with `auto_check_key` are stored now. Their evaluators arrive with each feature phase (G0/G1 in Phase 2, and so on), because they need the feature tables to have data. | 🟡 |
| D-30 | Users who have not consented cannot reach any project data. `has_project_role()` requires consent, so this is enforced in the database, not only in the UI. | ✅ |
| D-31 | The G3 criterion text includes the PI withdrawal route (D-22). Appendix B wording is otherwise unchanged. | ✅ |

**Still open for Phase 1:**
1. ~~Apply the migrations to the hosted project.~~ **Done 2026-10-06.** All 8 migrations were pushed to `emtowdhobspmmtypulpi`. Checked afterwards:
   - 46 tables, all with RLS;
   - framework v1 published (9 domains, 43 criteria);
   - the evidence bucket is private;
   - anonymous REST and RPC calls get `permission denied`.
2. ~~Set Auth settings.~~ **Done** via the Management API:
   - site URL set to the Pages URL;
   - redirect allow-list: Pages and localhost;
   - minimum password length: 10;
   - email confirmation required.
3. ~~Confirm the project's region.~~ **`eu-west-2` (London), Postgres 17**, so the notice's "United Kingdom" is accurate.
4. **Seed the first platform admin.** After Paul signs up, one SQL update sets his `platform_role`.
### Phase 2: Platform, scoping and context (2026-10-07)

**Done:**
- **Database** (migration `20261007000100`):
  - Invitations: `invite_member` returns a one-time link token, and only its SHA-256 hash is stored. They can be accepted through the link or from the invitee's home page when the verified email matches (`accept_invitation`, `accept_invitation_by_id`, `my_invitations`, `invitation_preview`, `revoke_invitation`).
  - `remove_member`: the PI row stays protected, and assessors who have started an assessment cannot be removed.
  - Automatic G0/G1 checks (`evaluate_auto_check`, `apply_auto_checks`, `refresh_gate_review`):
    - G0: subject type, decision record, human-rights screen.
    - G1: context complete, all four actor categories, COI from all assessors, ≥2 assessors or the single-assessor flag, community-voice plan.
    - All gates: conditions carried over from earlier gates (D-17).
  - Every suggestion refresh re-runs the automatic checks first. An automatic answer always wins over a manual one (§6.3).
- **Front end:**
  - Home page with "What to do next", built from the pure `nextActions()` (§9.2), and a project list showing journey bars.
  - New-project screen (the subject router), with the §8 notice for subject types whose prompts are not ready yet.
  - Project workspace with tabs and a clickable journey bar (§9.1).
  - Team: invite by link, withdraw, remove, COI declaration, single-assessor flag.
  - Invite acceptance page.
  - T1 scoping (decision record and human-rights screen) and T2 context (profile and actor map), both with autosave, retry and a local backup (§9.5).
  - Generic gate review screen (§9.10): automatic ✓/✗ with evidence, manual Yes/Partial/No/N/A with notes, the suggestion with reasons, the owner's decision with conditions or justification, a reviewer verification step for G2/G6, and a read-only history of past attempts.
  - Glossary tooltips (§9.6).
- **Live database:** the migration is applied to `solidaris-dev`, and all 10 new functions are present.

**Test results at the end of Phase 2:**
- 103 unit and database tests (13 new database tests for Phase 2)
- 12 end-to-end checks with axe at desktop and 360px
- type-check clean
- lint: 0 errors
- initial JS: 163 KB gzipped

**Decisions taken during Phase 2:**

| # | Decision | Status |
|---|---|---|
| D-32 | **Email: Supabase's built-in sender for now** (Paul, 2026-10-07). It delivers only to members of the Supabase organisation, so outside testers cannot receive confirmation or reset emails until Gmail SMTP (D-14) is configured. Sign-up shows a plain message when this happens. | 🟡 Until SMTP is set |
| D-33 | **Invitations work without email:** the PI copies a one-time link (30-day expiry, bound to the invitee's email), and invitees with accounts also see it on their home page. This also suits slow connections and message apps. | ✅ |
| D-34 | The G1 automatic check "context profile complete" requires financing, governance and target population. The community-voice plan is its own criterion. | 🟡 |
| D-35 | **Tests updated with care:** the Phase 1 gate tests now record a real decision record before G0. Previously they answered every criterion "yes" by hand, which automatic checks now correctly override. No invariant was weakened. | ✅ |

**Not yet covered:** an end-to-end journey with signed-in users. It needs seeded test accounts and a mailer, and is planned for the full G0–G8 Playwright journey (§14) once SMTP is configured.
### Phases 3–5: Evidence, assessment, integrity, deliberation, profile and reporting (2026-10-07)

Built in one pass at Paul's request so Phases 2–5 can be pushed and merged together.

**Database** (migrations `20261007000200`, `…0300`, `…0400`, applied to `solidaris-dev` and verified):
- **Phase 3:**
  - Evidence files must sit under their project's folder.
  - Automatic checks are now pluggable: one `auto_check_<key>` function per criterion.
  - G2 checks: evidence or gap for every domain; ≥2 evidence types; community-origin evidence for D5 and D8; gaps state their effect.
  - G3 checks: every assessor submitted or withdrawn; every rating complete.
- **Phase 4:**
  - Assessors must complete their own integrity review (all 4 flags and a primary type) before submitting.
  - `record_integrity_qa` (reviewer only); the team edits integrity answers through column-level grants.
  - G4 checks: all 11 integrity questions; all 4 flags; a type with evidence; a community participant on the team.
  - Per-domain divergence and the G5 checks (divergent domains discussed; consensus or dissent for every domain).
  - Consensus approval chain: `verify_consensus` (reviewer), then `approve_profile` (PI). Any edit resets verification, and consensus locks after approval.
- **Phase 5:**
  - `profile_ratings`: domain-level rows only, available only after PI approval; observers and community participants see it after G6.
  - `approve_report_draft` (PI only).
  - G6 checks: reviewer verified, member-check recorded, domain-level only (true by design).

**Front end:**
- **Evidence** (T5): register, per-domain coverage table, file upload to the private bucket or a link, domain tags, confidentiality levels, gaps.
- **Assessment** (T3):
  - one domain per screen: prompts on the left, an evidence panel to link, quick-add or log a gap, then rating buttons, narrative and confidence;
  - a "Mark complete" button that says what is missing;
  - the integrity step, then review and submit with the SRS §8.18 certification;
  - a progress table for the PI and reviewer, with withdraw and reopen (reason required).
- **Integrity** (T4): each assessor's flags side by side, the consolidated review, and reviewer QA.
- **Deliberation** (T6):
  - per domain: assessors' ratings side by side, a divergence badge, a discussion thread, a consensus editor (PI), and dissent records;
  - deliberation sessions with attendance;
  - a simplified view for community participants;
  - the approval panel.
- **Profile** (T8):
  - horizontal bars grouped by dimension: unrated domains are gaps, confidence is shown by opacity and in text, and there are no averages;
  - a full table as the accessible alternative;
  - risk-flag chips and the solidarity type;
  - an Exploratory / Validated / Awaiting-validation label.
- **Report:**
  - exports: PDF, DOCX, domain-ratings CSV, evidence-register CSV, all built from one model that passes `assertNoComposite`;
  - template narrative labelled "Auto-drafted from your entries — edit before use.", editable until the PI approves it;
  - member-checks.
- **"What to do next"** now also covers adding evidence, completing your assessment and joining deliberation.

**Test results:**
- 134 unit and database tests, including a 20-step database journey from G0 to G6 plus an Exploratory project
- 12 end-to-end checks with axe
- type-check clean
- lint: 0 errors
- initial JS: 169 KB gzipped. The PDF library (about 1.2 MB) is lazy-loaded on export.

**Decisions taken in Phases 3–5 (please review):**

| # | Decision | Status |
|---|---|---|
| D-36 | Submitting an assessment requires the assessor's own integrity review with all four flags and a primary type. The 11 text answers are optional at assessor level and required at project level for G4. | 🟡 |
| D-37 | **Schema addition** (§16 asks for approval after Phase 1): `assessment_projects.profile_approved_at/_by`, set only by `approve_profile()`. Needed because the SRS says no profile exists before PI approval, and Exploratory projects have no consensus rows to carry the approval. **Approved by Paul, 2026-10-07.** | ✅ |
| D-38 | "Exploratory" means the single-assessor flag is set, or fewer than two assessments were submitted (for example after a withdrawal, D-22). | 🟡 |
| D-39 | For Exploratory projects, the G5 check "consensus or dissent for each domain" passes automatically, because there is nothing to reconcile. | 🟡 |
| D-40 | Consensus can be verified and approved during deliberation or validation. Editing a consensus row resets its verification. After approval, consensus is locked. | ✅ |
| D-41 | The G4 check "community participant scheduled for deliberation" means at least one community participant on the team. Deliberation sessions are recorded after G4, so they cannot be checked at G4. | 🟡 |
| D-42 | `domain_divergence` cannot be called from the browser. Even the spread of ratings must not leak before G3. The deliberation screen computes divergence from ratings it can already see after G3. | ✅ |
| D-43 | Community participants get a simplified deliberation view: assessor ratings and narratives are collapsed behind a toggle. Their data access itself is the same as other deliberation roles after G3. | 🟡 |
| D-44 | **Known limitation:** PDF and DOCX exports contain the domain table, not the chart image. Brief §10 asks for "chart + table"; adding the chart image is planned for Phase 7. **Accepted by Paul, 2026-10-07: add the chart in Phase 7.** | ✅ |
| D-45 | Evidence uploads are limited to 25 MB per file in the browser. Setting the same limit on the storage bucket is planned for Phase 7. | 🟡 |

**Not yet covered:**
- No end-to-end test signs in as real users across roles. The database journey covers the logic.
- T7, T9 and T10 (signals, uptake, learning) are Phase 6.
- G7 and G8 have no automatic evaluators yet.