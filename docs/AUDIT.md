# SOLIDARIS — Phase 0 Audit

**Date:** 2026-10-06 · **Basis:** `docs/SOLIDARIS_REENGINEERING_BRIEF.md` §2 · **Commit audited:** `fa6d712`, plus the uncommitted working-tree changes listed in §0.

This document confirms or corrects every defect in brief §2 and lists problems the brief missed. Line numbers refer to the current working tree.

---

## 0. Scope, method and limits

**Read in full:**
- `src/App.jsx` (1,139 lines)
- `src/lib/db.js`
- `src/lib/sheetApi.js`
- `src/main.jsx`, `src/index.css`
- `index.html`, `package.json`, the Vite, Tailwind and PostCSS configs
- `.github/workflows/deploy.yml`, `.env.example`, `.gitignore`
- `GOOGLE_SHEETS_SETUP.md` (contains the Apps Script source), `APPS_SCRIPT_FIX.md`

**Read in part:** the auth, storage and sync sections of `prototypes/solidaris_chrome.html`, plus `prototypes/solidaris_demo.jsx`.

**Inspected:** the formulas in `research/Solidarity Profiling Tool.xlsx` and `research/advanced_solidarity_profile_tool.xlsx`, unzipped and read as XML.

**Not done:**
- **The app was not built or run.** Node.js is not installed on this machine.
- **The live Google Sheet and Apps Script deployment were not checked.** Findings about them come from the source in `GOOGLE_SHEETS_SETUP.md`.
- **SRS (added in the follow-up pass):** `research/SOLIDARIS.docx` is the SRS. Chapters 4–6, 8–10, 14 and 18 were read where they bear on the open questions; `PLAN.md` §8 cites them.
- **The SRS permission matrix (§5.8), as stored in the file, is aligned.** It shows the PI able to create and edit projects. The misalignment the brief describes is probably a rendering problem in Word.
- **Two real conflicts in the matrix:**
  - "Generate Reports" is ticked for Observer, which contradicts §5.4.6.
  - "Upload Evidence" is ticked for Assessor only, while brief §7 also allows the PI.
- Brief §7 governs both.

**Repo changes made earlier this session (not yet committed).** They affect what the brief describes:

| Change | Effect on the brief |
|---|---|
| `solidaris_chrome.html`, `solidaris_demo.jsx` and `test-sheet-api.html` moved to `prototypes/` | Brief §2 lists them at the repo root |
| Research `.docx`, `.pdf` and `.xlsx` files moved to `research/` | — |
| Hard-coded Apps Script URL fallback removed from `sheetApi.js`; URL now comes only from `VITE_SHEET_API_URL` (the CI build reads it from a repo variable) | Partly addresses defect 1 |
| Sheet sync is now debounced (1.5 s) and sends only the projects that changed | Partly addresses defect 8 |
| `desktop.ini` unstaged and gitignored | — |

---

## 1. Brief §2 defects: confirmed or corrected

| # | Verdict | Evidence |
|---|---|---|
| 1 | **Confirmed, with one correction** | Detail below |
| 2 | **Confirmed** | Detail below |
| 3 | **Confirmed, and more widespread than stated** | Detail below |
| 4 | **Confirmed, and more widespread than stated** | Detail below |
| 5 | **Confirmed** | Detail below |
| 6 | **Confirmed, and worse than stated** | Detail below |
| 7 | **Confirmed, plus one more problem** | Detail below |
| 8 | **Partly outdated; the root problem is worse** | Detail below |
| 9 | **Confirmed** | Detail below |
| 10 | **Confirmed** | Detail below |

### Defect 1: plaintext passwords

**Confirmed:**
- Demo passwords are hard-coded: `db.js:4-6`.
- Passwords are stored in plain text in localStorage: `db.js:202`, saved through `db.js:109`.
- Sign-in compares plain text: `db.js:243`.
- `getUsers` returns every column of the `users` tab, including `password`: `GOOGLE_SHEETS_SETUP.md:54-55`.
- The Apps Script `signIn` returns the full user row, including the password: `GOOGLE_SHEETS_SETUP.md:119-126`.
- The script is deployed with access set to "Anyone": `GOOGLE_SHEETS_SETUP.md:272` and `APPS_SCRIPT_FIX.md:65`.
- Every Sheet call puts all its parameters in a GET query string: `sheetApi.js:45-46`.

