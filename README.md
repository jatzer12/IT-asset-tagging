# IT Asset Tagging (Refactored)

This folder contains a modular version of the IT Asset Tagging app for long-term maintenance.

## Structure

- `index.html`: UI markup only.
- `css/styles.css`: all styling.
- `assets/pcc-logo.jpg`: optional header logo image (drop your PCC logo here).
- `templates/asset-import-template-v4.csv`: official CSV import template (required format).
- `js/app.bundle.js`: main app runtime (Supabase-backed).
- `js/auth.shared.js`: login/session helpers and role checks.
- `js/mass-delete.js`: mass delete page runtime (Supabase-backed).
- `js/dashboard.bundle.js`: dashboard page runtime (Supabase-backed).
- `supabase/functions/super-endpoint/index.ts`: Supabase Edge Function for Manager-only user administration.
- `js/csv.js`: CSV parsing and normalization pipeline.
- `js/validation.js`: business validation rules.
- `js/normalizers.js`: reusable data normalization helpers.
- `js/constants.js`: app-wide constants and status enums.

## Data Layer

The app is configured for Supabase-backed persistence (assets, comments, departments, audit).

The browser stores only short client session metadata; asset data is read/written in Supabase tables.

Before production, run:

- `supabase/hardening.sql` in Supabase SQL Editor (indexes + RLS policies).

## Manage Users (Supabase-only via Edge Function)

Manager user administration is handled by Supabase Edge Function:

- `supabase/functions/super-endpoint/index.ts`

Deploy it once, then the app can create agent accounts without any separate backend host.

Using Supabase CLI:

```powershell
supabase login
supabase link --project-ref bchztlpgksdaiyxlxppb
supabase functions deploy super-endpoint --no-verify-jwt=false
```

Important:

- Keep `SUPABASE_SERVICE_ROLE_KEY` out of frontend files.
- Edge Function runs inside Supabase and uses service role securely server-side.

## CSV Template

The importer accepts only this exact header row (same order):

`Asset Name,Asset Tag,Serial Number,Device Type,Model,Assigned User,Location,Room Number,Department,Purchase Date,Lifecycle Year,Asset Value,Status,Reason/Notes`

## Next Upgrade Path

1. Move login session storage from localStorage to HttpOnly server session cookies.
2. Add backend endpoint for full user lifecycle (disable/reset/delete).
3. Add automated database backups + restore validation job.

## Nightly Supabase Backup (Windows)

Scripts:

- `server/nightly-supabase-backup.ps1`
- `server/register-nightly-backup-task.ps1`

1. Get your Supabase Postgres connection string (`SUPABASE_DB_URL`) from Supabase project settings.
2. Ensure `pg_dump.exe` is installed (PostgreSQL client tools) and reachable in PATH.
3. Register nightly task:

```powershell
$env:SUPABASE_DB_URL="postgresql://postgres:<PASSWORD>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
.\server\register-nightly-backup-task.ps1 -RunAt "01:00"
```

4. Test immediately:

```powershell
Start-ScheduledTask -TaskName "PCC-Supabase-Nightly-Backup"
```

5. Backups are saved to:

- `backups\supabase-backup-YYYYMMDD-HHMMSS.dump`
- Daily logs under `backups\backup-log-YYYYMMDD.txt`
