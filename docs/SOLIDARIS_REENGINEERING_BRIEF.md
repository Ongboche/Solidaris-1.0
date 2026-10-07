# SOLIDARIS — Re-engineering Brief for the AI Coding Agent 

> **How to use this file (for Paul — delete this box before committing if you wish)**
> 1. Save this file in the repo as `docs/SOLIDARIS_REENGINEERING_BRIEF.md`. Also save a copy as `.github/copilot-instructions.md` (Copilot reads that file automatically on every request).
> 2. Open VS Code → Copilot Chat → switch to **Agent** mode → choose the strongest model available.
> 3. Paste the **Kick-off message** at the bottom of this file. Work **one phase per session**. Review and test each phase before starting the next.
> 4. Do not let the agent skip Phase 0. The audit and plan are where most mistakes get caught.

---

## 1. Your role and mission

You are a senior full-stack engineer re-engineering **SOLIDARIS**, a research platform for assessing solidarity in global health subjects (projects, programmes, portfolios, investments and policies).

The current app is a single-user prototype. Rebuild it into a **multi-user, workflow-driven toolkit** with firm, server-enforced logic and a calm, very user-friendly interface. Users are researchers, ministry and insurance-agency staff, funders, implementers and community representatives. Many are not technical. Some work on slow connections.

The methodology is **fixed by the research team**. Your job is to implement it faithfully. Do not invent methodology, scoring or indicators. Where this brief is silent or ambiguous, **stop and ask** rather than guess.

---

## 2. Current state (what exists today)

**Stack:** React 18 + Vite 5 + Tailwind 3 + Recharts + lucide-react. JavaScript, no TypeScript, no tests, no router.

**Files that matter**
- `src/App.jsx`: about 1,100 lines. It holds every view (auth, dashboard, context, assess, profile, report), all state and all logic.
- `src/lib/db.js`: an in-browser "database" in `localStorage` (key `solidaris:db:v1`), with seeded demo users.
- `src/lib/sheetApi.js`: syncs to a Google Sheet through an Apps Script web app (`VITE_SHEET_API_URL`).
- `GOOGLE_SHEETS_SETUP.md`, `APPS_SCRIPT_FIX.md`: Apps Script code and setup.
- `solidaris_chrome.html`, `solidaris_demo.jsx`: older prototypes. Use them as **reference only**.

**Current data shape (one assessment per project)**
```
project.assessment.domains.d1..d9 = { rating 0-5, responses[3], evidenceType, evidenceSummary, confidence }
project.assessment.integrity = { alignmentContradiction, burdenBearer, voiceReality, washingRisk, powerRisk }
```

**Known defects you must fix (do not carry them forward)**

| # | Defect | Where |
|---|---|---|
| 1 | **Plaintext passwords** are stored in localStorage and in the Google Sheet. Sign-in sends the password in a **GET query string**. `getUsers` returns every user's password. The Apps Script is deployed to "Anyone". | `db.js`, `sheetApi.js`, Apps Script |
| 2 | **Users choose their own role at sign-up**, so anyone can become an "owner". | `AuthView`, `createUser` |
| 3 | **Composite scores contradict the methodology.** The dashboard shows an average out of 5 plus a progress bar, the profile shows triad averages, `calculateIndex()` returns a percentage index, and the "AI summary" reports an average domain score. | `DashboardView`, `ProfileView`, `calculateIndex`, `buildAiSummary` |
| 4 | **Unrated domains count as 0** and drag the averages down. | `average()` callers |
| 5 | **The "AI summary" is not AI.** It is a keyword count with templated sentences, and its interpretation thresholds come from the average. | `buildAiSummary` |
| 6 | **No assessor independence.** There is one shared assessment per project, so everyone edits the same ratings. | data model |
| 7 | **The integrity check is incomplete.** It has only 2 of the 4 risk flags (sustainability and inclusion are missing) and no solidarity-type classification. | integrity model |
| 8 | **Sync is fragile.** localStorage is the source of truth, every save pushes **all** projects to the Sheet, and nothing pulls back. This means last-write-wins data loss across browsers. | `persistDb` |
| 9 | **Completion means "evidence summary non-empty".** Rating, narrative and confidence are never checked. | `AssessView` |
| 10 | **Everything is in one file.** Logic is tangled with UI, nothing is tested, and the app has no workflow states. | `App.jsx` |

The Excel version of the tool has two related bugs (D2 and D3 read as 0; an overall average is shown). Your rebuild must make both kinds of error structurally impossible.

---

## 3. Non-negotiable methodological rules (invariants)