**Correction:** the React app does **not** currently send passwords to the Sheet. `signInWithSheet` and `createUserWithSheet` (`sheetApi.js:56-66`) are never imported, and sign-in is local only (`App.jsx:264-274`). The prototype `solidaris_chrome.html` also signs in locally (line 1318). The risk sits in the unused helpers and in the Apps Script. Passwords reach the Sheet only if something calls `createUser`, such as the manual tester `prototypes/test-sheet-api.html`. **Check the live `users` tab.**

**Additional security issue:** the Sheet is linked with `usp=sharing` (`GOOGLE_SHEETS_SETUP.md:9`). If link sharing is on, anyone with that link can read the password column directly.

### Defect 2: users choose their own role

**Confirmed.**
- The sign-up form has a role selector: `App.jsx:583-595`.
- It is accepted as-is: `db.js:203`.
- The Apps Script accepts any `role` parameter: `GOOGLE_SHEETS_SETUP.md:134`.
- The prototype lets users pick `superadmin` at login: `solidaris_chrome.html:1018` and `1318-1322`.

### Defect 3: composite scores

**Confirmed. Every place a composite appears:**
- **Dashboard:** average out of 5 and a progress bar, `App.jsx:683`, `695-698`.
- **Profile, triad averages:** `App.jsx:919-922`, `961-962`.
- **"Solidarity index" %:** `calculateIndex` at `App.jsx:126-130`, shown on the profile (`968`) and the report (`1047`).
- **"Mean rating" card on the report:** `App.jsx:1046`.
- **AI summary:** `App.jsx:87-88`, `111`, `116`.

**Contradiction on the profile screen:** the chart caption says "Nine-domain profile — not a single score by design" (`App.jsx:941`), while a percentage index is shown about 30 lines below it (`968`).

**The Sheet stores ratings inside an `assessmentJson` text blob** (`GOOGLE_SHEETS_SETUP.md:203`, `234`), so the server cannot query or constrain individual ratings.

### Defect 4: unrated counts as 0

**Confirmed.**
- `Number(d.rating || 0)` appears at `App.jsx:87`, `90`, `127`, `683`, `916`, `920` and `1046`.
- New ratings default to `0`: `db.js:12`, `269`; `App.jsx:146`; `GOOGLE_SHEETS_SETUP.md:182`.
- The slider lets users pick 0 ("Not scored") as if it were a rating: `App.jsx:805`, `RATING_LABELS` at `44`.

**Further effects:**
- The radar chart draws unrated domains at 0 (`App.jsx:916`).
- The team-report export prints `0/5` (`App.jsx:68`).
- The AI summary lists unrated domains as "Highest-risk areas", because 0 ≤ 2 (`App.jsx:90`).

### Defect 5: "AI summary" is not AI

**Confirmed.**
- The summary is a regex keyword count plus template sentences, with thresholds taken from the average: `App.jsx:86-124`.
- It is labelled "AI" in several places: `App.jsx:110`, `370`, `977`, `980`, `1026`, `1034`, `1038`, `1076`.

### Defect 6: no assessor independence

**Confirmed. In practice it is worse than "everyone edits the same ratings":**
- There is one `assessment` object per project (`db.js:264`).
- No edit path checks the user's role: `App.jsx:226-262`, `445-447`, `464-474`. Any reviewer listed on a project can open the context and assessment screens and change the owner's ratings.
- The owner is added to their own `reviewerIds` (`db.js:263`).

### Defect 7: integrity check incomplete

**Confirmed.**
- Only `washingRisk` and `powerRisk` exist: `App.jsx:148-154`, `885-898`.
- There is no sustainability or inclusion flag and no solidarity type.

**Also:** both flags **default to "Medium"** (`db.js:20-21`; `App.jsx:152-153`, `888`, `894`). The app records a risk judgement nobody made, which is the same kind of problem as defect 4.

### Defect 8: fragile sync

**Partly outdated.** Since this session's change, sync no longer pushes all projects on every save.

**The deeper problem, which the brief does not mention:**
- Projects are created locally only (`db.js:253-290`). `createProjectInSheet` is never called.
- The Apps Script `saveProject` returns "Project not found" when the row does not exist (`GOOGLE_SHEETS_SETUP.md:221-222`).
- The app only writes a `console.warn` (`App.jsx:192`).

**Consequence:** for every project created in the app, sync has silently failed every time. The Sheet holds only rows created some other way.

**Still true:**
- Nothing ever pulls from the Sheet: `loadAllProjects` and `loadAllUsers` are unused.
- localStorage is the source of truth.
- The "Saved" indicator reflects only the local write (`App.jsx:216-224`).
- Long narratives sent as GET query strings will hit URL length limits.

### Defect 9: completion means "evidence summary non-empty"

