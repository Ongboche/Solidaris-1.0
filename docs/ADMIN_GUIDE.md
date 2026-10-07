# SOLIDARIS administrator guide

For platform and institution administrators, and for whoever runs the deployment.

## 1. Architecture in one paragraph

- **Front end:** a static React app on GitHub Pages (`https://ongboche.github.io/Solidaris-1.0/`).
- **Back end:** Supabase project `solidaris-dev` (`emtowdhobspmmtypulpi`, region **eu-west-2, London**, Postgres 17), which provides the database, sign-in and private file storage.
- **Where the rules live:** in the database (constraints, triggers, row-level security and functions), not just the app. The browser only ever holds the **publishable** key. Never put the `service_role` key in the app, the repo or a chat.

## 2. Deploying changes

| What | How |
|---|---|
| App code | Open a pull request. CI runs lint, type-check, unit and database tests, accessibility end-to-end tests, the bundle budget, and the migrations on a real Supabase stack. Merge when green, and `main` deploys automatically. |
| Database | Add a new file in `supabase/migrations/`. **Never edit an applied migration.** Apply it with `npx supabase login` (once per computer), `npx supabase link --project-ref emtowdhobspmmtypulpi`, then `npm run db:push`. **Apply database changes before merging the app code that uses them.** |
| Feature flags | `.env.production`: `VITE_FLAG_SIGNALS`, `VITE_FLAG_UPTAKE`, `VITE_FLAG_LEARNING` (T7, T9, T10), `VITE_FLAG_GOOGLE_SIGN_IN`, `VITE_FLAG_LEGACY_EXPORT`. Change, commit, merge. |
| Rule settings | `settings` table: `min_narrative_length` (50), `agreement_threshold` (1), `allow_single_assessor`, `gate_enforcement` (set false only for advisory mode), `conditions_resolution_required`. Edit them in the Supabase table editor; every change is audited. |

## 3. Supabase setup checklist

- **Authentication → URL configuration:**
  - site URL: the Pages URL;
  - redirect URLs: the Pages URL with `/**`, and `http://localhost:5173/**`.
- **Authentication → Providers:**
  - Email: on, with confirmation required.
  - Minimum password length: 10.
  - Google: optional. If you enable it, also set `VITE_FLAG_GOOGLE_SIGN_IN=true`.
- **Authentication → Emails → SMTP:** see *Gmail SMTP* below. Without custom SMTP, Supabase only emails members of your Supabase organisation.
- **Storage:** the `evidence` bucket is private, with a 25 MB limit per file. It is created by the migrations.

### Gmail SMTP (pilot)

> **Temporary (PLAN D-51):** email confirmation is currently **off**, because the Gmail sender is failing. When email works:
> 1. Supabase → Authentication → Providers → Email → turn **Confirm email** back on.
> 2. Run a password reset to your own address to confirm emails arrive.
1. Turn on 2-Step Verification on the sending Gmail account.
2. Create an app password at https://myaccount.google.com/apppasswords.
3. In Supabase → Authentication → Emails → SMTP Settings, turn on custom SMTP and fill in:
   - **Host:** `smtp.gmail.com`
   - **Port:** `587`
   - **Username:** the Gmail address
   - **Password:** the app password
   - **Sender email:** the same Gmail address
4. Under Rate Limits, set the email limit to about 30 per hour.

Gmail sends about 500 emails a day. Move to a transactional provider on a project domain before wide rollout.

## 4. Administration screens (Administration in the top menu)

| Tab | Who | What |
|---|---|---|
| Toolkit M&E | Platform admins (all); institution admins (own institution) | OC1–OC4 and OP3 from brief §11, filterable by subject type, country and institution. These describe the toolkit, never a subject's solidarity. |
| Users | Platform admins edit; institution admins view | Set the platform role (member, institution admin, platform admin) and link a user to an institution. At least one platform admin must remain. **Project roles are not set here**: they come only from project invitations. |
| Institutions | Platform admins | Add institutions so users and projects can be linked to them. |
| Framework | Platform admins | Covered in section 5. |
| Audit log | Platform admins | Recent entries, and **Check now**, which recomputes the hash chain to show whether any entry was altered outside the app. |

**Platform admins cannot edit assessment content** (brief §7). This is enforced in the database.

### Making someone a platform admin for the first time
The first admin needs a direct database update, because nobody can promote themselves:

```sql
update public.profiles set platform_role = 'platform_admin' where email = 'person@example.org';
```

Run it in the Supabase SQL editor. Afterwards, use the Users tab.

## 5. Framework versions (invariant 9)

- **Version v1** is seeded from the brief's Appendices A and B and is **published**. Published versions can never be edited.
- **To revise the framework:**
  1. Go to **Framework**, choose *Copy from* v1, and give the draft a label (for example `v2`).
  2. Click **Edit draft** and change domain texts, prompts, guidance, which subject types each prompt applies to (brief §8), and rating-scale descriptors.
  3. Click **Publish**. New projects use the newest published version; existing projects keep theirs.
- **The revision log** lists the lessons PIs have logged. Use it when preparing a revision.

## 6. Migrating data from the old prototype (brief §13)

1. **Export the old data:**
   - From the Google Sheet, download the `projects` tab and a `users` tab **without the password column** (see `docs/APPS_SCRIPT_LOCKDOWN.md`).
   - Or, from a browser that used the old app, open `/legacy-export` and download the JSON.
2. **Dry run.** This writes nothing to the database:
   ```bash
   node scripts/migrate-from-sheet.ts --projects projects.csv --users users.csv
   ```
   Read `migration-report.md`: it lists what would be imported and what needs review.
3. **Apply.** Use a trusted computer only, and never commit the key:
   ```powershell
   $env:SUPABASE_URL = "https://emtowdhobspmmtypulpi.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY = "<from Supabase → Project Settings → API keys; do not share>"
   node scripts/migrate-from-sheet.ts --projects projects.csv --users users.csv --apply
   ```
   **What the import does:**
   - Each old project becomes a *draft* project. Its old shared assessment becomes one submitted assessment by the owner, marked `legacy_import`.
   - Ratings of 0 become *Not rated*.
   - Passwords are never imported. Each owner receives an invitation email to set up a new account, which needs working SMTP.
4. Once migration is complete, delete the Apps Script deployment and the Google Sheet (brief §12).

## 7. Privacy and data requests

- **Consent:** each user's consent is stored with a timestamp and the version of the notice they accepted. The notice text is in `src/i18n/en.json` (`consent.notice`) and is marked as awaiting legal review. When it changes, bump `NOTICE_VERSION` in `src/lib/flags.ts`.
- **Requests from users:** export or delete a user's personal data on request. Deleting anonymises the profile and keeps the audit trail (brief §12).

## 8. Known limitations (see `docs/PLAN.md` §9)

- **No signed-in end-to-end tests across roles:** the full role-by-role journey is tested at database level. The screens are checked against a mocked backend.
- **Hold reasons in the M&E dashboard are free text:** coded categories need an agreed code list.
- **Prompts for portfolio, investment and policy subjects are not written yet:** these subjects show the programme prompts with a notice (brief §8).