Enforce these **on the server and in the database** (constraints, row-level security, server functions). Mirror them in the UI. Each rule needs at least one automated test.

1. **Profiles, not scores.** Never compute, store, display or export an overall solidarity score, an index, a percentage, a dimension average, a ranking, a league table or star ratings. Domain-level ratings only. Descriptive counts are allowed (for example, "6 of 9 domains rated").
2. **Unrated is not zero.** A missing rating is `NULL` and displays as "Not rated". Ratings are integers 1–5 only.
3. **Evidence before judgement.** An indicator response cannot be marked complete unless it has all of the following:
   - a rating
   - a narrative justification (minimum length configurable, default 50 characters)
   - a confidence level (Low / Medium / High)
   - at least one linked evidence item **or** a documented evidence gap with its reason
4. **Independent assessment.** An assessor can never see another assessor's ratings or narratives until the project passes **G3**. Enforce this with row-level security, not UI hiding.
5. **Submitted means locked.** A submitted assessment is read-only. It can be reopened only by the PI, with a recorded reason, and the reopening is audit-logged.
6. **Dissent is preserved.** Consensus never overwrites or deletes the original independent assessments. Minority positions are stored with their rationale.
7. **Human decisions.** Gate decisions are made and recorded by the gate owner. The system may *suggest* a decision. It never auto-advances a gate.
8. **Full traceability.** Every create, update, submit, reopen and gate decision writes an **append-only audit log** entry: who, when, what, old value, new value. Nobody can edit or delete the audit log, including admins.
9. **Versioned framework.** Domains, prompts, signals and gate criteria live in a versioned configuration. Each assessment is pinned to the framework version it started with. Revising the framework never changes past assessments.
10. **Anticipatory, not predictive.** Signals are logged observations and reassessment triggers. Never compute probabilities, forecasts or risk scores beyond the defined Low / Med / High flags.
11. **Honest automation.** Any machine-generated text must be labelled with how it was produced, and must stay a draft until a human approves it. No feature may be labelled "AI" unless it uses a language model.

---

## 4. Target architecture

### 4.1 Recommended stack
Use this stack unless Paul says otherwise. If you think a change is needed, propose it in Phase 0 and wait for approval.

- **Frontend:** React 18 + **TypeScript** + Vite + Tailwind, React Router, TanStack Query, react-hook-form + zod, Recharts (keep it), lucide-react.
- **Backend:** **Supabase**, covering Postgres, Auth (email + Google sign-in), Row-Level Security, Storage for evidence files, and Edge Functions or Postgres RPC for workflow logic. The current setup notes already recommend moving to Supabase or Firebase. Supabase fits because the data is relational and the access rules can be expressed as row-level security.
- **Testing:** Vitest + Testing Library for units and components, a SQL-level test for every RLS policy and workflow function, and Playwright for end-to-end journeys.
- **Quality:** ESLint + Prettier + `tsc --noEmit` in CI (GitHub Actions).

### 4.2 Folder structure
```
src/
  app/            routes, layout, providers
  features/
    platform/     home, subject router, "what to do next"
    scoping/      T1 + G0
    context/      T2 + G1 (actor & power map)
    evidence/     T5 + G2
    assessment/   T3 + G3
    integrity/    T4 + G4
    deliberation/ T6 + G5
    profile/      T8 + G6 (profile, report, exports)
    uptake/       T9 + G7 (decisions, KT products, action plans, uptake log)
    signals/      T7 (signal log)
    learning/     T10 + G8 (follow-up, reassessment, framework feedback)
    me-dashboard/ toolkit M&E indicators (admin)
    admin/        users, institutions, framework versions
  domain/         PURE TypeScript: workflow state machine, gate rules,
                  validation, divergence calc. No React, no I/O. 100% unit tested.
  lib/            supabase client, api hooks, audit helpers
  ui/             design system components
supabase/
  migrations/     schema, RLS, functions
  seed/           framework v1 (domains, prompts, signals, gate criteria)
  tests/          policy + function tests
```

**Rule:** Gate and workflow rules live in `src/domain/` **and** are re-checked in the database function that records the decision (`decide_gate`). The client can never move a project forward by writing to tables directly.

### 4.3 Components (T1–T10)

