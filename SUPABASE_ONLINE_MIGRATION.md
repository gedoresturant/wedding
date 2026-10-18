# Supabase online migration (staged)

This branch is an incremental migration; it intentionally does not replace the current SQLite-backed app yet.

## Current state
- The existing Express application still depends on SQLite and its `/api/*` routes.
- Supabase has the matching application tables, currently empty.
- All application tables have RLS enabled, but no policies were found. Do not expose a service-role key in browser code.
- `supabase/functions/erp-api/index.ts` is a staged Edge Function using Supabase Auth bearer tokens and server-side service-role access. It scopes data by trusted `app_metadata.company_id` and currently implements a limited first set of endpoints only.
- The existing frontend still calls relative `/api/*` endpoints. It must not be switched to the Edge Function until login/session migration and endpoint parity are complete.

## Before production
1. Create/import Supabase Auth accounts and set trusted `app_metadata` values (`company_id`, `role`, optional `legacy_user_id`) through a trusted admin process.
2. Implement remaining Express routes, including payments, expenses, cashbox, packages, menus, documents, reports, backup/restore, invitation QR, notifications, audit log, and admin permissions.
3. Add overlap protection at the database level for hall/date/period booking conflicts.
4. Add automated tests for company isolation, role permissions, booking conflicts, payment bounds, and cross-tenant access.
5. Migrate UI API helper and login to Supabase Auth + Edge Function URL; never ship service-role credentials to the browser.
6. Verify data migration from SQLite backups before enabling real usage.
