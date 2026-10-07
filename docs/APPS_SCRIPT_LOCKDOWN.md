# Locking down the Google Sheet and Apps Script

**Why:** the current Apps Script web app is deployed with access set to "Anyone" and has no authentication. Anyone who has its URL can:
- read every user, including their plaintext password;
- read every project;
- overwrite any project.

The URL is in this public repo's git history. See `docs/AUDIT.md`, defect 1 and findings A1–A3.

**What you lose by doing this:** nothing the current app depends on.
- The React app never reads from the Sheet.
- Its sync already fails for every project created in the app, because the Sheet has no row for it.
- After lockdown, the remaining sync attempts fail the same way and are only logged to the browser console.

Takes about 10 minutes. Do the steps in order.

## 1. Export the data first (needed for migration in Phase 7)

1. Open the Sheet.
2. For each tab (`projects`, `notifications`, `invites`): File → Download → **Comma-separated values (.csv)**.
3. For the `users` tab:
   - Make a copy of the tab and **delete the `password` column in the copy**.
   - Download the copy as CSV.
   - Delete the copy.
4. Save the CSVs somewhere private, **not** in this repo, for example a private Drive folder.

## 2. Remove the plaintext passwords

1. In the `users` tab, select the whole `password` column and delete its contents. Keep the header so the script doesn't break.
2. Tell anyone who reused that password elsewhere to change it there.

## 3. Restrict Sheet sharing

1. Click **Share** → General access → **Restricted**.
2. Remove anyone who doesn't need access.

## 4. Turn off the web app

1. Open **Extensions → Apps Script**.
2. Click **Deploy → Manage deployments**.
3. For **every** deployment listed:
   - select it;
   - click **Archive** (the box icon).

Archived deployment URLs stop working immediately.

4. **Optional, only if you still want to test against the Sheet:** create a new deployment with *Who has access* = **Only myself**. Don't put its URL in the repo.

## 5. Tidy up the configuration

1. Remove `VITE_SHEET_API_URL` from your local `.env`.
2. Remove it from the GitHub repo variable: Settings → Secrets and variables → Actions → Variables.

The app then skips syncing entirely.

## 6. Tell me when it's done

I'll mark D-15 resolved in `docs/PLAN.md`.

The full decommissioning (brief §12) happens after the Phase 7 migration: delete the script project, and archive or delete the Sheet.