| ID | Component | What the user does |
|---|---|---|
| T1 | Scoping & triage | Picks the subject type, names the decision the profile will inform (decision, decision-maker, decision window), passes the human-rights floor screen |
| T2 | Context profiler | Records subject metadata, financing and governance, and the actor map (funders, implementers, community actors, government) |
| T3 | Solidarity profiling (core) | Each assessor independently rates D1–D9 with prompts, evidence, narrative and confidence |
| T4 | Integrity & anti-capture | Alignment check, cost/burden, voice reality, 4 risk flags, solidarity type |
| T5 | Evidence repository | Uploads or links evidence, tags it to domains, logs gaps |
| T6 | Deliberation & consensus | Compares independent ratings, discusses divergence, records consensus or dissent |
| T7 | Anticipatory signals | Logs observed signals per domain; signals can recommend early reassessment |
| T8 | Profile & reporting | Domain-level profile, narrative, confidence caveats, risk flags, exports |
| T9 | KT & uptake | Tailored products, dialogue log, action plan, uptake log |
| T10 | Learning & reassessment | Follow-up on actions, reassessment decision, lessons to framework log |

---

## 5. Data model (Postgres)

Every table gets `id uuid`, `created_at`, `created_by` and `updated_at`. Use enums for fixed vocabularies. Never store JSON blobs for things you need to query or enforce.

- **institutions**: name, country, type.
- **profiles** (one per auth user): full_name, email, institution_id, country, discipline, ORCID (optional), `platform_role` (`platform_admin | institution_admin | member`), consent fields with timestamps. **No password column.** Supabase Auth handles credentials.
- **subjects**: type (`project | programme | portfolio | investment | policy`), name, country, region, description, `parent_subject_id` (portfolio holdings point to their portfolio). A subject can have many assessment cycles over time (it is the "digital twin").
- **assessment_projects**: one assessment cycle of one subject. Fields: subject_id, institution_id, framework_version_id, **status** (see §6), assessment type (baseline / midline / endline / rapid / reassessment), and `previous_project_id` for reassessments.
- **project_members**: project_id, user_id, **project_role** (`pi | assessor | reviewer | observer | external_expert | kt_lead | community_participant`). One user can hold different roles on different projects. There must be exactly one `pi` per project.
- **decision_records** (T1): decision text, decision-maker (name, institution), decision window (start and end), human-rights screen result and note.
- **context_profiles** and **actors** (T2): financing, governance and target population; actors with category, role, influence (Low/Med/High) and participation level.
- **evidence_items** (T5): title, type (`document | interview | fgd | observation | admin_data | literature | financial | media | other`), source, date, file (Supabase Storage) or URL, confidentiality level, **origin** (`community | government | funder | implementer | independent`). Links many-to-many to domains through **evidence_domain_links**.
- **evidence_gaps**: domain, description, expected effect on confidence.
- **assessments** (T3): one per assessor per project. Status `draft | submitted | reopened`, with submitted_at.
- **indicator_responses**: assessment_id, indicator_id, response text.
- **domain_ratings**: assessment_id, domain_id, rating (1–5 or NULL), narrative, confidence, and linked evidence ids or gap ids. A CHECK constraint or trigger enforces invariant 3 whenever `is_complete = true`.
- **integrity_reviews** (T4): alignment answers, cost/burden answers, voice-reality answers, 4 risk flags (`washing | power | sustainability | inclusion`, each Low/Med/High) with a required explanation when High, and solidarity type (`symbolic | instrumental | substantive | transformative`, primary and secondary) with evidence.
- **consensus_ratings** (T6): project_id, domain_id, consensus rating (or NULL with "no consensus"), rationale, confidence. **dissent_records**: domain_id, member_id, position, rationale. **deliberation_sessions**: date, participants (including community participants), notes.
- **member_checks** (G6): stakeholder group, response, relevance rating 1–5, date.
- **kt_products**, **action_items** (owner, due date, status), and **uptake_events** (date, decision body, use type `instrumental | conceptual | symbolic`, evidence link).
- **signal_definitions** (per framework version and domain) and **signal_observations**: project or subject, domain, date, source, description, level `watch | act`.
- **gate_reviews**: project_id, gate (`G0`–`G8`), criterion responses (`yes | partial | no | na` + note), suggested decision (computed), **owner_decision** (`go | conditional_go | hold | stop_redirect`), conditions text (required for `conditional_go`), decided_by, decided_at, attempt_number.
- **framework_versions**, **domains**, **indicators**, **gate_criteria**: the seeded configuration. Versioned and editable only by platform admins through the Admin module. Existing versions are immutable once in use.
- **audit_log**: append-only (no UPDATE or DELETE grants for anyone). Fields: actor, action, entity, entity_id, old value (jsonb), new value (jsonb), timestamp.
- **notifications**: recipient, type, project, read_at.

---

## 6. Workflow and gate logic

