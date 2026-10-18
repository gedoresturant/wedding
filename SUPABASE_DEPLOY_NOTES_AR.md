# Wedding Halls ERP V42 — Supabase sync preview

## Important architecture note
The application still uses SQLite as its operational database. This build adds a server-side sync worker that copies current rows from SQLite into Supabase `public.erp_sync_records` as JSON payloads. It does **not** yet replace SQLite with PostgreSQL as the live transactional database, and it does not import Supabase records back into SQLite. Treat Supabase as a cloud backup/mirror, not the only source of truth, until a full PostgreSQL port is completed.

## Required Supabase setup
1. In Supabase SQL Editor, run `SUPABASE_SYNC_SCHEMA.sql` from this project. This creates `erp_sync_records`, `erp_sync_instances`, and `erp_sync_conflicts`.
2. Keep your existing domain schema. Do not rerun or drop tables unnecessarily.
3. In Render > your Web Service > Environment, set:
   - `SUPABASE_SYNC_ENABLED=true`
   - `SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY`
   - `SUPABASE_SYNC_INTERVAL_MS=60000`
4. Never put the service-role key in `public/`, GitHub source, or browser code.
5. Redeploy and open `/healthz`. Check `supabaseSync.status` is `ok`. If it says `error`, inspect Render logs; common cause is the sync schema has not been run.

## Data safety
- Existing SQLite database remains on the Render persistent disk at `/var/data`.
- This sync is one-way (SQLite -> Supabase), idempotent by company/table/record ID.
- It does not currently sync physical deletes or resolve multi-instance conflicts.
- Do not remove the Render disk or reset the SQLite database after deployment.