**Confirmed.**
- The completion check: `App.jsx:747`.
- The report's "Coverage" card uses the same rule (`App.jsx:1045`).
- There is no concept of completing or submitting an assessment at all.

### Defect 10: everything in one file

**Confirmed.**
- `App.jsx` holds 13 components plus all state and logic.
- There is no router, no tests, no linter config and no TypeScript.
- **There is also no `package-lock.json`**, so every CI build resolves fresh dependency versions (`deploy.yml` runs `npm install`).

---

## 2. Findings the brief missed

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| A1 | **High** | **The Apps Script `assignReviewer` writes to the wrong row.** `rows` includes the header row, so the row number should be `rowIndex + 1`; the code uses `rowIndex + 2`. Assigning a reviewer overwrites the *next* project's row with this project's data. `APPS_SCRIPT_FIX.md` fixed the same bug in `saveProject` but not here. | `GOOGLE_SHEETS_SETUP.md:254`, `263` |
| A2 | **High** | **The Apps Script has no authentication.** Anyone with the URL can read all users and projects, or overwrite any project. The URL is in git history, in `prototypes/solidaris_chrome.html:1231`, and in every built JavaScript bundle. | `GOOGLE_SHEETS_SETUP.md:46-72` |
| A3 | **High** | **Sessions can be forged.** The signed-in user is just `sessionUserId` in localStorage, so editing it lets you become anyone. The whole database is also exposed as `window.__SOLIDARIS_DB__`. | `db.js:99`, `102`, `110`; `App.jsx:175-178` |
| A4 | Medium | **There is no way to add reviewers in the UI.** `addReviewerToProject` is never called, so reviewers exist only in the seed data. Collaboration as designed cannot happen. | `db.js:292-300` |
| A5 | Medium | **Promised emails are never sent.** The consent text promises email notifications, and sign-up says "An email confirmation has been prepared". No email is ever sent, and notifications are created but **never displayed anywhere**. This conflicts with the honesty rule (invariant 11) and with the privacy notice. | `App.jsx:600`, `626`; `db.js:226`; `App.jsx:288`, `305`, `378` |
| A6 | Medium | **Consent is not recorded properly.** Consent is stored as booleans with no timestamps, and `createUser` hard-codes `true` instead of storing what the user ticked. Email-notification consent is **mandatory** to register, which is questionable under PIPEDA and CASL. | `db.js:189`, `205-209` |
| A7 | Medium | **Domain content has drifted from framework v1.** The app's prompts are short labels, three per domain, and responses are fixed at 3 (`App.jsx:146`; `db.js:12`). Appendix A has 4 prompts for D4. The domain list is defined three times. | `App.jsx:23-39`; `db.js:56-66`; `GOOGLE_SHEETS_SETUP.md:180` |
| A8 | Medium | **The rating input is an unlabelled slider.** It is a 0–5 range input with no accessible name or descriptor text, which breaks brief §9.7. | `App.jsx:805` |
| A9 | Medium | **Accessibility gaps.** Text is 10–11px in many places (for example `App.jsx:744`, `1124`). Risk badges use colour alone (`1130-1138`). The radar chart has no table alternative. The `IBM Plex Sans` font is referenced but never loaded (`412`). | as listed |
| A10 | Low | **State is set during render**, a React anti-pattern that can cause render loops. | `App.jsx:407-409` |
| A11 | Low | **Dead code.** `emptyProject()`, `upsertProject`, `addReviewerToProject` and six helpers in `sheetApi.js` are unused. | `App.jsx:132`; `db.js:292`, `302` |
| A12 | Low | **Seed data contradicts the role model.** A user with the "reviewer" role owns a project. | `db.js:73` |
| A13 | Low | **Routing will not work on GitHub Pages as configured.** Pages serves the app from a subpath with `base: './'`. React Router will need `HashRouter` or a `404.html` fallback. | `vite.config.js:6` |
| A14 | **High** | **Unpublished material in a public repo.** The repo is **public** (confirmed via the GitHub API). Earlier commits published the SRS, paper drafts, the research protocol, the workshop report and the Excel tool. The not-yet-committed peer-review PDF and papers 1 and 2 were staged. `research/` is now untracked and gitignored, so nothing more gets published; the files stay on disk. History still contains the earlier files (`PLAN.md` D-2). | `research/` |
| A16 | Medium | **The SRS and the brief disagree in several places.** The brief wins in each case, and each is recorded in `PLAN.md` §8:<br>• v1 technology: SRS §4.12 (AppSheet) vs brief (Supabase), D-24<br>• automatic stage transitions: SRS §4.10, §6.9 vs invariant 7, D-19<br>• role chosen at registration: SRS §5.5 vs brief §7, D-25<br>• reviewer QA of individual assessments before consensus: SRS §8.18 vs brief §7, D-6<br>• the privacy notice cites PIPEDA, while SRS §14.20 names NDPA and GDPR, D-9 | SRS as cited |
| A15 | Info | **No local toolchain.** Node.js is not installed on this machine, and local Supabase needs Docker. Phase 1 cannot be verified locally until both are available, or until a hosted Supabase dev project is used. | — |