### 6.1 Project status machine
```
draft → scoping(G0) → context(G1) → evidence(G2) → assessment(G3) → integrity(G4)
      → deliberation(G5) → validation(G6) → uptake(G7) → learning(G8) → closed
```
- A project moves forward **only** through `decide_gate(project_id, gate, decision, conditions)` returning `go`, or `conditional_go` with conditions.
- `hold` keeps the current status and records the reason.
- `stop_redirect` at G0 closes the project with a reason.
- G8 can trigger **reassessment**. This creates a new assessment project for the same subject, linked by `previous_project_id`, starting at `scoping`.
- Gates are sequential. You cannot open G(n+1) until G(n) is Go or Conditional go.

### 6.2 Suggested decision (pure function in `src/domain/gates.ts`, mirrored in SQL)
```
if no criterion answered                         → "not_started"
if any REQUIRED criterion = "no"                 → "hold"
if every REQUIRED criterion ∈ {"yes","na"}       → "go"
otherwise                                        → "conditional_go"
"partial" NEVER counts as met. "na" requires a note.
```
The owner sees the suggestion **and the reasons** ("2 required criteria not met: …"), then records their own decision. Overriding the suggestion upward (for example, recording Go when the suggestion is Hold) requires a written justification and is flagged in the audit log.

### 6.3 Gate owners and automatic checks
Where a criterion can be checked from data, **pre-fill it automatically and show the evidence**. The owner can still add notes. Never let the owner overwrite an automatic "No".

| Gate | Owner | Criteria that can be auto-checked from data |
|---|---|---|
| G0 | PI | subject type set; decision + decision-maker + window recorded; human-rights screen answered |
| G1 | PI | context profile mandatory fields complete; actor map has ≥1 of each category; all assessors declared COI; ≥2 assessors (or single-assessor flag set); community-voice plan present |
| G2 | PI + Reviewer | every domain D1–D9 has ≥1 evidence link or a documented gap; ≥2 evidence types overall; community-origin evidence linked to D5 and D8 |
| G3 | PI | all assessors submitted; every domain rating complete (invariant 3) |
| G4 | Reviewer | integrity sections complete; all 4 flags rated; every High flag has an explanation; solidarity type set; ≥1 community_participant scheduled for deliberation |
| G5 | PI | every domain with divergence > 1 point has a discussion note; every domain has a consensus rating or dissent record |
| G6 | PI + Reviewer | reviewer QA done; ≥1 member-check recorded; report contains no composite (structurally guaranteed); confidence caveats present |
| G7 | KT lead | profile delivered (KT product logged); response recorded (action plan or documented no-action); follow-up date set |
| G8 | PI | follow-up review done; signals reviewed since last assessment; reassessment decision recorded |

The full criteria list (35 items, marked Required or Advisory) is in **Appendix B**. Seed it as framework v1.

### 6.4 Divergence (T6)
For each domain, divergence = max − min of the submitted independent ratings, ignoring NULLs. If divergence > 1, flag the domain "Needs discussion". Show each assessor's rating and narrative side by side, but **only after G3**.

---

## 7. Roles and permissions

Implement this with RLS. Use the role **descriptions** in the SRS (Chapter 5.4). **Do not** copy the SRS permission matrix in §5.8: its columns are misaligned (for example, it shows the PI unable to create or edit projects, which contradicts §5.4.3).

| Action | Platform admin | Institution admin | PI | Assessor | Reviewer | Observer | External expert | KT lead | Community participant |
|---|---|---|---|---|---|---|---|---|---|
| Manage framework versions | ✓ | | | | | | | | |
| Manage institution users | ✓ | ✓ (own) | | | | | | | |
| Create project | | ✓ | ✓ | | | | | | |
| Invite members / assign roles | | ✓ | ✓ | | | | | | |
| Upload evidence | | | ✓ | ✓ | | | | | |
| Complete own assessment | | | | ✓ | | | | | |
| See others' ratings before G3 | | | | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Integrity review | | | ✓ | ✓ | ✓ (QA) | | | | |
| Join deliberation | | | ✓ | ✓ | ✓ | | ✓ | | ✓ |
| Record gate decision | | | per §6.3 | | per §6.3 | | | G7 | |
| Edit uptake / action plan | | | ✓ | | | | | ✓ | |
| View profile & reports | | ✓ (own inst.) | ✓ | ✓ | ✓ | ✓ (after G6) | ✓ (limited) | ✓ | ✓ (after G6) |
| Modify audit log | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

Platform admins **cannot** edit assessment content. Self-registration always creates a `member` with no project roles. Roles are granted only by invitation.

---

## 8. Framework content (seed as version 1)

Rating scale: **1 Emerging/Minimal · 2 Partial/Inconsistent · 3 Moderate/Developing · 4 Strong/Consistent · 5 Transformative/Exemplary**. Confidence reflects the **strength of evidence**, not certainty of interpretation.

Each domain carries: dimension, name, key question, indicator prompts, evidence to look for, red flags, and an anticipatory signal. Seed the complete set from **Appendix A**. Prompts for portfolio, investment and policy subjects are **not yet written**. Model indicators with an optional `subject_types[]` field so that adapted prompts can be added later without code changes. Until then, show the programme prompts with a visible note: *"Adapted prompts for this subject type are in development."*

**Portfolio rule:** a portfolio's profile is the set of its holdings' profiles shown side by side. **Never aggregate** them.

---

## 9. UX requirements: make it very user-friendly

**Principles:** calm, plain-language, guided, forgiving. Users should always know *where they are, what to do next, and why something is blocked*.

1. **Journey bar.** Every project page shows a horizontal stepper of the 9 gates (G0–G8) with the current position, completed gates and any hold. Clicking a completed gate opens its read-only record.
2. **"What to do next" card.** The home page lists each user's pending actions across projects (for example: "Submit your D4–D9 ratings for *Kaduna Equity Fund*, due 14 Nov"), each with one primary button.
3. **One task per screen.** Assessment shows one domain at a time. The prompts are on the left; on the right is the **evidence panel** (linked items, quick-add, gap logging). The rating, narrative and confidence fields sit at the bottom. Previous/next navigation and a domain checklist sidebar complete the layout.
4. **Explain blocks in plain words.** A disabled button always says why ("You can submit once D3 has a narrative and a confidence level"), with a link that jumps to the gap.
5. **Autosave everything.** Show a visible "Saved · 2 seconds ago" status. Keep offline-tolerant drafts (queue and retry) and never lose typed text. Warn before leaving with unsaved changes.
6. **Inline guidance with progressive disclosure.** Each domain and indicator has a "What good evidence looks like" expander and an example. A glossary tooltip appears on terms like *solidarity washing*, *member-check* and *conditional go*.
7. **Rating input.** Five labelled buttons (number + label + one-line descriptor). No sliders. "Not rated" is shown clearly.
8. **Profile visual.** A 9-domain chart, either a radar or (preferred, more readable) **grouped horizontal bars by dimension**. Unrated domains appear as gaps, not zeros. Confidence is encoded with an accessible pattern or opacity plus a text label. Risk flags appear as labelled chips. **No averages anywhere.**
9. **Deliberation view.** A domain-by-domain table of assessor ratings, with a divergence badge, a discussion thread, and fields for consensus and dissent. Community participants get a simplified view.
10. **Gate review screen.** A checklist with auto-checked items (✓ or ✗ and the evidence behind them), Yes/Partial/No/N/A for manual items, the suggested decision with reasons, and the owner's decision with a conditions box.
11. **Onboarding.** A three-step welcome (what SOLIDARIS is, your role, your first task) and a sample read-only project to explore.
12. **Accessibility.** WCAG 2.2 AA, full keyboard use, visible focus, labelled form controls, 4.5:1 contrast, and nothing conveyed by colour alone. Test with axe in Playwright.
13. **Responsive.** It must work on a tablet and a phone (at least read, comment and complete ratings). The minimum width is 360px.
14. **Performance.** Initial JS under 250 KB gzipped, routes lazy-loaded, and the app usable on a 3G connection.
15. **Language.** All strings go through an i18n layer (English first; French-ready). Use plain-English labels and no jargon in buttons.
16. **Design tokens.** Keep the current palette as CSS variables: green `#2F6F5E` (WHAT), gold `#B0782E` (HOW), purple `#5B4C8A` (TO WHAT END), ink `#20261F`, muted `#6B6250`, background `#F6F4EF`, panel `#FFFFFF`, line `#DAD4C4`, alert `#7A3B2E`. Use a readable system font stack at a 15–16px base. Generous whitespace.
17. **Empty states and errors.** Every list has a helpful empty state with the next action. Errors say what happened and what to do, never only "Something went wrong".

---

## 10. Reporting and exports (T8)

- The report contains: subject and context summary; the decision it informs; the domain profile (chart + table: rating, confidence, key evidence, narrative); integrity flags and solidarity type; consensus and dissent; evidence gaps; limitations and confidence caveats; member-check summary; and recommended actions.
- Exports: **PDF** and **DOCX** for the report, and **CSV** for domain ratings and the evidence register. Exports must pass the same no-composite rule.
- **Narrative draft (replaces the fake "AI summary").** Phase 5 ships a **template-based draft** built from the recorded data and labelled *"Auto-drafted from your entries — edit before use."* An optional LLM draft can come later as a server-side Edge Function. If it is built, it must:
  - cite the evidence ids it used
  - never invent facts
  - stay a draft until the PI approves it
  - be clearly labelled as AI-generated