---

## 3. Excel tool check (brief §2, final paragraph)

**Confirmed with exact cells** in `research/Solidarity Profiling Tool.xlsx`.

**D2 and D3 read as 0:**
- `Calculations!D7 = Input_Domains!B21` and `Calculations!D8 = Input_Domains!B37`.
- `B21` and `B37` are the **header rows** ("D2: COMMON GOOD ORIENTATION", "D3: MUTUAL RESPONSIBILITY"). The ratings are in `B22` and `B38`.
- The Dashboard reads the correct cells (`Dashboard!C19 = B22`, `C20 = B38`), so the Dashboard and the Calculations sheet disagree.
- Everything built on the Calculations sheet (the triad averages, the "Area for development" text, and the variation statistic) treats D2 and D3 as 0.

**Overall average:**
- `Dashboard!B33 = AVERAGE(B30:B32)`, an average of the triad averages.
- `Calculations!B26 = AVERAGE(D6:D14)`.
- `advanced_solidarity_profile_tool.xlsx` averages each triad as well (`sheet3 B3:B5`).

**How the rebuild prevents both:**
- Ratings are keyed by `domain_id` foreign key, never by position, which rules out the wrong-cell error.
- No aggregate is computed anywhere, which rules out the averages (invariant 1, with tests).

---

## 4. Conflicts and gaps in the brief (flagged, not resolved)

These items are numbered 1–14 below. **All are now resolved or have a default in `PLAN.md` §8.** The mapping:

| Item below | Resolved in |
|---|---|
| 1 | D-3 |
| 2 | D-16 |
| 3 | D-4 |
| 4 | D-5 |
| 5 | D-17 |
| 6 | invariant 3 applies |
| 7 | D-7 |
| 8 | D-6 |
| 9 and 10 | D-18 |
| 11 | D-19 |
| 12 | `PLAN.md` §3.2 audit_log |
| 13 | D-20 |
| 14 | D-21 |

1. **File locations.** §2 lists the prototypes at the root; they are now in `prototypes/`. Phase 1 says move them to `legacy/`. *Proposal:* rename `prototypes/` to `legacy/prototypes/`.
2. **G2 "≥2 evidence types" (§6.3) vs "≥2 source types" (Appendix B).** Evidence `type` (document, interview, …) and `origin` (community, government, …) are different fields. Which one does this criterion mean?
3. **How a project leaves `draft`.** §6.1 has a `draft` status before `scoping(G0)`, but no gate or action moves a project out of `draft`.
4. **`stop_redirect` is only defined for G0.** What happens when it is chosen at G1–G8?
5. **What a `conditional_go` condition requires.** The brief does not say when a condition must be resolved, or by whom.
6. **G3 auto-check vs invariant 3.** The G3 auto-check says "narrative and confidence". Invariant 3 also requires evidence or a gap. *Proposal:* use invariant 3, the stricter rule.
7. **Integrity reviews.** Is there one integrity review per project or one per assessor? §7 lets the PI, assessors and the reviewer do integrity reviews, but §5 does not say which.
8. **Can the PI see ratings before G3?** The §7 row "See others' ratings before G3" leaves the PI column blank.
9. **Which ratings the profile shows.** Is it the consensus ratings? For single-assessor projects, is it the assessor's own ratings?
10. **Single-assessor projects and G5.** With one assessor, divergence is undefined, so it is unclear how G5 applies.
11. **A feature flag on the gate system (§16.4).** Every status change runs through gates. What should the app do when that flag is off?
12. **Audit-log immutability (invariant 8).** Inside Postgres, the database owner and Supabase's `service_role` can always bypass grants and triggers. The plan removes UPDATE and DELETE from every application role, adds a trigger guard and a hash chain to detect tampering, and keeps the service key out of the app. A database superuser still cannot be prevented technically.
13. **"Mean member-check relevance" (OC2, §11).** This is a mean, but of feedback about the toolkit, not a solidarity score. *Proposal:* allowed, because invariant 1 covers solidarity ratings only. Please confirm.
14. **Libraries the brief needs but §4.1 does not list.** These need approval under §16; see `PLAN.md` §6.