---

## 11. Toolkit M&E instrumentation (T10 + admin dashboard)

Compute these indicators from data. **No manual entry.** Each one must be filterable by subject type, country and institution.
- **OC1:** number of documented decisions where a profile was considered (uptake_events), the share of G6-released profiles that passed G7 with an action plan, and the mix of use types.
- **OC2:** pre-deliberation agreement (share of domains with divergence ≤1), the share of consensus ratings at Medium/High confidence, and mean member-check relevance.
- **OC3:** the share of projects with a community participant in deliberation, the share of High flags with explanations, and the share of non-consensus domains with recorded dissent.
- **OC4:** institutions with at least one profile past G6, registrations, and report downloads.
- **OP3:** median days from G0 to G6, and first-pass rate per gate with coded hold reasons.

---

## 12. Security, privacy and data

- Use Supabase Auth only. Implement password rules, email verification, password reset, optional Google sign-in, and session timeout.
- **No secrets in the client bundle.** Use environment variables. Keep the service key server-side only.
- Apply RLS on **every** table. Default deny.
- Evidence files go in private storage buckets and are served through signed URLs. Respect confidentiality levels.
- Record consent with timestamps (keep the existing PIPEDA notice text, reviewed). Users can export or delete their own personal data. Deleting a user keeps the audit trail but anonymises their personal fields.
- Rate-limit authentication. Validate all inputs with zod on the client and with constraints on the server.
- **Decommission the Apps Script endpoint** once migration is complete. Ask Paul to rotate or delete the deployment and to remove the plaintext passwords from the Google Sheet.

---

## 13. Migration

Write a one-off script, `scripts/migrate-from-sheet.ts`, that:
- reads existing projects from the Google Sheet export (CSV) or a localStorage JSON export
- creates the subjects and assessment projects
- imports each old shared assessment as **one assessment by the original owner**, marked `legacy_import = true` and status `submitted`
- maps ratings of 0 to NULL
- **does not import passwords.** Each existing user is invited by email to set up a new account.
- produces a migration report listing what was imported, skipped and needs review

---

## 14. Testing and acceptance criteria

The minimum automated tests are listed below. A phase is not done until its tests pass in CI.

- **Invariants:**
  - no API, view or export ever returns an aggregate rating across domains (assert this on the API responses, the views and the exports)
  - a NULL rating is never treated as 0
  - an incomplete rating cannot be marked complete
  - assessor A cannot read assessor B's ratings before G3 (RLS test)
  - a submitted assessment cannot be edited
  - nobody can update or delete the audit log
  - consensus does not alter the independent assessments
- **Gates:** unit tests of the suggestion rule (each branch, "partial" never counted as met, "na" requires a note); a test that `decide_gate` rejects out-of-order gates; and a test that an upward override without justification is rejected.
- **Roles:** an RLS test for every row of the permission table in §7.
- **End-to-end (Playwright):** one full journey from G0 to G8 with a PI, 2 assessors, a reviewer, a community participant and a KT lead, including one Hold and one reassessment.
- **Accessibility:** axe finds no serious or critical violations on the main screens.

---

## 15. Delivery plan (one phase per session)

**Phase 0: Audit and plan. No code changes.**
Read the whole repo. Write `docs/AUDIT.md` (confirm or correct §2, and add anything missed) and `docs/PLAN.md` (files to create, delete and keep; schema; risks; questions for Paul). **Stop and wait for approval.**

**Phase 1: Foundation.**
Set up TypeScript, the folder structure, routing, the design tokens and UI kit, the Supabase project, auth, the full schema, RLS defaults, the audit log, the framework v1 seed, CI and the test harness. Remove localStorage and Sheet persistence behind a feature flag.

**Phase 2: Platform, scoping and context (T1, T2, G0, G1).**
Build the home page with "What to do next", the subject router, project creation and invitations, the decision record, the context profiler and actor map, the journey bar, and the gate review screen (generic, reused by all gates).

**Phase 3: Evidence and independent assessment (T5, T3, G2, G3).**
Build the evidence repository (upload, link, tag, gaps), the assessment screens, completeness validation, submit and lock, and reopen with a reason.

**Phase 4: Integrity and deliberation (T4, T6, G4, G5).**
Build the integrity review, the divergence view, deliberation sessions, consensus and dissent, and the community participant view.

**Phase 5: Profile and reporting (T8, G6).**
Build the profile chart and table, the member-check, the report, the PDF/DOCX/CSV exports and the template narrative draft.

**Phase 6: Uptake, signals and learning (T9, T7, T10, G7, G8).**
Build KT products, action plans with reminders, the uptake log, signal definitions and observations, the follow-up review, the reassessment flow and the lessons log.

**Phase 7: M&E dashboard, admin and hardening.**
Build the M&E dashboard, framework version management, the migration script, an accessibility and performance pass, user documentation (`docs/USER_GUIDE.md`) and admin documentation.

**For every phase:** list what you will change, then implement it in small commits with clear messages. Add tests, run lint, type-check and the full test suite, then summarise what changed, what is left, and any decision you need from Paul.

---

## 16. Working rules for you, the agent

- **Plan before coding**, and keep the plan updated in `docs/PLAN.md`.
- **Ask before** adding a dependency not listed in §4.1, changing the schema after Phase 1, or changing anything in §3.
- **Never** weaken an invariant to make a test pass. Fix the code instead.
- Keep the methodological logic in `src/domain/` pure and fully unit-tested.
- Prefer clarity over cleverness. Small components and named functions. Add comments where the methodology drives the code (cite the rule number from this brief).
- Do not delete the old prototype files. Move them to `legacy/` in Phase 1.
- If something in this brief conflicts with the SRS or the code, **flag it and ask**. Do not resolve it silently.

### Open decisions: do not decide these yourself
Implement them as configuration with the defaults shown. Leave them easy to change.

1. Reliability metric: default **±1-point agreement**. Weighted kappa or ICC can be added later as an option.
2. Single-assessor profiles: default **allowed but labelled "Exploratory"**. They cannot be marked "Validated" at G6.
3. Minimum narrative length: default **50 characters**.
4. Whether T7, T9, T10 and the gate system are final: they are **proposals pending the team's review**. Build them, but behind feature flags.

---

## Appendix A: Domains, prompts, evidence, red flags, signals (framework v1)

| Dim | Code | Domain | Indicator prompts | Evidence to look for | Red flags | Anticipatory signal |
|---|---|---|---|---|---|---|
| WHAT | D1 | Equity & Justice | 1. Priority given to marginalised / underserved populations in targeting and design · 2. Resources allocated by need rather than political or economic factors · 3. Attention to root causes of inequity, not only symptoms | Targeting criteria; disaggregated coverage; allocation formulas; theory of change | Elite capture; politically driven allocation; symptom-only response | Shifts in targeting or eligibility; cuts falling on lowest-coverage groups |
| WHAT | D2 | Common Good Orientation | 1. Collective outcomes prioritised over organisational gain · 2. Public goods (data, knowledge, technology) shared openly · 3. Strengthens public systems rather than parallel structures | Strategy docs; open-data platforms; licensing terms; system integration | Organisational visibility prioritised; proprietary restriction; parallel systems | Moves to proprietary data or parallel reporting |
| WHAT | D3 | Mutual Responsibility | 1. Responsibilities and accountabilities clearly shared · 2. Risk borne in fair shares by funders, implementers, communities · 3. Reciprocal obligations rather than one-way dependency | MOUs; joint reviews; contract terms; co-financing commitments | One-sided obligations; all risk carried locally | Co-financing commitments missed; risk-transfer clauses added |
| HOW | D4 | Power Transformation | 1. Decision-making power shared with local actors · 2. Who sets priorities and controls allocation · 3. Mechanisms to shift authority to local ownership over time · 4. Historical power imbalances acknowledged and addressed | Decision records; committee composition; budget authority; transition plans | All decisions external; no local budget control; no transfer path | Transition milestones slipping; local seats on decision bodies reduced |
| HOW | D5 | Inclusive Participation | 1. Affected communities involved in design · 2. Marginalised groups have voice in decisions, not only consultation · 3. Participation mechanisms accessible and culturally appropriate | Consultation records; governance roles; voting rights; language, venue, compensation | Token consultation; informed-only participation; inaccessible processes | Community bodies sidelined; consultation shortened or skipped |
| HOW | D6 | Transparency & Accountability | 1. Information on funding, decisions, outcomes openly accessible · 2. Communities can hold actors accountable · 3. Failures and challenges reported honestly | Published budgets; grievance mechanisms; reports with negative findings | Hidden information; no feedback loop; only success stories | Publication delays; grievances unanswered |
| TO WHAT END | D7 | Sustainability & Sovereignty | 1. Local health-system capacity strengthened long-term · 2. Clear transition plan toward local ownership and control · 3. Builds on national priorities | Capacity plans; transition strategy; domestic financing data; alignment with national strategies | Capacity substituted not built; no exit plan; externally set priorities | Rising external share of funding; domestic budget lines not released |
| TO WHAT END | D8 | Relational Trust | 1. Genuine partnership rather than donor–recipient dynamics · 2. Relationships marked by mutual respect and learning · 3. Trust built through consistent, reliable engagement | Partner perception data; joint reviews; commitments-honoured record | Command relationships; disrespect; broken promises | Commitments broken or delayed; partner turnover |
| TO WHAT END | D9 | Transformative Impact | 1. Contribution to systemic change beyond immediate outcomes · 2. Shifts in norms, policies or structures toward equity · 3. Challenges rather than reinforces existing inequities | Policy/system change evidence; norm surveys; distributional analysis | Status quo maintained; no structural shift; inequities reproduced | Reversal of enabling policies; stalled reforms |

**Integrity (T4):**
- **Alignment check:** contradictions between the subject's goals and the organisation's other activities; whether the funder's portfolio undermines the aims; whether stated values match resource allocation.
- **Cost and burden:** who bears implementation costs; whether transaction costs are proportionate; whether costs are shifted to local actors; whether indirect costs are covered.
- **Voice reality:** the actual level of community involvement; veto or modification power; grievance mechanisms; whether input led to real changes.
- **Risk flags:** solidarity washing, power imbalance, sustainability, inclusion gap (each Low/Med/High).
- **Solidarity type:** symbolic/rhetorical, partial/instrumental, substantive/relational, transformative (primary and secondary).

## Appendix B: Gate criteria (framework v1) — R = Required, A = Advisory

- **G0:**
  - Subject type identified (R)
  - Decision, decision-maker and decision window named (R)
  - Human-rights floor screen done; flagrant violations escalated rather than profiled (R)
  - Requester has no controlling interest, or it is declared (A)
- **G1:**
  - Context profile complete (R)
  - Actor map lists funders, implementers, community actors, government (R)
  - COI declared by all assessors (R)
  - ≥2 independent assessors, or single-assessor flagged (R)
  - Plan for affected-community voice documented (R)
- **G2:**
  - Every domain has ≥1 linked evidence item or a documented gap (R)
  - ≥2 source types overall (R)
  - Community-origin evidence for D5 and D8 (R)
  - Evidence gaps logged with effect on confidence (A)
- **G3:**
  - All assigned assessors submitted (R)
  - Every rating has narrative and confidence (R)
  - Independence maintained (R)
- **G4:**
  - Alignment, cost/burden and voice-reality checks done (R)
  - All four flags rated; every High explained (R)
  - Solidarity type classified with evidence (R)
  - Marginalised/affected groups represented in deliberation (R)
- **G5:**
  - Every domain with >1-point divergence discussed (R)
  - Consensus or documented dissent for each domain (R)
  - Minority interpretations archived with rationale (R)
- **G6:**
  - Reviewer QA done (R)
  - Member-check with affected stakeholders done (R)
  - Domain-level reporting only (R)
  - Confidence caveats and limitations stated (R)
- **G7:**
  - Delivered to named decision-maker in tailored format (R)
  - Response recorded: action plan or documented no-action (R)
  - Follow-up date set (R)
  - Barriers to use identified (A)
- **G8:**
  - Follow-up review of actions done (R)
  - Signals reviewed since last assessment (R)
  - Reassessment decision made (R)
  - Lessons logged to framework revision log (A)

---

## Kick-off message (paste this into Copilot Agent mode)

```
You are re-engineering the SOLIDARIS web app in this repository.
Read docs/SOLIDARIS_REENGINEERING_BRIEF.md in full before doing anything. It is the
source of truth for methodology, architecture, data model, workflow, roles, UX and tests.

Start with Phase 0 only:
1. Read every file in the repo (src/, src/lib/, the Apps Script docs, package.json, configs).
2. Write docs/AUDIT.md: confirm or correct each defect in §2 of the brief, with file and
   line references, and list anything the brief missed.
3. Write docs/PLAN.md: target folder tree, full Postgres schema with RLS policies in
   outline, the gate state machine, the list of files to keep / move to legacy/ / delete,
   risks, and a numbered list of questions for me.
4. Do NOT change any application code in this phase.
Stop when both documents are written and wait for my approval before Phase 1.
```

**For later phases**, start each session with:
```
Read docs/SOLIDARIS_REENGINEERING_BRIEF.md and docs/PLAN.md. Implement Phase N only.
Follow §16 working rules. Run lint, type-check and all tests before you finish, then
summarise what changed, what is left, and any decision you need from me.
```
